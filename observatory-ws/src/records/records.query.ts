import { FilterQuery } from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { escapeRegex } from '../common/escape-regex';
import { RecordDocument } from './schemas/record.schema';
import { synonymsFor } from './search-synonyms';

export type Classification = 'positive' | 'negative' | 'undeterminable';
export type SortOrder = 'relevance' | 'year_desc' | 'year_asc' | 'citations_desc' | 'citations_asc';

/**
 * Every query param observatory-ui's search-params.ts (queryToParams) can emit, as the raw
 * strings HTTP delivers them -- mirrors that file's own `RawParams` type deliberately, so the
 * parsing below can be tested against exactly the same edge cases its spec file covers, with no
 * translation layer between a shared UI URL and this API. Absent (`undefined`) and explicitly-
 * empty (`''`) are meaningfully different for `class` -- see resolveClassification below -- so
 * this is `string | undefined`, never defaulted to `''` at this layer.
 */
export interface RawSearchParams {
  q?: string;
  class?: string;
  oa?: string;
  ft?: string;
  year?: string;
  // Multi-value filters. `string | string[]` because they are REPEATABLE params
  // (`?jrnl=A&jrnl=B`), which is what makes a value containing a comma expressible at all -- see
  // readList. Express delivers a single occurrence as a string and a repeated one as an array.
  lic?: string | string[];
  jrnl?: string | string[];
  mesh?: string | string[];
  kw?: string | string[];
  ptype?: string | string[];
  d1?: string | string[];
  d2?: string | string[];
  d3?: string | string[];
  para?: string | string[];
  fam?: string | string[];
  mt?: string | string[];
  dl?: string | string[];
  enriched?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
}

export interface ParsedFilters {
  q?: string;
  classification: Classification[];
  openAccess?: boolean;
  fulltextAvailable?: boolean;
  yearMin?: number;
  yearMax?: number;
  license?: string[];
  journal?: string[];
  meshHeadings?: string[];
  keywordsAuthor?: string[];
  pubTypes?: string[];
  domainTier1?: string[];
  domainTier2?: string[];
  domainTier3?: string[];
  learningParadigm?: string[];
  modelFamily?: string[];
  modelType?: string[];
  /** Resource slugs from data_links.resources[].resource (schema v1.4.0): pdb, geo, zenodo, ... */
  dataResources?: string[];
  enrichedOnly?: boolean;
}

export interface ParsedQuery {
  filters: ParsedFilters;
  sort: SortOrder;
  page: number;
  pageSize: number;
  skip: number;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_SORT: SortOrder = 'relevance';
/** Same reasoning as observatory-ui/src/app/core/search-params.ts: an unfiltered visit should show
 *  the resource's actual content (AI/ML methods papers), not the screened-out majority. */
export const DEFAULT_CLASSIFICATION: Classification[] = ['positive'];
/** page * pageSize beyond this is rejected (400), not silently clamped -- see buildPagination.
 *  Deep pages exist to browse, not to reconstruct the corpus; that's what /api/export is for
 *  (keyset-paginated, no window -- see export/export.service.ts). Also makes Mongo's 32MB
 *  in-memory sort ceiling structurally unreachable. */
export const MAX_RESULT_WINDOW = 10_000;

const SORTS: SortOrder[] = [
  'relevance',
  'year_desc',
  'year_asc',
  'citations_desc',
  'citations_asc',
];
const CLASSIFICATIONS: Classification[] = ['positive', 'negative', 'undeterminable'];

/**
 * Reads a multi-value filter param. Values are taken VERBATIM -- never split on anything.
 *
 * Mirrors observatory-ui's search-params.ts readList exactly, and exists for the same reason: the
 * previous comma-joined encoding destroyed any facet value containing a comma. A journal like
 * "Bioinformatics Advances (Oxford, England)" parsed to the two-value filter
 * ["Bioinformatics Advances (Oxford", "England)"] and matched nothing, and the same bug hit MeSH
 * headings ("Neoplasms, Second Primary") and the EDAM domain vocabulary's own comma-bearing terms.
 * A repeated key (`?jrnl=A&jrnl=B`) needs no in-value delimiter, so the comma is just data.
 */
function readList(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const items = (Array.isArray(value) ? value : [value]).filter(
    (v) => typeof v === 'string' && v.trim() !== '',
  );
  return items.length ? items : undefined;
}

/**
 * The one surviving comma-split, used only by `class` (see resolveClassification).
 *
 * Its three values are fixed literals that can never contain a comma, `class=positive,negative` is
 * a documented API contract, and the empty-string `class=` "explicitly cleared" signal has to
 * survive byte-for-byte -- canUseTextIndex depends on it, and getting it wrong turns every
 * cleared-classification search into a 500 rather than a slow query.
 */
function splitClassificationList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

/** A free-text query longer than this is almost certainly a paste, not a search -- and each term
 *  becomes another regex clause per document on an unindexed collection, so this bounds the cost
 *  of a single query as much as it bounds nonsense input. */
const MAX_QUERY_TERMS = 8;

/**
 * "random forest sepsis" -> ['random', 'forest', 'sepsis']; a "quoted phrase" is kept as one term.
 * Splitting on whitespace outside quotes (not a naive .split(' ')) so a query like
 * `"cell type" transformer` produces two terms, not four. Terms beyond MAX_QUERY_TERMS are
 * dropped rather than rejected -- a long paste should still search on its first few words instead
 * of erroring outright.
 */
export function tokenizeQuery(q: string): string[] {
  const terms: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(q)) !== null) {
    const term = (match[1] ?? match[2]).trim();
    if (term) terms.push(term);
    if (terms.length >= MAX_QUERY_TERMS) break;
  }
  return terms;
}

/** A term this short is a stray initial or article: it costs a full regex pass per document and
 *  narrows nothing. Dropping it is what makes an author query like "Farrell G" behave -- the bare
 *  "G" clause matched almost everything while doubling the query's cost. */
const MIN_TERM_LENGTH = 2;

/** Spellings per term: the one typed plus at most this many synonyms. Bounds the regex on the
 *  scan path (8 terms x 4 spellings x 3 fields) as much as it bounds the noise. */
const MAX_ALTERNATIVES = 4;

const TRAILING_PUNCTUATION_RE = /[.,;:]+$/;
const TRAILING_STAR_RE = /\*+$/;

/** One spelling of a search term. */
export interface QueryAlternative {
  /** As typed, or as the vocabulary writes it: "svm", "support vector machine", "SVM". */
  text: string;
  /** The same as the words a regex must find in order. Hyphens split, so "single-cell" also finds
   *  "single cell" -- the corpus writes both. */
  words: string[];
  /** `neuro*`: match word beginnings. Never served by the index, and never expanded. */
  prefix: boolean;
  source: 'typed' | 'synonym';
}

/** One search term with every spelling that satisfies it. Terms are AND-ed, spellings OR-ed. */
export interface QueryGroup {
  /** The term as typed, cleaned: trailing punctuation and the `*` gone. */
  typed: string;
  alternatives: QueryAlternative[];
}

