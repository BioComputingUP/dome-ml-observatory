import { Component, computed, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

/**
 * Searchable multi-select for the high-cardinality facets.
 *
 * Two modes, chosen by whether `searchFn` is set:
 *  - **Local** (the default): filters the static `options` list client-side. Used for the
 *    vocabulary-driven facets (EDAM tier 2/3, model type) -- small, fixed lists that never need a
 *    network round trip.
 *  - **Remote**: `searchFn` is called (debounced 250ms, cancelling any in-flight request via
 *    switchMap) instead of filtering `options`. Used for journal and MeSH headings -- corpus-wide
 *    cardinalities in the tens of thousands, served from observatory-ws's /api/facets/:field
 *    in-memory boot cache rather than shipped to the browser as a static list.
 *
 * `maxSelections` enforces the vocabularies' own `max_tags` caps (tier1 1, tier2 2, tier3 3,
 * paradigm 2, family 3) so the UI can't produce a filter combination the enrichment vocabulary
 * would never emit.
 */
@Component({
  selector: 'app-facet-typeahead',
  imports: [],
  templateUrl: './facet-typeahead.html',
  styleUrl: './facet-typeahead.scss',
})
export class FacetTypeahead {
  readonly label = input.required<string>();
  readonly options = input<string[]>([]);
  readonly selected = input<string[]>([]);
  readonly placeholder = input<string>('Type to search…');
  /** Undefined means unlimited. */
  readonly maxSelections = input<number | undefined>(undefined);
  /** When set, the label renders as an external link to this URL instead of plain text --
   *  currently only MeSH headings uses this, linking to the NLM MeSH browser. Left unset for
   *  every other facet, which have no equivalent external home to point at. */
  readonly labelHref = input<string | null>(null);
  /** Set for the remote-search facets (journal, MeSH); left null for local, vocabulary-backed
   *  ones. See the class doc above. */
  readonly searchFn = input<((q: string) => Observable<string[]>) | null>(null);
  /** Optional display-only transform for option/chip labels (e.g. model type's title-casing in
   *  facet-labels.ts). Matching, adding and removing selections all keep comparing the raw
   *  option string -- only what's rendered changes. Defaults to the identity function so every
   *  other facet is unaffected. */
  readonly displayFn = input<(value: string) => string>((value) => value);

  readonly selectionChange = output<string[]>();

  readonly query = signal('');
  readonly open = signal(false);
  private readonly remoteMatches = signal<string[]>([]);
  private readonly query$ = new Subject<string>();

  readonly atLimit = computed(() => {
    const max = this.maxSelections();
    return max !== undefined && this.selected().length >= max;
  });

  readonly matches = computed(() => {
    const chosen = new Set(this.selected());
    if (this.searchFn()) {
      return this.remoteMatches().filter((o) => !chosen.has(o));
    }
    const q = this.query().trim().toLowerCase();
    return this.options()
      .filter((o) => !chosen.has(o) && (q === '' || o.toLowerCase().includes(q)))
      .slice(0, 20);
  });

  constructor() {
    this.query$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const fn = this.searchFn();
          if (!fn) return of([] as string[]);
          return fn(q).pipe(catchError(() => of([] as string[])));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((values) => this.remoteMatches.set(values));
  }

  add(option: string): void {
    if (this.atLimit()) return;
    this.selectionChange.emit([...this.selected(), option]);
    this.query.set('');
    this.open.set(false);
  }

  remove(option: string): void {
    this.selectionChange.emit(this.selected().filter((o) => o !== option));
  }

  onInput(value: string): void {
    this.query.set(value);
    this.open.set(true);
    if (this.searchFn()) this.query$.next(value);
  }

  onFocus(): void {
    this.open.set(true);
    // Remote mode has nothing to show until the first request resolves -- fire one for the
    // current (possibly empty) query so opening the list isn't just blank.
    if (this.searchFn()) this.query$.next(this.query());
  }

  /** Blur closes the list, but only after a click on an option has had a chance to register. */
  onBlur(): void {
    setTimeout(() => this.open.set(false), 150);
  }
}
