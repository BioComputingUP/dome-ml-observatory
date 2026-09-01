import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AiMlRecord } from '../../core/record.model';
import { outboundLinks } from '../../core/outbound-links';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { OutboundLinkItem } from '../../shared/outbound-link/outbound-link';

const SNIPPET_LENGTH = 240;

@Component({
  selector: 'app-result-card',
  imports: [RouterLink, StatusBadge, OutboundLinkItem],
  templateUrl: './result-card.html',
  styleUrl: './result-card.scss',
})
export class ResultCard {
  readonly record = input.required<AiMlRecord>();

  readonly title = computed(() => this.record().publication_metadata.title ?? 'Untitled record');

  /** Abstracts carry embedded markup ("<h4>Background</h4>"); the card wants plain text, so tags
   *  are stripped rather than rendered. The record page renders the structured version. */
  readonly snippet = computed(() => {
    const abstract = this.record().publication_metadata.abstract;
    if (!abstract) return null;
    const plain = abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain.length > SNIPPET_LENGTH ? `${plain.slice(0, SNIPPET_LENGTH).trimEnd()}…` : plain;
  });

  readonly meta = computed(() => {
    const pm = this.record().publication_metadata;
    return [pm.authors, pm.journal, pm.year?.toString()].filter(Boolean).join(' · ');
  });

  readonly links = computed(() => outboundLinks(this.record()));
}
