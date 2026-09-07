import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AiMlRecord } from '../../core/record.model';
import { articleSources } from '../../core/outbound-links';
import { richTitle, truncatePlain } from '../../core/rich-text';
import { publicationVenue } from '../../core/venue';
import { StatusBadge } from '../../shared/status-badge/status-badge';

const SNIPPET_LENGTH = 240;

@Component({
  selector: 'app-result-card',
  imports: [DecimalPipe, RouterLink, StatusBadge],
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
  readonly year = computed(() => this.record().publication_metadata.year);

  /** The venue row: the journal, or for a preprint the server it was posted to. One row either
   *  way, because a preprint has no journal at all (Europe PMC returns none for a SRC:PPR record)
   *  and the row used to vanish entirely on 6.7% of the corpus, leaving the card silent about
   *  where the paper actually is. core/venue.ts owns the journal-wins rule -- see it before
   *  changing anything here. */
  readonly venue = computed(() => publicationVenue(this.record()));

  /** Europe PMC's citation count. `null` means "not available" (no Europe PMC record answered for
   *  this paper's identifiers, ~2% of the corpus) and the row is omitted; zero is a real, cited-
   *  nowhere-yet count and must still render, which is why this tests the type rather than
   *  truthiness the way the facts above do. */
  readonly citationCount = computed(() => {
    const count = this.record().publication_metadata.citation_count;
    return typeof count === 'number' ? count : null;
  });

  /** Where the article itself can be read. Rendered as plain named pills: the external-link
   *  glyph that used to follow each one added no information (they are obviously outbound) and
   *  turned a tidy row into visual clutter. The "opens in a new tab" cue stays, for screen
   *  readers. */
  readonly sources = computed(() => articleSources(this.record()));
}
