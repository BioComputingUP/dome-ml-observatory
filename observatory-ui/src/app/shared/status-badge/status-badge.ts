import { Component, computed, input } from '@angular/core';
import { AiMlRecord, isEnriched } from '../../core/record.model';

export type BadgeTone = 'positive' | 'neutral' | 'undeterminable';

/**
 * The at-a-glance status strip shown on result cards and record headers: what the screening
 * decided, whether it's readable, and whether enrichment has touched it.
 *
 * Tone choices are deliberate: "negative" is neutral grey, not red -- a paper screened out as
 * not-AI/ML is a valid, unremarkable outcome, not an error -- and "undeterminable" is amber
 * (uncertain), not red (wrong).
 */
@Component({
  selector: 'app-status-badge',
  imports: [],
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.scss',
})
export class StatusBadge {
  readonly record = input.required<AiMlRecord>();

  readonly classification = computed(() => this.record().llm_classification.classification);

  readonly classificationLabel = computed(() => {
    switch (this.classification()) {
      case 'positive':
        return 'AI/ML methods paper';
      case 'negative':
        return 'Screened out';
      case 'undeterminable':
        return 'Undeterminable';
      default:
        return 'Unclassified';
    }
  });

  readonly classificationTone = computed<BadgeTone>(() => {
    switch (this.classification()) {
      case 'positive':
        return 'positive';
      case 'undeterminable':
        return 'undeterminable';
      default:
        return 'neutral';
    }
  });

  readonly openAccess = computed(() => this.record().source.access.open_access === true);
  readonly fulltext = computed(() => this.record().source.access.fulltext_available === true);
  readonly enriched = computed(() => isEnriched(this.record()));
}
