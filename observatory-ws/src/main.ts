import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger/swagger';
import { AppConfig } from './config/configuration';
import { MongoUnavailableFilter } from './common/mongo-unavailable.filter';

async function bootstrap(): Promise<void> {
  // Typed as NestExpressApplication (not the platform-agnostic default) specifically so
  // app.set('trust proxy', ...) below is available -- see internal/ROADMAP.md Phase 6, item 12.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService<AppConfig, true>);

  // Every controller route lands under /api -- matches the `location /api/ { ... }` proxy rule
  // already shipped in observatory-ui/nginx.conf (Phase 4), so that file needs no change here.
  // Swagger is mounted at the literal path 'api/docs' in swagger.ts rather than relying on this
  // prefix to reach it -- SwaggerModule.setup()'s path is not auto-prefixed by setGlobalPrefix().
  app.setGlobalPrefix('api');

  // CSP off: this API serves JSON plus its own Swagger UI (which needs inline scripts to render)
  // under the same origin -- nginx's frontend image, not this one, is where a real CSP belongs.
  app.use(helmet({ contentSecurityPolicy: false }));

  // nginx forwards X-Forwarded-For in both the Docker and bare-metal deployment; the throttler
  // guard keys on req.ip, which only reads X-Forwarded-For once Express is told to trust it.
  app.set('trust proxy', 1);

  app.enableCors({ origin: config.get('frontendUrl', { infer: true }) });

  // whitelist: true strips any query param that isn't declared on a DTO -- an unrecognised param
  // must never silently become a Mongo filter. transform: true lets Nest coerce query strings
  // (e.g. "2") into the numbers/booleans the DTOs declare.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Turns a Mongo outage (VPN down, the database server unreachable) into a clean 503 for /api/records etc.
  // instead of a bare "Internal server error" -- see that filter's header comment for the
  // VPN-drop test that found the gap.
  app.useGlobalFilters(new MongoUnavailableFilter());

  // Closes the Mongo connection on SIGTERM instead of leaving `docker stop` to SIGKILL the
  // process after its 10s grace period -- see internal/ROADMAP.md Phase 6 readiness checklist.
  app.enableShutdownHooks();

  setupSwagger(app);

  const port = config.get('port', { infer: true });
  // Bind 0.0.0.0 explicitly, not the Node default -- inside a container, binding only the
  // loopback interface would make the service unreachable from other containers on the same
  // Docker network (see Phase 6).
  await app.listen(port, '0.0.0.0');
  logger.log(`observatory-ws listening on 0.0.0.0:${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
