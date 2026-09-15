/**
 * Titles and abstracts are stored with their markup (inline emphasis, JATS, structured-abstract
 * headings). Metadata formats want plain text, so every tag becomes a space and runs of whitespace
 * collapse. Entities are deliberately left alone: the write side decodes them once at build time.
 *
 * A port of observatory-ui's `plainText` (src/app/core/rich-text.ts). Duplicated rather than
 * shared, as every type and helper between the two apps is (AGENTS.md); keep the two in step.
 */
const TAG_RE = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g;

export function plainText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(TAG_RE, ' ').replace(/\s+/g, ' ').trim();
}
