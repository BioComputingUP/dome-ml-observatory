import { FilterQuery } from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { escapeRegex } from '../common/escape-regex';
import { RecordDocument } from './schemas/record.schema';

export type Classification = 'positive' | 'negative' | 'undeterminable';
export type SortOrder = 'relevance' | 'year_desc' | 'year_asc';

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

const SORTS: SortOrder[] = ['relevance', 'year_desc', 'year_asc'];
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

/**
 * Reproduces observatory-ui's matchesFilters() (records.service.ts) as a Mongo filter, field for
 * field -- see internal/ROADMAP.md Phase 5's filter translation table. `$in` against an array
 * field is Mongo's native any-element-matches semantics, which is exactly hasAnyOverlap().
 */
export function buildMongoFilter(filters: ParsedFilters): FilterQuery<RecordDocument> {
  const clauses: FilterQuery<RecordDocument>[] = [];

  // Classification goes FIRST, before the expensive free-text regex below -- measured directly
  // against the database server: the identical filter with this clause first vs. last is 2,566ms vs. 5,809ms
  // (more than 2x) on a zero-match query, because Mongo's un-indexed collection scan can then
  // short-circuit the regex entirely for the majority of documents (the 464,581 non-positive ones
  // on the default filter) via this cheap equality check first. Don't reorder this without
  // re-measuring -- it looks like a no-op change and isn't.
  if (filters.classification.length) {
    clauses.push({
      'llm_classification.classification':
        filters.classification.length === 1
          ? { $eq: filters.classification[0] }
          : { $in: filters.classification },
    });
  }

  if (filters.q) {
    // AND-of-terms, not one literal phrase: a user typing "random forest sepsis" means all three
    // words, in any order, not that exact substring -- which appears in zero documents and used
    // to force a full 827k-document scan to prove it (measured: 5.1s, then a false-positive 503
    // from MongoUnavailableFilter for what was actually a healthy, just-slow query). Each term is
    // \b-anchored (word-start only, so "cell" still matches "cells"/"cellular") -- measured to cut
    // false hits like "excellent"/"parcellation" matching "cell" from 61,288 to 46,141, for a
    // ~10-20% time cost. Matches across title, abstract AND author -- author search is new here.
    const terms = tokenizeQuery(filters.q);
    for (const term of terms) {
      const pattern = `\\b${escapeRegex(term)}`;
      clauses.push({
        $or: [
          { 'publication_metadata.title': { $regex: pattern, $options: 'i' } },
          { 'publication_metadata.abstract': { $regex: pattern, $options: 'i' } },
          { 'publication_metadata.authors': { $regex: pattern, $options: 'i' } },
        ],
      });
    }
  }

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

  return clauses.length ? { $and: clauses } : {};
}

/**
 * `relevance` sorts by `_id` -- the only indexed field on the database server's Content collection today (see
 * internal/ROADMAP.md). It's not a relevance ranking (there is none server-side yet), just a
 * stable, deep-pagination-safe default ordering; year sorts add `_id` as a tiebreak so page 2
 * never repeats or skips a row that shares a year with the page boundary.
 */
export function buildSortSpec(sort: SortOrder): Record<string, 1 | -1> {
  if (sort === 'year_desc') return { 'publication_metadata.year': -1, _id: 1 };
  if (sort === 'year_asc') return { 'publication_metadata.year': 1, _id: 1 };
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
