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
        'See https://observatory.dome-ml.org/download/api for the human-readable version of ' +
        'this contract, including worked recommendations.\n\n' +
        '**Fair use** -- the following limits are enforced server-side and apply to every ' +
        'client. They exist to keep one runaway client from degrading a shared database host, ' +
        'not to ration access: pulling the entire corpus through this API is supported and ' +
        'expected.\n' +
        '- Rate limit: 1200 requests per minute per client IP, over a rolling 60-second window. ' +
        'Requests above the limit return HTTP 429. /api/export has its own budget of 60 ' +
        'requests per minute, because one of those returns up to 1000 records -- 60,000 ' +
        'records per minute. Health checks are not rate-limited.\n' +
        '- Whole-corpus retrieval: use /api/export, which pages on a cursor and has no result ' +
        'window at all. Every /api/records filter applies to it.\n' +
        '- Result window: page x pageSize above 10,000 on /api/records returns HTTP 400 rather ' +
        'than silently truncating. This is a browsing limit specific to that endpoint -- ' +
        'MongoDB cannot sort past it at this corpus size -- and is why /api/export exists.\n' +
        '- Query budget: 5 seconds for filter-only queries, 20 seconds for free-text queries ' +
        '(q=), 30 seconds for one /api/export chunk.\n' +
        '- Database outage: if the corpus database is unreachable, data endpoints return HTTP ' +
        '503 rather than a generic server error. Safe to retry with exponential backoff.',
    )
    .setVersion('1.0')
    .addServer('https://observatory.dome-ml.org', 'Production')
    .addServer('http://localhost:3000', 'Local development')
    .addTag(
      'health',
      'Liveness and readiness probes. Never rate-limited or Mongo-dependent for the liveness check.',
    )
    .addTag('records', 'Paginated corpus search and single-record lookup by PID.')
    .addTag(
      'export',
      'Whole-corpus retrieval as NDJSON, paged on a cursor rather than an offset. No result ' +
        'window; every /api/records filter applies.',
    )
    .addTag('facets', 'Typeahead suggestions for the high-cardinality search facets.')
    .addTag('stats', 'Corpus-wide headline figures and facet counts, cached server-side.')
    .setContact('DOME Observatory', 'https://observatory.dome-ml.org', 'contact@dome-ml.org')
    .setLicense('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/')
    .setExternalDoc('Fair use & recommendations', 'https://observatory.dome-ml.org/download/api')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    customSiteTitle: 'DOME Observatory API',
    swaggerOptions: {
      tryItOutEnabled: true,
      docExpansion: 'list',
      filter: true,
    },
  });
}
