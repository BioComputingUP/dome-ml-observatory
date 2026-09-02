import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { TtlCache } from '../common/ttl-cache';
import { RecordDocument } from '../records/schemas/record.schema';
import { AppConfig } from '../config/configuration';
import { CURRENT_SCHEMA_VERSION } from '../common/schema-version';

export interface FacetCount {
  value: string;
  count: number;
}

/** Everything about "what the search page can actually search" -- scoped to
 *  classification: positive, the whole search space now that the UI's search page no longer
 *  offers a classification filter (see observatory-ui's facet-panel.ts and Part 2 of the search
 *  repair). Distinct from `corpus` below, which stays corpus-wide (all 827,061 screened
 *  publications) so the home/about/download pages can keep telling the honest "we screen and
 *  track the negatives too" story. */
export interface SearchSpaceStats {
  total: number;
  fulltextAvailable: number;
  openAccess: number;
  enriched: number;
  yearRange: { min: number; max: number } | null;
}

/** The real data date, as opposed to FacetStats.generated below (a cache-fill timestamp that
 *  changes every 24h regardless of whether the corpus moved). Both timestamps are `$max` over the
 *  corresponding llm_*.timestamp field, ISO-8601 strings that sort correctly lexically -- null
 *  until the corresponding pass has landed on at least one record. */
export interface LastClassification {
  timestamp: string | null;
  enriched_timestamp: string | null;
}

export interface FacetStats {
  generated: string;
  schema_version: string;
  source: 'full-corpus';
  records_counted: number;
  corpus: {
    total: number;
    positive: number;
    negative: number;
    undeterminable: number;
    openAccess: number;
    fulltextAvailable: number;
    enriched: number;
  };
  corpus_provenance: string;
  last_classification: LastClassification;
  search_space: SearchSpaceStats;
  facets: {
    /** Corpus-wide, not positives-scoped like every other facet below -- see shapeFacetStats's
     *  comment on why. */
    classification: FacetCount[];
    license: FacetCount[];
    pubTypes: FacetCount[];
    domainTier1: FacetCount[];
    learningParadigm: FacetCount[];
    modelFamily: FacetCount[];
    /** Mirrors search_space.yearRange exactly -- kept here too since the facet panel's year
     *  inputs read counts/bounds from `facets`, not `search_space`. */
    yearRange: { min: number; max: number } | null;
  };
}

const CACHE_KEY = 'facet-stats';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // same reasoning as CountService: corpus refreshes 6-12x/year
/** $facet has a 16MB-per-sub-pipeline output cap. The high-cardinality fields (journal 12,753,
 *  mesh 23,222, keywords_author 694,411 -- measured against the database server 2026-09-01) are deliberately
 *  left out of this aggregation for that reason and because a UI stat block has no use for them;
 *  the low-cardinality ones here (license 9, pub_types 89 among the positives) are comfortably
 *  inside the cap. */

const POSITIVE_MATCH = { $match: { 'llm_classification.classification': 'positive' } };

/**
 * Shape mirrors observatory-ui/src/app/core/facet-stats.model.ts (schema/stats/facet-stats.json)
 * -- duplicated deliberately, not shared, per the "no shared -core" decision. Two cached
 * aggregations, run in parallel and warmed at boot: one unfiltered $group for the corpus-wide
 * headline figures, one $match-then-$facet for everything scoped to the positives (the actual
 * search space). They're kept as two separate aggregate() calls rather than one combined $facet
 * because $facet's sub-pipelines all read the SAME input documents -- a single upstream $match
 * would wrongly narrow `corpus` to positives-only too, and there is no way to un-filter one
 * sub-pipeline of a $facet once its parent stage has filtered the input. Measured against the database server,
 * 2026-09-01: the positives-scoped $facet (search_space totals + license + pubTypes + yearRange)
 * took 2,836ms on its own; running both aggregations via Promise.all keeps the combined wall time
 * close to that, not their sum.
 */
@Injectable()
export class StatsService implements OnModuleInit {
  private readonly logger = new Logger(StatsService.name);
  private readonly cache = new TtlCache<FacetStats>(CACHE_TTL_MS);

