/**
 * Freshness wording for a citation count. The count is a snapshot fetched from Europe PMC and
 * refreshed with each processing round -- never a live figure -- and a count that cannot be
 * dated ages invisibly, so wherever one is shown it says when it was fetched. Shared by the
 * result card and the record page so the wording cannot drift between them.
 */

import { formatDate } from '@angular/common';
import { AiMlRecord } from './record.model';

const SOURCE_NAMES: Record<string, string> = { europepmc: 'Europe PMC' };

/** "3 Sep 2026" -- the site's date format (see search.html) -- or null when the count carries no
 *  fetch date: the 200-record dev fixture predates schema v1.2.0, which added it. */
export function citationCountDate(record: AiMlRecord): string | null {
  const updated = record.publication_metadata.citation_count_updated;
  if (!updated) return null;
  const parsed = Date.parse(updated);
  return Number.isNaN(parsed) ? null : formatDate(parsed, 'd MMM y', 'en-US', 'UTC');
}

/** The hover text beside a count. */
export function citationCountNote(record: AiMlRecord): string {
  const source = record.publication_metadata.citation_source;
  const from = SOURCE_NAMES[source ?? 'europepmc'] ?? source;
  const date = citationCountDate(record);
  const fetched = date ? `, fetched ${date}` : '';
  return `Citation count from ${from}${fetched}. A snapshot refreshed periodically with the corpus, not a live figure.`;
}
