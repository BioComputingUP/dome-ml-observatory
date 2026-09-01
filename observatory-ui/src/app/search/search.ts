import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, catchError, of, map, startWith } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { RecordsService, SearchFilters, SearchQuery, SortOrder } from '../core/records.service';
import { AiMlRecord } from '../core/record.model';
import {
  paramsToQuery,
  queryToParams,
  activeFilterCount,
  isDefaultClassification,
} from '../core/search-params';
import { FacetPanel } from './facet-panel/facet-panel';
import { ResultCard } from './result-card/result-card';

interface ActiveChip {
  label: string;
  clear: Partial<SearchFilters>;
}

@Component({
  selector: 'app-search',
  imports: [FacetPanel, ResultCard, DecimalPipe],
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

  private readonly results = toSignal(
    this.route.queryParams.pipe(
      map((params) => paramsToQuery(params)),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap((query) => {
        this.loading.set(true);
        this.error.set(null);
        return this.records.search(query).pipe(
          catchError(() => {
            this.error.set('Could not load results. Please try again.');
            return of({ items: [] as AiMlRecord[], total: 0, page: 1, pageSize: 25 });
          }),
        );
      }),
      map((result) => {
        this.loading.set(false);
        return result;
      }),
    ),
    { initialValue: { items: [] as AiMlRecord[], total: 0, page: 1, pageSize: 25 } },
  );

  readonly items = computed(() => this.results().items);
  readonly total = computed(() => this.results().total);

  readonly rangeStart = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.query().pageSize + 1));
  readonly rangeEnd = computed(() => Math.min(this.page() * this.query().pageSize, this.total()));
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.query().pageSize)));

  readonly stats = toSignal(this.records.getFacetStats().pipe(catchError(() => of(null))), { initialValue: null });
  readonly vocab = toSignal(this.records.getVocabularies().pipe(catchError(() => of(null))), { initialValue: null });

  /** True while the search runs on the development fixture rather than the real corpus -- drives
   *  the preview banner, and disappears on its own once Phase 5 regenerates stats from Mongo. */
  readonly isPreview = computed(() => this.stats()?.source !== 'full-corpus');
  readonly corpusTotal = computed(() => this.stats()?.corpus.total ?? 0);
  readonly sampleSize = computed(() => this.stats()?.records_counted ?? 0);

  /** Distinct values for the facets with no controlled vocabulary, derived from loaded data. */
  private readonly allRecords = toSignal(
    this.records.search({ filters: {}, sort: 'relevance', page: 1, pageSize: 100000 }).pipe(
      map((r) => r.items),
      catchError(() => of([] as AiMlRecord[])),
      startWith([] as AiMlRecord[]),
    ),
    { initialValue: [] as AiMlRecord[] },
  );

  readonly journals = computed(() =>
    unique(this.allRecords().map((r) => r.publication_metadata.journal).filter(Boolean) as string[]),
  );
  readonly meshHeadings = computed(() =>
    unique(this.allRecords().flatMap((r) => r.content_filters.mesh_headings)),
  );
  readonly authorKeywords = computed(() =>
    unique(this.allRecords().flatMap((r) => r.content_filters.keywords_author)),
  );

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
    // Typing shouldn't push a history entry per keystroke -- debounce, then replace.
    this.textInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((value) => {
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

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
