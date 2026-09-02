/**
 * BibTeX / RIS builders. Pure functions, unit-tested -- the awkward bit is that `authors` arrives
 * as one comma-separated string ("Liang L, Liang H, He M") rather than a list, and every citation
 * format wants it differently.
 */

import { AiMlRecord } from './record.model';
import { plainText } from './rich-text';

/** "Liang L, Liang H, He M." -> ["Liang L", "Liang H", "He M"] */
export function splitAuthors(authors: string | null): string[] {
  if (!authors) return [];
  return authors
    .replace(/\.\s*$/, '') // corpus authors strings often end with a trailing full stop
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
}

/** A stable, readable BibTeX key: first author surname + year + first title word. */
export function bibtexKey(record: AiMlRecord): string {
  const firstAuthor = splitAuthors(record.publication_metadata.authors)[0] ?? 'anon';
  const surname = firstAuthor.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '') || 'anon';
  const year = record.publication_metadata.year ?? 'nd';
  const firstWord =
    plainText(record.publication_metadata.title)
      ?.split(/\s+/)
      .find((w) => w.replace(/[^a-zA-Z]/g, '').length > 3)
      ?.toLowerCase()
      .replace(/[^a-z]/g, '') ?? 'untitled';
  return `${surname}${year}${firstWord}`;
}

function bibtexEscape(value: string): string {
  return value.replace(/[{}]/g, '');
}

export function toBibtex(record: AiMlRecord): string {
  const pm = record.publication_metadata;
  const lines: string[] = [`@article{${bibtexKey(record)},`];

  const authors = splitAuthors(pm.authors);
  if (authors.length) lines.push(`  author = {${authors.map(bibtexEscape).join(' and ')}},`);
  // Titles carry inline markup ("non-<i>ab initio</i>"); strip it rather than shipping tags
  // into someone's reference manager. Same reason the RIS branch below strips its abstract.
  if (pm.title) lines.push(`  title = {${bibtexEscape(plainText(pm.title))}},`);
  if (pm.journal) lines.push(`  journal = {${bibtexEscape(pm.journal)}},`);
  if (pm.year != null) lines.push(`  year = {${pm.year}},`);
  if (record.identifiers.doi) lines.push(`  doi = {${record.identifiers.doi}},`);
  if (record.identifiers.pmid) lines.push(`  pmid = {${record.identifiers.pmid}},`);

  // Drop the trailing comma on the final field so the entry is valid for strict parsers.
  const last = lines.length - 1;
  lines[last] = lines[last].replace(/,$/, '');
  lines.push('}');
  return lines.join('\n');
}

export function toRis(record: AiMlRecord): string {
  const pm = record.publication_metadata;
  const lines: string[] = ['TY  - JOUR'];
  for (const author of splitAuthors(pm.authors)) lines.push(`AU  - ${author}`);
  if (pm.title) lines.push(`TI  - ${plainText(pm.title)}`);
  if (pm.journal) lines.push(`JO  - ${pm.journal}`);
  if (pm.year != null) lines.push(`PY  - ${pm.year}`);
  if (record.identifiers.doi) lines.push(`DO  - ${record.identifiers.doi}`);
  if (record.identifiers.pmid) lines.push(`AN  - ${record.identifiers.pmid}`);
  if (pm.abstract) lines.push(`AB  - ${plainText(pm.abstract)}`);
  lines.push('ER  - ');
  return lines.join('\n');
}
