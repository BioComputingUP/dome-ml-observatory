import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, filter, switchMap, catchError, of, map, tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { RecordsService, SearchFilters, SearchInfo, SearchQuery, SearchResult, SortOrder } from '../core/records.service';
import { searchHighlightTerms } from '../core/search-terms';
import { SearchStateService } from '../core/search-state.service';
import {
  paramsToQuery,
  queryToParams,
  activeFilterCount,
  DEFAULT_CLASSIFICATION,
  MAX_RESULT_WINDOW,
} from '../core/search-params';
import { modelTypeLabel, pubTypeLabel, sentenceCase } from '../core/facet-labels';
import { resourceLabel } from '../core/data-links';
import { FacetPanel } from './facet-panel/facet-panel';
import { ResultCard } from './result-card/result-card';

/** Per-facet display transform for chip labels -- must match what the facet panel itself renders
 *  for the same value (facet-labels.ts), or a chip and its corresponding checkbox would disagree
 *  on what a filter is called. Facets not listed here render the raw value unchanged. */
const CHIP_VALUE_DISPLAY: Partial<Record<keyof SearchFilters, (v: string) => string>> = {
  pubTypes: pubTypeLabel,
  learningParadigm: sentenceCase,
  modelFamily: sentenceCase,
  modelType: modelTypeLabel,
  dataResources: resourceLabel,
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
  private readonly searchState = inject(SearchStateService);

  /** The URL is the state: everything below derives from query params, so any result set is
   *  bookmarkable, citable and shareable. */
  private readonly query = toSignal(
    this.route.queryParams.pipe(
      // Hand the current results URL to SearchStateService so a record page's "back to search"
      // returns here rather than to an empty search. Recorded on every param change, including the
      // first load, so it is already correct by the time any result is clicked.
      tap((params) => this.searchState.remember(params)),
      map((params) => paramsToQuery(params)),
    ),
    { initialValue: paramsToQuery({}) },
  );

  readonly filters = computed(() => this.query().filters);
  readonly sort = computed(() => this.query().sort);
  readonly page = computed(() => this.query().page);
  readonly freeText = computed(() => this.query().q ?? '');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** True while a word-beginning (`*`) search is in flight: the one kind of free-text search that
   *  still takes the scan path, several seconds against the live corpus. Every other free-text
   *  search is served from the index in about a second. */
  readonly searchingByPrefix = computed(() => this.loading() && this.freeText().includes('*'));

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

  /** How the free text was matched, from the API; null with no free text. */
  readonly searchInfo = computed<SearchInfo | null>(() => this.results().search ?? null);

  /** What to mark in each result: the typed terms plus whatever the API also searched. */
  readonly highlightTerms = computed(() =>
    searchHighlightTerms(this.freeText(), this.searchInfo()?.expansions ?? []),
  );

  /**
   * One line under the count saying how the text was matched, so nobody has to guess why
   * "dome" no longer finds "domestic" -- and how to get that back (`dome*`). `suggest` is a
   * query the person can run with one click.
   */
  readonly matchNote = computed<{ text: string; suggest?: string } | null>(() => {
    const info = this.searchInfo();
    const q = this.freeText();
    if (!info || !q || this.loading() || this.error()) return null;

    const spellings = info.expansions
      .map((e) => `${e.term} also searched as ${listWords(e.alternatives)}`)
      .join('; ');
    const expanded = spellings ? ` ${spellings}.` : '';

    switch (info.matched) {
      case 'identifier':
        return { text: 'Matched by identifier.' };
      case 'author':
        return { text: `Matched as an author name.${expanded}` };
      case 'prefix':
        return q.includes('*')
          ? { text: `Matching word beginnings for ${q}.${expanded}` }
          : { text: `No whole-word matches for ${q}; showing words that begin with it.${expanded}` };
      default: {
        const single = !/\s/.test(q) && !q.includes('"');
        const few = this.total() > 0 && this.total() <= 100;
        const lead =
          single && few
            ? `${this.totalLabel()} whole-word matches for ${q}.`
            : `Whole-word matches for ${q}.`;
        return single
          ? { text: `${lead}${expanded} For words beginning with it, search`, suggest: `${q}*` }
          : { text: `${lead}${expanded} Add * to a word to match its beginnings.` };
      }
    }
  });

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
      { key: 'dataResources', label: 'Linked data' },
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

  /** The search box. Deliberately NOT bound with `[value]="freeText()"` -- see syncBox. */
  private readonly queryInput = viewChild<ElementRef<HTMLInputElement>>('queryInput');

  /** The trimmed text this component last navigated to from its own box, consumed the moment the
   *  router hands it back. Anything the person typed in between must survive -- see syncBox. */
  private lastTypedQuery: string | undefined;

  constructor() {
    // Typing shouldn't push a history entry per keystroke -- debounce, then replace. Compared
    // against the URL's current `q` rather than the stream's previous value, so a query typed,
    // cleared and typed again still searches, and a pause after a trailing space (which trims to
    // what the URL already holds) navigates nowhere at all.
    this.textInput$
      .pipe(
        debounceTime(500),
        map((value) => value.trim()),
        filter((value) => value !== this.freeText()),
      )
      .subscribe((value) => this.navigateTyped(value));

    effect(() => this.syncBox());
  }

  onTextInput(value: string): void {
    this.textInput$.next(value);
  }

  /** Search button / Enter key: skip the 500ms debounce above and navigate on the field's
   *  current value right away -- an accelerator for anyone who'd rather not wait it out, not a
   *  replacement for live search (typing alone still searches on its own). */
  searchNow(value: string): void {
    this.navigateTyped(value.trim());
  }

  private navigateTyped(value: string): void {
    this.lastTypedQuery = value;
    this.navigate({ ...this.query(), q: value || undefined, page: 1 }, true);
  }

  /**
   * Keeps the box in step with the URL without ever fighting the person typing in it.
   *
   * The box used to be bound `[value]="freeText()"`, the URL's TRIMMED `q`. Pause for the
   * debounce after typing "random " and the URL became `q=random`, the binding rewrote the box to
   * "random", and the next word ran on as "randomforest"; any letters typed while that navigation
   * was still in flight were wiped the same way. So the box is written to by hand, and only when
   * the URL changed behind its back (first load, back/forward, "Clear all"):
   *  - a `q` this component itself just navigated to is consumed, not written -- the box already
   *    holds it, plus whatever was typed since;
   *  - a difference that is only surrounding whitespace is left alone.
   */
  private syncBox(): void {
    const q = this.freeText();
    const input = this.queryInput()?.nativeElement;
    if (!input) return;
    if (q === this.lastTypedQuery) {
      this.lastTypedQuery = undefined;
      return;
    }
    if (input.value.trim() === q) return;
    input.value = q;
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

  /** Drops every filter but keeps the search text -- what a timed-out or empty search needs. */
  clearFilters(): void {
    this.navigate({ ...this.query(), filters: { classification: DEFAULT_CLASSIFICATION }, page: 1 });
  }

  clearAll(): void {
    // classification: DEFAULT_CLASSIFICATION, not []. [] means "explicitly cleared" on the wire
    // (see search-params.ts's resolveClassification) and would silently widen the search from the
    // positives to every screened record -- the opposite of what "clear all filters" should do
    // now that the classification filter isn't a user-removable chip any more.
    this.navigate({ ...this.query(), q: undefined, filters: { classification: DEFAULT_CLASSIFICATION }, page: 1 });
    // Supersede any keystrokes still waiting on the debounce, or they would re-run the search
    // that was just cleared half a second later.
    this.textInput$.next('');
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

/** "a, b and c" */
function listWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
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
