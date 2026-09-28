import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  of,
  scan,
  startWith,
  switchMap,
} from 'rxjs';
import { JournalsService } from '../core/journals.service';
import { JournalDetailResult, JournalListResult, JournalSort } from '../core/journal.model';
import { ChartSeries, LineChart } from '../shared/line-chart/line-chart';
import { JournalSearch } from './journal-search/journal-search';

/** Selectable floors for the share ranking. Defaults to 100 -- see the caveat in the template. */
export const MIN_SCREENED_OPTIONS = [50, 100, 500];
const DEFAULT_MIN_SCREENED = 100;
const TOP_N = 50;

/** Params this page keeps in the URL, so any view of it is shareable. */
interface JournalsQuery {
  journal: string | null;
  sort: JournalSort;
  minScreened: number;
}

/**
 * One request's lifecycle, kept distinct so the template can be honest about each state: a 503
 * or a timeout is "temporarily unavailable, retry", never "no journals" -- conflating them made
 * a backend outage read as an empty corpus. `data` is carried through `loading` and `error` by
 * the list stream's scan, so a lens change dims the table it has instead of blanking it.
 */
interface Remote<T> {
  status: 'loading' | 'ok' | 'notFound' | 'error';
  data?: T;
}

function parseParams(params: Record<string, unknown>): JournalsQuery {
  const raw = (key: string): string | undefined => {
    const value = params[key];
    if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
    return typeof value === 'string' ? value : undefined;
  };
  const min = Number(raw('min'));
  return {
    journal: raw('j')?.trim() || null,
    sort: raw('view') === 'density' ? 'density' : 'count',
    minScreened: MIN_SCREENED_OPTIONS.includes(min) ? min : DEFAULT_MIN_SCREENED,
  };
}

/**
 * Journals: which journals publish AI/ML methods papers, and how that has changed since 2000.
 *
 * Two views on one route, chosen by whether a journal is selected. The URL is the state, matching
 * the search page -- ?j= selects a journal, ?view=density&min= configures the ranking -- so any
 * view here is bookmarkable and shareable.
 *
 * Everything is served from observatory-ws's in-memory journal table, so switching lens or journal
 * costs a ~15ms request, not an aggregation.
 */
