import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { configuration, AppConfig, RATE_LIMIT_TTL_MS } from './config/configuration';
import { validate } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { RecordsModule } from './records/records.module';
import { FacetsModule } from './facets/facets.module';
import { StatsModule } from './stats/stats.module';
import { JournalsModule } from './journals/journals.module';
import { ExportModule } from './export/export.module';
import { IpThrottlerGuard } from './common/ip-throttler.guard';
import { MatomoInterceptor } from './analytics/matomo.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),

    // Two named throttlers, both per client IP over a rolling minute. Every route is subject to
    // both by default, so each controller opts out of the one that does not apply to it with
    // @SkipThrottle -- 'export' everywhere except ExportController, 'default' on ExportController,
    // and both on HealthController.
    //
    // The limits are deliberately generous. They exist as a backstop against a runaway client on a
    // database host shared with other services, not as a wall: the sibling MobiDB service runs the
    // same shape of workload with no request limit at all, bounding cost by per-request size and
    // query time instead. 'default' at 1200/min is 20 req/s, past anything an interactive client
    // does; 'export' at 60/min is 60,000 records/min because each of those requests is up to 1000
    // documents. Both are env-tunable (RATE_LIMIT_PER_MINUTE, EXPORT_RATE_LIMIT_PER_MINUTE) so the
    // hosting deployment can retune without a code change. Documented publicly in swagger.ts and
    // on /download/api -- those numbers are hand-copied, so they move together with these.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => [
        {
          name: 'default',
          ttl: RATE_LIMIT_TTL_MS,
          limit: config.get('rateLimit.perMinute', { infer: true }),
        },
        {
          name: 'export',
          ttl: RATE_LIMIT_TTL_MS,
          limit: config.get('rateLimit.exportPerMinute', { infer: true }),
        },
      ],
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        uri: config.get('mongo.uri', { infer: true }),
        dbName: config.get('mongo.db', { infer: true }),
        // Fail fast on a dead/unreachable MongoDB server (e.g. VPN down) instead of the driver's 30s
        // default -- this is what keeps /api/health/ready honest under real network conditions.
        serverSelectionTimeoutMS: 5_000,
        // the MongoDB server is a standalone server, not a replica set (confirmed via mongosh, 2026-09-01) --
        // this skips replica-set discovery entirely rather than timing out looking for one.
        directConnection: true,
        maxPoolSize: 10,
        // Without this, @nestjs/mongoose awaits the FIRST connection attempt (with its own
        // retry loop, default 10 attempts) as a hard Nest module dependency -- confirmed the hard
        // way: with the MongoDB server unreachable, that blocked app.listen() from ever being called for 80+
        // seconds before the process crashed outright, taking /api/health down with it even
        // though that route never touches Mongo. lazyConnection makes this provider resolve
        // immediately and connect in the background instead (Mongoose's own bufferTimeoutMS,
        // 10s default, bounds how long a query issued before that connects waits) -- this is
        // exactly what keeps liveness honest under the VPN-drop scenario the Docker healthcheck
        // depends on.
        lazyConnection: true,
        // lazyConnection alone isn't sufficient. Mongoose's createConnection() calls openUri()
        // in "fire and forget" mode internally when lazy, stashing the connection attempt as
        // `connection.$initialConnection` -- but nothing then calls `.asPromise()` to observe
        // its rejection, so a real MongoServerSelectionError becomes a genuinely unhandled
        // promise rejection, which crashes the whole process a few seconds later anyway (the
        // exact outcome lazyConnection was meant to avoid). Confirmed the hard way, twice:
        // `connection.on('error', ...)` does NOT fix this (the promise rejecting and the
        // 'error' event firing are two independent things); and @nestjs/mongoose's own
        // `onConnectionCreate` hook is dead code on the lazy path specifically -- its own source
        // returns the connection before ever calling onConnectionCreate when lazyConnection is
        // true. `connectionFactory` is the one hook this package calls unconditionally on both
        // paths, so it's what actually gets to attach `.asPromise().catch(...)` in time (without
        // awaiting it, so app.listen() still isn't blocked) -- verified directly against
        // MongooseCoreModule.createMongooseConnection in isolation before relying on it here.
        // Mongoose keeps retrying the connection in the background regardless; this only stops
        // that first failure from being fatal to the whole process.
        connectionFactory: (connection: Connection) => {
          const logger = new Logger('MongooseConnection');
          connection.asPromise().catch((err: unknown) => {
            logger.error(
              `Initial Mongo connection failed (will keep retrying in the background): ${String(err)}`,
            );
          });
          return connection;
        },
      }),
    }),

    HealthModule,
    RecordsModule,
    FacetsModule,
    StatsModule,
    JournalsModule,
    ExportModule,
  ],
  providers: [
    // IpThrottlerGuard, not the stock ThrottlerGuard: the stock key includes the controller and
    // handler, which would make each limit per-endpoint rather than per-IP. See that file.
    { provide: APP_GUARD, useClass: IpThrottlerGuard },
    // Reports API usage to the lab's Matomo. Inert unless MATOMO_TOKEN is set, which is the
    // shipped default -- it constructs no tracker and contacts no host in that case.
    { provide: APP_INTERCEPTOR, useClass: MatomoInterceptor },
  ],
})
export class AppModule {}
