import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { configuration, AppConfig } from './config/configuration';
import { validate } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { RecordsModule } from './records/records.module';
import { FacetsModule } from './facets/facets.module';
import { StatsModule } from './stats/stats.module';
import { JournalsModule } from './journals/journals.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),

    // 300 req/min per IP. Sized to the shared database host's capacity: the MongoDB server carries several
    // other production databases, so a runaway client loop has to be capped here rather than
    // allowed to degrade the host. Documented publicly in swagger.ts and on /download/api.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),

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
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
