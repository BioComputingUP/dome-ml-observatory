import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { JournalsService } from './journals.service';
import { JournalDetailResult, JournalListResult } from './journal.model';

function listResult(overrides: Partial<JournalListResult> = {}): JournalListResult {
  return {
    generated: '2026-09-28T00:00:00Z',
    sort: 'count',
    minScreened: 100,
    total: 1,
    corpus: {
      journals: 1,
      journalsScreened: 1,
      screened: 100,
      positive: 10,
      withoutJournal: { screened: 5, positive: 2 },
    },
    rows: [],
    ...overrides,
  };
}

function detailResult(): JournalDetailResult {
  return {
    generated: '2026-09-28T00:00:00Z',
    corpus: {
      journals: 1,
      journalsScreened: 1,
      screened: 100,
      positive: 10,
      withoutJournal: { screened: 5, positive: 2 },
    },
    journal: {
      journal: 'Nature',
      screened: 100,
      positive: 10,
      negative: 85,
      undeterminable: 5,
      positiveRate: 0.1,
      openAccessPositive: 4,
      enriched: 3,
      firstYear: 2001,
      lastYear: 2026,
      peakYear: 2024,
      series: [],
      pre: { screened: 0, positive: 0 },
    },
    rank: 1,
    rankOf: 1,
    shareOfCorpusPositive: 0.8,
  };
}

describe('JournalsService', () => {
  let service: JournalsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(JournalsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('list()', () => {
    it('serves a repeat of the same options from the session cache, one request total', async () => {
      const first = firstValueFrom(service.list({ sort: 'count', limit: 50, minScreened: 100 }));
      httpMock.expectOne((r) => r.url === '/api/journals').flush(listResult());
      await first;

      // Same options again: no new request may be issued (verify() in afterEach enforces it).
      const second = await firstValueFrom(
        service.list({ sort: 'count', limit: 50, minScreened: 100 }),
      );
      expect(second.total).toBe(1);
    });

    it('treats different options as a different cache entry', async () => {
      const a = firstValueFrom(service.list({ sort: 'density', minScreened: 100 }));
      httpMock.expectOne((r) => r.params.get('minScreened') === '100').flush(listResult());
      await a;

      const b = firstValueFrom(service.list({ sort: 'density', minScreened: 500 }));
      httpMock
        .expectOne((r) => r.params.get('minScreened') === '500')
        .flush(listResult({ minScreened: 500 }));
      await b;
    });

    it('never caches a typeahead lookup (q present)', async () => {
      const a = firstValueFrom(service.list({ q: 'bio', limit: 10 }));
      httpMock.expectOne((r) => r.params.get('q') === 'bio').flush(listResult());
      await a;

      const b = firstValueFrom(service.list({ q: 'bio', limit: 10 }));
      httpMock.expectOne((r) => r.params.get('q') === 'bio').flush(listResult());
      await b;
    });

    it('evicts an errored request so a retry is a real request', async () => {
      const failed = firstValueFrom(service.list({ sort: 'count' }));
      httpMock
        .expectOne((r) => r.url === '/api/journals')
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(failed).rejects.toBeTruthy();

      const retried = firstValueFrom(service.list({ sort: 'count' }));
      httpMock.expectOne((r) => r.url === '/api/journals').flush(listResult());
      await retried;
    });
  });

  describe('detail()', () => {
    it('serves a repeat for the same journal from the session cache', async () => {
      const first = firstValueFrom(service.detail('Nature'));
      httpMock.expectOne((r) => r.params.get('journal') === 'Nature').flush(detailResult());
      await first;

      const second = await firstValueFrom(service.detail('Nature'));
      expect(second?.journal.journal).toBe('Nature');
    });

    it('caches a 404 as undefined -- not-found is a stable answer within the session', async () => {
      const first = firstValueFrom(service.detail('No Such Journal'));
      httpMock
        .expectOne((r) => r.url === '/api/journals/detail')
        .flush('nope', { status: 404, statusText: 'Not Found' });
      await expect(first).resolves.toBeUndefined();

      await expect(firstValueFrom(service.detail('No Such Journal'))).resolves.toBeUndefined();
    });

    it('propagates a real failure and evicts it, so a retry is a real request', async () => {
      const failed = firstValueFrom(service.detail('Nature'));
      httpMock
        .expectOne((r) => r.url === '/api/journals/detail')
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(failed).rejects.toBeTruthy();

      const retried = firstValueFrom(service.detail('Nature'));
      httpMock.expectOne((r) => r.url === '/api/journals/detail').flush(detailResult());
      await expect(retried).resolves.toBeTruthy();
    });
  });
});