/**
 * Trailing sentence punctuation is stripped, and that is load-bearing rather than cosmetic:
 * without it "Farrell G." tokenises to ["Farrell", "G."], the two-character "G." survives the
 * length floor, and the search becomes "surname AND a token ending in G." -- which matched 7
 * documents where "Farrell G" matched 94. Two spellings of the same author's name have to return
 * the same thing. A trailing `*` is the word-beginning marker and comes off here, before anything
 * could escape it into a literal.
 */
function cleanTerm(raw: string): { term: string; prefix: boolean } {
  const term = raw.replace(TRAILING_PUNCTUATION_RE, '');
  const prefix = TRAILING_STAR_RE.test(term);
  return {
    term: term.replace(TRAILING_STAR_RE, '').replace(TRAILING_PUNCTUATION_RE, ''),
    prefix,
  };
}

function phraseWords(text: string): string[] {
  return text.replace(/-/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function alternative(
  text: string,
  prefix: boolean,
  source: QueryAlternative['source'],
): QueryAlternative {
  return { text, words: phraseWords(text), prefix, source };
}

/**
 * The terms a query asks for, each with its spellings.
 *
 * "random forest sepsis" is three terms of one spelling each. A bare word or a quoted phrase that
 * names a method in the published vocabulary gains that method's other spellings -- `svm` is also
 * searched as "support vector machine" -- so a paper is found however its authors chose to write
 * it; search-synonyms.ts says what qualifies. A `*` term is never expanded: the star says "exactly
 * this beginning".
 */
export function parseQueryGroups(q: string): QueryGroup[] {
  const groups: QueryGroup[] = [];
  for (const raw of tokenizeQuery(q)) {
    const { term, prefix } = cleanTerm(raw);
    if (term.length < MIN_TERM_LENGTH) continue;
    const alternatives = [alternative(term, prefix, 'typed')];
    if (!prefix) {
      for (const synonym of synonymsFor(term).slice(0, MAX_ALTERNATIVES - 1)) {
        alternatives.push(alternative(synonym, false, 'synonym'));
      }
    }
    groups.push({ typed: term, alternatives });
  }
  return groups;
}

/** The typed terms actually worth matching: parseQueryGroups without the spellings. */
export function searchTerms(q: string): string[] {
  return parseQueryGroups(q).map((group) => group.typed);
}

/** Every synonym the query picked up, for the response to say so ("svm also searched as ..."). */
export function queryExpansions(q: string): { term: string; alternatives: string[] }[] {
  return parseQueryGroups(q)
    .filter((group) => group.alternatives.length > 1)
    .map((group) => ({
      term: group.typed,
      alternatives: group.alternatives.slice(1).map((alt) => alt.text),
    }));
}

/**
 * Word separator inside a phrase. A literal space fails on the corpus's real text: titles carry
 * inline markup, so "in vitro" is stored as "<i>In Vitro</i>" and a plain-space phrase regex never
 * matches it. Hyphenation ("random-forest") breaks it the same way. Measured *faster* than the
 * naive form on the MongoDB server (1,225ms vs 1,572ms for "in vitro"), because it fails earlier on non-matches.
 */
const PHRASE_GAP = '(?:<[^>]*>|[\\s\\-\u2013\u2014])+';

/**
 * `\b`-anchored pattern for one term. Word-start only, so "cell" still matches "cells"/"cellular"
 * -- measured to cut false hits like "excellent"/"parcellation" from 61,288 to 46,141 for a
 * ~10-20% time cost. A multi-word (quoted) term becomes a markup-tolerant phrase.
 */
export function termPattern(term: string): string {
  const words = term.trim().split(/\s+/).map(escapeRegex);
  return `\\b${words.join(PHRASE_GAP)}`;
}

export interface AuthorName {
  surname: string;
  initials: string;
}

/**
 * Which spelling of a name the user typed:
 *  - `pubmed`  "Farrell G", "farrell g", "Farrell, G.", "Tosatto SCE", "van der Berg J"
 *  - `leading` "G Farrell", "g farrell", "S.C.E. Tosatto"  (initials FIRST)
 *  - `given`   "Gavin Farrell", "Farrell Gavin", "sce tosatto"  (no explicit initials at all)
 *
 * The shape decides routing, not just labelling: only `pubmed` may put a quoted phrase straight
 * into the main `$text` query, because only there is the leading token certainly a surname. See
 * buildAuthorProbeFilter for why `leading` gets its own probe instead.
 */
export type AuthorShape = 'pubmed' | 'leading' | 'given';

export interface AuthorInterpretation extends AuthorName {
  shape: AuthorShape;
}

/** A token that could be part of a personal name: letters, plus the apostrophes, hyphens and dots
 *  real names and initials carry ("O'Brien", "García-Martínez", "S.C.E"). Anything else -- a digit,
 *  a "+", a bare symbol -- means this is not a name, which is what keeps "covid 19" and "C++" out. */
const AUTHOR_TOKEN_RE = /^\p{L}[\p{L}'.-]*$/u;

/** Initials, as written when they are unmistakably initials: "G", "SCE", "AGB", "LEE", and the
 *  particle forms Europe PMC really carries ("RdJ", "MdC"). Deliberately case-sensitive for the
 *  multi-letter case -- "Yu", "Li" and "Ke" are surnames, not initials -- and matched on \p{Lu} so
 *  a caseless script is never mistaken for capitals. */
const INITIALS_RE = /^\p{Lu}(?:\p{Ll}?\p{Lu}){0,3}$/u;

/** Names never run this long as a query, and each extra token multiplies the interpretations. */
const MAX_AUTHOR_TOKENS = 4;

function nameLetters(token: string): string {
  return token.replace(/[^\p{L}]/gu, '');
}

/**
 * Splits a query into name tokens, or undefined when it cannot be a name at all.
 *
 * Deliberately NOT searchTerms(): that drops single-character tokens, which are exactly the
 * initials this has to see. Commas are separators here ("Farrell, G" and "Farrell,G" are the same
 * name), trailing dots are stripped per token, and a curly apostrophe is folded to a straight one
 * so it matches what the corpus stores.
 */
function authorTokens(q: string): string[] | undefined {
  let text = q.trim().replace(/’/g, "'");
  const quoted = /^"([^"]+)"$/.exec(text);
  if (quoted) text = quoted[1].trim();
  else if (text.includes('"')) return undefined; // a mixed quoted query is a phrase search, not a name

  const tokens = text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => token.replace(/\.+$/, ''));

  if (tokens.length < 2 || tokens.length > MAX_AUTHOR_TOKENS) return undefined;
  if (!tokens.every((token) => AUTHOR_TOKEN_RE.test(token))) return undefined;
  return tokens;
}

/** A lone letter is never a name, a dotted token is always initials, and anything longer has to
 *  look like capitals to qualify. */
function isInitialsShaped(token: string): boolean {
  const letters = nameLetters(token);
  if (letters.length === 0 || letters.length > 4) return false;
  if (letters.length === 1) return true;
  if (token.includes('.')) return true;
  return INITIALS_RE.test(letters);
}

/** Initials that cannot also be read as a word. "G" and "S.C.E" qualify; "SCE" and "DNA" do not --
 *  an all-caps token at the FRONT of a query is far more often an acronym ("DNA methylation",
 *  "RNA seq") than someone's initials, and reading it as a name would hijack the query. */
