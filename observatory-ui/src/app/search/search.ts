import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, catchError, of, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { RecordsService, SearchFilters, SearchQuery, SearchResult, SortOrder } from '../core/records.service';
import {
  paramsToQuery,
  queryToParams,
  activeFilterCount,
  isDefaultClassification,
  MAX_RESULT_WINDOW,
} from '../core/search-params';
import { FacetPanel } from './facet-panel/facet-panel';
import { ResultCard } from './result-card/result-card';

interface ActiveChip {
  label: string;
  clear: Partial<SearchFilters>;
}

const EMPTY_RESULT: SearchResult = { items: [], total: 0, totalRelation: 'eq', page: 1, pageSize: 25 };

@Component({
  selector: 'app-search',
  imports: [FacetPanel, ResultCard, DecimalPipe, RouterLink],
  templateUrl: './search.html',
  styleUrl: './search.scss',
})
export class Search {
  private readonly records = inject(RecordsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** The URL is the state: everything below derives from query params, so any result set is
   *  bookmarkable, citable and shareable. */
  private readonly query = toSignal(
    this.route.queryParams.pipe(map((params) => paramsToQuery(params))),
    { initialValue: paramsToQuery({}) },
  );

  readonly filters = computed(() => this.query().filters);
  readonly sort = computed(() => this.query().sort);
  readonly page = computed(() => this.query().page);
  readonly freeText = computed(() => this.query().q ?? '');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** True while a free-text search against the real corpus is in flight -- q searches are the
   *  slow path (measured against the database server: ~4-10s depending on term rarity, see
   *  internal/ROADMAP.md Phase 5's timing table), unlike filter-only searches which stay fast. */
  readonly searchingFullText = computed(() => this.loading() && this.freeText().length > 0);

  private readonly results = toSignal(
    this.route.queryParams.pipe(
      map((params) => paramsToQuery(params)),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap((query) => {
        this.loading.set(true);
        this.error.set(null);
        return this.records.search(query).pipe(
          catchError((err: unknown) => {
            this.error.set(searchErrorMessage(err));
            return of(EMPTY_RESULT);
          }),
        );
      }),
      map((result) => {
        this.loading.set(false);
        return result;
      }),
    ),
    { initialValue: EMPTY_RESULT },
  );

  readonly items = computed(() => this.results().items);
  readonly total = computed(() => this.results().total);
  readonly totalRelation = computed(() => this.results().totalRelation);

  /** 'gte' always means exactly MAX_RESULT_WINDOW (10,000) -- an uncertain lower bound, not an
   *  exact count. Render "10,000+", never a bare number -- see records.service.ts. */
  readonly totalLabel = computed(() =>
    this.totalRelation() === 'gte' ? `${this.total().toLocaleString()}+` : this.total().toLocaleString(),
  );

  readonly rangeStart = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.query().pageSize + 1));
  readonly rangeEnd = computed(() => Math.min(this.page() * this.query().pageSize, this.total()));

  /** observatory-ws hard-rejects page * pageSize > MAX_RESULT_WINDOW (400, not a clamp) -- the
   *  pager must never offer a page that would 400. Capped independently of the (possibly
   *  uncertain, possibly much larger) total. */
  readonly totalPages = computed(() => {
    const pageSize = this.query().pageSize;
    const byTotal = Math.max(1, Math.ceil(this.total() / pageSize));
    const byWindow = Math.floor(MAX_RESULT_WINDOW / pageSize);
    return Math.min(byTotal, byWindow);
  });

  /** True when the real result count would need more pages than the browsable window allows --
   *  drives an honest "browse caps at N; use Download for the rest" note near the pager. */
  readonly cappedByResultWindow = computed(
    () => this.totalRelation() === 'gte' || Math.ceil(this.total() / this.query().pageSize) > this.totalPages(),
  );

  readonly stats = toSignal(this.records.getFacetStats().pipe(catchError(() => of(null))), { initialValue: null });
  readonly vocab = toSignal(this.records.getVocabularies().pipe(catchError(() => of(null))), { initialValue: null });

  /** Bound once, passed down to FacetPanel -> FacetTypeahead: journal and MeSH have no controlled
   *  vocabulary and too many corpus-wide values to ship as a static list, so their typeaheads
   *  query observatory-ws's /api/facets/:field cache live instead. */
  readonly journalSearch = (q: string) => this.records.facetValues('journal', q);
  readonly meshSearch = (q: string) => this.records.facetValues('mesh_headings', q);

