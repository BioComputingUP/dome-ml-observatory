import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { RecordsService, CORPUS_STATS, SearchResult } from './records.service';
import { AiMlRecord } from './record.model';

function makeRecord(overrides: Partial<AiMlRecord> = {}): AiMlRecord {
  return {
    _id: 'test-id',
    schema_version: '1.1.0',
    identifiers: { pmid: null, pmcid: null, doi: null, dome_registry: null, bioai_repo: null, huggingface: null, kaggle: null, zenodo: null },
    publication_metadata: { title: 'A study of random forests', abstract: 'We apply random forests to classify things.', authors: 'Doe J', year: 2024, journal: 'Journal of Testing', citation_count: null },
    source: { abstract_source: 'europepmc', metadata_repair_sources: null, access: { open_access: true, license: 'cc by', fulltext_available: true } },
    content_filters: { mesh_headings: ['Humans'], pub_types: ['research-article'], keywords_author: ['machine learning'], domain_tier1: 'Computer science', domain_tier2: ['Machine learning'], domain_tier3: [], learning_paradigm: ['supervised'], model_family: ['classical machine learning'], model_type: ['random forest'] },
    llm_classification: { provider: 'deepseek', model_tier: 'flash', model_id: 'deepseek-v4-flash', mode: 'primary', classification: 'positive', rationale: 'test', prompt_version: 'v1', ruleset_sha256: null, batch_id: null, timestamp: null },
    llm_enrichment: { provider: null, model_tier: null, model_id: null, mode: null, rationale: null, prompt_version: null, ruleset_sha256: null, batch_id: null, timestamp: null, vocab_violations: null, parse_status: null, input_tokens: null, output_tokens: null, cache_hit_tokens: null, parse_fallback_used: null },
    ...overrides,
  };
}

