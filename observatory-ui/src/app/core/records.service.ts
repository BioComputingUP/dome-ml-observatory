import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map, shareReplay } from 'rxjs';
import { AiMlRecord, Classification } from './record.model';
import { DomainVocab, ModellingBranchVocab, ModelTypeSeedVocab, Vocabularies } from './vocab.model';
import { CorpusStats, FacetStats } from './facet-stats.model';

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
  page: number;
  pageSize: number;
}

/**
 * Real, known corpus-wide numbers. NOT derived from the ~200-record dev fixture (which is a
 * curated sample, not a proportional one) -- the home page metric row must show the real figures
 * regardless of fixture size. Phase 7 replaces this with a live query against the real database
 * (observatory-ws's GET /api/stats, built in Phase 5); until then these are the one place that
 * corpus-wide truth is hardcoded, so update here (and only here) if the corpus numbers change.
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
  /** Measured against the live collection, 2026-09-01 -- see observatory-ws/src/stats/stats.service.ts. */
  openAccess: 548_412,
  /** Measured against the live collection, 2026-09-01 -- see observatory-ws/src/stats/stats.service.ts. */
  fulltextAvailable: 615_151,
  /** No enrichment run has landed yet -- update once Gavin's batch is in Mongo (see roadmap). */
  enriched: 0,
};

@Injectable({ providedIn: 'root' })
export class RecordsService {
  private readonly http = inject(HttpClient);

  /** Fetched once, shared -- fixture-backed today, swapped for an /api call in Phase 5/7. The
   *  public method signatures below are the contract that swap has to preserve. */
  private readonly records$: Observable<AiMlRecord[]> = this.http
    .get<AiMlRecord[]>('assets/data/sample-records.json')
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  /** Fetched once, shared -- see schema/README.md for where these files come from
   *  (observatory-ui/scripts/sync-schema.js copies them out of schema/releases/$(CURRENT)/vocab/). */
  private readonly vocabularies$: Observable<Vocabularies> = forkJoin({
    domain: this.http.get<DomainVocab>('assets/vocab/domain.json'),
    modellingBranch: this.http.get<ModellingBranchVocab>('assets/vocab/modelling-branch.json'),
    modelTypeSeed: this.http.get<ModelTypeSeedVocab>('assets/vocab/model-type-seed.json'),
  }).pipe(shareReplay({ bufferSize: 1, refCount: false }));

  getVocabularies(): Observable<Vocabularies> {
    return this.vocabularies$;
  }

  /** Precomputed facet counts + real corpus figures. Generated per data update by
   *  schema/generate_facet_stats.py, never aggregated per query -- see that script's docstring.
   *  Phase 5 swaps the source for a cached stats document; this signature does not change. */
  private readonly facetStats$: Observable<FacetStats> = this.http
    .get<FacetStats>('assets/data/facet-stats.json')
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  getFacetStats(): Observable<FacetStats> {
    return this.facetStats$;
  }

  /** Synchronous fallback for the corpus figures. Prefer getFacetStats() where an Observable is
   *  workable -- it carries the same numbers plus per-facet counts, from a file regenerated with
   *  the data rather than hardcoded here. */
  getStats() {
    return CORPUS_STATS;
  }

  search(query: SearchQuery): Observable<SearchResult> {
    return this.records$.pipe(
      map((all) => {
        let items = all.filter((r) => matchesFilters(r, query.filters));
        if (query.q?.trim()) {
          items = items.filter((r) => matchesFreeText(r, query.q!));
        }
        items = sortRecords(items, query.sort);

        const total = items.length;
        const start = (query.page - 1) * query.pageSize;
        const page = items.slice(start, start + query.pageSize);
        return { items: page, total, page: query.page, pageSize: query.pageSize };
      }),
    );
  }

  getByPid(pid: string): Observable<AiMlRecord | undefined> {
    return this.records$.pipe(map((all) => all.find((r) => r._id === pid)));
  }
}

function matchesFreeText(record: AiMlRecord, q: string): boolean {
  const needle = q.trim().toLowerCase();
  const title = record.publication_metadata.title?.toLowerCase() ?? '';
  const abstract = record.publication_metadata.abstract?.toLowerCase() ?? '';
  return title.includes(needle) || abstract.includes(needle);
}

function matchesFilters(record: AiMlRecord, filters: SearchFilters): boolean {
  const pm = record.publication_metadata;
  const cf = record.content_filters;
  const access = record.source.access;
  const cls = record.llm_classification.classification;

  if (filters.yearMin != null && (pm.year == null || pm.year < filters.yearMin)) return false;
  if (filters.yearMax != null && (pm.year == null || pm.year > filters.yearMax)) return false;
  if (filters.classification?.length && (!cls || !filters.classification.includes(cls))) return false;
  if (filters.openAccess != null && access.open_access !== filters.openAccess) return false;
  if (filters.fulltextAvailable != null && access.fulltext_available !== filters.fulltextAvailable) return false;
  if (filters.license?.length && !filters.license.includes(access.license ?? '')) return false;
  if (filters.journal?.length && !filters.journal.includes(pm.journal ?? '')) return false;
  if (filters.meshHeadings?.length && !hasAnyOverlap(cf.mesh_headings, filters.meshHeadings)) return false;
  if (filters.pubTypes?.length && !hasAnyOverlap(cf.pub_types, filters.pubTypes)) return false;
  if (filters.keywordsAuthor?.length && !hasAnyOverlap(cf.keywords_author, filters.keywordsAuthor)) return false;
  if (filters.enrichedOnly && record.llm_enrichment.provider === null) return false;
  if (filters.domainTier1?.length && (!cf.domain_tier1 || !filters.domainTier1.includes(cf.domain_tier1))) return false;
  if (filters.domainTier2?.length && !hasAnyOverlap(cf.domain_tier2, filters.domainTier2)) return false;
  if (filters.domainTier3?.length && !hasAnyOverlap(cf.domain_tier3, filters.domainTier3)) return false;
  if (filters.learningParadigm?.length && !hasAnyOverlap(cf.learning_paradigm, filters.learningParadigm)) return false;
  if (filters.modelFamily?.length && !hasAnyOverlap(cf.model_family, filters.modelFamily)) return false;
  if (filters.modelType?.length && !hasAnyOverlap(cf.model_type, filters.modelType)) return false;

  return true;
}

function hasAnyOverlap(haystack: string[], needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function sortRecords(items: AiMlRecord[], sort: SortOrder): AiMlRecord[] {
  const copy = [...items];
  if (sort === 'year_desc') {
    copy.sort((a, b) => (b.publication_metadata.year ?? 0) - (a.publication_metadata.year ?? 0));
  } else if (sort === 'year_asc') {
    copy.sort((a, b) => (a.publication_metadata.year ?? 0) - (b.publication_metadata.year ?? 0));
  }
  // 'relevance' keeps fixture order today; Phase 5's /api does real relevance ranking server-side.
  return copy;
}
