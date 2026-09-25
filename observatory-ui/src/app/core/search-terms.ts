/**
 * The terms to highlight in a result: what was typed, plus what the API says it also searched
 * (SearchInfo.expansions -- "svm" also as "support vector machine").
 *
 * Mirrors observatory-ws's parseQueryGroups: a quoted phrase is one term, a trailing `*` marks a
 * word-beginning search and is dropped, trailing sentence punctuation goes, and a single
 * character is never a term. Only for display -- the server decides what matched.
 */
export function searchHighlightTerms(
  q: string | undefined,
  expansions: { term: string; alternatives: string[] }[] = [],
): string[] {
  const terms: string[] = [];
  const tokens = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(q ?? '')) !== null) {
    const term = (match[1] ?? match[2])
      .trim()
      .replace(/[.,;:]+$/, '')
      .replace(/\*+$/, '')
      .replace(/[.,;:]+$/, '');
    if (term.length >= 2) terms.push(term);
  }
  for (const expansion of expansions) {
    for (const alternative of expansion.alternatives) {
      if (alternative.trim().length >= 2) terms.push(alternative.trim());
    }
  }
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