describe('RecordsService', () => {
  let service: RecordsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RecordsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('returns the fallback corpus-wide stats synchronously, before any request resolves', () => {
    expect(service.getStats()).toEqual(CORPUS_STATS);
    expect(service.getStats().positive).toBe(355_558);
  });

  describe('search()', () => {
    it('requests GET /api/records with no q/class params for a fully-default query', async () => {
      const promise = firstValueFrom(service.search({ filters: {}, sort: 'relevance', page: 1, pageSize: 25 }));
      const req = httpMock.expectOne((r) => r.url === '/api/records');
      expect(req.request.params.has('q')).toBe(false);
      expect(req.request.params.has('class')).toBe(false);
      expect(req.request.params.get('pageSize')).toBe('25');
      req.flush({ items: [], total: 0, totalRelation: 'eq', page: 1, pageSize: 25 } satisfies SearchResult);
      await promise;
    });

    it('sends an explicitly-cleared classification as the literal empty param, not omitted', async () => {
      const promise = firstValueFrom(
        service.search({ filters: { classification: [] }, sort: 'relevance', page: 1, pageSize: 25 }),
      );
      const req = httpMock.expectOne((r) => r.url === '/api/records');
      expect(req.request.params.has('class')).toBe(true);
      expect(req.request.params.get('class')).toBe('');
      req.flush({ items: [], total: 827_061, totalRelation: 'eq', page: 1, pageSize: 25 } satisfies SearchResult);
      await promise;
    });

    it('sends an explicit classification list as a comma-separated param', async () => {
      const promise = firstValueFrom(
        service.search({ filters: { classification: ['negative', 'undeterminable'] }, sort: 'relevance', page: 1, pageSize: 25 }),
      );
      const req = httpMock.expectOne((r) => r.url === '/api/records');
      expect(req.request.params.get('class')).toBe('negative,undeterminable');
      req.flush({ items: [], total: 0, totalRelation: 'eq', page: 1, pageSize: 25 } satisfies SearchResult);
      await promise;
    });

    it('carries an open-ended year lower bound as "2020-"', async () => {
      const promise = firstValueFrom(
        service.search({ filters: { yearMin: 2020 }, sort: 'relevance', page: 1, pageSize: 25 }),
      );
      const req = httpMock.expectOne((r) => r.url === '/api/records');
      expect(req.request.params.get('year')).toBe('2020-');
      req.flush({ items: [], total: 0, totalRelation: 'eq', page: 1, pageSize: 25 } satisfies SearchResult);
      await promise;
    });

    it('omits page at 1 and sends it explicitly beyond that', async () => {
      const promiseFirst = firstValueFrom(service.search({ filters: {}, sort: 'relevance', page: 1, pageSize: 25 }));
      const reqFirst = httpMock.expectOne((r) => r.url === '/api/records');
      expect(reqFirst.request.params.has('page')).toBe(false);
      reqFirst.flush({ items: [], total: 0, totalRelation: 'eq', page: 1, pageSize: 25 } satisfies SearchResult);
      await promiseFirst;

      const promiseLater = firstValueFrom(service.search({ filters: {}, sort: 'relevance', page: 5, pageSize: 25 }));
      const reqLater = httpMock.expectOne((r) => r.url === '/api/records');
      expect(reqLater.request.params.get('page')).toBe('5');
      reqLater.flush({ items: [], total: 0, totalRelation: 'eq', page: 5, pageSize: 25 } satisfies SearchResult);
      await promiseLater;
    });

    it('passes totalRelation through untouched', async () => {
      const promise = firstValueFrom(service.search({ filters: {}, sort: 'relevance', page: 1, pageSize: 25 }));
      const req = httpMock.expectOne((r) => r.url === '/api/records');
      req.flush({
        items: [makeRecord()],
        total: 10_000,
        totalRelation: 'gte',
        page: 1,
        pageSize: 25,
      } satisfies SearchResult);
      const result = await promise;
      expect(result.totalRelation).toBe('gte');
      expect(result.total).toBe(10_000);
    });
  });

  describe('getByPid()', () => {
    it('requests GET /api/records/:pid and returns the record on success', async () => {
      const promise = firstValueFrom(service.getByPid('rf-2024'));
      const req = httpMock.expectOne('/api/records/rf-2024');
      req.flush(makeRecord({ _id: 'rf-2024' }));
      const record = await promise;
      expect(record?._id).toBe('rf-2024');
    });

    it('resolves to undefined on a 404, rather than throwing', async () => {
      const promise = firstValueFrom(service.getByPid('does-not-exist'));
      const req = httpMock.expectOne('/api/records/does-not-exist');
      req.flush({ message: 'No record with id does-not-exist', error: 'Not Found', statusCode: 404 }, { status: 404, statusText: 'Not Found' });
      expect(await promise).toBeUndefined();
    });

    it('resolves to undefined on a 400 (malformed pid), rather than throwing', async () => {
      const promise = firstValueFrom(service.getByPid('not-a-uuid'));
      const req = httpMock.expectOne('/api/records/not-a-uuid');
      req.flush({ message: 'Invalid record id: expected a UUID', error: 'Bad Request', statusCode: 400 }, { status: 400, statusText: 'Bad Request' });
      expect(await promise).toBeUndefined();
    });

    it('propagates a 503 as an error instead of collapsing it to undefined', async () => {
      const promise = firstValueFrom(service.getByPid('rf-2024'));
      const req = httpMock.expectOne('/api/records/rf-2024');
      req.flush(
        { message: 'Database temporarily unavailable -- please retry shortly.', error: 'Service Unavailable', statusCode: 503 },
        { status: 503, statusText: 'Service Unavailable' },
      );
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('facetValues()', () => {
    it('requests the typeahead endpoint with q and a fixed limit', async () => {
      const promise = firstValueFrom(service.facetValues('journal', 'nat'));
      const req = httpMock.expectOne((r) => r.url === '/api/facets/journal');
      expect(req.request.params.get('q')).toBe('nat');
      expect(req.request.params.get('limit')).toBe('20');
      req.flush(['Nature', 'Nature Methods']);
      expect(await promise).toEqual(['Nature', 'Nature Methods']);
    });
  });

  describe('getFacetStats()', () => {
    it('fetches GET /api/stats once and shares it across subscribers', async () => {
      const stats = {
        generated: '2026-09-01T00:00:00Z',
        schema_version: '1.1.0',
        source: 'full-corpus' as const,
        records_counted: 827_061,
        corpus: { total: 827_061, positive: 355_558, negative: 464_581, undeterminable: 6_922, openAccess: 548_412, fulltextAvailable: 615_151, enriched: 0 },
        corpus_provenance: 'test',
        facets: { classification: [], license: [], pubTypes: [], domainTier1: [], learningParadigm: [], modelFamily: [], yearRange: null },
      };
      const first = firstValueFrom(service.getFacetStats());
      httpMock.expectOne('/api/stats').flush(stats);
      expect((await first).corpus.positive).toBe(355_558);

      // A second subscriber must not trigger a second HTTP request -- shareReplay caches it.
      const second = await firstValueFrom(service.getFacetStats());
      expect(second.corpus.positive).toBe(355_558);
    });
  });
});
