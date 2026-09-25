/**
 * Titles and abstracts are stored with their markup (inline emphasis, JATS, structured-abstract
 * headings). Metadata formats want plain text, so tags are stripped, entities decoded and runs of
 * whitespace collapsed.
 *
 * Two shapes of markup reach this. Most titles carry real tags (`<i>E. coli</i>`); 14,450 PubMed
 * titles (measured 2026-09-25) carry them entity-encoded (`&lt;i&gt;E. coli&lt;/i&gt;`), because
 * the write side's build-time entity decode (schema v1.2.0) was never applied to the documents
 * already loaded. Only a bare encoded tag with a known name is revived, so a comparison such as
 * `P&lt;0.05` is decoded as text and never read as a tag. Once the stored data is repaired
 * (issue #4) that step matches nothing.
 *
 * A port of observatory-ui's `plainText` (src/app/core/rich-text.ts). Duplicated rather than
 * shared, as every type and helper between the two apps is (AGENTS.md); keep the two in step.
 */

/** Tags that sit inside a word as often as around one (`CO<sub>2</sub>`), so they leave no space. */
const INLINE_TAGS = new Set(['i', 'em', 'b', 'strong', 'sub', 'sup', 'u', 'span']);

/** JATS names for the same emphasis, plus JATS's section heading. */
const TAG_ALIASES: Record<string, string> = {
  italic: 'em',
  bold: 'strong',
  underline: 'u',
  sc: 'span',
  title: 'h4',
};

const KNOWN_TAGS = new Set([
  ...INLINE_TAGS,
  ...['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li'],
  ...Object.keys(TAG_ALIASES),
]);

/** The name has to follow `<` or `</` directly, so a comparison (`0.5 < ICC ≤ 0.75 ... >`) is text. */
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)(?:\s[^<>]*)?\/?>/g;

const ENCODED_TAG_RE = /&lt;(\/?)([a-zA-Z][a-zA-Z0-9]*)\s*&gt;/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  trade: '™',
};

const ENTITY_RE = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g;

function decodeEncodedTags(raw: string): string {
  return raw.replace(ENCODED_TAG_RE, (match, closing: string, name: string) =>
    KNOWN_TAGS.has(name.toLowerCase()) ? `<${closing}${name}>` : match,
  );
}

/** One pass, as a browser makes; an unknown name is left as written. */
function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (match, dec?: string, hex?: string, name?: string) => {
    if (name) return NAMED_ENTITIES[name] ?? match;
    const code = dec ? Number(dec) : parseInt(hex ?? '', 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

export function plainText(raw: string | null | undefined): string {
  if (!raw) return '';
  const stripped = decodeEncodedTags(raw).replace(
    TAG_RE,
    (_match, _closing: string, name: string) => {
      const tag = TAG_ALIASES[name.toLowerCase()] ?? name.toLowerCase();
      return INLINE_TAGS.has(tag) ? '' : ' ';
    },
  );
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim();
}
