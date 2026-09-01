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
  facets: {
    classification: FacetCount[];
    license: FacetCount[];
    pubTypes: FacetCount[];
    domainTier1: FacetCount[];
    learningParadigm: FacetCount[];
    modelFamily: FacetCount[];
    yearRange: { min: number; max: number } | null;
  };
}

const CACHE_KEY = 'facet-stats';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // same reasoning as CountService: corpus refreshes 6-12x/year
/** $facet has a 16MB-per-sub-pipeline output cap. The high-cardinality fields (journal 12,753,
 *  mesh 23,222, keywords_author 694,411 -- measured against the database server 2026-09-01) are deliberately
 *  left out of this aggregation for that reason and because a UI stat block has no use for them;
 *  the low-cardinality ones here (license 10, pub_types 141) are comfortably inside the cap. */

/**
 * Shape mirrors observatory-ui/src/app/core/facet-stats.model.ts (schema/stats/facet-stats.json)
 * -- duplicated deliberately, not shared, per the "no shared -core" decision. One cached
 * aggregation computes the whole thing in a single collection scan via $facet; warmed at boot,
 * recomputed lazily on cache expiry.
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

    let result: RawFacetResult[];
    try {
      result = await this.model
        .aggregate<RawFacetResult>(buildStatsPipeline())
        .option({ maxTimeMS: maxTimeMs, allowDiskUse: true })
        .exec();
    } catch (err) {
      this.logger.warn(`Facet-stats aggregation failed: ${String(err)}`);
      throw new ServiceUnavailableException('Corpus statistics are temporarily unavailable');
    }

    const stats = shapeFacetStats(result[0]);
    this.cache.set(CACHE_KEY, stats);
    return stats;
  }
}

interface RawFacetResult {
  corpus: {
    total: number;
    positive: number;
    negative: number;
    undeterminable: number;
    openAccess: number;
    fulltextAvailable: number;
    enriched: number;
  }[];
  classification: { _id: string | null; count: number }[];
  license: { _id: string | null; count: number }[];
  pubTypes: { _id: string | null; count: number }[];
  domainTier1: { _id: string | null; count: number }[];
  learningParadigm: { _id: string | null; count: number }[];
  modelFamily: { _id: string | null; count: number }[];
  yearRange: { min: number | null; max: number | null }[];
}

function buildStatsPipeline() {
  const countBy = (field: string) => [{ $group: { _id: `$${field}`, count: { $sum: 1 } } }];
  const countByArrayElement = (field: string) => [
    { $unwind: `$${field}` },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ];

  return [
    {
      $facet: {
        corpus: [
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
            },
          },
        ],
        classification: countBy('llm_classification.classification'),
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

function shapeFacetStats(raw: RawFacetResult | undefined): FacetStats {
  // Destructured explicitly, not spread -- raw.corpus[0] is a $group output and carries a
  // Mongo-internal `_id: null` alongside the real fields, which must not leak into the response.
  const rawCorpus = raw?.corpus[0];
  const corpus = {
    total: rawCorpus?.total ?? 0,
    positive: rawCorpus?.positive ?? 0,
    negative: rawCorpus?.negative ?? 0,
    undeterminable: rawCorpus?.undeterminable ?? 0,
    openAccess: rawCorpus?.openAccess ?? 0,
    fulltextAvailable: rawCorpus?.fulltextAvailable ?? 0,
    enriched: rawCorpus?.enriched ?? 0,
  };
  const yearRange = raw?.yearRange[0];

  return {
    generated: new Date().toISOString(),
    schema_version: CURRENT_SCHEMA_VERSION,
    source: 'full-corpus',
    records_counted: corpus.total,
    corpus,
    corpus_provenance: 'Computed live from dome_observatory.Content on the database server via GET /api/stats.',
    facets: {
      classification: toFacetCounts(raw?.classification ?? []),
      license: toFacetCounts(raw?.license ?? []),
      pubTypes: toFacetCounts(raw?.pubTypes ?? []),
      domainTier1: toFacetCounts(raw?.domainTier1 ?? []),
      learningParadigm: toFacetCounts(raw?.learningParadigm ?? []),
      modelFamily: toFacetCounts(raw?.modelFamily ?? []),
      yearRange:
        yearRange?.min != null && yearRange?.max != null
          ? { min: yearRange.min, max: yearRange.max }
          : null,
    },
  };
}
