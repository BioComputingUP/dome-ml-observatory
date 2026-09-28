import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Journals } from './journals';
import { JournalDetailResult, JournalListResult } from '../core/journal.model';

const CORPUS = {
  journals: 2,
  journalsScreened: 3,
  screened: 200,
  positive: 30,
  withoutJournal: { screened: 10, positive: 5 },
};

function listResult(): JournalListResult {
  return {
    generated: '2026-09-28T00:00:00Z',
    sort: 'count',
    minScreened: 100,
    total: 2,
    corpus: CORPUS,
    rows: [
      {
        journal: 'Nature',
        screened: 120,
        positive: 20,
        negative: 95,
        undeterminable: 5,
        positiveRate: 20 / 120,
        openAccessPositive: 9,
        enriched: 4,
        firstYear: 2001,
        lastYear: 2026,
        peakYear: 2024,
      },
      {
        journal: 'Cell',
        screened: 80,
        positive: 10,
        negative: 68,
        undeterminable: 2,
        positiveRate: 10 / 80,
        openAccessPositive: 3,
        enriched: 1,
        firstYear: 2005,
        lastYear: 2025,
        peakYear: 2022,
      },
    ],
  };
}

function detailResult(): JournalDetailResult {
  return {
    generated: '2026-09-28T00:00:00Z',
    corpus: CORPUS,
    journal: {
      journal: 'Nature',
      screened: 120,
      positive: 20,
      negative: 95,
      undeterminable: 5,
      positiveRate: 20 / 120,
      openAccessPositive: 9,
      enriched: 4,
      firstYear: 2001,
      lastYear: 2026,
      peakYear: 2024,
      series: [
        { year: 2024, screened: 40, positive: 8 },
        { year: 2025, screened: 50, positive: 12 },
      ],
      pre: { screened: 0, positive: 0 },
    },
    rank: 1,
    rankOf: 2,
    shareOfCorpusPositive: 20 / 35,
  };
}

describe('Journals page', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'journals', component: Journals }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const text = (harness: RouterTestingHarness, selector: string): string =>
    (harness.routeNativeElement?.querySelector(selector)?.textContent ?? '').trim();

  it('requests only the ranking on the overview, showing — pills and skeleton rows meanwhile', async () => {
    const harness = await RouterTestingHarness.create('/journals');

    // Before the response: the frame is up, no figure is invented.
    expect(text(harness, '.stat-pill-value')).toBe('—');
    expect(harness.routeNativeElement?.querySelector('.skeleton-row')).toBeTruthy();

    const req = httpMock.expectOne((r) => r.url === '/api/journals');
    req.flush(listResult());
    harness.detectChanges();

    expect(text(harness, '.stat-pill-value')).toBe('2');
    expect(harness.routeNativeElement?.querySelectorAll('.journal-table tbody tr').length).toBe(2);
    // No detail request was made: verify() in afterEach enforces it.
  });

  it('requests only the detail when landing on ?j=, with the journal name shown at once', async () => {
    const harness = await RouterTestingHarness.create('/journals?j=Nature');

    expect(text(harness, '.journal-name')).toBe('Nature');
    expect(text(harness, '.stat-pill-value')).toBe('—');

    httpMock.expectOne((r) => r.url === '/api/journals/detail').flush(detailResult());
    harness.detectChanges();

    expect(text(harness, '.stat-pill-value')).toBe('20');
    // No list request was made: verify() in afterEach enforces it.
  });

  it('shows a retry that issues a real request when the ranking fails', async () => {
    const harness = await RouterTestingHarness.create('/journals');
    httpMock
      .expectOne((r) => r.url === '/api/journals')
      .flush('boom', { status: 503, statusText: 'Service Unavailable' });
    harness.detectChanges();

    const alert = harness.routeNativeElement?.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Temporarily unavailable');

    (alert?.querySelector('button') as HTMLButtonElement).click();
    harness.detectChanges();

    httpMock.expectOne((r) => r.url === '/api/journals').flush(listResult());
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelectorAll('.journal-table tbody tr').length).toBe(2);
  });

  it('tells a missing journal (404) apart from an unreachable backend (503)', async () => {
    const notFound = await RouterTestingHarness.create('/journals?j=Nope');
    httpMock
      .expectOne((r) => r.url === '/api/journals/detail')
      .flush('nope', { status: 404, statusText: 'Not Found' });
    notFound.detectChanges();
    expect(notFound.routeNativeElement?.textContent).toContain('No journal by that name');
  });

  it('shows temporarily-unavailable for a failed detail, not not-found', async () => {
    const harness = await RouterTestingHarness.create('/journals?j=Nature');
    httpMock
      .expectOne((r) => r.url === '/api/journals/detail')
      .flush('boom', { status: 503, statusText: 'Service Unavailable' });
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Temporarily unavailable');
    expect(harness.routeNativeElement?.textContent).not.toContain('No journal by that name');
  });
});
