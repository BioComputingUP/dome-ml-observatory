import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface EndpointParam {
  name: string;
  type: string;
  note: string;
}

interface Endpoint {
  method: 'GET';
  path: string;
  summary: string;
  params?: EndpointParam[];
  example: string;
}

interface Limit {
  icon: string;
  title: string;
  value: string;
  detail: string;
}

@Component({
  selector: 'app-download-api',
  imports: [RouterLink],
  templateUrl: './download-api.html',
  styleUrl: './download-api.scss',
})
export class DownloadApi {
  // Root-relative, not absolute. Both documents are served by the API itself, so they resolve
  // against whatever origin is serving the app: through proxy.conf.json in `ng serve`, through
  // nginx's `location /api/` rule in the container, and against the public host in production --
  // with no second place to update when the deployment host changes. Hardcoding the production
  // origin here previously made both links dead in local development.
  readonly swaggerUrl = '/api/docs';
  readonly openApiSpecUrl = '/api/docs-json';

  readonly endpoints: Endpoint[] = [
    {
      method: 'GET',
      path: '/api/health',
      summary: 'Liveness check. Never touches the database, so it stays reachable even if the corpus store is unreachable.',
      example: '{ "status": "ok" }',
    },
    {
      method: 'GET',
      path: '/api/health/ready',
      summary: 'Readiness check — confirms the database connection is live and reports the collection it is reading.',
      example:
        '{\n  "status": "ok",\n  "mongo": { "db": "dome_observatory", "collection": "Content", "estimatedCount": 827412 },\n  "schemaVersion": "1.1.0"\n}',
    },
    {
      method: 'GET',
      path: '/api/records',
      summary: 'Paginated search over the corpus. Parameters mirror the Search page’s own filters exactly — a shared search results URL is a valid query string here with no translation.',
      params: [
        { name: 'q', type: 'string', note: 'Free text over title and abstract.' },
        { name: 'class', type: 'positive,negative,undeterminable', note: 'Comma-separated. Absent defaults to positive.' },
        { name: 'oa', type: 'boolean', note: 'Open access only.' },
        { name: 'ft', type: 'boolean', note: 'Full text available.' },
        { name: 'year', type: '2020-2026', note: 'Inclusive range, either bound optional.' },
        { name: 'lic', type: 'string(s)', note: 'Comma-separated licence values.' },
        { name: 'jrnl', type: 'string(s)', note: 'Comma-separated journal names.' },
        { name: 'mesh', type: 'string(s)', note: 'Comma-separated MeSH headings.' },
        { name: 'kw', type: 'string(s)', note: 'Comma-separated author keywords, exact match.' },
        { name: 'ptype', type: 'string(s)', note: 'Comma-separated publication types.' },
        { name: 'd1, d2, d3', type: 'string(s)', note: 'EDAM domain tiers 1–3 — see the published vocabularies.' },
        { name: 'para', type: 'string(s)', note: 'Learning paradigm.' },
        { name: 'fam', type: 'string(s)', note: 'Model family.' },
        { name: 'mt', type: 'string(s)', note: 'Model type.' },
        { name: 'enriched', type: 'boolean', note: 'Only records the enrichment pass has touched.' },
        { name: 'sort', type: 'relevance | year_desc | year_asc | citations_desc | citations_asc', note: 'Defaults to relevance.' },
        { name: 'page, pageSize', type: 'integer', note: 'Pagination — pageSize capped at 100.' },
      ],
      example:
        '{\n  "page": 1,\n  "pageSize": 25,\n  "total": 355558,\n  "totalRelation": "eq",\n  "items": [ { "_id": "8b720ad0-...", "publication_metadata": { "title": "..." }, "...": "..." } ]\n}',
    },
    {
      method: 'GET',
      path: '/api/records/:pid',
      summary: 'A single record by its PID (the same identifier used in /record/:pid URLs).',
      example: '{ "_id": "8b720ad0-8cf7-5304-a016-3b15feae2815", "schema_version": "1.1.0", "...": "..." }',
    },
    {
      method: 'GET',
      path: '/api/export',
      summary:
        'Whole-corpus retrieval as NDJSON, one chunk at a time. Every filter below works here too. Instead of page numbers it pages on a cursor, so there is no result window and no limit on how far you can walk — repeat with cursor set to the previous response’s X-Next-Cursor header until that header is absent. Records come back in ascending _id order; free-text q= is not supported.',
      params: [
        { name: 'cursor', type: 'string', note: 'The _id to resume after, from the previous response’s X-Next-Cursor header. Omit for the first chunk.' },
        { name: 'limit', type: 'integer', note: 'Records per chunk, up to 1000. Defaults to 1000.' },
        { name: '(all /api/records filters)', type: '—', note: 'class, year, jrnl, mesh, lic, ptype, d1–d3, para, fam, mt, oa, ft, enriched. Export a slice, not just the whole thing.' },
      ],
      example:
        'curl -sD headers.txt \'/api/export?class=positive&limit=1000\' >> corpus.ndjson\n' +
        '# then repeat with &cursor=<X-Next-Cursor from headers.txt> until that header is gone\n' +
        '{"_id":"02203bf8-5451-59f8-aab6-678bff8754ca","publication_metadata":{...}}',
    },
    {
      method: 'GET',
      path: '/api/facets/:field',
      summary: 'Typeahead suggestions for a facet field. Allowed fields: journal, mesh_headings, pub_types, license. keywords_author is excluded — it carries 694,411 distinct values, too many to serve as suggestions.',
      params: [
        { name: 'q', type: 'string', note: 'Substring to filter suggestions by, case-insensitive.' },
        { name: 'limit', type: 'integer', note: 'Max suggestions to return. Defaults to 20.' },
      ],
      example: '["Nature Methods", "Nature Machine Intelligence", "Nature Biotechnology"]',
    },
    {
      method: 'GET',
      path: '/api/stats',
      summary: 'Corpus-wide headline figures and facet counts — the same numbers the Search page reads for its metric row and facet panel. Cached server-side; refreshes at most once a day.',
      example:
        '{\n  "generated": "2026-08-15T02:00:00.000Z",\n  "schema_version": "1.1.0",\n  "corpus": { "total": 827412, "positive": 355558, "negative": 461210, "undeterminable": 10644, "enriched": 128340 },\n  "...": "..."\n}',
    },
  ];

