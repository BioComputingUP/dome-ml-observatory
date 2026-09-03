import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
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

  readonly listLoading = signal(false);
  readonly detailLoading = signal(false);

  /** The ranking. Refetched when the lens or floor changes, not when a journal is selected. */
  private readonly list = toSignal(
    this.route.queryParams.pipe(
      map((params) => parseParams(params)),
      map((q) => ({ sort: q.sort, minScreened: q.minScreened })),
      distinctUntilChanged((a, b) => a.sort === b.sort && a.minScreened === b.minScreened),
      tap(() => this.listLoading.set(true)),
      switchMap((q) =>
        this.journals
          .list({ sort: q.sort, minScreened: q.minScreened, limit: TOP_N })
          .pipe(catchError(() => of(null))),
      ),
      tap(() => this.listLoading.set(false)),
    ),
    { initialValue: null as JournalListResult | null },
  );

  private readonly detail = toSignal(
    this.route.queryParams.pipe(
      map((params) => parseParams(params).journal),
      distinctUntilChanged(),
      tap((journal) => this.detailLoading.set(journal !== null)),
      switchMap((journal) =>
        journal === null
          ? of(undefined)
          : this.journals.detail(journal).pipe(catchError(() => of(undefined))),
      ),
      tap(() => this.detailLoading.set(false)),
    ),
    { initialValue: undefined as JournalDetailResult | undefined },
  );

  readonly rows = computed(() => this.list()?.rows ?? []);
  readonly corpus = computed(() => this.list()?.corpus ?? this.detail()?.corpus ?? null);
  readonly rankedTotal = computed(() => this.list()?.total ?? 0);

  readonly result = computed(() => this.detail());
  /** True once a lookup has finished and found nothing -- a stale link or a hand-edited ?j=. */
  readonly notFound = computed(
    () => this.selected() !== null && !this.detailLoading() && this.detail() === undefined,
  );

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