  readonly activeCount = computed(() => activeFilterCount(this.filters()));
  readonly facetsOpen = signal(false);

  readonly chips = computed<ActiveChip[]>(() => {
    const f = this.filters();
    const chips: ActiveChip[] = [];

    if (f.classification?.length) {
      const label = isDefaultClassification(f.classification)
        ? 'AI/ML methods papers only'
        : `Classification: ${f.classification.join(', ')}`;
      // Clearing sets [] rather than undefined -- "explicitly cleared", so it doesn't snap back
      // to the positive default on the next URL read.
      chips.push({ label, clear: { classification: [] } });
    }
    if (f.openAccess !== undefined) {
      chips.push({ label: f.openAccess ? 'Open access' : 'Not open access', clear: { openAccess: undefined } });
    }
    if (f.fulltextAvailable !== undefined) {
      chips.push({ label: 'Full text available', clear: { fulltextAvailable: undefined } });
    }
    if (f.yearMin != null || f.yearMax != null) {
      chips.push({ label: `Year ${f.yearMin ?? '…'}–${f.yearMax ?? '…'}`, clear: { yearMin: undefined, yearMax: undefined } });
    }
    if (f.enrichedOnly) {
      chips.push({ label: 'Enriched only', clear: { enrichedOnly: undefined } });
    }

    const listFacets: { key: keyof SearchFilters; label: string }[] = [
      { key: 'license', label: 'Licence' },
      { key: 'journal', label: 'Journal' },
      { key: 'meshHeadings', label: 'MeSH' },
      { key: 'keywordsAuthor', label: 'Keyword' },
      { key: 'pubTypes', label: 'Type' },
      { key: 'domainTier1', label: 'Domain 1' },
      { key: 'domainTier2', label: 'Domain 2' },
      { key: 'domainTier3', label: 'Domain 3' },
      { key: 'learningParadigm', label: 'Paradigm' },
      { key: 'modelFamily', label: 'Family' },
      { key: 'modelType', label: 'Method' },
    ];
    for (const facet of listFacets) {
      for (const value of (f[facet.key] as string[] | undefined) ?? []) {
        chips.push({
          label: `${facet.label}: ${value || 'none recorded'}`,
          clear: {
            [facet.key]: ((f[facet.key] as string[]).filter((v) => v !== value) as string[]).length
              ? (f[facet.key] as string[]).filter((v) => v !== value)
              : undefined,
          } as Partial<SearchFilters>,
        });
      }
    }
    return chips;
  });

  private readonly textInput$ = new Subject<string>();

  constructor() {
    // Typing shouldn't push a history entry per keystroke -- debounce, then replace. 500ms (not
    // 300ms): free-text now hits the real corpus (~4-10s for a full search, see
    // searchingFullText above), so there's no benefit to firing sooner.
    this.textInput$.pipe(debounceTime(500), distinctUntilChanged()).subscribe((value) => {
      this.navigate({ ...this.query(), q: value || undefined, page: 1 }, true);
    });
  }

  onTextInput(value: string): void {
    this.textInput$.next(value);
  }

  applyFilters(patch: Partial<SearchFilters>): void {
    const next: SearchQuery = {
      ...this.query(),
      filters: { ...this.filters(), ...patch },
      page: 1,
    };
    this.navigate(next);
  }

  clearChip(chip: ActiveChip): void {
    this.applyFilters(chip.clear);
  }

  clearAll(): void {
    this.navigate({ ...this.query(), q: undefined, filters: { classification: [] }, page: 1 });
  }

  setSort(sort: string): void {
    this.navigate({ ...this.query(), sort: sort as SortOrder, page: 1 });
  }

  goToPage(page: number): void {
    this.navigate({ ...this.query(), page });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private navigate(query: SearchQuery, replaceUrl = false): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryToParams(query),
      replaceUrl,
    });
  }
}

/** message is a plain string for hand-thrown Nest exceptions but string[] for ValidationPipe
 *  failures (see observatory-ws/src/records/dto/search-records.dto.ts) -- handle both. */
function searchErrorMessage(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return 'Could not load results. Please try again.';
  }
  if (err.status === 503) {
    return 'Database temporarily unavailable — please retry shortly.';
  }
  if (err.status === 400) {
    const msg: unknown = err.error?.message;
    if (Array.isArray(msg)) return msg.join(' ');
    if (typeof msg === 'string') return msg;
  }
  return 'Could not load results. Please try again.';
}
