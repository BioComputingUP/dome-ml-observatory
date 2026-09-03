/**
 * Pure conversion between the URL query string and SearchQuery.
 *
 * The URL *is* the search state: any result set must be bookmarkable, citable and shareable, so
 * every control writes here and the page reads its whole state back from here on load. Kept as
 * pure functions (not component methods) because the edge cases -- absent values, arrays,
 * defaults that shouldn't be serialised, malformed input pasted by a human -- are exactly what
 * unit tests should pin down. See search-params.spec.ts.
 */

import { HttpParams } from '@angular/common/http';
import { Classification } from './record.model';
import { SearchFilters, SearchQuery, SortOrder } from './records.service';

export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_SORT: SortOrder = 'relevance';
/** Mirrors observatory-ws's records.query.ts MAX_RESULT_WINDOW exactly: page * pageSize beyond
 *  this is a hard 400 there, not a clamp -- duplicated here (no shared `-core`, see AGENTS.md) so
 *  the pager can stop offering pages that would 400 rather than showing that error after the
 *  fact. Also the reason 'gte' counts always land on exactly 10,000 -- see records.service.ts. */
export const MAX_RESULT_WINDOW = 10_000;

/**
 * The corpus is 355,558 AI/ML methods papers plus 464,581 records screened out as not-AI/ML.
 * Defaulting to positives means an unfiltered visit shows the resource's actual content.
 *
 * The search page no longer offers any way to widen this -- see the comment in search.ts on why
 * the classification chip was withdrawn. The `class=` wire format below is still honoured for
 * anyone calling /api/records directly or landing on an old bookmarked URL, but from the UI the
 * search space is always the positives. The full screened corpus is reachable through bulk
 * download, and /about/support says so.
 */
export const DEFAULT_CLASSIFICATION: Classification[] = ['positive'];

const SORTS: SortOrder[] = ['relevance', 'year_desc', 'year_asc', 'citations_desc', 'citations_asc'];
const CLASSIFICATIONS: Classification[] = ['positive', 'negative', 'undeterminable'];

/** Query-param names, kept short for readable/shareable URLs. */
const PARAM = {
  q: 'q',
  classification: 'class',
  openAccess: 'oa',
  fulltextAvailable: 'ft',
  year: 'year',
  license: 'lic',
  journal: 'jrnl',
  meshHeadings: 'mesh',
  keywordsAuthor: 'kw',
  pubTypes: 'ptype',
  domainTier1: 'd1',
  domainTier2: 'd2',
  domainTier3: 'd3',
  learningParadigm: 'para',
  modelFamily: 'fam',
  modelType: 'mt',
  enrichedOnly: 'enriched',
  sort: 'sort',
  page: 'page',
} as const;

/** Anything the router hands us: a string, an array of strings when the same key appears more
 *  than once in the URL (see readList), or null/undefined when the param is absent. */
export type RawParams = Record<string, string | string[] | null | undefined>;

/**
 * Reads a multi-value filter param. Values are taken VERBATIM -- never split on anything.
 *
 * Multiple values arrive as a repeated key (`?jrnl=A&jrnl=B`), which the router hands back as an
 * array. This is not a stylistic choice: the previous comma-joined encoding silently destroyed any
 * facet value that itself contains a comma, and a great many of them do. Selecting
 * "Bioinformatics Advances (Oxford, England)" in the journal typeahead produced the two-value
 * filter ["Bioinformatics Advances (Oxford", "England)"], two junk chips, and zero results. The
 * same bug hit MeSH headings ("Neoplasms, Second Primary"), author keywords, and the EDAM domain
 * vocabulary itself, which ships comma-bearing terms ("Allergy, clinical immunology and
 * immunotherapeutics", "Sequence sites, features and motifs") -- so it also broke the enrichment-tag
 * links out of every record page. A repeated key needs no in-value delimiter, so a comma inside a
 * value is just data.
 *
 * Note the cost this accepts: an old bookmarked `?jrnl=A,B` URL is now the single journal "A,B"
 * rather than two journals. A single param value cannot be both one value and a list, and
 * comma-bearing values are far more common in this corpus than multi-value bookmarks.
 */
function readList(value: string | string[] | null | undefined): string[] | undefined {
  if (value === null || value === undefined) return undefined;
  const items = (Array.isArray(value) ? value : [value]).filter((v) => v.trim() !== '');
  return items.length ? items : undefined;
}

