import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SearchFilters } from '../../core/records.service';
import { FacetStats } from '../../core/facet-stats.model';
import { Vocabularies } from '../../core/vocab.model';
import { Classification } from '../../core/record.model';
import { FacetTypeahead } from '../facet-typeahead/facet-typeahead';

/** Values a user can pick for licence. '' is the single "no licence recorded" bucket -- the
 *  underlying data has both null and '' for this, unified in RecordsService, and it would be
 *  nonsense to show a user two identical-looking "unknown" options. */
const NO_LICENCE = '';

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
  /** Distinct values present in the loaded data, for the facets with no controlled vocabulary. */
  readonly journals = input<string[]>([]);
  readonly meshHeadings = input<string[]>([]);
  readonly authorKeywords = input<string[]>([]);

  readonly filtersChange = output<Partial<SearchFilters>>();

  readonly classifications: Classification[] = ['positive', 'negative', 'undeterminable'];

  readonly classificationLabels: Record<Classification, string> = {
    positive: 'AI/ML methods paper',
    negative: 'Screened out',
    undeterminable: 'Undeterminable',
  };

  readonly licences = computed(() => this.stats()?.facets.license.map((l) => l.value) ?? []);
  readonly pubTypes = computed(() => this.stats()?.facets.pubTypes.map((p) => p.value) ?? []);
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

  toggleTriState(key: 'openAccess' | 'fulltextAvailable' | 'enrichedOnly', value: boolean | undefined): void {
    this.filtersChange.emit({ [key]: value } as Partial<SearchFilters>);
  }

  setYear(which: 'yearMin' | 'yearMax', raw: string): void {
    const n = Number(raw);
    this.filtersChange.emit({ [which]: raw.trim() && Number.isInteger(n) ? n : undefined } as Partial<SearchFilters>);
  }

  setList(key: keyof SearchFilters, values: string[]): void {
    this.filtersChange.emit({ [key]: values.length ? values : undefined } as Partial<SearchFilters>);
  }
}
