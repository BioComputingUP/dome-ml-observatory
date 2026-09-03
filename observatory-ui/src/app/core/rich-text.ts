/**
 * Title and abstract text arriving from the corpus is not plain text.
 *
 * Measured against the live collection (2026-09-02): 1.5% of titles and 43% of abstracts contain
 * markup. Titles carry inline emphasis (`<i>In Vitro</i>`, `CO<sub>2</sub>`, `<sup>18</sup>F-FDG`);
 * abstracts carry structural headings from Europe PMC's structured-abstract form
 * (`<h4>Background</h4>`), plus the same inline emphasis, plus JATS tags (`<italic>`, `<bold>`) that
 * browsers render as unknown elements and therefore silently drop the emphasis from. Roughly 3% of
 * abstracts also contain a bare URL -- usually the paper's GitHub repository -- which is exactly the
 * kind of onward link this resource exists to surface, and which rendered as dead text.
 *
 * These functions NORMALISE that markup; they are deliberately not the security boundary. Output is
 * bound with `[innerHTML]` *without* `bypassSecurityTrustHtml`, so Angular's own sanitizer still
 * runs over the result -- see record.ts. Every attribute is dropped here regardless, so nothing
 * with an attribute payload can survive this far anyway.
 *
 * No entity decoding happens anywhere below. A handful of live titles carry double-encoded markup
 * (`&lt;i&gt;Halomonas elongata&lt;/i&gt;`) which is an ingestion data-quality problem; blanket
 * decoding would mis-render every title that legitimately contains `<` or `>` (`P<0.05`, `<74
 * years`) in order to fix those few. See ROADMAP.md.
 */

/** Inline emphasis, safe in a heading, a card title or a sentence. */
const INLINE_TAGS = ['i', 'em', 'b', 'strong', 'sub', 'sup'];

/** Abstracts additionally carry block structure from the structured-abstract form. */
const BLOCK_TAGS = ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li'];

/**
 * JATS -> HTML. Europe PMC's abstracts are JATS-derived and `<italic>`/`<bold>` reach us unchanged;
 * a browser treats them as unknown inline elements, so the emphasis the author wrote is lost
 * silently. `<title>` is JATS's section heading -- as an in-body HTML `<title>` element the browser
 * swallows its text entirely, so it has to be remapped rather than merely stripped.
 */
const TAG_ALIASES: Record<string, string> = {
  italic: 'em',
  bold: 'strong',
  underline: 'u',
  sc: 'span',
  title: 'h4',
};

const TAG_RE = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g;

/**
 * Rewrites `raw` to contain only `allowed` tags, with every attribute dropped. A tag that isn't
 * allowed is removed but its text content is kept, so nothing the reader needs disappears with it.
 */
function toAllowlist(raw: string, allowed: Set<string>): string {
  return raw.replace(TAG_RE, (_match, closing: string, name: string) => {
    const tag = TAG_ALIASES[name.toLowerCase()] ?? name.toLowerCase();
    if (!allowed.has(tag)) return '';
    return closing ? `</${tag}>` : `<${tag}>`;
  });
}

const TITLE_ALLOWED = new Set(INLINE_TAGS);
const ABSTRACT_ALLOWED = new Set([...INLINE_TAGS, ...BLOCK_TAGS, 'u', 'span']);

/**
 * A title with its emphasis preserved and everything else stripped. Bind with `[innerHTML]`.
 * `<sc>` (JATS small-caps) maps to `<span>`, which the alias table handles, but `span` is not in
 * the title allowlist -- small-caps in a card title is noise, so it degrades to plain text.
 */
export function richTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  return toAllowlist(raw, TITLE_ALLOWED);
}

/**
 * Tags stripped and whitespace collapsed. This is what length-based truncation, `aria-label`s and
 * citation output must use -- truncating the marked-up string would cut mid-tag and leave a
 * dangling `<i` in the DOM, and a reference manager should never receive `<i>` in a title field.
 */
export function plainText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(TAG_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncates on the plain-text form, never the marked-up one, appending an ellipsis only when the
 * text was actually shortened. Breaks on a word boundary where one is close enough to the limit
 * that the result doesn't lose a meaningful amount of text.
 */
export function truncatePlain(raw: string | null | undefined, limit: number): string {
  const plain = plainText(raw);
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  const body = lastSpace > limit * 0.8 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}

/** Trailing punctuation that is far more likely to be the sentence's than the URL's. */
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCT_RE = /[.,;:!?)\]}>]+$/;

/**
 * Turns bare URLs into links. Safe to run after `toAllowlist` precisely because that dropped every
 * attribute and does not allow `<a>` through: there is no surviving `href` for this to corrupt, and
 * no existing anchor for it to nest inside.
 */
function linkify(html: string): string {
  return html.replace(URL_RE, (url) => {
    const trimmed = url.replace(TRAILING_PUNCT_RE, '');
    const tail = url.slice(trimmed.length);
    return `<a href="${trimmed}" target="_blank" rel="noopener nofollow">${trimmed}</a>${tail}`;
  });
}

/**
 * An abstract with its structure and emphasis preserved and its bare URLs made clickable.
 * Bind with `[innerHTML]`.
 */
export function richAbstract(raw: string | null | undefined): string {
  if (!raw) return '';
  return linkify(toAllowlist(raw, ABSTRACT_ALLOWED));
}
