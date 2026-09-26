import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, of, shareReplay, throwError } from 'rxjs';
import { AiMlRecord, Classification } from './record.model';
import { DomainVocab, ModellingBranchVocab, ModelTypeSeedVocab, Vocabularies } from './vocab.model';
import { FacetStats } from './facet-stats.model';
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
  /** Linked data resources (data_links.resources[].resource slugs: pdb, geo, zenodo, ...). A
   *  record matches when any of its resources is selected. Schema v1.4.0. */
  dataResources?: string[];
  /** Only records the enrichment pass has actually touched. */
  enrichedOnly?: boolean;
}

/** citations_desc/citations_asc sort on publication_metadata.citation_count, a real Europe PMC
 *  figure on ~98% of records since the 2026-09-03 load; the rest are null and sort last. */
export type SortOrder = 'relevance' | 'year_desc' | 'year_asc' | 'citations_desc' | 'citations_asc';

export interface SearchQuery {
  q?: string;
  filters: SearchFilters;
  sort: SortOrder;
  page: number;
  pageSize: number;
}

/** How the free text was matched -- observatory-ws's SearchInfo (records.service.ts there). */
export interface SearchInfo {
  /**
   *  'word'       whole words and their inflections, from the index -- the ordinary case.
   *  'prefix'     word beginnings on the scan path: a `*` term, or the automatic retry after the
   *               index found nothing for the words as typed.
   *  'author'     the initials-first name probe answered ("G Farrell").
   *  'identifier' a DOI, PMID or PMCID looked up directly.
   */
  matched: 'word' | 'prefix' | 'author' | 'identifier';
  /** Synonyms the query picked up from the published vocabulary: "svm" also searched as
   *  "support vector machine". Empty when none applied. */
  expansions: { term: string; alternatives: string[] }[];
}

export interface SearchResult {
  items: AiMlRecord[];
  total: number;
  /** 'eq' is an exact count. 'gte' means the exact count timed out on the MongoDB server's un-indexed
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
  /** Absent when there was no free text. */
  search?: SearchInfo;
}

/** Facet fields observatory-ws serves a typeahead for -- keeps the string literal in one place
 *  rather than repeated at every call site. Deliberately excludes keywords_author: see
 *  observatory-ws/src/facets/facets.service.ts (hundreds of thousands of distinct values). */
export type TypeaheadFacetField = 'journal' | 'mesh_headings' | 'pub_types' | 'license';

const FACET_TYPEAHEAD_LIMIT = 20;

@Injectable({ providedIn: 'root' })
export class RecordsService {
  private catalog$?: Observable<object | undefined>;
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
   *  reload picks up any change within the server's own cache window.
   *
   *  The only source of corpus figures in the app. There is deliberately no snapshot to fall back
   *  on: a page shows '—' until this answers, and '—' if it fails, rather than a remembered number
   *  that drifts from the corpus with every load. */
  private readonly facetStats$: Observable<FacetStats> = this.http
    .get<FacetStats>('/api/stats')
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  getFacetStats(): Observable<FacetStats> {
    return this.facetStats$;
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

  /** GET /api/records/:pid/jsonld -- the record as schema.org JSON-LD, for the record page to
   *  embed. Any failure resolves to undefined: structured data is for crawlers, never a reason for
   *  the page itself to fail. */
  getRecordJsonLd(pid: string): Observable<object | undefined> {
    return this.http
      .get<object>(`/api/records/${encodeURIComponent(pid)}/jsonld`)
      .pipe(catchError(() => of(undefined)));
  }

  /** GET /api/catalog -- the corpus as DCAT / schema.org JSON-LD, requested once per session.
   *  Undefined when no release metadata is published or the request fails. */
  getCatalog(): Observable<object | undefined> {
    this.catalog$ ??= this.http.get<object>('/api/catalog').pipe(
      catchError(() => of(undefined)),
      shareReplay(1),
    );
    return this.catalog$;
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
