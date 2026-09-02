import { FilterQuery } from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { escapeRegex } from '../common/escape-regex';
import { RecordDocument } from './schemas/record.schema';

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
  lic?: string;
  jrnl?: string;
  mesh?: string;
  kw?: string;
  ptype?: string;
  d1?: string;
  d2?: string;
  d3?: string;
  para?: string;
  fam?: string;
  mt?: string;
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
 *  the resource's actual content (AI/ML methods papers), not the 464k+ screened-out majority. */
export const DEFAULT_CLASSIFICATION: Classification[] = ['positive'];
/** page * pageSize beyond this is rejected (400), not silently clamped -- see buildPagination.
 *  Deep pages exist to browse, not to reconstruct the corpus; that's what /download is for
 *  (see observatory-ui's api-docs page). Also makes Mongo's 32MB in-memory sort ceiling on
 *  the database server's un-indexed collection structurally unreachable -- see internal/ROADMAP.md Phase 5. */
export const MAX_RESULT_WINDOW = 10_000;

const SORTS: SortOrder[] = [
  'relevance',
  'year_desc',
  'year_asc',
  'citations_desc',
  'citations_asc',
];
const CLASSIFICATIONS: Classification[] = ['positive', 'negative', 'undeterminable'];

function splitList(value: string | undefined): string[] | undefined {
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

/**
 * Terms actually worth putting in the filter.
 *
 * Trailing sentence punctuation is stripped first, and that is load-bearing rather than cosmetic:
 * without it "Farrell G." tokenises to ["Farrell", "G."], the two-character "G." survives the
 * length floor, and the search becomes "surname AND a token ending in G." -- which matched 7
 * documents where "Farrell G" matched 94. Two spellings of the same author's name have to return
 * the same thing.
 */
export function searchTerms(q: string): string[] {
  return tokenizeQuery(q)
    .map((term) => term.replace(/[.,;:]+$/, ''))
    .filter((term) => term.length >= MIN_TERM_LENGTH);
}

/**
 * Word separator inside a phrase. A literal space fails on the corpus's real text: titles carry
 * inline markup, so "in vitro" is stored as "<i>In Vitro</i>" and a plain-space phrase regex never
 * matches it. Hyphenation ("random-forest") breaks it the same way. Measured *faster* than the
 * naive form on the database server (1,225ms vs 1,572ms for "in vitro"), because it fails earlier on non-matches.
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
 * Recognises the "surname + initials" form the corpus stores authors in ("Farrell G", "Farrell G.",
 * "Farrell, G", "Tosatto SCE") -- the exact format the search page's own hint tells users to type.
 *
 * The initials must be UPPERCASE in the raw input. That is what keeps ordinary two-word topical
 * queries out: "random forest" and "single cell" are not author names, and treating them as one
 * would spend a whole extra collection scan proving it. Lowercase "farrell g" simply falls through
 * to the ordinary term path, which still finds the surname.
 *
 * A false positive here is cheap but not free: this only ever drives the promotion tier (see
 * buildPromotedFilter), never what a search matches, so a wrong guess costs one scan and changes
 * no results.
 */
const AUTHOR_QUERY_RE = /^(\p{L}[\p{L}'\u2019-]+)\s*,?\s+([A-Z]{1,4})\.?$/u;

export function parseAuthorName(q: string): AuthorName | undefined {
  const match = AUTHOR_QUERY_RE.exec(q.trim());
  if (!match) return undefined;
  return { surname: match[1], initials: match[2] };
}

/**
 * Matches one author exactly within the comma-separated authors string
 * ("Liang L, Liang H, He M, Zhang H, Ke P."). Anchored on a comma or the string edge at both ends
 * so "Farrell G" cannot match inside another name, and allowing the initials to extend
 * ("Farrell G" also matches "Farrell GP") the way PubMed's author search does.
 */
export function authorClause(name: AuthorName): FilterQuery<RecordDocument> {
  const pattern = `(^|,\\s*)${escapeRegex(name.surname)}\\s+${escapeRegex(name.initials)}[A-Za-z]*\\.?\\s*(,|\\.?$)`;
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
  const items = (splitList(value) ?? []).filter((c): c is Classification =>
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
    license: splitList(raw.lic),
    journal: splitList(raw.jrnl),
    meshHeadings: splitList(raw.mesh),
    keywordsAuthor: splitList(raw.kw),
    pubTypes: splitList(raw.ptype),
    domainTier1: splitList(raw.d1),
    domainTier2: splitList(raw.d2),
    domainTier3: splitList(raw.d3),
    learningParadigm: splitList(raw.para),
    modelFamily: splitList(raw.fam),
    modelType: splitList(raw.mt),
    enrichedOnly: parseBool(raw.enriched),
  };

  return { filters, sort: parseSort(raw.sort) };
}

/**
 * Validates + clamps page/pageSize, and rejects (400) any request whose result window would
 * exceed MAX_RESULT_WINDOW -- rather than allowing it through and letting Mongo's un-indexed
 * deep sort fail with a raw 500 (see internal/ROADMAP.md's measured `Sort operation used more
 * than the maximum 33554432 bytes of RAM` failure at skip ~9000).
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
        `(${MAX_RESULT_WINDOW}). Narrow the filters, or use /download for the full corpus.`,
    );
  }

  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** license: '' represents "no license recorded" on the frontend (`access.license ?? ''`,
 *  see record.model.ts) but is stored in Mongo as a genuine mix of `""` (208,649 docs) and `null`
 *  (71,025 docs) -- confirmed by direct aggregation against the database server, 2026-09-01. Requesting the
 *  empty-license bucket must therefore match both. */
function licenseInClause(license: string[]): (string | null)[] {
  return license.includes('') ? [...license, null] : license;
}

const TITLE = 'publication_metadata.title';
const ABSTRACT = 'publication_metadata.abstract';
const AUTHORS = 'publication_metadata.authors';

/**
 * Classification goes FIRST, before the expensive free-text regex -- measured directly against
 * the database server: the identical filter with this clause first vs. last is 2,566ms vs. 5,809ms (more than
 * 2x) on a zero-match query, because Mongo's un-indexed collection scan can then short-circuit the
 * regex entirely for the majority of documents (the 464,581 non-positive ones on the default
 * filter) via this cheap equality check first. Don't reorder this without re-measuring -- it looks
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

/**
 * AND-of-terms, not one literal phrase: a user typing "random forest sepsis" means all three words,
 * in any order, not that exact substring -- which appears in zero documents and used to force a
 * full 827k-document scan to prove it (measured: 5.1s, then a false-positive 503 for what was
 * actually a healthy, just-slow query). Matches across title, abstract AND author.
 */
function freeTextClauses(filters: ParsedFilters): FilterQuery<RecordDocument>[] {
  if (!filters.q) return [];
  return searchTerms(filters.q).map((term) => {
    const pattern = termPattern(term);
    return {
      $or: [
        { [TITLE]: { $regex: pattern, $options: 'i' } },
        { [ABSTRACT]: { $regex: pattern, $options: 'i' } },
        { [AUTHORS]: { $regex: pattern, $options: 'i' } },
      ],
    };
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
  if (filters.enrichedOnly) clauses.push({ 'llm_enrichment.provider': { $ne: null } });

  return clauses;
}

/**
 * Reproduces observatory-ui's matchesFilters() (records.service.ts) as a Mongo filter, field for
 * field -- see internal/ROADMAP.md Phase 5's filter translation table. `$in` against an array
 * field is Mongo's native any-element-matches semantics, which is exactly hasAnyOverlap().
 */
export function buildMongoFilter(filters: ParsedFilters): FilterQuery<RecordDocument> {
  const clauses = [
    ...classificationClauses(filters),
    ...freeTextClauses(filters),
    ...structuredClauses(filters),
  ];
  return clauses.length ? { $and: clauses } : {};
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

  const author = parseAuthorName(filters.q);
  const promoted: FilterQuery<RecordDocument>[] = author
    ? [authorClause(author)]
    : searchTerms(filters.q).map((term) => ({
        [TITLE]: { $regex: termPattern(term), $options: 'i' },
      }));

  if (!promoted.length) return null;

  return {
    $and: [...classificationClauses(filters), ...promoted, ...structuredClauses(filters)],
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
 * `relevance` sorts by `_id` -- the only indexed field on the database server's Content collection today (see
 * internal/ROADMAP.md). It's not a relevance ranking (there is none server-side yet), just a
 * stable, deep-pagination-safe default ordering; year and citation sorts add `_id` as a tiebreak
 * so page 2 never repeats or skips a row that shares a sort value with the page boundary.
 *
 * `citations_desc`/`citations_asc` sort on `publication_metadata.citation_count`, which is
 * `null` for every record in the corpus today (schema v1.1.0: a forward-compatible placeholder,
 * never populated upstream -- see record.model.ts). Wired now so the option works the moment that
 * field is populated in a future data update, without needing a second code change then; until
 * then every document ties on `null` and the `_id` tiebreak makes the result identical to
 * `relevance`.
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
    enrichedOnly: filters.enrichedOnly ?? null,
  };

  // Object.keys order above is fixed by literal declaration order, which is stable in JS --
  // no separate key-sort needed on top of the value normalisation.
  return JSON.stringify(normalized);
}
