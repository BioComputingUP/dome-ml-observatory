import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, of, shareReplay, throwError } from 'rxjs';
import { AiMlRecord, Classification } from './record.model';
import { DomainVocab, ModellingBranchVocab, ModelTypeSeedVocab, Vocabularies } from './vocab.model';
import { CorpusStats, FacetStats, SearchSpaceStats } from './facet-stats.model';
import { queryToHttpParams } from './search-params';

export interface SearchFilters {
  yearMin?: number;
  yearMax?: number;
  classification?: Classification[];
  openAccess?: boolean;
  fulltextAvailable?: boolean;
  license?: string[];
  journal?: string[];
  meshHeadings?: string[];
  pubTypes?: string[];
  keywordsAuthor?: string[];
  domainTier1?: string[];
  domainTier2?: string[];
  domainTier3?: string[];
  learningParadigm?: string[];
  modelFamily?: string[];
  modelType?: string[];
  /** Only records the enrichment pass has actually touched. */
  enrichedOnly?: boolean;
}

export type SortOrder = 'relevance' | 'year_desc' | 'year_asc';

export interface SearchQuery {
  q?: string;
  filters: SearchFilters;
  sort: SortOrder;
  page: number;
  pageSize: number;
}

export interface SearchResult {
  items: AiMlRecord[];
  total: number;
  /** 'eq' is an exact count. 'gte' means the exact count timed out on the database server's un-indexed
   *  collection and `total` is a cheap lower bound instead (always exactly 10,000) -- render it
   *  as "10,000+", never a bare number. See observatory-ws/src/records/count.service.ts. */
  totalRelation: 'eq' | 'gte';
  page: number;
  pageSize: number;
  /** True when fetching this page itself hit its time budget and gave up -- items is [] in that
   *  case. Distinct from a real outage (a 503, which arrives as an HTTP error instead): this is a
   *  200 with an honest "that specific search was too slow" result. Only ever true for a
   *  free-text (q=) search. See observatory-ws/src/records/records.service.ts. */
  timedOut?: boolean;
}

/**
 * Fallback corpus-wide numbers, painted instantly so the home/about/download metric rows never
 * show a zero flash while GET /api/stats is in flight, and shown as-is if that call fails
 * outright. RecordsService.getFacetStats() is the primary source now (Phase 7) -- these values
 * are a snapshot, not live, and will drift from the real corpus over time; update here only if
 * they drift enough to be misleading as a fallback.
 *
 * Corrected 2026-09-01 (Phase 5) from a direct read-only aggregation against the database server
 * (dome_observatory.Content via GET /api/stats), replacing the prior dome-triage export tallies,
 * which were marginally higher (e.g. positive was recorded as 355,569; the live collection has
 * 355,558) -- a handful of records evidently didn't make it from that export into the loaded
 * collection. See schema/generate_facet_stats.py's CORPUS dict for the same correction.
 */
export const CORPUS_STATS: CorpusStats = {
  total: 827_061,
  positive: 355_558,
  negative: 464_581,
  undeterminable: 6_922,
  openAccess: 548_412,
  fulltextAvailable: 615_151,
  /** No enrichment run had landed as of the snapshot above -- getFacetStats() carries the live
   *  figure; this fallback only matters while that call hasn't resolved yet. */
  enriched: 0,
};

/** Positives-scoped fallback (classification: positive only) -- same role and provenance as
 *  CORPUS_STATS above: painted instantly so the home metric row never flashes zeros while
 *  GET /api/stats is in flight. Measured against dome_observatory.Content on the database server via
 *  GET /api/stats, 2026-09-02. */
export const SEARCH_SPACE_STATS: SearchSpaceStats = {
  total: 355_558,
  fulltextAvailable: 229_325,
  openAccess: 204_335,
  enriched: 0,
  yearRange: { min: 1963, max: 2027 },
};

/** Facet fields observatory-ws serves a typeahead for -- keeps the string literal in one place
 *  rather than repeated at every call site. Deliberately excludes keywords_author: see
 *  observatory-ws/src/facets/facets.service.ts (694,411 distinct values on the live corpus). */
