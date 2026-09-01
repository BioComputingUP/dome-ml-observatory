import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Mounted at the literal path 'api/docs'. SwaggerModule.setup()'s path is NOT affected by
 * app.setGlobalPrefix('api') (a well-known Nest gotcha), so 'api' is spelled out here explicitly
 * rather than relying on the prefix -- this is what puts it under nginx's existing
 * `location /api/ { proxy_pass ...; }` rule (Phase 4) with zero changes to that file.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('DOME Observatory API')
    .setDescription(
      'Read-only REST API over the DOME Observatory AI/ML methods-paper corpus. ' +
        'See https://observatory.dome-ml.org/api for the human-readable version of this contract.',
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
