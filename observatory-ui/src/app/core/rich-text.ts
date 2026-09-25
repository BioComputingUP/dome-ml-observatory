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
 * Entity-encoded tags are a second, equally large group. 14,450 titles (1.6% of the corpus, measured
 * 2026-09-25, every one a PubMed record) store their emphasis as `&lt;i&gt;Drosophila&lt;/i&gt;`,
 * which `[innerHTML]` shows as the literal text `<i>Drosophila</i>`. dome-ml-observatory-triage has
 * decoded entities at build time since schema v1.2.0, but the documents already loaded were only
 * re-stamped by later migrations, never rebuilt, so they still carry the encoded form (ROADMAP.md
 * tracks the data repair). A blanket entity decode here would be wrong: it would turn `P&lt;0.05` or
 * `&lt;74 years` into something the allowlist has to guess about. `decodeEncodedTags` is narrow
 * instead: it revives only a bare `&lt;name&gt;` whose name is one this file already knows, which
 * every one of those titles uses and no comparison can look like. Once the stored data is repaired
 * it matches nothing.
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

/**
 * The name has to follow `<` or `</` directly, as it must for an HTML parser to see a tag. Allowing
 * whitespace there made a comparison like `0.5 < ICC ≤ 0.75 ... >` read as one long tag and deleted
 * the text between the two signs (237 live abstracts). `:` admits namespaced tags (`<mml:math>`).
 */
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)(?:\s[^<>]*)?\/?>/g;

/** Every tag name the functions below keep, remap or know to strip. */
const KNOWN_TAGS = new Set([...INLINE_TAGS, ...BLOCK_TAGS, ...Object.keys(TAG_ALIASES), 'u', 'span']);

/** A bare encoded tag -- no attributes: none of the encoded titles carries one. */
const ENCODED_TAG_RE = /&lt;(\/?)([a-zA-Z][a-zA-Z0-9]*)\s*&gt;/g;

/** `&lt;i&gt;` -> `<i>`, for known tag names only; any other `&lt;` is left exactly as it was. */
function decodeEncodedTags(raw: string): string {
  return raw.replace(ENCODED_TAG_RE, (match, closing: string, name: string) =>
    KNOWN_TAGS.has(name.toLowerCase()) ? `<${closing}${name}>` : match,
  );
}

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
  return toAllowlist(decodeEncodedTags(raw), TITLE_ALLOWED);
}

/** Emphasis sits inside a word as often as around one (`CO<sub>2</sub>`, `non-<i>ab initio</i>`). */
const INLINE_SET = new Set([...INLINE_TAGS, 'u', 'span']);

/** The named entities the live titles carry (2026-09-25), plus the handful that travel with them. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  trade: '\u2122',
};

const ENTITY_RE = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g;

/**
 * One pass, as the browser makes over `[innerHTML]`, so the plain form reads exactly as the rendered
 * one does. An unknown name is left as written rather than guessed at.
 */
function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (match, dec?: string, hex?: string, name?: string) => {
    if (name) return NAMED_ENTITIES[name] ?? match;
    const code = dec ? Number(dec) : parseInt(hex ?? '', 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

/**
 * Tags stripped, entities decoded and whitespace collapsed. This is what length-based truncation,
 * `aria-label`s, the page title and citation output must use -- truncating the marked-up string
 * would cut mid-tag and leave a dangling `<i` in the DOM, and a reference manager should never
 * receive `<i>` or `&amp;` in a title field. Inline tags vanish without a trace, so `CO<sub>2</sub>`
 * reads `CO2`; block tags leave a space, so a heading doesn't run into the sentence after it.
 * Decoding is safe here and only here: the result is text, and whatever displays it escapes it.
 */
export function plainText(raw: string | null | undefined): string {
  if (!raw) return '';
  const stripped = decodeEncodedTags(raw).replace(TAG_RE, (_match, _closing: string, name: string) => {
    const tag = TAG_ALIASES[name.toLowerCase()] ?? name.toLowerCase();
    return INLINE_SET.has(tag) ? '' : ' ';
  });
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim();
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
  return linkify(toAllowlist(decodeEncodedTags(raw), ABSTRACT_ALLOWED));
}
