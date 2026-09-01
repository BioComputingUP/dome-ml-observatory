import { Component, computed, input, output, signal } from '@angular/core';

/**
 * Searchable multi-select for the high-cardinality facets.
 *
 * Needed because a checkbox list is genuinely impossible for these: the 200-record dev fixture
 * alone has 127 distinct journals and 478 distinct MeSH headings, and the full corpus runs to
 * tens of thousands. EDAM tier 2/3 (121/125 terms) and model type (76) are the same story.
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
  readonly options = input.required<string[]>();
  readonly selected = input<string[]>([]);
  readonly placeholder = input<string>('Type to search…');
  /** Undefined means unlimited. */
  readonly maxSelections = input<number | undefined>(undefined);

  readonly selectionChange = output<string[]>();

  readonly query = signal('');
  readonly open = signal(false);

  readonly atLimit = computed(() => {
    const max = this.maxSelections();
    return max !== undefined && this.selected().length >= max;
  });

  readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    const chosen = new Set(this.selected());
    return this.options()
      .filter((o) => !chosen.has(o) && (q === '' || o.toLowerCase().includes(q)))
      .slice(0, 20);
  });

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
  }

  /** Blur closes the list, but only after a click on an option has had a chance to register. */
  onBlur(): void {
    setTimeout(() => this.open.set(false), 150);
  }
}
