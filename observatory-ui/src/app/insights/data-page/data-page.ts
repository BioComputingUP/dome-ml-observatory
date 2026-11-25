import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { InsightsService } from '../../core/insights.service';
import {
  DataOverview,
  DesignationKey,
  ResourceDetail,
  ResourceRow,
} from '../../core/insights.model';
import { sentenceCase } from '../../core/facet-labels';
import { MultiplePanel, SmallMultiples } from '../../shared/small-multiples/small-multiples';
import { StackSeries, StackedBars } from '../../shared/stacked-bars/stacked-bars';
import { HeatColumn, HeatRow, Heatmap } from '../../shared/heatmap/heatmap';
import { RankedBar, RankedBars, SegmentKey } from '../../shared/ranked-bars/ranked-bars';
import { ChartSeries, LineChart } from '../../shared/line-chart/line-chart';
import { ChartLink, formatShare } from '../../shared/viz';
import { Remote } from '../remote';

/** A year needs this many linking papers to be drawn. */
const MIN_YEAR_PAPERS = 50;
const TOP_BARS = 20;
const TREND_PANELS = 12;
const HEAT_ROWS = 15;
/** Categories drawn in the stack; the rest fold into "Other kinds". */
const STACK_CATEGORIES = 6;

/** Short names for the designation badges and filter chips. */
const DESIGNATION_SHORT: Record<DesignationKey, string> = {
  embl_ebi: 'EMBL-EBI',
  elixir_cdr: 'ELIXIR Core Data Resource',
  elixir_edd: 'ELIXIR Deposition Database',
  gcbr: 'Global Core Biodata Resource',
};
const BADGE: Record<DesignationKey, string> = {
  embl_ebi: 'EMBL-EBI',
  elixir_cdr: 'ELIXIR CDR',
  elixir_edd: 'ELIXIR DD',
  gcbr: 'GCBR',
};
const DESIGNATIONS = Object.keys(DESIGNATION_SHORT) as DesignationKey[];

/** Plain names for the kinds the page leaves out. */
const KIND_NAMES: Record<string, string> = {
  code: 'code hosts',
  identifier: 'generic identifiers',
  model_hub: 'model hubs',
  ontology: 'ontologies',
  software_registry: 'software registries',
  transparency_report: 'reporting registries',
};

export const LINK_KINDS: SegmentKey[] = [
  { key: 'deposited', label: 'Deposited', color: 'var(--viz-series-2)' },
  { key: 'mentioned', label: 'Mentioned in the text', color: 'var(--viz-series-1)' },
  { key: 'other', label: 'Other route', color: 'var(--viz-muted)' },
];

function hasDesignation(r: ResourceRow, key: DesignationKey): boolean {
  return key === 'embl_ebi' ? r.embl_ebi : Boolean(r[key]);
}

/**
 * Data: which data resources AI/ML methods papers link to, how the links were found, and how that
 * has changed. Filters for EMBL-EBI, the ELIXIR designations, Global Core Biodata Resources, ELIXIR
 * Nodes and data category apply to every chart. All state is in the URL.
 */
