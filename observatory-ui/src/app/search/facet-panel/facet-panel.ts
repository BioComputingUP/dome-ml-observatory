import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, debounceTime } from 'rxjs';
import { SearchFilters } from '../../core/records.service';
import { FacetStats } from '../../core/facet-stats.model';
import { Vocabularies } from '../../core/vocab.model';
import { PUB_TYPE_LABELS, pubTypeLabel, sentenceCase } from '../../core/facet-labels';
import { FacetTypeahead } from '../facet-typeahead/facet-typeahead';

/** https://www.nlm.nih.gov/mesh/meshhome.html -- the canonical browser for the MeSH vocabulary
 *  these headings are drawn from. Not deep-linkable per-term (MeSH's own UI needs a descriptor ID
 *  we don't carry), so every heading points at the same home page rather than a broken search. */
const MESH_BROWSER_URL = 'https://www.nlm.nih.gov/mesh/meshhome.html';

/** Values a user can pick for licence. '' is the single "no licence recorded" bucket -- the
 *  underlying data has both null and '' for this, unified in RecordsService, and it would be
 *  nonsense to show a user two identical-looking "unknown" options. */
const NO_LICENCE = '';

type YearBound = 'yearMin' | 'yearMax';

@Component({
  selector: 'app-facet-panel',
  imports: [FacetTypeahead, DecimalPipe],
  templateUrl: './facet-panel.html',
  styleUrl: './facet-panel.scss',
})
export class FacetPanel {
  readonly filters = input.required<SearchFilters>();
  readonly stats = input<FacetStats | null>(null);
  readonly vocab = input<Vocabularies | null>(null);
  /** Journal and MeSH have no controlled vocabulary and too many distinct corpus-wide values to
   *  ship as a static list (tens of thousands each) -- these back their typeaheads with a live
   *  lookup (RecordsService.facetValues) instead, passed down from the parent search page. */
  readonly journalSearch = input<((q: string) => Observable<string[]>) | null>(null);
  readonly meshSearch = input<((q: string) => Observable<string[]>) | null>(null);

  readonly filtersChange = output<Partial<SearchFilters>>();

  /** Bound to the template so it can call the shared label helpers directly. */
  readonly pubTypeLabel = pubTypeLabel;
  readonly sentenceCase = sentenceCase;
  readonly meshBrowserUrl = MESH_BROWSER_URL;

  readonly licences = computed(() => this.stats()?.facets.license.map((l) => l.value) ?? []);
  /** Filtered to the curated allowlist (facet-labels.ts) -- the API facet carries 89 distinct
   *  values, most of them raw MeSH grant-source tags or Crossref/JATS duplicates that are
   *  meaningless as a filter. Order is preserved from the API's descending-count order. */
  readonly pubTypes = computed(
    () => this.stats()?.facets.pubTypes.map((p) => p.value).filter((v) => v in PUB_TYPE_LABELS) ?? [],
  );
  /** The searchable years -- scoped to the positives (observatory-ws's /api/stats now computes
   *  this from classification: positive only, not the whole corpus), so these are the actual
   *  bounds of what a search on this page can return, e.g. 1963-2027, not the corpus-wide
   *  1961-2027 (which includes two years' worth of screened-out-only records). */
  readonly yearBounds = computed(() => this.stats()?.facets.yearRange ?? null);

  readonly domainTier1 = computed(() => this.terms('domain', 'domain_tier1'));
  readonly domainTier2 = computed(() => this.terms('domain', 'domain_tier2'));
  readonly domainTier3 = computed(() => this.terms('domain', 'domain_tier3'));
  readonly paradigms = computed(() => this.terms('modellingBranch', 'learning_paradigm'));
  readonly modelFamilies = computed(() => this.terms('modellingBranch', 'model_family'));
  readonly modelTypes = computed(() => this.vocab()?.modelTypeSeed.terms.map((t) => t.canonical) ?? []);

  readonly caps = computed(() => ({
    domainTier2: this.cap('domain', 'domain_tier2'),
    domainTier3: this.cap('domain', 'domain_tier3'),
    learningParadigm: this.cap('modellingBranch', 'learning_paradigm'),
    modelFamily: this.cap('modellingBranch', 'model_family'),
  }));

  /** How many of the positive set have been enriched -- drives the honest coverage banner. */
  readonly enrichedCount = computed(() => this.stats()?.corpus.enriched ?? 0);
  readonly positiveCount = computed(() => this.stats()?.corpus.positive ?? 0);

  /** "2020–2024" / "From 2020" / "To 2024" / '' -- shown in the Year group's <summary> so its
   *  collapsed state (or just its header, since it's open by default) still says what's active. */
  readonly yearSummary = computed(() => {
    const { yearMin, yearMax } = this.filters();
    if (yearMin != null && yearMax != null) return `${yearMin}–${yearMax}`;
    if (yearMin != null) return `From ${yearMin}`;
    if (yearMax != null) return `To ${yearMax}`;
    return '';
  });