  constructor(
    @InjectModel('Content') private readonly model: Model<RecordDocument>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.getStats();
      this.logger.log('Warmed facet-stats cache');
    } catch (err) {
      this.logger.warn(`Facet-stats warm-up failed (non-fatal, will retry lazily): ${String(err)}`);
    }
  }

  async getStats(): Promise<FacetStats> {
    const cached = this.cache.get(CACHE_KEY);
    if (cached) return cached;

    const maxTimeMs = Math.max(this.config.get('mongo.maxTimeMs', { infer: true }), 15_000);
    const options = { maxTimeMS: maxTimeMs, allowDiskUse: true };

    let corpusRows: RawCorpusResult[];
    let searchSpaceRows: RawSearchSpaceResult[];
    try {
      [corpusRows, searchSpaceRows] = await Promise.all([
        this.model.aggregate<RawCorpusResult>(buildCorpusPipeline()).option(options).exec(),
        this.model
          .aggregate<RawSearchSpaceResult>(buildSearchSpacePipeline())
          .option(options)
          .exec(),
      ]);
    } catch (err) {
      this.logger.warn(`Facet-stats aggregation failed: ${String(err)}`);
      throw new ServiceUnavailableException('Corpus statistics are temporarily unavailable');
    }

    const stats = shapeFacetStats(corpusRows[0], searchSpaceRows[0]);
    this.cache.set(CACHE_KEY, stats);
    return stats;
  }
}

interface RawCorpusResult {
  total: number;
  positive: number;
  negative: number;
  undeterminable: number;
  openAccess: number;
  fulltextAvailable: number;
  enriched: number;
  lastClassifiedAt: string | null;
  lastEnrichedAt: string | null;
}

interface RawSearchSpaceResult {
  totals: {
    total: number;
    fulltextAvailable: number;
    openAccess: number;
    enriched: number;
  }[];
  license: { _id: string | null; count: number }[];
  pubTypes: { _id: string | null; count: number }[];
  domainTier1: { _id: string | null; count: number }[];
  learningParadigm: { _id: string | null; count: number }[];
  modelFamily: { _id: string | null; count: number }[];
  yearRange: { min: number | null; max: number | null }[];
}

/** Unfiltered -- every screened publication, not just the positives. This is the one place
 *  classification-breakdown counts (positive/negative/undeterminable) are computed; `facets.
 *  classification` (shapeFacetStats) reuses these rather than re-grouping by the same field a
 *  second time. */
function buildCorpusPipeline() {
  return [
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        positive: {
          $sum: {
            $cond: [{ $eq: ['$llm_classification.classification', 'positive'] }, 1, 0],
          },
        },
        negative: {
          $sum: {
            $cond: [{ $eq: ['$llm_classification.classification', 'negative'] }, 1, 0],
          },
        },
        undeterminable: {
          $sum: {
            $cond: [
              {
                $eq: ['$llm_classification.classification', 'undeterminable'],
              },
              1,
              0,
            ],
          },
        },
        openAccess: {
          $sum: {
            $cond: [{ $eq: ['$source.access.open_access', true] }, 1, 0],
          },
        },
        fulltextAvailable: {
          $sum: {
            $cond: [{ $eq: ['$source.access.fulltext_available', true] }, 1, 0],
          },
        },
        enriched: {
          $sum: {
            $cond: [{ $ne: ['$llm_enrichment.provider', null] }, 1, 0],
          },
        },
        // ISO-8601 strings (e.g. "2026-08-27T22:44:56.416265+00:00") sort correctly under $max as
        // plain string comparison -- no date parsing needed. null on every document until that
        // record's pass has actually run, so $max naturally ignores untouched records and yields
        // null only when NO record in the whole corpus has run through that pass yet.
        lastClassifiedAt: { $max: '$llm_classification.timestamp' },
        lastEnrichedAt: { $max: '$llm_enrichment.timestamp' },
      },
    },
  ];
}

/** Everything a search-page user can actually filter by, scoped to classification: positive via
 *  the $match up front -- every sub-pipeline below then only ever sees that ~355,558-document
 *  subset, matching what buildMongoFilter (records.query.ts) defaults every search to. */