@Component({
  selector: 'app-journals',
  imports: [DecimalPipe, RouterLink, LineChart, JournalSearch],
  templateUrl: './journals.html',
  styleUrl: './journals.scss',
})
export class Journals {
  private readonly journals = inject(JournalsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly minScreenedOptions = MIN_SCREENED_OPTIONS;
  readonly topN = TOP_N;

  private readonly query = toSignal(this.route.queryParams.pipe(map(parseParams)), {
    initialValue: parseParams({}),
  });

  readonly selected = computed(() => this.query().journal);
  readonly sort = computed(() => this.query().sort);
  readonly minScreened = computed(() => this.query().minScreened);

  /** Bumped by the retry buttons. The service evicts an errored request from its session cache,
   *  so re-running the stream is a real request for whatever failed -- and a free cache replay
   *  for whatever didn't. */
  private readonly retry$ = new BehaviorSubject(0);

  /** The ranking. Fetched only while the overview is showing (the detail view never displays
   *  it -- its corpus figures come from the detail response), and only refetched when the lens,
   *  floor or retry counter changes: returning from a journal with the same lens keeps the rows
   *  as they are. */
  private readonly listState = toSignal(
    combineLatest([this.route.queryParams.pipe(map(parseParams)), this.retry$]).pipe(
      filter(([q]) => q.journal === null),
      map(([q, attempt]) => ({ sort: q.sort, minScreened: q.minScreened, attempt })),
      distinctUntilChanged(
        (a, b) => a.sort === b.sort && a.minScreened === b.minScreened && a.attempt === b.attempt,
      ),
      switchMap((q) =>
        this.journals.list({ sort: q.sort, minScreened: q.minScreened, limit: TOP_N }).pipe(
          map((data): Remote<JournalListResult> => ({ status: 'ok', data })),
          catchError(() => of<Remote<JournalListResult>>({ status: 'error' })),
          startWith<Remote<JournalListResult>>({ status: 'loading' }),
        ),
      ),
      // Carry the last good rows through a reload or a failed refresh: the table dims rather
      // than blanking, and an error over old data is a note, not an empty page.
      scan(
        (prev: Remote<JournalListResult>, next: Remote<JournalListResult>) =>
          next.status === 'ok' ? next : { ...next, data: prev.data },
        { status: 'loading' } as Remote<JournalListResult>,
      ),
    ),
    { initialValue: { status: 'loading' } as Remote<JournalListResult> },
  );

  /** No scan here on purpose: switching journal A -> B must not show A's figures under B's
   *  heading. The heading itself comes from `selected()`, so it never waits on this. */
  private readonly detailState = toSignal(
    combineLatest([
      this.route.queryParams.pipe(map((params) => parseParams(params).journal)),
      this.retry$,
    ]).pipe(
      distinctUntilChanged(([aj, aa], [bj, ba]) => aj === bj && aa === ba),
      switchMap(([journal]) =>
        journal === null
          ? of<Remote<JournalDetailResult>>({ status: 'loading' })
          : this.journals.detail(journal).pipe(
              map(
                (data): Remote<JournalDetailResult> =>
                  data === undefined ? { status: 'notFound' } : { status: 'ok', data },
              ),
              catchError(() => of<Remote<JournalDetailResult>>({ status: 'error' })),
              startWith<Remote<JournalDetailResult>>({ status: 'loading' }),
            ),
      ),
    ),
    { initialValue: { status: 'loading' } as Remote<JournalDetailResult> },
  );

  readonly rows = computed(() => this.listState().data?.rows ?? []);
  readonly corpus = computed(
    () => this.listState().data?.corpus ?? this.detailState().data?.corpus ?? null,
  );
  readonly rankedTotal = computed(() => this.listState().data?.total ?? 0);
  readonly listBusy = computed(() => this.listState().status === 'loading');
  readonly listError = computed(() => this.listState().status === 'error');

  readonly result = computed(() => this.detailState().data);
  /** True once a lookup has finished and found nothing -- a stale link or a hand-edited ?j=. */
  readonly notFound = computed(() => this.detailState().status === 'notFound');
  readonly detailError = computed(() => this.detailState().status === 'error');

  /** Percentages precomputed so the template can fall back to '—' without arithmetic on a
   *  value that may not have arrived yet. */
  readonly detailRatePct = computed(() => {
    const r = this.result();
    return r ? r.journal.positiveRate * 100 : null;
  });
  readonly detailSharePct = computed(() => {
    const r = this.result();
    return r ? r.shareOfCorpusPositive * 100 : null;
  });

  retry(): void {
    this.retry$.next(this.retry$.value + 1);
  }

  // ---- Single-journal lens ---------------------------------------------------------------------

  /** Counts per year. Two series on ONE axis -- both are papers per year, the same unit. */
  readonly trendSeries = computed<ChartSeries[]>(() => {
    const series = this.result()?.journal.series ?? [];
    return [
      {
        key: 'positive',
        label: 'AI/ML methods papers',
        color: 'var(--viz-series-1)',
        values: series.map((p) => p.positive),
      },
      {
        key: 'screened',
        label: 'All papers screened',
        color: 'var(--viz-series-2)',
        values: series.map((p) => p.screened),
      },
    ];
  });

  /** The share, as its own panel rather than a second y-axis on the chart above -- a percentage
   *  and a count share no scale, and overlaying them is the standard way a chart misleads. */
  readonly shareSeries = computed<ChartSeries[]>(() => {
    const series = this.result()?.journal.series ?? [];
    return [
      {
        key: 'share',
        label: 'AI/ML share of that year',
        color: 'var(--viz-series-1)',
        values: series.map((p) => (p.screened ? (p.positive / p.screened) * 100 : 0)),
      },
    ];
  });

  readonly years = computed(() => (this.result()?.journal.series ?? []).map((p) => p.year));
  readonly hasTrend = computed(() => this.years().length > 1);

  /** Query params that open this journal's records in the search page. */
  readonly recordsLink = computed(() => ({ jrnl: this.selected() ?? '' }));

  // ---- Navigation ------------------------------------------------------------------------------

  select(journal: string): void {
    this.navigate({ j: journal });
  }

  clearJournal(): void {
    this.navigate({ j: null });
  }

  setSort(sort: JournalSort): void {
    this.navigate({ view: sort === 'count' ? null : sort });
  }

  setMinScreened(value: string): void {
    const min = Number(value);
    this.navigate({ min: min === DEFAULT_MIN_SCREENED ? null : String(min) });
  }

  /** Merges into the existing params so changing the lens keeps the selected journal and vice
   *  versa; `null` drops a key, keeping a default-state URL clean. */
  private navigate(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }
}