export type TypeaheadFacetField = 'journal' | 'mesh_headings' | 'pub_types' | 'license';

const FACET_TYPEAHEAD_LIMIT = 20;

@Injectable({ providedIn: 'root' })
export class RecordsService {
  private readonly http = inject(HttpClient);

  /** Fetched once, shared -- `schema/` (via observatory-ui/scripts/sync-schema.js) is the source
   *  of truth for controlled vocabularies, not the API: there is no /api/vocab endpoint, and
   *  these values only change when a schema release ships, not per query. */
  private readonly vocabularies$: Observable<Vocabularies> = forkJoin({
    domain: this.http.get<DomainVocab>('assets/vocab/domain.json'),
    modellingBranch: this.http.get<ModellingBranchVocab>('assets/vocab/modelling-branch.json'),
    modelTypeSeed: this.http.get<ModelTypeSeedVocab>('assets/vocab/model-type-seed.json'),
  }).pipe(shareReplay({ bufferSize: 1, refCount: false }));

  getVocabularies(): Observable<Vocabularies> {
    return this.vocabularies$;
  }

  /** Live corpus-wide figures + precomputed facet counts, computed by a single cached aggregation
   *  server-side (observatory-ws/src/stats/stats.service.ts, 24h TTL) -- never aggregated
   *  per-search here. Shared across the app session so repeat page visits don't refetch; a full
   *  reload picks up any change within the server's own cache window. */
  private readonly facetStats$: Observable<FacetStats> = this.http
    .get<FacetStats>('/api/stats')
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  getFacetStats(): Observable<FacetStats> {
    return this.facetStats$;
  }

  /** Synchronous fallback for the corpus figures -- see CORPUS_STATS. Prefer getFacetStats()
   *  where an Observable is workable; it carries the same numbers, live from Mongo. */
  getStats(): CorpusStats {
    return CORPUS_STATS;
  }

  /** Synchronous fallback for the positives-scoped figures -- see SEARCH_SPACE_STATS. Prefer
   *  getFacetStats().search_space where an Observable is workable; it carries the same numbers,
   *  live from Mongo. */
  getSearchSpaceStats(): SearchSpaceStats {
    return SEARCH_SPACE_STATS;
  }

  /** GET /api/records. Not cached -- unlike vocab/stats, results genuinely differ per query, and
   *  the corpus is too large to hold client-side. queryToHttpParams (search-params.ts) is the
   *  entire translation layer: observatory-ws's records.query.ts parses the exact same param
   *  names and defaulting rules, so this is just "serialise the query", not "build a request". */
  search(query: SearchQuery): Observable<SearchResult> {
    return this.http.get<SearchResult>('/api/records', { params: queryToHttpParams(query) });
  }

  /** GET /api/records/:pid. A missing or malformed pid (404/400) resolves to `undefined`,
   *  preserving this method's existing "not found is a normal, non-error result" contract --
   *  callers that only care about presence don't need to catch anything. Every other failure
   *  (503 Mongo-unavailable, a network error) is left to propagate as an actual Observable error,
   *  so a caller that needs to tell "not found" apart from "temporarily unavailable" (the record
   *  page does) can catch it separately instead of both collapsing to the same undefined. */
  getByPid(pid: string): Observable<AiMlRecord | undefined> {
    return this.http.get<AiMlRecord>(`/api/records/${encodeURIComponent(pid)}`).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404 || err.status === 400) return of(undefined);
        return throwError(() => err);
      }),
    );
  }

  /** GET /api/facets/:field -- typeahead suggestions from observatory-ws's in-memory boot cache
   *  (no Mongo round trip per keystroke). `field` is intentionally a bare string, not
   *  TypeaheadFacetField, at the call boundary: the backend is the source of truth for which
   *  fields are allowed (400s on anything else) and callers already only ever pass a literal. */
  facetValues(field: TypeaheadFacetField, q: string): Observable<string[]> {
    return this.http.get<string[]>(`/api/facets/${field}`, {
      params: { q, limit: String(FACET_TYPEAHEAD_LIMIT) },
    });
  }
}
