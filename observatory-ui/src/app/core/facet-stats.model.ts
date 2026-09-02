/**
 * Mirrors observatory-ws's FacetStats (src/stats/stats.service.ts), fetched live via
 * RecordsService.getFacetStats() -> GET /api/stats (Phase 7 onward). Not sourced from
 * schema/stats/facet-stats.json in the running app any more -- that file still exists and is
 * still written by schema/generate_facet_stats.py, but only for offline/fixture-mode use; see
 * that script's module docstring.
 *
 * The counts are precomputed server-side once per data update rather than aggregated per query
 * (24h cache, see StatsService): the corpus is refreshed 6-12 times a year in triage batches, so
 * live aggregation over 827k documents on every search would be the most expensive thing on the
 * page for data that barely moves.
 */

export interface FacetCount {
  value: string;
  /** Absent where no real corpus figure is available yet -- render the option without a count
   *  rather than showing a fixture-scale number as if it were corpus truth. */
  count?: number;
}

export interface YearRange {
  min: number;
  max: number;
}

/** The real, full-corpus headline figures -- these are corpus-wide even while `facets` below are
 *  still fixture-derived. See `corpus_provenance` in the generated file. */
export interface CorpusStats {
  total: number;
  positive: number;
  negative: number;
  undeterminable: number;
  openAccess: number;
  fulltextAvailable: number;
  enriched: number;
}

/** Everything scoped to `classification: positive` -- the actual searchable set, as opposed to
 *  CorpusStats above which stays corpus-wide (all 827k screened publications) so pages can still
 *  tell the honest "we screen and track the negatives too" story. Mirrors observatory-ws's
 *  SearchSpaceStats (src/stats/stats.service.ts); the API has always served this block, it just
 *  wasn't declared here until the home page needed positives-scoped figures. */
export interface SearchSpaceStats {
  total: number;
  fulltextAvailable: number;
  openAccess: number;
  enriched: number;
  yearRange: YearRange | null;
}

export interface FacetStats {
  generated: string;
  schema_version: string;
  /** observatory-ws's GET /api/stats only ever reports 'full-corpus' -- 'fixture' remains in the
   *  union only because schema/generate_facet_stats.py's offline default mode can still produce
   *  it (see that script), and getFacetStats()'s error path can hand back a stale cached value
   *  from a prior source before Phase 7 shipped. Nothing in the running app branches on this any
   *  more (the old development-preview banner keyed off it was removed in Phase 7, once the
   *  search page stopped running on the dev fixture at all). */
  source: 'fixture' | 'full-corpus';
  records_counted: number;
  corpus: CorpusStats;
  corpus_provenance: string;
  search_space: SearchSpaceStats;
  facets: {
    classification: FacetCount[];
    license: FacetCount[];
    pubTypes: FacetCount[];
    domainTier1: FacetCount[];
    learningParadigm: FacetCount[];
    modelFamily: FacetCount[];
    yearRange: YearRange | null;
  };
}