/**
 * The one surviving comma-split, used only by `class`.
 *
 * Its three values are fixed literals that can never contain a comma, `class=positive,negative` is
 * a documented API contract (see observatory-ws's search-records.dto.ts), and the empty-string
 * `class=` "explicitly cleared" signal has to survive byte-for-byte -- observatory-ws's
 * canUseTextIndex depends on it, and getting it wrong turns every cleared search into a 500.
 */
function splitClassificationList(value: string | string[] | null | undefined): string[] | undefined {
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  if (!raw) return undefined;
  const items = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

/** Single-valued params. A repeated key is nonsense for these, so the last one wins rather than
 *  erroring -- same "tolerate malformed input a human pasted" posture as the parsers below. */
function readScalar(value: string | string[] | null | undefined): string | null | undefined {
  return Array.isArray(value) ? (value[value.length - 1] ?? undefined) : value;
}

function parseBool(value: string | null | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseIntOr(value: string | null | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * "2020-2026" -> { yearMin: 2020, yearMax: 2026 }. Tolerates open-ended "2020-" and "-2026".
 *
 * Note the explicit empty check: Number('') is 0 and Number.isInteger(0) is true, so parsing the
 * empty half of "2020-" naively yields yearMax: 0 -- a filter that silently matches nothing.
 */
function parseYearBound(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

function parseYearRange(value: string | null | undefined): { yearMin?: number; yearMax?: number } {
  if (!value) return {};
  const [rawMin, rawMax] = value.split('-');
  return { yearMin: parseYearBound(rawMin), yearMax: parseYearBound(rawMax) };
}

export function paramsToQuery(params: RawParams): SearchQuery {
  // An empty-but-present `class=` means the user cleared the filter, and must round-trip as
  // cleared -- so it becomes [], not undefined (undefined means "never set", which re-applies
  // the default below).
  const rawClassification = readScalar(params[PARAM.classification]);
  const classification = (splitClassificationList(rawClassification) ?? []).filter(
    (c): c is Classification => (CLASSIFICATIONS as string[]).includes(c),
  );

  const sortRaw = readScalar(params[PARAM.sort]);
  const sort = SORTS.includes(sortRaw as SortOrder) ? (sortRaw as SortOrder) : DEFAULT_SORT;

  const filters: SearchFilters = {
    // Absent param means "not yet touched" -> apply the positive default. An explicitly empty
    // value (`class=`) means the user cleared it, and must NOT silently snap back to the default.
    classification:
      rawClassification === undefined || rawClassification === null
        ? DEFAULT_CLASSIFICATION
        : classification,
    openAccess: parseBool(readScalar(params[PARAM.openAccess])),
    fulltextAvailable: parseBool(readScalar(params[PARAM.fulltextAvailable])),
    ...parseYearRange(readScalar(params[PARAM.year])),
    license: readList(params[PARAM.license]),
    journal: readList(params[PARAM.journal]),
    meshHeadings: readList(params[PARAM.meshHeadings]),
    keywordsAuthor: readList(params[PARAM.keywordsAuthor]),
    pubTypes: readList(params[PARAM.pubTypes]),
    domainTier1: readList(params[PARAM.domainTier1]),
    domainTier2: readList(params[PARAM.domainTier2]),
    domainTier3: readList(params[PARAM.domainTier3]),
    learningParadigm: readList(params[PARAM.learningParadigm]),
    modelFamily: readList(params[PARAM.modelFamily]),
    modelType: readList(params[PARAM.modelType]),
    enrichedOnly: parseBool(readScalar(params[PARAM.enrichedOnly])),
  };

  return {
    q: readScalar(params[PARAM.q])?.trim() || undefined,
    filters,
    sort,
    page: parseIntOr(readScalar(params[PARAM.page]), 1),
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

/**
 * Inverse of paramsToQuery. Anything at its default is omitted so shared URLs stay short and
 * readable; `null` is used (not '') for keys the router should drop entirely.
 */
export function queryToParams(query: SearchQuery): Record<string, string | string[] | null> {
  const f = query.filters;
  const out: Record<string, string | string[] | null> = {
    [PARAM.q]: query.q?.trim() || null,
    [PARAM.openAccess]: f.openAccess === undefined ? null : String(f.openAccess),
    [PARAM.fulltextAvailable]: f.fulltextAvailable === undefined ? null : String(f.fulltextAvailable),
    [PARAM.license]: listOrNull(f.license),
    [PARAM.journal]: listOrNull(f.journal),
    [PARAM.meshHeadings]: listOrNull(f.meshHeadings),
    [PARAM.keywordsAuthor]: listOrNull(f.keywordsAuthor),
    [PARAM.pubTypes]: listOrNull(f.pubTypes),
    [PARAM.domainTier1]: listOrNull(f.domainTier1),
    [PARAM.domainTier2]: listOrNull(f.domainTier2),
    [PARAM.domainTier3]: listOrNull(f.domainTier3),
    [PARAM.learningParadigm]: listOrNull(f.learningParadigm),
    [PARAM.modelFamily]: listOrNull(f.modelFamily),
    [PARAM.modelType]: listOrNull(f.modelType),
    [PARAM.enrichedOnly]: f.enrichedOnly ? 'true' : null,
    [PARAM.sort]: query.sort === DEFAULT_SORT ? null : query.sort,
    [PARAM.page]: query.page > 1 ? String(query.page) : null,
    [PARAM.year]: yearRangeParam(f.yearMin, f.yearMax),
    [PARAM.classification]: classificationParam(f.classification),
  };
  return out;
}

/**
 * The wire request for GET /api/records. Built directly on queryToParams -- observatory-ws's
 * records.query.ts parses these exact same param names with the exact same defaulting rules
 * (see records.query.spec.ts), so this is serialisation, not translation:
 *
 *  - `null` (anything at its default) is dropped so the backend applies the identical default
 *    itself, rather than the two copies of "what's the default" silently drifting apart.
 *  - `''` is KEPT. That's queryToParams's signal for an explicitly cleared classification, and on
 *    the wire it must arrive as the literal `class=` -- the one thing that tells the backend's
 *    resolveClassification() "match every classification" instead of "class absent -> positive
 *    only". Dropping it here would silently narrow every cleared search back to positives.
 *  - `pageSize` is appended directly from the query, not from queryToParams: DEFAULT_PAGE_SIZE is
 *    a UI constant that never appears in the URL (see PARAM above), but the API has no page-size
 *    default of its own to fall back to and needs it sent explicitly every time.
 *  - A multi-value filter is `append`ed once per value, producing the repeated key the backend
 *    reads (`?jrnl=A&jrnl=B`). `set` would keep only the last one.
 */
export function queryToHttpParams(query: SearchQuery): HttpParams {
  let params = new HttpParams().set('pageSize', String(query.pageSize));
  for (const [key, value] of Object.entries(queryToParams(query))) {
    if (value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params = params.append(key, item);
    } else {
      params = params.set(key, value);
    }
  }
  return params;
}

/** Multi-value filters go out as the array itself, which the router serialises as a repeated key
 *  (`?jrnl=A&jrnl=B`) and queryToHttpParams appends one at a time. Deliberately NOT comma-joined --
 *  see readList for the values that encoding destroyed. */
function listOrNull(values: string[] | undefined): string[] | null {
  return values?.length ? values : null;
}

function yearRangeParam(min: number | undefined, max: number | undefined): string | null {
  if (min == null && max == null) return null;
  return `${min ?? ''}-${max ?? ''}`;
}

/**
 * Omitted when it matches the positive default (keeps the common URL clean), but an explicitly
 * empty string when the user has cleared it -- that's what tells paramsToQuery not to re-apply
 * the default on the next read.
 */
function classificationParam(classification: Classification[] | undefined): string | null {
  if (classification === undefined) return null;
  if (isDefaultClassification(classification)) return null;
  return classification.length ? classification.join(',') : '';
}

export function isDefaultClassification(classification: Classification[] | undefined): boolean {
  return (
    classification?.length === DEFAULT_CLASSIFICATION.length &&
    DEFAULT_CLASSIFICATION.every((c) => classification.includes(c))
  );
}

/** Count of filters a user has actively applied -- drives the "Filters (3)" mobile button. The
 *  positive default doesn't count as user-applied until they change it. */
export function activeFilterCount(filters: SearchFilters): number {
  let count = 0;
  if (filters.classification?.length && !isDefaultClassification(filters.classification)) count++;
  if (filters.openAccess !== undefined) count++;
  if (filters.fulltextAvailable !== undefined) count++;
  if (filters.yearMin != null || filters.yearMax != null) count++;
  if (filters.enrichedOnly) count++;
  for (const key of [
    'license', 'journal', 'meshHeadings', 'keywordsAuthor', 'pubTypes',
    'domainTier1', 'domainTier2', 'domainTier3', 'learningParadigm', 'modelFamily', 'modelType',
  ] as const) {
    if (filters[key]?.length) count++;
  }
  return count;
}
