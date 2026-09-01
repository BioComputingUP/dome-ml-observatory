import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { RecordsService, CORPUS_STATS } from './records.service';
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

  const fixture: AiMlRecord[] = [
    makeRecord({ _id: 'rf-2024', publication_metadata: { ...makeRecord().publication_metadata, year: 2024, journal: 'Journal A' } }),
    makeRecord({
      _id: 'negative-2020',
      publication_metadata: { ...makeRecord().publication_metadata, title: 'An unrelated clinical trial', abstract: 'A retrospective cohort study of patient outcomes.', year: 2020, journal: 'Journal B' },
      llm_classification: { ...makeRecord().llm_classification, classification: 'negative' },
      content_filters: { ...makeRecord().content_filters, domain_tier1: null, domain_tier2: [], learning_paradigm: [], model_family: [], model_type: [] },
      source: { ...makeRecord().source, access: { open_access: false, license: null, fulltext_available: false } },
    }),
    makeRecord({
      _id: 'closed-access-2022',
      publication_metadata: { ...makeRecord().publication_metadata, title: 'Deep learning for imaging', abstract: 'We apply a convolutional neural network to classify medical images.', year: 2022, journal: 'Journal A' },
      source: { ...makeRecord().source, access: { open_access: false, license: null, fulltext_available: true } },
      content_filters: { ...makeRecord().content_filters, model_family: ['deep learning'], model_type: ['convolutional neural network'] },
    }),
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RecordsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function flushFixture() {
    httpMock.expectOne('assets/data/sample-records.json').flush(fixture);
  }

  it('returns the real, hardcoded corpus-wide stats, not fixture-derived numbers', () => {
    expect(service.getStats()).toEqual(CORPUS_STATS);
    expect(service.getStats().positive).toBe(355_558);
  });

  it('free-text search matches title/abstract case-insensitively', async () => {
    const result$ = service.search({ q: 'RANDOM FOREST', filters: {}, sort: 'relevance', page: 1, pageSize: 10 });
    const promise = firstValueFrom(result$);
    flushFixture();
    const result = await promise;
    expect(result.items.map((r) => r._id)).toEqual(['rf-2024']);
  });

  it('filters by classification', async () => {
    const result$ = service.search({ filters: { classification: ['negative'] }, sort: 'relevance', page: 1, pageSize: 10 });
    const promise = firstValueFrom(result$);
    flushFixture();
    const result = await promise;
    expect(result.items.map((r) => r._id)).toEqual(['negative-2020']);
  });

  it('filters by open access', async () => {
    const result$ = service.search({ filters: { openAccess: false }, sort: 'relevance', page: 1, pageSize: 10 });
    const promise = firstValueFrom(result$);
    flushFixture();
    const result = await promise;
    expect(result.items.map((r) => r._id).sort()).toEqual(['closed-access-2022', 'negative-2020']);
  });

  it('filters by year range', async () => {
    const result$ = service.search({ filters: { yearMin: 2023 }, sort: 'relevance', page: 1, pageSize: 10 });
    const promise = firstValueFrom(result$);
    flushFixture();
    const result = await promise;
    expect(result.items.map((r) => r._id)).toEqual(['rf-2024']);
  });

  it('filters by model_family (enrichment field)', async () => {
    const result$ = service.search({ filters: { modelFamily: ['deep learning'] }, sort: 'relevance', page: 1, pageSize: 10 });
    const promise = firstValueFrom(result$);
    flushFixture();
    const result = await promise;
    expect(result.items.map((r) => r._id)).toEqual(['closed-access-2022']);
  });

  it('enrichedOnly excludes records the enrichment pass has not touched', async () => {
    const result$ = service.search({ filters: { enrichedOnly: true }, sort: 'relevance', page: 1, pageSize: 10 });
    const promise = firstValueFrom(result$);
    flushFixture();
    const result = await promise;
    // fixture helper leaves llm_enrichment.provider null on every record -- none pass
    expect(result.items).toEqual([]);
  });

  it('composes multiple filters with AND semantics', async () => {
    const result$ = service.search({
      filters: { classification: ['positive'], journal: ['Journal A'] },
      sort: 'relevance',
      page: 1,
      pageSize: 10,
    });
    const promise = firstValueFrom(result$);
    flushFixture();
    const result = await promise;
    expect(result.items.map((r) => r._id).sort()).toEqual(['closed-access-2022', 'rf-2024']);
  });

  it('sorts by year descending', async () => {
    const result$ = service.search({ filters: {}, sort: 'year_desc', page: 1, pageSize: 10 });
    const promise = firstValueFrom(result$);
    flushFixture();
    const result = await promise;
    expect(result.items.map((r) => r.publication_metadata.year)).toEqual([2024, 2022, 2020]);
  });

  it('paginates and reports the true total separately from page size', async () => {
    const result$ = service.search({ filters: {}, sort: 'relevance', page: 1, pageSize: 2 });
    const promise = firstValueFrom(result$);
    flushFixture();
    const result = await promise;
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(3);
  });

  it('getByPid finds a record by its PID', async () => {
    const result$ = service.getByPid('rf-2024');
    const promise = firstValueFrom(result$);
    flushFixture();
    const record = await promise;
    expect(record?._id).toBe('rf-2024');
  });

  it('getByPid returns undefined for an unknown PID rather than throwing', async () => {
    const result$ = service.getByPid('does-not-exist');
    const promise = firstValueFrom(result$);
    flushFixture();
    const record = await promise;
    expect(record).toBeUndefined();
  });
});