@Component({
  selector: 'app-data-page',
  imports: [DecimalPipe, RouterLink, SmallMultiples, StackedBars, Heatmap, RankedBars, LineChart],
  templateUrl: './data-page.html',
  styleUrl: './data-page.scss',
})
export class DataPage {
  private readonly insights = inject(InsightsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly retry$ = new BehaviorSubject(0);

  readonly linkKinds = LINK_KINDS;
  readonly designationKeys = DESIGNATIONS;
  readonly designationShort = DESIGNATION_SHORT;

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly tag = computed<DesignationKey | null>(() => {
    const t = this.params().get('tag');
    return DESIGNATIONS.includes(t as DesignationKey) ? (t as DesignationKey) : null;
  });
  readonly node = computed(() => this.params().get('node') || null);
  readonly category = computed(() => this.params().get('cat') || null);
  readonly selectedSlug = computed(() => this.params().get('r') || null);
  readonly view = computed(() => (this.params().get('view') === 'count' ? 'count' : 'share'));
  readonly showAll = computed(() => this.params().get('all') === '1');

  private readonly state = toSignal(
    this.retry$.pipe(
      switchMap(() =>
        this.insights.data().pipe(
          map((data): Remote<DataOverview> => ({ status: 'ok', data })),
          catchError(() => of<Remote<DataOverview>>({ status: 'error' })),
          startWith<Remote<DataOverview>>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as Remote<DataOverview> },
  );

  private readonly detailState = toSignal(
    combineLatest([this.route.queryParamMap.pipe(map((p) => p.get('r') || null)), this.retry$]).pipe(
      switchMap(([slug]) =>
        slug === null
          ? of<Remote<ResourceDetail>>({ status: 'loading' })
          : this.insights.resource(slug).pipe(
              map(
                (data): Remote<ResourceDetail> =>
                  data === undefined ? { status: 'notFound' } : { status: 'ok', data },
              ),
              catchError(() => of<Remote<ResourceDetail>>({ status: 'error' })),
              startWith<Remote<ResourceDetail>>({ status: 'loading' }),
            ),
      ),
    ),
    { initialValue: { status: 'loading' } as Remote<ResourceDetail> },
  );

  readonly data = computed(() => this.state().data ?? null);
  readonly loading = computed(() => this.state().status === 'loading');
  readonly failed = computed(() => this.state().status === 'error');
  readonly detail = computed(() => this.detailState().data ?? null);
  readonly detailMissing = computed(() => this.detailState().status === 'notFound');
  readonly detailFailed = computed(() => this.detailState().status === 'error');

  readonly linkingPct = computed(() => {
    const d = this.data();
    return d && d.scope.positive ? (d.scope.linking / d.scope.positive) * 100 : null;
  });

  readonly ebiPct = computed(() => {
    const d = this.data();
    const ebi = d?.designations.find((x) => x.key === 'embl_ebi');
    return d && ebi && d.scope.linking ? (ebi.papers / d.scope.linking) * 100 : null;
  });

  readonly designations = computed(() =>
    DESIGNATIONS.map((key) => {
      const summary = this.data()?.designations.find((x) => x.key === key);
      return {
        key,
        label: DESIGNATION_SHORT[key],
        pending: summary?.status === 'pending',
        papers: summary?.papers ?? 0,
        resources: summary?.resources ?? 0,
        source: summary?.source ?? null,
      };
    }),
  );

  readonly nodesPending = computed(() => !this.data()?.nodes.length);

  readonly excludedText = computed(() => {
    const names = (this.data()?.scope.excludedKinds ?? []).map((k) => KIND_NAMES[k.kind] ?? k.kind);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
  });

  readonly categories = computed(() => (this.data()?.categories ?? []).map((c) => c.value));

  /** Resources passing every filter, in rank order. */
  readonly filtered = computed(() => {
    const tag = this.tag();
    const node = this.node();
    const cat = this.category();
    return (this.data()?.resources ?? []).filter(
      (r) =>
        (!tag || hasDesignation(r, tag)) &&
        (!node || r.elixir_nodes.includes(node)) &&
        (!cat || r.category === cat),
    );
  });

  readonly filterActive = computed(() => Boolean(this.tag() || this.node() || this.category()));

  readonly filterSummary = computed(() => {
    const tag = this.tag();
    const summary = tag ? this.data()?.designations.find((x) => x.key === tag) : null;
    // A paper count is only exact for a designation on its own; several filters together would
    // add up papers that link more than one resource.
    return {
      resources: this.filtered().length,
      papers: summary && !this.node() && !this.category() ? summary.papers : null,
    };
  });

  badges(r: ResourceRow): string[] {
    return DESIGNATIONS.filter((k) => hasDesignation(r, k)).map((k) => BADGE[k]);
  }

  readonly bars = computed<RankedBar[]>(() => {
    const rows = this.showAll() ? this.filtered() : this.filtered().slice(0, TOP_BARS);
    const selected = this.selectedSlug();
    return rows.map((r) => ({
      key: r.slug,
      label: r.label,
      badges: this.badges(r),
      segments: [
        { key: 'deposited', value: r.deposited },
        { key: 'mentioned', value: r.mentioned },
        { key: 'other', value: r.other },
      ],
      link: { path: '/data', queryParams: { ...this.keptParams(), r: r.slug } },
      searchLink: { path: '/search', queryParams: { dl: r.slug } },
      selected: r.slug === selected,
    }));
  });

  /** Years with enough linking papers to draw. */
  private readonly window = computed(() => {
    const d = this.data();
    if (!d) return { start: 0, years: [] as number[] };
    const start = Math.max(0, d.linkingByYear.findIndex((n) => n >= MIN_YEAR_PAPERS));
    return { start, years: d.years.slice(start) };
  });
  readonly years = computed(() => this.window().years);
  readonly firstYear = computed(() => this.years()[0] ?? null);
  readonly lastPartial = computed(() => this.data()?.lastYearPartial ?? false);
  readonly unit = computed(() => (this.view() === 'share' ? '%' : ''));

  readonly trendPanels = computed<MultiplePanel[]>(() => {
    const d = this.data();
    if (!d) return [];
    const { start } = this.window();
    const base = d.positiveByYear.slice(start);
    return this.filtered()
      .slice(0, TREND_PANELS)
      .map((r) => {
        const counts = r.series.slice(start);
        return {
          key: r.slug,
          label: r.label,
          values:
            this.view() === 'share' ? counts.map((n, i) => (base[i] ? (n / base[i]) * 100 : 0)) : counts,
          note: `${r.papers.toLocaleString('en-GB')} papers`,
          link: { path: '/data', queryParams: { ...this.keptParams(), r: r.slug } },
        };
      });
  });

  readonly categoryStack = computed(() => {
    const d = this.data();
    if (!d) return { years: [] as number[], series: [] as StackSeries[] };
    const { start, years } = this.window();
    const cats = d.categories;
    const shown = cats.slice(0, STACK_CATEGORIES);
    const rest = cats.slice(STACK_CATEGORIES);
    const series: StackSeries[] = shown.map((c) => ({
      key: c.value,
      label: c.value,
      values: c.series.slice(start),
    }));
    if (rest.length) {
      series.push({
        key: 'other',
        label: 'Other kinds',
        values: years.map((_, i) => rest.reduce((a, c) => a + (c.series[start + i] ?? 0), 0)),
      });
    }
    return { years, series };
  });

  readonly familyColumns = computed<HeatColumn[]>(() =>
    (this.data()?.families ?? []).map((f) => ({ key: f.value, label: sentenceCase(f.value) })),
  );

  readonly resourceFamilyRows = computed<HeatRow[]>(() => {
    const d = this.data();
    if (!d) return [];
    const cells = new Map(d.resourceFamilies.map((r) => [r.slug, r]));
    return this.filtered()
      .filter((r) => r.enriched > 0)
      .slice(0, HEAT_ROWS)
      .map((r) => ({
        key: r.slug,
        label: r.label,
        total: r.enriched,
        cells: cells.get(r.slug)?.cells ?? [],
        highlight: r.slug === this.selectedSlug(),
        link: { path: '/data', queryParams: { ...this.keptParams(), r: r.slug } },
      }));
  });

  readonly resourceFamilyCell = (row: HeatRow, column: HeatColumn): ChartLink => ({
    path: '/search',
    queryParams: { dl: row.key, fam: column.key, enriched: 'true' },
  });

  // ---- The selected resource -----------------------------------------------------------------

  readonly detailSeries = computed<ChartSeries[]>(() => {
    const d = this.detail();
    if (!d) return [];
    return [{ key: 'papers', label: 'Papers', color: 'var(--viz-series-2)', values: d.resource.series }];
  });

  readonly detailFamilies = computed(() =>
    (this.detail()?.families ?? [])
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
  );

  detailDesignations(r: ResourceRow): string[] {
    const out: string[] = [];
    if (r.embl_ebi) out.push('Hosted at EMBL-EBI');
    if (r.elixir_cdr) out.push('ELIXIR Core Data Resource');
    if (r.elixir_edd) out.push('ELIXIR Deposition Database');
    if (r.gcbr) out.push(r.gcbr === r.label ? 'Global Core Biodata Resource' : `Global Core Biodata Resource (${r.gcbr})`);
    return out;
  }

  share(value: number): string {
    return formatShare(value);
  }

  family(value: string): string {
    return sentenceCase(value);
  }

  // ---- URL state ------------------------------------------------------------------------------

  /** The filters, kept on links that open a resource so the page around it does not change. */
  private keptParams(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of ['tag', 'node', 'cat', 'view', 'all']) {
      const v = this.params().get(key);
      if (v) out[key] = v;
    }
    return out;
  }

  private set(params: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  setTag(tag: DesignationKey | null): void {
    this.set({ tag });
  }

  setNode(node: string): void {
    this.set({ node: node || null });
  }

  setCategory(cat: string): void {
    this.set({ cat: cat || null });
  }

  setView(view: 'share' | 'count'): void {
    this.set({ view: view === 'share' ? null : view });
  }

  toggleAll(): void {
    this.set({ all: this.showAll() ? null : '1' });
  }

  clearFilters(): void {
    this.set({ tag: null, node: null, cat: null });
  }

  closeDetail(): void {
    this.set({ r: null });
  }

  retry(): void {
    this.retry$.next(this.retry$.value + 1);
  }
}
