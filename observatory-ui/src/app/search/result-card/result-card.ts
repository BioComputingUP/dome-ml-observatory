import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AiMlRecord } from '../../core/record.model';
import { articleSources } from '../../core/outbound-links';
import { richTitle, truncatePlain } from '../../core/rich-text';
import { StatusBadge } from '../../shared/status-badge/status-badge';

const SNIPPET_LENGTH = 240;

@Component({
  selector: 'app-result-card',
  imports: [RouterLink, StatusBadge],
  templateUrl: './result-card.html',
  styleUrl: './result-card.scss',
})
export class ResultCard {
  readonly record = input.required<AiMlRecord>();

  /** Titles carry inline emphasis ("non-<i>ab initio</i>", "CO<sub>2</sub>"), which interpolation
   *  rendered as literal tag text. Bound with [innerHTML] so Angular sanitises the normalised
   *  string -- see core/rich-text.ts. */
  readonly titleHtml = computed(() => richTitle(this.record().publication_metadata.title));
  readonly hasTitle = computed(() => Boolean(this.record().publication_metadata.title));

  /** The card wants plain text: truncating the marked-up abstract would cut mid-tag. Truncation
   *  therefore happens on the stripped form. The record page renders the structured version. */
  readonly snippet = computed(() =>
    truncatePlain(this.record().publication_metadata.abstract, SNIPPET_LENGTH),
  );

  // Labelled rows (Authors: / Journal: / Year:) rather than one "authors · journal · year" line
  // -- each is its own fact and reads faster labelled than run together, and it's what makes
  // authors visually findable at all now that the search box can match on them (see search.ts).
  readonly authors = computed(() => this.record().publication_metadata.authors);
  readonly journal = computed(() => this.record().publication_metadata.journal);
  readonly year = computed(() => this.record().publication_metadata.year);

  /** Where the article itself can be read. Rendered as plain named pills: the external-link
   *  glyph that used to follow each one added no information (they are obviously outbound) and
   *  turned a tidy row into visual clutter. The "opens in a new tab" cue stays, for screen
   *  readers. */
  readonly sources = computed(() => articleSources(this.record()));
}
