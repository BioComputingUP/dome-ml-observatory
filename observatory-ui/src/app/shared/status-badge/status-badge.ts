import { Component, computed, input } from '@angular/core';
import { AiMlRecord, isEnriched } from '../../core/record.model';

export type BadgeTone = 'positive' | 'neutral' | 'undeterminable';

/**
 * The at-a-glance status strip shown on result cards and record headers.
 *
 * Two contexts, deliberately different in what they show:
 *  - 'record' (default, the record detail page): the full strip -- classification, open
 *    access/full text, enrichment. A single record is worth the detail.
 *  - 'card' (search result cards): classification and the open-access/full-text split are BOTH
 *    dropped. Classification is dropped because every search result is a positive now that the
 *    search page's whole space is the AI/ML methods papers (see facet-panel.ts) -- an "AI/ML
 *    methods paper" chip on every single card is pure noise, not information. The
 *    open-access/full-text split collapses to one indicator because `fulltext_available` tracks
 *    PMC full-text availability almost exactly, and two near-identical badges read as redundant
 *    UI rather than two different facts. The one exception is an open-access paper whose flag
 *    is false: that says "Open access" rather than "No full text", which would be wrong for it.
 *    On 2026-09-25, 593 positives were open access with the flag false (AlphaFold 2 among them),
 *    mostly records merged in from the curated sets, which never had the flag derived.
 *    Enrichment stays in both -- see the honest "not yet enriched" coverage story elsewhere on
 *    the page.
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
  readonly context = input<'card' | 'record'>('record');

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

  readonly fulltext = computed(() => this.record().source.access.fulltext_available === true);
  readonly openAccess = computed(() => this.record().source.access.open_access === true);
  readonly enriched = computed(() => isEnriched(this.record()));
}
