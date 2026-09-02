/**
 * Display-label helpers shared between the facet panel and search.ts's active-filter chips --
 * both must show identical labels for the same underlying value, so this lives in core/ rather
 * than being duplicated between the two.
 */

/**
 * Curated publication-type allowlist, keyed by the exact corpus string. The wire value and the
 * `ptype` URL param are untouched -- only the label shown to users changes.
 *
 * The live facet carries 89 distinct values on the corpus (see observatory-ws's
 * stats.service.ts), most of them either raw MeSH "Research Support, ..." grant-source tags or
 * Crossref/JATS lowercase duplicates (`research-article`, `correction`, `English Abstract`, ...)
 * that are meaningless as a user-facing filter. Deliberately excludes every comma-containing
 * value: pubTypes is comma-joined into the `ptype` param (search-params.ts's
 * joinOrNull/splitList), so a value like "Research Support, Non-U.S. Gov't" would silently
 * round-trip as two broken values on reload -- this allowlist sidesteps that bug rather than
 * working around it elsewhere.
 */
export const PUB_TYPE_LABELS: Record<string, string> = {
  'Journal Article': 'Journal article',
  Preprint: 'Preprint',
  Review: 'Review',
  'Systematic Review': 'Systematic review',
  'Meta-Analysis': 'Meta-analysis',
  'Comparative Study': 'Comparative study',
  'Multicenter Study': 'Multicenter study',
  'Clinical Trial': 'Clinical trial',
};

export function pubTypeLabel(value: string): string {
  return PUB_TYPE_LABELS[value] ?? value;
}

/**
 * Sentence-cases a vocabulary label for display only -- the underlying value (used in the URL,
 * the API filter and toggleInList's equality checks) stays exactly as modelling-branch.json
 * defines it, lowercase. Only the first character changes, which is correct for this vocabulary:
 * "ensemble learning" -> "Ensemble learning", "supervised" -> "Supervised", while terms that
 * already start with a capital ("generative AI", "AI agent") render unchanged.
 */
export function sentenceCase(value: string): string {
  return value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