function isUnambiguousInitials(token: string): boolean {
  return isInitialsShaped(token) && (nameLetters(token).length === 1 || token.includes('.'));
}

function isNameLike(token: string): boolean {
  return !token.includes('.') && nameLetters(token).length >= 2;
}

/** A name token contributes its first letter; an initials token contributes all of them. */
function initialsOf(token: string): string {
  const letters = nameLetters(token);
  return (isInitialsShaped(token) ? letters : letters.slice(0, 1)).toUpperCase();
}

/**
 * Every way the query could name an author, most-certain first.
 *
 * The corpus stores authors one way only -- surname then initials, "Liang L, He M" -- but people
 * type names every other way: lowercase, initials first, dotted, comma'd, or with the full given
 * name that is nowhere in the data. Each interpretation is a surname+initials pair to look for, and
 * authorClause turns it into a match against the stored form. Ordinary topical queries produce
 * `given` interpretations too ("random forest" -> "Forest R", "Random F"); that is intended and
 * cheap, because those clauses are OR'd alongside the normal term matching rather than replacing it
 * -- a query only ever gains the handful of papers actually written by someone of that name.
 */
export function authorInterpretations(q: string): AuthorInterpretation[] {
  const tokens = authorTokens(q);
  if (!tokens) return [];

  const found: AuthorInterpretation[] = [];
  const seen = new Set<string>();
  const add = (surname: string, initials: string, shape: AuthorShape): void => {
    if (!surname || !initials) return;
    const key = `${surname.toLowerCase()}|${initials.toUpperCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ surname, initials, shape });
  };
  const joinInitials = (parts: string[]): string =>
    parts.map(nameLetters).join('').toUpperCase().slice(0, 8);

  // "van der Berg J" -- the longest run of trailing initials, everything before it the surname.
  // Every remaining token must be name-like, which is what keeps a two-author paste
  // ("Farrell G Attafi O") from parsing as one absurd surname.
  let surnameEnd = tokens.length;
  while (surnameEnd > 1 && isInitialsShaped(tokens[surnameEnd - 1])) surnameEnd--;
  if (surnameEnd < tokens.length && tokens.slice(0, surnameEnd).every(isNameLike)) {
    add(tokens.slice(0, surnameEnd).join(' '), joinInitials(tokens.slice(surnameEnd)), 'pubmed');
    return found;
  }

  // "G Farrell" -- the mirror image. Only unambiguous initials lead, so "DNA methylation" is not
  // read as a person.
  let surnameStart = 0;
  while (surnameStart < tokens.length - 1 && isUnambiguousInitials(tokens[surnameStart])) {
    surnameStart++;
  }
  if (surnameStart > 0 && tokens.slice(surnameStart).every(isNameLike)) {
    add(
      tokens.slice(surnameStart).join(' '),
      joinInitials(tokens.slice(0, surnameStart)),
      'leading',
    );
    return found;
  }

  // "Gavin Farrell" / "Farrell Gavin" -- no initials anywhere, so both orders are plausible and
  // both are tried. Only the FIRST given name's initial is used: records routinely carry "Tosatto
  // S" for an author whose full name has a middle name, and authorClause lets initials extend, so
  // the shorter form finds "Tosatto S", "Tosatto SC" and "Tosatto SCE" alike.
  if (tokens.length <= 3 && tokens.every(isNameLike)) {
    add(tokens[tokens.length - 1], initialsOf(tokens[0]), 'given');
    if (tokens.length === 3) add(tokens.slice(1).join(' '), initialsOf(tokens[0]), 'given');
    if (tokens.length === 2) add(tokens[0], initialsOf(tokens[1]), 'given');
  }
  return found;
}

/**
 * The "surname then initials" reading of a query, the one shape whose leading token is certainly a
 * surname -- so the only one that may become a `$text` phrase in the main query (see
 * buildTextSearch).
 */
export function parseAuthorName(q: string): AuthorName | undefined {
  return authorInterpretations(q).find((name) => name.shape === 'pubmed');
}

/** The "initials then surname" reading ("G Farrell"). Drives the probe query, never the main one. */
export function leadingInitialsName(q: string): AuthorName | undefined {
  return authorInterpretations(q).find((name) => name.shape === 'leading');
}

/**
 * Matches one author exactly within the comma-separated authors string
 * ("Liang L, Liang H, He M, Zhang H, Ke P."). Anchored on a comma or the string edge at both ends
 * so "Farrell G" cannot match inside another name, and allowing the initials to extend
 * ("Farrell G" also matches "Farrell GP") the way PubMed's author search does.
 *
 * The surname's own spaces become `\s+` rather than literal spaces so a multi-part surname
 * ("van der Berg J") survives any spacing, and the initials may extend through a hyphen because
 * Europe PMC writes some Korean and Chinese names that way ("Lee J-H").
 */
export function authorClause(name: AuthorName): FilterQuery<RecordDocument> {
  const surname = name.surname.trim().split(/\s+/).map(escapeRegex).join('\\s+');
  const pattern = `(^\\s*|,\\s*)${surname}\\s+${escapeRegex(name.initials)}[A-Za-z-]*\\.?\\s*(,|\\.?$)`;
  return { 'publication_metadata.authors': { $regex: pattern, $options: 'i' } };
}

function parseBool(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/**
 * "2020-2026" -> { yearMin: 2020, yearMax: 2026 }. Tolerates open-ended "2020-" and "-2026".
 *
 * The explicit empty check matters: `Number('')` is `0` and `Number.isInteger(0)` is `true`, so
 * naively parsing the empty half of "2020-" would yield `yearMax: 0` -- a filter matching
 * nothing. Same bug search-params.spec.ts pins down on the frontend side of this exact contract.
 */
function parseYearBound(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

function parseYearRange(value: string | undefined): {
  yearMin?: number;
  yearMax?: number;
} {
  if (!value) return {};
  const [rawMin, rawMax] = value.split('-');
  return { yearMin: parseYearBound(rawMin), yearMax: parseYearBound(rawMax) };
}

/**
 * Absent `class` means "never touched" -> the positive default applies. An explicitly empty
 * `class=` means the user cleared the filter and must NOT snap back to the default -- it means
 * "show every classification". This mirrors observatory-ui's paramsToQuery exactly, because the
 * frontend applies this same defaulting *before* the URL is ever built (queryToParams omits
 * `class` entirely at the default), so a shared results URL and a direct API call must resolve
 * the missing param identically.
 */
function resolveClassification(value: string | undefined): Classification[] {
  if (value === undefined) return DEFAULT_CLASSIFICATION;
  const items = (splitClassificationList(value) ?? []).filter((c): c is Classification =>
    (CLASSIFICATIONS as string[]).includes(c),
  );
  return items;
}

function parseSort(value: string | undefined): SortOrder {
  return SORTS.includes(value as SortOrder) ? (value as SortOrder) : DEFAULT_SORT;
}

export function parseSearchParams(
  raw: RawSearchParams,
): Omit<ParsedQuery, 'page' | 'pageSize' | 'skip'> {
  const filters: ParsedFilters = {
    q: raw.q?.trim() || undefined,
    classification: resolveClassification(raw.class),
    openAccess: parseBool(raw.oa),
    fulltextAvailable: parseBool(raw.ft),
    ...parseYearRange(raw.year),
    license: readList(raw.lic),
    journal: readList(raw.jrnl),
    meshHeadings: readList(raw.mesh),
    keywordsAuthor: readList(raw.kw),
    pubTypes: readList(raw.ptype),
    domainTier1: readList(raw.d1),
    domainTier2: readList(raw.d2),
    domainTier3: readList(raw.d3),
    learningParadigm: readList(raw.para),
    modelFamily: readList(raw.fam),
    modelType: readList(raw.mt),
    dataResources: readList(raw.dl),
    enrichedOnly: parseBool(raw.enriched),
  };

  return { filters, sort: parseSort(raw.sort) };
}

/**
 * Validates + clamps page/pageSize, and rejects (400) any request whose result window would
 * exceed MAX_RESULT_WINDOW -- rather than allowing it through and letting Mongo's deep sort fail
 * with a raw 500 (measured: `Sort operation used more than the maximum 33554432 bytes of RAM`
 * at skip ~9000).
 */
export function buildPagination(rawPage: string | undefined, rawPageSize: string | undefined) {
  const pageNum = Number(rawPage);
  const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1;

  const sizeNum = Number(rawPageSize);
  const pageSize =
    Number.isInteger(sizeNum) && sizeNum > 0 ? Math.min(sizeNum, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  if (page * pageSize > MAX_RESULT_WINDOW) {
    throw new BadRequestException(
      `page * pageSize (${page * pageSize}) exceeds the maximum browsable result window ` +
        `(${MAX_RESULT_WINDOW}). Narrow the filters, or use /api/export to walk the whole ` +
        `matching set with a cursor.`,
    );
  }

  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** license: '' represents "no license recorded" on the frontend (`access.license ?? ''`,
 *  see record.model.ts) but is stored in Mongo as a genuine mix of `""` (208,649 docs) and `null`
 *  (71,025 docs) -- confirmed by direct aggregation against the MongoDB server, 2026-09-01. Requesting the
 *  empty-license bucket must therefore match both. */
function licenseInClause(license: string[]): (string | null)[] {
  return license.includes('') ? [...license, null] : license;
}

const TITLE = 'publication_metadata.title';
const ABSTRACT = 'publication_metadata.abstract';
const AUTHORS = 'publication_metadata.authors';

/**
 * Classification goes FIRST, before the expensive free-text regex -- measured directly against
 * The MongoDB server: the identical filter with this clause first vs. last is 2,566ms vs. 5,809ms (more than
 * 2x) on a zero-match query, because Mongo's un-indexed collection scan can then short-circuit the
 * regex entirely for the majority of documents (the non-positive ones, on the default filter) via
 * this cheap equality check first. Don't reorder this without re-measuring -- it looks
 * like a no-op change and isn't.
 */
function classificationClauses(filters: ParsedFilters): FilterQuery<RecordDocument>[] {
  if (!filters.classification.length) return [];
  return [
    {
      'llm_classification.classification':
        filters.classification.length === 1
          ? { $eq: filters.classification[0] }
          : { $in: filters.classification },
    },
  ];
}

const SEARCH_FIELDS = [TITLE, ABSTRACT, AUTHORS];

/** "SVM", "OLS", "PLS-DA": capitals only. */
const ACRONYM_RE = /^[A-Z][A-Z0-9-]{1,5}$/;

/**
 * The regex for one spelling, and whether it may ignore case.
 *
 * A typed term is matched as today: word-start anchored, case-insensitive, so "cell" finds "cells"
 * and "cellular". A synonym that is an acronym is matched whole and case-sensitively instead: the
 * vocabulary's aliases include ANN, SOM and GAN, and as case-insensitive word beginnings those are
 * "annual", "somatic" and "ganglion". A plural is allowed ("SVMs").
 */
function alternativePattern(alt: QueryAlternative): { pattern: string; caseSensitive: boolean } {
  if (alt.source === 'synonym' && ACRONYM_RE.test(alt.text)) {
    return { pattern: `\\b${escapeRegex(alt.text)}s?\\b`, caseSensitive: true };
  }
  return { pattern: termPattern(alt.words.join(' ')), caseSensitive: false };
}

function fieldClauses(alt: QueryAlternative): FilterQuery<RecordDocument>[] {
  const { pattern, caseSensitive } = alternativePattern(alt);
  const match = caseSensitive ? { $regex: pattern } : { $regex: pattern, $options: 'i' };
  return SEARCH_FIELDS.map((field) => ({ [field]: match }));
}

/** One term, matched anywhere it could sensibly appear, in any of its spellings. */
function groupClause(group: QueryGroup): FilterQuery<RecordDocument> {
  return { $or: group.alternatives.flatMap(fieldClauses) };
}

/**
 * AND-of-terms, not one literal phrase: a user typing "random forest sepsis" means all three words,
 * in any order, not that exact substring -- which appears in zero documents and used to force a
 * full-collection scan to prove it (measured: 5.1s, then a false-positive 503 for what was
 * actually a healthy, just-slow query). Matches across title, abstract AND author.
 *
 * When the query could also be somebody's name, the author readings are OR'd alongside that AND
 * rather than replacing it. That is the one thing making "Gavin Farrell" work at all: no given name
 * is stored anywhere in the corpus, so the term AND can never match, and only the reconstructed
 * "Farrell G" clause can. It is equally load-bearing for dotted initials -- "S.C.E. Tosatto" keeps
 * the five-character term "S.C.E", which appears in no document. For a query already in the stored
 * form ("Farrell G") the extra clause is a subset of what the terms match anyway, so results are
 * unchanged; for an ordinary topical query it adds only the handful of papers written by someone
 * actually named that.
 */
function freeTextClauses(
  filters: ParsedFilters,
  keepReading: (name: AuthorInterpretation) => boolean = () => true,
): FilterQuery<RecordDocument>[] {
  if (!filters.q) return [];
  const groups = parseQueryGroups(filters.q);
  const clauses = groups.map(groupClause);
  // The typed words only: a synonym is another spelling of a method, never of a person.
  const typed = groups.map((group) => group.typed);
  const authors = authorInterpretations(filters.q)
    .filter((name) => !impliedByTerms(name, typed) && keepReading(name))
    .map(authorClause);

  if (!authors.length) return clauses;
  if (!clauses.length) return [{ $or: authors }];
  return [{ $or: [{ $and: clauses }, ...authors] }];
}

/**
 * True when the term AND already matches everything this author clause could -- so adding it would
 * cost a second regex per document and find nothing new.
 *
 * That is the case whenever every search term is part of the name itself: "farrell g" searches for
 * `\bfarrell` and looks for the author "farrell G", and any document with that author necessarily
 * contains that term. Skipping it matters, not just tidiness -- measured against the live corpus
 * with the classification filter cleared, carrying the redundant clause pushed the count for
 * "farrell g" past its 5s budget, degrading an exact 334 into "10,000+".
 *
 * A given-name query is the opposite case and keeps its clause: "Gavin Farrell" ANDs a term that
 * appears in no document at all, so only the reconstructed "Farrell G" clause can match anything.
 * That one does still cost a scan when the classification filter is cleared -- measured live, the
 * count for "Gavin Farrell" with `class=` exceeds its 5s budget and CountService reports "10,000+"
 * rather than an exact number. The page itself is correct and fast, and the alternative is what
 * this query used to do, which was return zero results.
 */
function impliedByTerms(name: AuthorName, terms: string[]): boolean {
  const words = new Set(name.surname.toLowerCase().split(/\s+/));
  const initials = name.initials.toLowerCase();
  return terms.every((term) => {
    const lower = term.toLowerCase();
    return words.has(lower) || initials.includes(lower);
  });
}

function structuredClauses(filters: ParsedFilters): FilterQuery<RecordDocument>[] {
  const clauses: FilterQuery<RecordDocument>[] = [];

  if (filters.openAccess !== undefined)
    clauses.push({ 'source.access.open_access': filters.openAccess });
  if (filters.fulltextAvailable !== undefined) {
    clauses.push({
      'source.access.fulltext_available': filters.fulltextAvailable,
    });
  }
  // BSON comparison order places null below every number, so a null/missing year is already
  // excluded by a plain $gte/$lte -- no separate $ne: null clause needed (matches the frontend's
  // `pm.year == null` exclusion in matchesFilters).
  if (filters.yearMin !== undefined || filters.yearMax !== undefined) {
    const yearClause: { $gte?: number; $lte?: number } = {};
    if (filters.yearMin !== undefined) yearClause.$gte = filters.yearMin;
    if (filters.yearMax !== undefined) yearClause.$lte = filters.yearMax;
    clauses.push({ 'publication_metadata.year': yearClause });
  }
  if (filters.license?.length)
    clauses.push({
      'source.access.license': { $in: licenseInClause(filters.license) },
    });
  if (filters.journal?.length)
    clauses.push({ 'publication_metadata.journal': { $in: filters.journal } });
  if (filters.meshHeadings?.length)
    clauses.push({
      'content_filters.mesh_headings': { $in: filters.meshHeadings },
    });
  if (filters.keywordsAuthor?.length) {
    clauses.push({
      'content_filters.keywords_author': { $in: filters.keywordsAuthor },
    });
  }
  if (filters.pubTypes?.length)
    clauses.push({ 'content_filters.pub_types': { $in: filters.pubTypes } });
  if (filters.domainTier1?.length)
    clauses.push({
      'content_filters.domain_tier1': { $in: filters.domainTier1 },
    });
  if (filters.domainTier2?.length)
    clauses.push({
      'content_filters.domain_tier2': { $in: filters.domainTier2 },
    });
  if (filters.domainTier3?.length)
    clauses.push({
      'content_filters.domain_tier3': { $in: filters.domainTier3 },
    });
  if (filters.learningParadigm?.length) {
    clauses.push({
      'content_filters.learning_paradigm': { $in: filters.learningParadigm },
    });
  }
  if (filters.modelFamily?.length)
    clauses.push({
      'content_filters.model_family': { $in: filters.modelFamily },
    });
  if (filters.modelType?.length)
    clauses.push({ 'content_filters.model_type': { $in: filters.modelType } });
  // Dot notation into the array of subdocuments: a record matches when ANY of its linked
  // resources is in the list -- Mongo's native semantics, the same any-element-matches rule the
  // string-array filters above rely on.
  if (filters.dataResources?.length)
    clauses.push({ 'data_links.resources.resource': { $in: filters.dataResources } });
  if (filters.enrichedOnly) clauses.push({ 'llm_enrichment.provider': { $ne: null } });

  return clauses;
}

/**
 * Reproduces observatory-ui's matchesFilters() (records.service.ts) as a Mongo filter, field for
 * field. `$in` against an array field is Mongo's native any-element-matches semantics, which is
 * exactly hasAnyOverlap().
 */
export function buildMongoFilter(filters: ParsedFilters): FilterQuery<RecordDocument> {
  return buildFilter(filters, () => true);
}

function buildFilter(
  filters: ParsedFilters,
  keepReading: (name: AuthorInterpretation) => boolean,
): FilterQuery<RecordDocument> {
  const clauses = [
    ...classificationClauses(filters),
    ...freeTextClauses(filters, keepReading),
    ...structuredClauses(filters),
  ];
  return clauses.length ? { $and: clauses } : {};
}

/** Name of the partial text index on `Content`. The backend never requires it to exist -- see
 *  RecordsService's boot detection -- but when it does, this is what it is called. */
export const TEXT_INDEX_NAME = 'positives_text';

/**
 * True when a `$text` query is legal for these filters.
 *
 * This is not an optimisation check, it is a correctness guard. `positives_text` is a PARTIAL index
 * (`partialFilterExpression: { classification: "positive" }`), and MongoDB 4.2 does not quietly
 * fall back to a collection scan when a `$text` query fails to carry that predicate -- it REJECTS
 * the query outright:
 *
 *   planner returned error :: caused by :: failed to use text index to satisfy $text query
 *
 * Confirmed against the live collection after the index was built, 2026-09-02. So a search with the
 * classification filter cleared (`class=`, which resolveClassification treats as "every
 * classification") must take the regex path, or it becomes a 500 rather than a slow query.
 */
export function canUseTextIndex(filters: ParsedFilters): boolean {
  return (
    Boolean(filters.q) &&
    filters.classification.length === 1 &&
    filters.classification[0] === 'positive' &&
    // `neuro*` asks for word beginnings, which a stemmed index cannot give. With no other term to
    // select candidates by, the scan is the only honest answer.
    parseQueryGroups(filters.q as string).some((group) =>
      group.alternatives.some((alt) => !alt.prefix),
    )
  );
}

/** How common a word is among the positives, per TermFrequencyService; undefined when unknown. */
export type DocumentFrequency = (word: string) => number | undefined;

/** A word as `$text` may be given it: no leading minus (which `$text` reads as negation) or stray
 *  quote. Undefined when it stems to nothing useful (a lone letter). Case is kept -- `$text` is
 *  case-insensitive, and the frequency table keys on the lower-cased form. */
function indexWord(word: string): string | undefined {
  const cleaned = word.replace(/^[-"']+|["']+$/g, '');
  return cleaned.replace(/[^\p{L}\p{N}]/gu, '').length >= 2 ? cleaned : undefined;
}

function candidateWords(alt: QueryAlternative): string[] {
  if (alt.prefix) return [];
  return alt.words.map(indexWord).filter((w): w is string => w !== undefined);
}

function unique(words: string[]): string[] {
  return [...new Set(words)];
}

function surnameWords(name: AuthorName): string[] {
  return phraseWords(name.surname)
    .map(indexWord)
    .filter((word): word is string => word !== undefined);
}

/** The rarest word of a surname: what `$text` must be given to select that author's papers. */
function surnamePick(name: AuthorName, cost: (word: string) => number): string | undefined {
  const words = surnameWords(name).filter((word) => cost(word) > 0);
  return words.length ? words.reduce((a, b) => (cost(b) < cost(a) ? b : a)) : undefined;
}

/**
 * A `given` reading whose surname is a commoner word than this is a topic, not a person:
 * "machine" is in 191k positives ("support vector machine"), "prediction" in 181k. Real surnames
 * sit far below -- Wang 56k, Li 50k, Zhang 49k, Farrell 84 (measured 2026-09-25) -- and so do the
 * topic words that share their range, which is why the cap is this high: a reading is dropped
 * only where carrying it would visibly slow the search, never merely to speed it up.
 */
const SURNAME_DF_CAP = 100_000;

/** Whether the index path carries this reading. An unmeasured surname is kept: correctness first. */
function readingFitsIndex(name: AuthorName, df: DocumentFrequency): boolean {
  const known = surnameWords(name)
    .map((word) => df(word.toLowerCase()))
    .filter((cost): cost is number => cost !== undefined && Number.isFinite(cost));
  return known.length === 0 || Math.min(...known) <= SURNAME_DF_CAP;
}

/**
 * The author readings the index path carries, given how common their surnames are.
 *
 * The filter ORs a reading alongside the term AND -- "Gavin Farrell" is matched as the author
 * "Farrell G" or as the two words -- so the words handed to `$text` have to select that reading's
 * papers too, and only the surname can: no given name is stored anywhere. Measured live before
 * this was so, "Gavin Farrell" selected by its rarest word, "gavin", found none of Farrell G's
 * papers and fell to the 16s scan.
 */
export function indexPathReadings(q: string, df: DocumentFrequency): AuthorInterpretation[] {
  const typed = searchTerms(q);
  return authorInterpretations(q).filter(
    (name) => !impliedByTerms(name, typed) && readingFitsIndex(name, df),
  );
}

/** Every word buildTextSearch might hand to `$text` -- what the service measures first. */
export function textSearchWords(q: string): string[] {
  if (parseAuthorName(q)) return [];
  const typed = searchTerms(q);
  const words = [
    ...parseQueryGroups(q).flatMap((g) => g.alternatives.flatMap(candidateWords)),
    ...authorInterpretations(q)
      .filter((name) => !impliedByTerms(name, typed))
      .flatMap(surnameWords),
  ];
  return unique(words.map((word) => word.toLowerCase()));
}

/**
 * The `$search` string for a query: the words that select candidates from the index.
 *
 * `$text` OR's its words and the regex clauses do the AND, so the candidate set is the UNION of
 * the words' postings and the regexes run over all of it. That union is the whole cost. Measured
 * live: "support vector machine" with all three words took 10.0s, because "machine" is in 191k
 * positives; with "vector" alone, 1.3s for the identical 29,918 results. So only the rarest word
 * goes in -- of the cheapest term, when there are several -- and the others stay with the regex.
 * A term with several spellings needs one word per spelling ("vector svm"), because a paper may
 * carry either. Words the index does not know (df 0: a stop word, a typo) select nothing and are
 * skipped; when nothing can be measured at all, every word goes in as it always did, which at
 * worst finds nothing and hands the query to the scan.
 *
 * Words are passed BARE, not quoted, which looks wrong until you measure it. Quoting a word turns
 * stemming off: `"prediction"` matched 3,415 documents on the probe where bare `prediction`
 * matched 5,320 (it also finds "predict", "predicts", "predicting"). A user-quoted phrase is
 * likewise not quoted here: a `$text` phrase is a literal adjacency test on the raw field, but
 * termPattern's phrase regex is deliberately markup- and hyphen-tolerant (PHRASE_GAP), because
 * "in vitro" is stored as "<i>In Vitro</i>" and "random forest" is often "random-forest".
 * Adjacency is the regex's job: `$text` selects candidates, the regexes decide what matches.
 *
 * An author-shaped query becomes a quoted phrase instead: measured `"Farrell G"` -> the 2 correct
 * records in 562ms, versus ~3.4s for the equivalent author regex. That one is safe to quote
 * because an author name really is a literal string in the stored field.
 */
export function buildTextSearch(q: string, df: DocumentFrequency = () => undefined): string {
  const author = parseAuthorName(q);
  if (author) return `"${author.surname} ${author.initials}"`;

  const groups = parseQueryGroups(q);
  const cost = (word: string): number => df(word.toLowerCase()) ?? Number.POSITIVE_INFINITY;

  // Every author reading the filter keeps needs its surname in here (indexPathReadings). The
  // term AND is then already covered when some term has one of those words in every spelling.
  const required = unique(
    indexPathReadings(q, df)
      .map((name) => surnamePick(name, cost))
      .filter((word): word is string => word !== undefined),
  );
  const requiredSet = new Set(required.map((word) => word.toLowerCase()));
  const covered = groups.some((group) =>
    group.alternatives.every(
      (alt) =>
        !alt.prefix && candidateWords(alt).some((word) => requiredSet.has(word.toLowerCase())),
    ),
  );

  let best: { words: string[]; cost: number } | undefined = covered
    ? { words: [], cost: 0 }
    : undefined;
  for (const group of covered ? [] : groups) {
    const picks: string[] = [];
    let total = 0;
    for (const alt of group.alternatives) {
      if (alt.prefix) continue;
      const words = candidateWords(alt).filter((word) => cost(word) > 0);
      if (!words.length) {
        // A spelling the index cannot select at all: the OR would silently lose it.
        picks.length = 0;
        break;
      }
      const pick = words.reduce((a, b) => (cost(b) < cost(a) ? b : a));
      picks.push(pick);
      total += cost(pick);
    }
    if (picks.length && (!best || total < best.cost)) best = { words: picks, cost: total };
  }
  const measurable =
    best !== undefined &&
    Number.isFinite(best.cost) &&
    required.every((word) => Number.isFinite(cost(word)));
  if (best && measurable) return unique([...best.words, ...required]).join(' ');

  const all = unique([
    ...groups.flatMap((g) => g.alternatives.flatMap(candidateWords)),
    ...required,
  ]);
  return (all.length ? all : tokenizeQuery(q)).join(' ');
}

/**
 * buildMongoFilter's result with a `$text` clause added, or null when `$text` is not usable here.
 *
 * The regex clauses are deliberately kept. Measured against the live collection, this composite
 * returns EXACTLY the same counts as the regex-only filter -- random forest 45,116, deep learning
 * 70,661, single cell transformer 187, graph neural network 5,749, identical in every case -- while
 * running 1.2-4.6x faster, because `$text` narrows to a few thousand candidates via the index and
 * the regexes only ever run on those. Recall is unchanged; there is no behaviour to explain to a
 * reader, only a speed difference.
 */
export function buildTextSearchFilter(
  filters: ParsedFilters,
  df: DocumentFrequency = () => undefined,
): FilterQuery<RecordDocument> | null {
  if (!canUseTextIndex(filters)) return null;
  // The same readings buildTextSearch covers -- a reading the filter carried without its surname
  // in `$search` would silently match nothing.
  const base = buildFilter(filters, (name) => readingFitsIndex(name, df)) as {
    $and?: FilterQuery<RecordDocument>[];
  };
  if (!base.$and) return null;
  return { $and: [...base.$and, { $text: { $search: buildTextSearch(filters.q as string, df) } }] };
}

/**
 * The one-shot probe for an initials-first query ("G Farrell", "S.C.E. Tosatto"), or null when the
 * query is not that shape.
 *
 * These cannot go through buildTextSearchFilter the way "Farrell G" does. A `$text` phrase is a
 * case-folded substring test, and the leading token of a query like "T cell" or "X ray" is a single
 * letter that is not an initial at all -- the phrase `"cell T"` would quietly match "cell types"
 * and "cell therapy" and return a wrong, non-empty subset, which shouldFallBackFromText (zero only)
 * would never rescue.
 *
 * So the probe asks the narrower question instead: its base is the AUTHOR clause alone, with no
 * title or abstract branch. A correct guess returns that author's papers off the index in one round
 * trip; a wrong guess returns exactly zero and the caller falls through to the ordinary routing
 * with nothing changed. The cost of being wrong is one indexed query, not a wrong answer.
 *
 * Gated on positives-only for the same non-negotiable reason every other `$text` query here is:
 * `positives_text` is a partial index and MongoDB 4.2 rejects a `$text` query that omits its filter
 * predicate outright, so a cleared `class=` has to stay off this path entirely.
 */
export function buildAuthorProbeFilter(filters: ParsedFilters): FilterQuery<RecordDocument> | null {
  if (!filters.q) return null;
  if (filters.classification.length !== 1 || filters.classification[0] !== 'positive') return null;
  const name = leadingInitialsName(filters.q);
  if (!name) return null;

  return {
    $and: [
      ...classificationClauses(filters),
      authorClause(name),
      ...structuredClauses(filters),
      { $text: { $search: `"${name.surname} ${name.initials}"` } },
    ],
  };
}

/**
 * Whether to discard the `$text` result and re-run the query the old way.
 *
 * Only zero: the index matches whole words and their inflections, so a zero means no word of the
 * query is in it as typed -- a combining form like "bioinform" or "onco" -- and the word-beginning
 * scan is worth the one wasted round trip. The response says which happened (SearchInfo.matched).
 */
export function shouldFallBackFromText(_filters: ParsedFilters, total: number): boolean {
  return total === 0;
}

const DOI_RE = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/\S+?)[.,;]*$/i;
const PMID_RE = /^(?:pmid:?\s*)?(\d{6,9})$/i;
const PMCID_RE = /^(?:pmcid:?\s*)?(PMC\d{4,9})$/i;

/**
 * A pasted DOI, PMID or PMCID as an exact lookup on `identifiers.*`, or null when the query is not
 * one. Free text would find nothing for these (no title or abstract contains its own DOI), and a
 * person pasting one wants that record. The other filters and the classification clause still
 * apply, so `class=` and `total` agree with every other route. DOIs are case-insensitive by
 * definition, hence the anchored regex rather than equality. Unindexed, ~1s measured on the
 * positives -- fine for a lookup that used to return zero.
 */
export function identifierQuery(filters: ParsedFilters): FilterQuery<RecordDocument> | null {
  const q = filters.q?.trim();
  if (!q) return null;

  let clause: FilterQuery<RecordDocument> | undefined;
  const doi = DOI_RE.exec(q);
  const pmid = doi ? null : PMID_RE.exec(q);
  const pmcid = doi || pmid ? null : PMCID_RE.exec(q);
  if (doi) clause = { 'identifiers.doi': { $regex: `^${escapeRegex(doi[1])}$`, $options: 'i' } };
  else if (pmid) clause = { 'identifiers.pmid': pmid[1] };
  else if (pmcid) clause = { 'identifiers.pmcid': pmcid[1].toUpperCase() };
  if (!clause) return null;

  return { $and: [...classificationClauses(filters), clause, ...structuredClauses(filters)] };
}

/** How many of the index's best-scoring rows are re-ordered in process -- eight pages of 25. Past
 *  this depth results stay in textScore order. Measured: the 200-row projection sorts in 0.1-0.9s
 *  for every lone word tried, the same as a 25-row page. */
export const RERANK_DEPTH = 200;

/** One row of the ranked projection, as RecordsService fetches it. */
export interface TextCandidate {
  _id: string;
  score?: number;
  publication_metadata?: { title?: string | null; citation_count?: number | null };
}

/** A typed term short enough to be an acronym ("DOME", "GNN", "svm"): 3-5 letters or digits. */
const ACRONYM_CANDIDATE_RE = /^[A-Za-z][A-Za-z0-9]{2,4}$/;

/**
 * Orders the index's top rows the way a person would expect, given what they typed.
 *
 * textScore alone is not that: it is a term-frequency figure with the index's field weights
 * behind it, so among titles that all contain the word, a short title outranks a long one and a
 * paper on gold-nanoparticle domes outranks "DOME Copilot". Three things come first:
 *
 *   tier 0  the typed words appear in the title as a phrase (for one word: the word is in the title)
 *   tier 1  every term appears in the title, in some spelling
 *   tier 2  everything else -- abstract or author matches
 *
 * Within a tier, a title that opens with the first term ("DOME Copilot: ...", "Random Forest.")
 * comes first, then a title carrying a term in capitals ("GNN-DRL") -- an acronym hit, which also
 * moves to tier 0 when the person typed it in capitals. After those the order is
 * textScore plus log10 of the citation count -- a cited paper on the topic ahead of an uncited one
 * with a shorter title -- then the arrival order, which is textScore then _id and therefore stable
 * across pages. Pure and in-process over at most RERANK_DEPTH rows.
 */
export function rankTextCandidates(rows: TextCandidate[], q: string): string[] {
  const groups = parseQueryGroups(q);
  const typedWords = groups.flatMap((group) => group.alternatives[0].words);
  const phrase = typedWords.length > 1 ? new RegExp(termPattern(typedWords.join(' ')), 'i') : null;
  const spellings = groups.map((group) =>
    group.alternatives.map((alt) => {
      const { pattern, caseSensitive } = alternativePattern(alt);
      return new RegExp(pattern, caseSensitive ? '' : 'i');
    }),
  );
  const acronyms = groups
    .map((group) => group.typed)
    .filter((typed) => ACRONYM_CANDIDATE_RE.test(typed))
    .map((typed) => ({ typed, re: new RegExp(`\\b${escapeRegex(typed.toUpperCase())}s?\\b`) }));
  // "DOME Copilot: ...", "Random Forest." -- a title that opens with the first term is about it.
  const lead = groups.length
    ? new RegExp(
        `^\\W*(?:(?:the|a|an)\\s+)?${termPattern(groups[0].alternatives[0].words.join(' '))}`,
        'i',
      )
    : null;

  const ranked = rows.map((row, index) => {
    const title = row.publication_metadata?.title ?? '';
    const allInTitle =
      groups.length > 0 && spellings.every((res) => res.some((re) => re.test(title)));
    let tier = allInTitle ? (phrase && !phrase.test(title) ? 1 : 0) : 2;
    const leads = lead && allInTitle && lead.test(title) ? 1 : 0;
    let acronymHit = 0;
    for (const { typed, re } of acronyms) {
      if (!re.test(title)) continue;
      acronymHit = 1;
      if (typed === typed.toUpperCase()) tier = 0;
    }
    const citations = row.publication_metadata?.citation_count;
    const score =
      (row.score ?? 0) + Math.log10((typeof citations === 'number' ? citations : 0) + 1);
    return { id: row._id, index, tier, leads, acronymHit, score };
  });
  ranked.sort(
    (a, b) =>
      a.tier - b.tier ||
      b.leads - a.leads ||
      b.acronymHit - a.acronymHit ||
      b.score - a.score ||
      a.index - b.index,
  );
  return ranked.map((r) => r.id);
}

/**
 * The narrower "these are the ones you actually meant" tier, used to order results -- never to
 * decide which ones match. It is a strict subset of buildMongoFilter's result for the same
 * filters, which is what lets RecordsService put it in front of the rest without changing the
 * total or breaking pagination.
 *
 * Two shapes, in priority order:
 *  - an author-shaped query ("Farrell G") promotes exact author matches;
 *  - anything else promotes documents carrying every term IN THE TITLE, on the reasoning that
 *    people search by title and an incidental abstract mention is a weaker signal.
 *
 * Returns null when there is nothing to promote, and the caller skips the extra query entirely.
 */
export function buildPromotedFilter(filters: ParsedFilters): FilterQuery<RecordDocument> | null {
  if (!filters.q) return null;

  const names = authorInterpretations(filters.q);
  const definite = names.some((name) => name.shape !== 'given');
  const titleClauses = searchTerms(filters.q).map((term) => ({
    [TITLE]: { $regex: termPattern(term), $options: 'i' },
  }));

  // A query that spells out initials ("Farrell G", "G Farrell") is unambiguously about a person, so
  // only that person's papers are promoted -- putting title mentions of the surname in the same
  // tier would let them crowd out the real hits inside PROMOTE_CAP, and a single-term query has no
  // phrase ordering left for rankPromoted to separate them by.
  const promoted: FilterQuery<RecordDocument>[] = definite
    ? names.map(authorClause)
    : [...(titleClauses.length ? [{ $and: titleClauses }] : []), ...names.map(authorClause)];

  if (!promoted.length) return null;
  const tier = promoted.length === 1 ? promoted : [{ $or: promoted }];

  return {
    $and: [...classificationClauses(filters), ...tier, ...structuredClauses(filters)],
  };
}

/** One promoted candidate, as the projection in RecordsService fetches it. */
export interface PromotedRow {
  _id: string;
  publication_metadata?: { title?: string | null };
}

/**
 * Orders the promoted tier. Everything reaching here already matched the promoted filter, so this
 * only separates degrees of "matched in the title":
 *
 *   0  the words appear together as a phrase   ("Random Forest classifier")
 *   1  the words appear in order, apart        ("Random survival Forest models")
 *   2  the words appear, in any order          ("Forest cover from Random sampling")
 *
 * Single-term and author-shaped queries have nothing to separate, so everything ties at 0 and the
 * `_id` tiebreak carries the order. That tiebreak is what makes this stable across pages: the same
 * query always produces the same sequence, so page 2 never repeats or drops a row from page 1.
 *
 * Costs nothing extra at the database: the promoted query already projects the title, so this is
 * pure in-process work over at most PROMOTE_CAP rows.
 */
export function rankPromoted(rows: PromotedRow[], q: string): string[] {
  const terms = searchTerms(q);
  const ranked = rows.map((row, index) => ({
    id: row._id,
    index,
    rank: promotedRank(row.publication_metadata?.title ?? '', terms),
  }));
  // Sort is not guaranteed stable across every engine for large inputs, so the original index is
  // an explicit tiebreak rather than an assumption -- rows arrive in _id order.
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.map((r) => r.id);
}

function promotedRank(title: string, terms: string[]): number {
  if (terms.length < 2 || !title) return 0;
  if (new RegExp(termPattern(terms.join(' ')), 'i').test(title)) return 0;
  // Titles are ~150 characters, so the wildcard between terms is bounded and cheap.
  if (new RegExp(terms.map(termPattern).join('[\\s\\S]*'), 'i').test(title)) return 1;
  return 2;
}

/**
 * `relevance` sorts by `_id`. It's not a relevance ranking (there is none server-side yet), just
 * a stable, deep-pagination-safe default ordering; year and citation sorts add `_id` as a tiebreak
 * so page 2 never repeats or skips a row that shares a sort value with the page boundary.
 *
 * `citations_desc`/`citations_asc` sort on `publication_metadata.citation_count`, a real Europe PMC
 * figure on ~98% of the corpus since the 2026-09-03 load. The remainder is `null`, meaning "not
 * available" rather than zero; BSON orders null below every number, so those records sort to the
 * bottom of `citations_desc` and the top of `citations_asc`, and the `_id` tiebreak keeps paging
 * stable across the ties. The field is not indexed, so a deep citation sort is slow -- measure
 * before adding an index for it.
 */
export function buildSortSpec(sort: SortOrder): Record<string, 1 | -1> {
  if (sort === 'year_desc') return { 'publication_metadata.year': -1, _id: 1 };
  if (sort === 'year_asc') return { 'publication_metadata.year': 1, _id: 1 };
  if (sort === 'citations_desc') return { 'publication_metadata.citation_count': -1, _id: 1 };
  if (sort === 'citations_asc') return { 'publication_metadata.citation_count': 1, _id: 1 };
  return { _id: 1 };
}

/**
 * Stable string key for CountService's cache: two filter combinations that are logically
 * equivalent (e.g. `mesh=a,b` vs `mesh=b,a`) must hash identically, so array values are sorted
 * before serialising and object keys are emitted in a fixed order.
 */
export function canonicalCacheKey(filters: ParsedFilters): string {
  const sortedArray = (arr: string[] | undefined): string[] | undefined =>
    arr?.length ? [...arr].sort() : undefined;

  const normalized: Record<string, unknown> = {
    q: filters.q ?? null,
    classification: sortedArray(filters.classification),
    openAccess: filters.openAccess ?? null,
    fulltextAvailable: filters.fulltextAvailable ?? null,
    yearMin: filters.yearMin ?? null,
    yearMax: filters.yearMax ?? null,
    license: sortedArray(filters.license),
    journal: sortedArray(filters.journal),
    meshHeadings: sortedArray(filters.meshHeadings),
    keywordsAuthor: sortedArray(filters.keywordsAuthor),
    pubTypes: sortedArray(filters.pubTypes),
    domainTier1: sortedArray(filters.domainTier1),
    domainTier2: sortedArray(filters.domainTier2),
    domainTier3: sortedArray(filters.domainTier3),
    learningParadigm: sortedArray(filters.learningParadigm),
    modelFamily: sortedArray(filters.modelFamily),
    modelType: sortedArray(filters.modelType),
    dataResources: sortedArray(filters.dataResources),
    enrichedOnly: filters.enrichedOnly ?? null,
  };

  // Object.keys order above is fixed by literal declaration order, which is stable in JS --
  // no separate key-sort needed on top of the value normalisation.
  return JSON.stringify(normalized);
}
