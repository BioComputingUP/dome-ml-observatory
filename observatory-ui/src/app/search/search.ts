import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, catchError, of, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { RecordsService, SearchFilters, SearchQuery, SearchResult, SortOrder } from '../core/records.service';
import {
  paramsToQuery,
  queryToParams,
  activeFilterCount,
  DEFAULT_CLASSIFICATION,
  MAX_RESULT_WINDOW,
} from '../core/search-params';
import { pubTypeLabel, sentenceCase } from '../core/facet-labels';
import { FacetPanel } from './facet-panel/facet-panel';
import { ResultCard } from './result-card/result-card';

/** Per-facet display transform for chip labels -- must match what the facet panel itself renders
 *  for the same value (facet-labels.ts), or a chip and its corresponding checkbox would disagree
 *  on what a filter is called. Facets not listed here render the raw value unchanged. */
const CHIP_VALUE_DISPLAY: Partial<Record<keyof SearchFilters, (v: string) => string>> = {
  pubTypes: pubTypeLabel,
  learningParadigm: sentenceCase,
  modelFamily: sentenceCase,
};

interface ActiveChip {
  label: string;
  clear: Partial<SearchFilters>;
}

const EMPTY_RESULT: SearchResult = { items: [], total: 0, totalRelation: 'eq', page: 1, pageSize: 25 };

@Component({
  selector: 'app-search',
  imports: [FacetPanel, ResultCard, DecimalPipe, DatePipe, RouterLink],
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
  /** True when the page fetch itself gave up on its time budget -- a 200 with an honest "that
   *  search was too slow" result, not the outage state (error()/searchErrorMessage below, which
   *  only ever fires on an actual HTTP error such as a 503). See records.service.ts (ws). */
  readonly timedOut = computed(() => this.results().timedOut === true);

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

  /** Live from /api/stats -- not hardcoded, not the cache's own `generated` timestamp (which
   *  changes every 24h regardless of whether the corpus moved). Absent until a classification run
   *  has actually landed, so the results-bar link only renders once there's a real date to show. */
  readonly lastClassifiedAt = computed(() => this.stats()?.last_classification?.timestamp ?? null);

  /** citation_count is null for every record today (see records.service.ts's SortOrder doc) --
   *  this drives the honest "not yet populated" note rather than letting the sort look like it
   *  did nothing for no reason. */
  readonly citationSortActive = computed(() => this.sort() === 'citations_desc' || this.sort() === 'citations_asc');

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

    // No classification chip: the search page no longer offers a classification filter at all
    // (see facet-panel.ts) -- the search space is always the positives, silently and permanently,
    // not a removable "AI/ML methods papers only" choice a user could clear. The API param and
    // its parsing rules (search-params.ts) are untouched for anyone hitting /api/records directly
    // or landing on an old bookmarked ?class= URL -- only this UI stops surfacing it.
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
      const display = CHIP_VALUE_DISPLAY[facet.key];
      for (const value of (f[facet.key] as string[] | undefined) ?? []) {
        const shown = value ? (display ? display(value) : value) : 'none recorded';
        chips.push({
          label: `${facet.label}: ${shown}`,
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

  /** Search button / Enter key: skip the 500ms debounce above and navigate on the field's
   *  current value right away -- an accelerator for anyone who'd rather not wait it out, not a
   *  replacement for live search (typing alone still searches on its own). */
  searchNow(value: string): void {
    this.navigate({ ...this.query(), q: value || undefined, page: 1 }, true);
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
    // classification: DEFAULT_CLASSIFICATION, not []. [] means "explicitly cleared" on the wire
    // (see search-params.ts's resolveClassification) and would silently widen the search from the
    // 355,558 positives to all 827,061 screened records -- the opposite of what "clear all
    // filters" should do now that the classification filter isn't a user-removable chip any more.
    this.navigate({ ...this.query(), q: undefined, filters: { classification: DEFAULT_CLASSIFICATION }, page: 1 });
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
