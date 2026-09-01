import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Endpoint {
  method: 'GET';
  path: string;
  summary: string;
  params?: { name: string; type: string; note: string }[];
  example: string;
}

@Component({
  selector: 'app-api-docs',
  imports: [RouterLink],
  templateUrl: './api-docs.html',
  styleUrl: './api-docs.scss',
})
export class ApiDocs {
  readonly endpoints: Endpoint[] = [
    {
      method: 'GET',
      path: '/api/health',
      summary: 'Service liveness check.',
      example: '{ "status": "ok" }',
    },
    {
      method: 'GET',
      path: '/api/records',
      summary: 'Paginated search over the corpus. Parameters mirror the Search page’s own filters.',
      params: [
        { name: 'q', type: 'string', note: 'Free text over title and abstract.' },
        { name: 'class', type: 'positive,negative,undeterminable', note: 'Comma-separated. Defaults to positive.' },
        { name: 'oa', type: 'boolean', note: 'Open access only.' },
        { name: 'year', type: '2020-2026', note: 'Inclusive range, either bound optional.' },
        { name: 'd1, d2, d3, para, fam, mt', type: 'string(s)', note: 'EDAM domain tiers, learning paradigm, model family, model type — see the published vocabularies.' },
        { name: 'page, pageSize', type: 'integer', note: 'Pagination.' },
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
  ];
}