  readonly limits: Limit[] = [
    {
      icon: 'icon-signal',
      title: 'Rate limit',
      value: '1,200 requests / minute / IP',
      detail:
        'One budget per client IP across all endpoints, over a rolling 60-second window. Requests above it return HTTP 429. Health checks are exempt.',
    },
    {
      icon: 'icon-download',
      title: 'Export budget',
      value: '60 requests / minute / IP',
      detail:
        '/api/export has its own separate budget, because one request there returns up to 1,000 records — 60,000 records a minute. Walking the whole corpus takes well under half an hour.',
    },
    {
      icon: 'icon-ban',
      title: 'Result window (search only)',
      value: '10,000 records',
      detail:
        'On /api/records, page × pageSize above 10,000 returns HTTP 400 rather than silently truncating. This is a browsing limit — the database cannot sort past it at this corpus size — and it is exactly why /api/export exists. Export has no window.',
    },
    {
      icon: 'icon-hourglass-half',
      title: 'Query budget',
      value: '5s standard · 20s free text · 30s export',
      detail:
        'Filter-only queries have a 5-second execution budget, free-text queries (q=) 20 seconds, and one export chunk 30 seconds.',
    },
    {
      icon: 'icon-exclamation-triangle',
      title: 'Database outage',
      value: '503, not a crash',
      detail:
        'If the corpus database is unreachable, data endpoints return HTTP 503 rather than a generic server error. Safe to retry with exponential backoff.',
    },
  ];
}