function buildSearchSpacePipeline() {
  const countBy = (field: string) => [{ $group: { _id: `$${field}`, count: { $sum: 1 } } }];
  const countByArrayElement = (field: string) => [
    { $unwind: `$${field}` },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ];

  return [
    POSITIVE_MATCH,
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              fulltextAvailable: {
                $sum: {
                  $cond: [{ $eq: ['$source.access.fulltext_available', true] }, 1, 0],
                },
              },
              openAccess: {
                $sum: {
                  $cond: [{ $eq: ['$source.access.open_access', true] }, 1, 0],
                },
              },
              enriched: {
                $sum: {
                  $cond: [{ $ne: ['$llm_enrichment.provider', null] }, 1, 0],
                },
              },
            },
          },
        ],
        license: countBy('source.access.license'),
        pubTypes: countByArrayElement('content_filters.pub_types'),
        domainTier1: countBy('content_filters.domain_tier1'),
        learningParadigm: countByArrayElement('content_filters.learning_paradigm'),
        modelFamily: countByArrayElement('content_filters.model_family'),
        yearRange: [
          {
            $group: {
              _id: null,
              min: { $min: '$publication_metadata.year' },
              max: { $max: '$publication_metadata.year' },
            },
          },
        ],
      },
    },
  ];
}

function toFacetCounts(rows: { _id: string | null; count: number }[]): FacetCount[] {
  return rows
    .filter((r): r is { _id: string; count: number } => r._id !== null && r._id !== '')
    .map((r) => ({ value: r._id, count: r.count }))
    .sort((a, b) => b.count - a.count);
}

function shapeFacetStats(
  rawCorpus: RawCorpusResult | undefined,
  rawSearchSpace: RawSearchSpaceResult | undefined,
): FacetStats {
  const corpus = {
    total: rawCorpus?.total ?? 0,
    positive: rawCorpus?.positive ?? 0,
    negative: rawCorpus?.negative ?? 0,
    undeterminable: rawCorpus?.undeterminable ?? 0,
    openAccess: rawCorpus?.openAccess ?? 0,
    fulltextAvailable: rawCorpus?.fulltextAvailable ?? 0,
    enriched: rawCorpus?.enriched ?? 0,
  };

  const totals = rawSearchSpace?.totals[0];
  const rawYearRange = rawSearchSpace?.yearRange[0];
  const yearRange =
    rawYearRange?.min != null && rawYearRange?.max != null
      ? { min: rawYearRange.min, max: rawYearRange.max }
      : null;

  // Derived from `corpus` directly rather than a separate positives-scoped $group -- the three
  // classification counts are already computed there in one pass, so re-grouping by the same
  // field a second time would only pay for an identical scan twice. Deliberately left corpus-wide
  // (not scoped to positives, unlike every other facet below): the search page no longer offers a
  // classification filter to attach these counts to (see observatory-ui's facet-panel.ts), so this
  // field now exists for API consumers who want the full screened/not-screened breakdown --
  // scoping it to positives would make it a redundant single-entry list duplicating corpus.positive.
  const classification: FacetCount[] = [
    { value: 'positive', count: corpus.positive },
    { value: 'negative', count: corpus.negative },
    { value: 'undeterminable', count: corpus.undeterminable },
  ]
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    generated: new Date().toISOString(),
    schema_version: CURRENT_SCHEMA_VERSION,
    source: 'full-corpus',
    records_counted: corpus.total,
    corpus,
    corpus_provenance: 'Computed live from dome_observatory.Content on the database server via GET /api/stats.',
    last_classification: {
      timestamp: rawCorpus?.lastClassifiedAt ?? null,
      enriched_timestamp: rawCorpus?.lastEnrichedAt ?? null,
    },
    search_space: {
      total: totals?.total ?? 0,
      fulltextAvailable: totals?.fulltextAvailable ?? 0,
      openAccess: totals?.openAccess ?? 0,
      enriched: totals?.enriched ?? 0,
      yearRange,
    },
    facets: {
      classification,
      license: toFacetCounts(rawSearchSpace?.license ?? []),
      pubTypes: toFacetCounts(rawSearchSpace?.pubTypes ?? []),
      domainTier1: toFacetCounts(rawSearchSpace?.domainTier1 ?? []),
      learningParadigm: toFacetCounts(rawSearchSpace?.learningParadigm ?? []),
      modelFamily: toFacetCounts(rawSearchSpace?.modelFamily ?? []),
      yearRange,
    },
  };
}
