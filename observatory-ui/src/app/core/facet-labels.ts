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

/**
 * Display casing for model_type -- deliberately its own function rather than reusing
 * sentenceCase, because unlike modelling-branch.json's closed, all-lowercase-first vocabulary,
 * model_type is OPEN free text (schema/releases/.../ai-ml-landscape.schema.json): the 76-term
 * seed list is coverage assurance only, and a record can carry any verbatim string a paper used,
 * not just a seed term. So this has to be safe for arbitrary input, and has to leave
 * already-correctly-cased method names alone rather than blindly capitalising every value's
 * first letter: sentenceCase would turn "k-means" into "K-means" and "t-SNE" into "T-SNE", both
 * wrong, and would leave "XGBoost" alone only by coincidence of already starting uppercase.
 *
 * Display-only, exactly like sentenceCase: the wire value (search-params.ts's `mt` param) and
 * the backend's exact, case-sensitive Mongo match (records.query.ts) both use the raw string.
 */
export function modelTypeLabel(value: string): string {
  if (!value) return value;
  // Already capitalised (brand names, acronyms, eponyms already spelled with a capital) --
  // e.g. XGBoost, LightGBM, CatBoost, AdaBoost, DBSCAN, HDBSCAN, BIRCH, UMAP, BERT, GPT, YOLO,
  // MaxEnt, U-Net, ResNet, Q-learning, Gaussian process, Bayesian network, naive Bayes (only
  // its second word is capitalised, but that's still true after this check runs unchanged).
  if (value.charAt(0) !== value.charAt(0).toLowerCase()) return value;
  // A single lowercase letter before a hyphen is part of the method's name, not a capitalisation
  // slip -- k-means, k-nearest neighbors, t-SNE, one-class SVM (the "one" here isn't a single
  // letter, so this only guards the genuine single-letter cases).
  if (/^[a-z]-/.test(value)) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
