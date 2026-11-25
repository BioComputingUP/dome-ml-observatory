import { Component, computed, inject } from '@angular/core';
import { DecimalPipe, LowerCasePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { InsightsService } from '../../core/insights.service';
import { CountSeries, JournalModelProfile, ModelsOverview, Mover } from '../../core/insights.model';
import { modelTypeLabel, sentenceCase } from '../../core/facet-labels';
import { JournalSearch } from '../../journals/journal-search/journal-search';
import { MultiplePanel, SmallMultiples } from '../../shared/small-multiples/small-multiples';
import { StackSeries, StackedBars } from '../../shared/stacked-bars/stacked-bars';
import { BumpChart, BumpSeries } from '../../shared/bump-chart/bump-chart';
import { HeatColumn, HeatRow, Heatmap } from '../../shared/heatmap/heatmap';
import { ChartLink, formatShare } from '../../shared/viz';
import { Remote } from '../remote';

/** A year needs this many enriched papers to be drawn: a share of a dozen papers is noise. */
export const MIN_YEAR_PAPERS = 50;
/** Rows of the journal grid. */
const JOURNAL_ROWS = 25;
/** Lines on the rank chart, and the years it spans. */
const BUMP_SERIES = 12;
const BUMP_YEARS = 10;

/** model_use in the vocabulary's order, the order the stack is drawn in. */
const USE_ORDER = [
  'trained in this study',
  'fine-tuned or adapted',
  'pretrained, applied as-is',
  'prompted (zero/few-shot)',
];

type View = 'share' | 'count';

/** Search with only enriched papers, so a count on this page matches the count it opens. */
function search(params: Record<string, string>): ChartLink {
  return { path: '/search', queryParams: { ...params, enriched: 'true' } };
}

/**
 * Models: which kinds of model AI/ML methods papers report, how that has changed, and which
 * journals and research domains lean towards which. Every figure covers the enriched papers only,
 * and the page says how many those are before anything else.
 *
 * The URL holds the state (?view=share|count, ?j=<journal>), so any view is shareable.
 */
@Component({
  selector: 'app-models-page',
  imports: [DecimalPipe, LowerCasePipe, RouterLink, JournalSearch, SmallMultiples, StackedBars, BumpChart, Heatmap],
  templateUrl: './models-page.html',
  styleUrl: './models-page.scss',
})
export class ModelsPage {
  private readonly insights = inject(InsightsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly retry$ = new BehaviorSubject(0);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly view = computed<View>(() => (this.params().get('view') === 'count' ? 'count' : 'share'));
  readonly journalName = computed(() => this.params().get('j')?.trim() || null);

  private readonly state = toSignal(
    this.retry$.pipe(
      switchMap(() =>
        this.insights.models().pipe(
          map((data): Remote<ModelsOverview> => ({ status: 'ok', data })),
          catchError(() => of<Remote<ModelsOverview>>({ status: 'error' })),
          startWith<Remote<ModelsOverview>>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as Remote<ModelsOverview> },
  );

  private readonly journalState = toSignal(
    combineLatest([this.route.queryParamMap.pipe(map((p) => p.get('j')?.trim() || null)), this.retry$]).pipe(
      switchMap(([name]) =>
        name === null
          ? of<Remote<JournalModelProfile>>({ status: 'loading' })
          : this.insights.journal(name).pipe(
              map(
                (data): Remote<JournalModelProfile> =>
                  data === undefined ? { status: 'notFound' } : { status: 'ok', data },
              ),
              catchError(() => of<Remote<JournalModelProfile>>({ status: 'error' })),
              startWith<Remote<JournalModelProfile>>({ status: 'loading' }),
            ),
      ),
    ),
    { initialValue: { status: 'loading' } as Remote<JournalModelProfile> },
  );

  readonly data = computed(() => this.state().data ?? null);
  readonly loading = computed(() => this.state().status === 'loading');
  readonly failed = computed(() => this.state().status === 'error');
  readonly journal = computed(() => this.journalState().data ?? null);
  readonly journalMissing = computed(() => this.journalState().status === 'notFound');

  readonly coveragePct = computed(() => {
    const d = this.data();
    return d && d.coverage.positive ? (d.coverage.enriched / d.coverage.positive) * 100 : null;
  });

  /** Years with enough enriched papers to draw a share, from the first such year to the end. */
  private readonly window = computed(() => {
    const d = this.data();
    if (!d) return { start: 0, years: [] as number[] };
    const start = Math.max(0, d.enrichedByYear.findIndex((n) => n >= MIN_YEAR_PAPERS));
    return { start, years: d.years.slice(start) };
  });
  readonly years = computed(() => this.window().years);
  readonly firstYear = computed(() => this.years()[0] ?? null);
  readonly lastPartial = computed(() => this.data()?.lastYearPartial ?? false);

  private panels(series: CountSeries[], param: string, label: (v: string) => string): MultiplePanel[] {
    const d = this.data();
    if (!d) return [];
    const { start } = this.window();
    const base = d.enrichedByYear.slice(start);
    return series.map((s) => {
      const counts = s.series.slice(start);
      return {
        key: s.value,
        label: label(s.value),
        values:
          this.view() === 'share'
            ? counts.map((n, i) => (base[i] ? (n / base[i]) * 100 : 0))
            : counts,
        note: `${s.total.toLocaleString('en-GB')} papers`,
        link: search({ [param]: s.value }),
      };
    });
  }

  readonly familyPanels = computed(() => this.panels(this.data()?.families ?? [], 'fam', sentenceCase));
  readonly paradigmPanels = computed(() =>
    this.panels(this.data()?.paradigms ?? [], 'para', sentenceCase),
  );
  readonly unit = computed(() => (this.view() === 'share' ? '%' : ''));

  /** Model use starts where e2/e3 records do: before that the field is empty by design. */
  readonly useStack = computed(() => {
    const d = this.data();
    if (!d) return { years: [] as number[], series: [] as StackSeries[] };
    const start = Math.max(0, d.withUseByYear.findIndex((n) => n >= MIN_YEAR_PAPERS));
    const byValue = new Map(d.uses.map((u) => [u.value, u]));
    const ordered = [
      ...USE_ORDER.filter((v) => byValue.has(v)),
      ...d.uses.map((u) => u.value).filter((v) => !USE_ORDER.includes(v)),
    ];
    return {
      years: d.years.slice(start),
      series: ordered.map((v) => ({
        key: v,
        label: sentenceCase(v),
        values: byValue.get(v)!.series.slice(start),
      })),
    };
  });

  readonly bump = computed(() => {
    const d = this.data();
    if (!d) return { years: [] as number[], series: [] as BumpSeries[] };
    const n = d.years.length;
    const start = Math.max(this.window().start, n - BUMP_YEARS);
    return {
      years: d.years.slice(start),
      series: d.modelTypes.top.slice(0, BUMP_SERIES).map((t) => ({
        key: t.value,
        label: modelTypeLabel(t.value),
        values: t.series.slice(start),
        link: search({ mt: t.value }),
      })),
    };
  });

  readonly movers = computed(() => this.data()?.movers ?? null);

  moverLink(m: Mover): ChartLink {
    return search({ mt: m.value });
  }

  moverLabel(m: Mover): string {
    return modelTypeLabel(m.value);
  }

  share(value: number): string {
    return formatShare(value);
  }

  change(m: Mover): string {
    const sign = m.change > 0 ? '+' : '−';
    return `${sign}${Math.abs(m.change).toFixed(1)} points`;
  }

  readonly familyColumns = computed<HeatColumn[]>(() =>
    (this.data()?.families ?? []).map((f) => ({ key: f.value, label: sentenceCase(f.value) })),
  );

  readonly journalRows = computed<HeatRow[]>(() => {
    const d = this.data();
    if (!d) return [];
    const picked = this.journal()?.profile ?? null;
    const rows = d.journals.rows.slice(0, JOURNAL_ROWS).filter((r) => r.name !== picked?.name);
    const toRow = (r: { name: string; enriched: number; cells: HeatRow['cells'] }, highlight = false): HeatRow => ({
      key: r.name,
      label: r.name,
      total: r.enriched,
      cells: r.cells,
      highlight,
      link: { path: '/journals', queryParams: { j: r.name } },
    });
    return [...(picked ? [toRow(picked, true)] : []), ...rows.map((r) => toRow(r))];
  });

  readonly domainRows = computed<HeatRow[]>(() =>
    (this.data()?.domains ?? []).map((r) => ({
      key: r.name,
      label: r.name,
      total: r.enriched,
      cells: r.cells,
    })),
  );

  readonly journalCell = (row: HeatRow, column: HeatColumn): ChartLink =>
    search({ jrnl: row.key, fam: column.key });
  readonly domainCell = (row: HeatRow, column: HeatColumn): ChartLink =>
    search({ d1: row.key, fam: column.key });

  /** The picked journal's strongest leanings, for the sentence above the grid. */
  readonly journalSummary = computed(() => {
    const j = this.journal();
    if (!j) return null;
    const cells = j.profile.cells.filter((c) => c.count >= 5 && c.lift !== null);
    const top = [...cells].sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))[0];
    return { profile: j.profile, rank: j.rank, rankOf: j.rankOf, top, small: j.profile.enriched < j.minEnriched };
  });

  setView(view: View): void {
    void this.router.navigate([], {
      queryParams: { view: view === 'share' ? null : view },
      queryParamsHandling: 'merge',
    });
  }

  pickJournal(name: string): void {
    void this.router.navigate([], { queryParams: { j: name }, queryParamsHandling: 'merge' });
  }

  clearJournal(): void {
    void this.router.navigate([], { queryParams: { j: null }, queryParamsHandling: 'merge' });
  }

  retry(): void {
    this.retry$.next(this.retry$.value + 1);
  }

  label(value: string): string {
    return sentenceCase(value);
  }
}