  /** Typed year input is debounced before it commits (mirrors search.ts's own free-text
   *  debounce): typing "2020" digit by digit must not fire four separate filter changes / URL
   *  navigations, and the field must never be forced back to a stale value mid-keystroke -- see
   *  onYearInput/stepYear below and this component's history: the previous <input type="number">
   *  with a browser-native min/max spun an EMPTY field straight to the minimum year on the first
   *  arrow click, which is the year-picker bug this rewrite fixes. */
  private readonly yearInput$ = new Subject<{ which: YearBound; raw: string }>();

  constructor() {
    this.yearInput$.pipe(debounceTime(500), takeUntilDestroyed()).subscribe(({ which, raw }) => {
      const trimmed = raw.trim();
      if (trimmed === '') {
        this.commitYear(which, undefined);
        return;
      }
      const n = Number(trimmed);
      // Not yet a complete integer (e.g. a bare "-" mid-type) -- wait for more input rather than
      // discarding what the user typed or committing something wrong.
      if (!Number.isInteger(n)) return;
      this.commitYear(which, n);
    });
  }

  private terms(group: 'domain' | 'modellingBranch', field: string): string[] {
    const vocab = this.vocab();
    if (!vocab) return [];
    const fields = group === 'domain' ? vocab.domain.fields : vocab.modellingBranch.fields;
    return (fields as Record<string, { terms: { label: string }[] }>)[field]?.terms.map((t) => t.label) ?? [];
  }

  private cap(group: 'domain' | 'modellingBranch', field: string): number | undefined {
    const vocab = this.vocab();
    if (!vocab) return undefined;
    const fields = group === 'domain' ? vocab.domain.fields : vocab.modellingBranch.fields;
    return (fields as Record<string, { max_tags: number }>)[field]?.max_tags;
  }

  countFor(facet: keyof FacetStats['facets'], value: string): number | undefined {
    const entries = this.stats()?.facets[facet];
    if (!Array.isArray(entries)) return undefined;
    return entries.find((e) => e.value === value)?.count;
  }

  /** Selected-count for a <details> group's summary row, e.g. "Journal (2)". */
  countOf(key: keyof SearchFilters): number {
    const value = this.filters()[key];
    return Array.isArray(value) ? value.length : 0;
  }

  licenceLabel(value: string): string {
    return value === NO_LICENCE ? 'No licence recorded' : value;
  }

  isChecked(list: string[] | undefined, value: string): boolean {
    return !!list?.includes(value);
  }

  toggleInList(key: keyof SearchFilters, value: string, checked: boolean): void {
    const current = (this.filters()[key] as string[] | undefined) ?? [];
    const next = checked ? [...current, value] : current.filter((v) => v !== value);
    this.filtersChange.emit({ [key]: next.length ? next : undefined } as Partial<SearchFilters>);
  }

  toggleTriState(key: 'fulltextAvailable' | 'enrichedOnly', value: boolean | undefined): void {
    this.filtersChange.emit({ [key]: value } as Partial<SearchFilters>);
  }

  onYearInput(which: YearBound, raw: string): void {
    this.yearInput$.next({ which, raw });
  }

  /** ▲/▼ on an empty field seeds from the search-space bound for that specific field (yearMin
   *  seeds from the earliest searchable year, yearMax from the latest) rather than stepping from
   *  zero or undefined -- then steps by 1 on every press after that. Commits immediately (no
   *  debounce): a button click, unlike typing, is one deliberate change per press. */
  stepYear(which: YearBound, delta: 1 | -1): void {
    const bounds = this.yearBounds();
    const current = this.filters()[which];
    const next = current == null ? (which === 'yearMin' ? bounds?.min : bounds?.max) : current + delta;
    if (next == null) return; // stats not loaded yet -- nothing to seed from
    this.commitYear(which, next);
  }

  private commitYear(which: YearBound, value: number | undefined): void {
    this.filtersChange.emit({ [which]: value === undefined ? undefined : this.clampYear(which, value) } as Partial<SearchFilters>);
  }

  /** Clamps to the searchable range, then enforces yearMin <= yearMax against whichever bound
   *  wasn't just edited -- so typing/stepping can never produce an empty (min > max) range. */
  private clampYear(which: YearBound, value: number): number {
    const bounds = this.yearBounds();
    let v = bounds ? Math.min(Math.max(value, bounds.min), bounds.max) : value;
    const other = which === 'yearMin' ? this.filters().yearMax : this.filters().yearMin;
    if (other != null) {
      if (which === 'yearMin' && v > other) v = other;
      if (which === 'yearMax' && v < other) v = other;
    }
    return v;
  }

  setList(key: keyof SearchFilters, values: string[]): void {
    this.filtersChange.emit({ [key]: values.length ? values : undefined } as Partial<SearchFilters>);
  }
}
