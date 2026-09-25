import { truncatePlain } from './rich-text';

/**
 * Marks the search terms in a result card, and picks the part of the abstract worth showing.
 *
 * Matching follows the server's own rule for display purposes: word-start anchored and
 * case-insensitive, so "cell" marks "cellular" -- the whole word, not just its beginning, so the
 * highlight reads as a word. A multi-word term may be split by whitespace or a hyphen, as the
 * corpus writes "random-forest". Markup is never touched: a title's `<i>` and an abstract's
 * entities are skipped over, and the plain snippet is escaped before anything is inserted into
 * it, because abstracts really do contain "P<0.05".
 */

const GAP = '(?:[\\s\\-–—]+)';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termRegex(terms: string[]): RegExp | null {
  const alternatives = terms
    .map((term) => term.replace(/-/g, ' ').trim().split(/\s+/).filter(Boolean).map(escapeRegex).join(GAP))
    .filter(Boolean);
  if (!alternatives.length) return null;
  // Longest first, so "support vector machine" is marked as one term rather than as "support".
  alternatives.sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${alternatives.join('|')})[\\p{L}\\p{N}]*`, 'giu');
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wraps every term hit in `<mark>`, in the text of `html` only -- never inside a tag or an entity. */
export function markTerms(html: string, terms: string[]): string {
  const re = termRegex(terms);
  if (!re || !html) return html;
  return html
    .split(/(<[^>]*>|&[a-zA-Z#0-9]+;)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(re, (hit) => `<mark>${hit}</mark>`)))
    .join('');
}

/**
 * A window of `plain` around the first term hit, or the start of the text when nothing matches
 * or the first hit is early enough to be in view anyway. Cuts on word boundaries, with an
 * ellipsis on whichever side was cut.
 */
export function snippetAround(plain: string, terms: string[], limit: number): string {
  if (plain.length <= limit) return plain;
  const re = termRegex(terms);
  const hit = re ? (re.exec(plain)?.index ?? -1) : -1;
  if (hit < 0 || hit < limit * 0.6) return truncatePlain(plain, limit);

  let start = Math.max(0, hit - Math.floor(limit * 0.35));
  const space = plain.lastIndexOf(' ', start);
  if (space > 0) start = space + 1;
  let end = Math.min(plain.length, start + limit);
  if (end < plain.length) {
    const lastSpace = plain.lastIndexOf(' ', end);
    if (lastSpace > start + limit * 0.8) end = lastSpace;
  }
  const body = plain.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${body}${end < plain.length ? '…' : ''}`;
}
