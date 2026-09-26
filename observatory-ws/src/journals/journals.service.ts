import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TtlCache } from '../common/ttl-cache';
import { RecordDocument } from '../records/schemas/record.schema';
import { rankFacetMatches } from '../facets/facets.service';

/**
 * First year the per-journal trend series covers. Everything earlier is folded into a single
 * `pre` bucket rather than dropped -- a journal's pre-2000 output still belongs in its totals, it
 * just isn't worth 40 near-empty points on a chart.
 */
export const SERIES_START = 2000;

/** Default floor on `screened` for the AI/ML-share ranking. Without one, a journal with two
 *  screened papers and two positives tops the list at 100% and the ranking is noise. */
export const DEFAULT_MIN_SCREENED = 100;

export type JournalSort = 'count' | 'density';

export interface JournalYearPoint {
  year: number;
  screened: number;
  positive: number;
}

/** One journal's row in the cached table. `screened` is what Observatory ingested and classified
 *  from this journal, NOT the journal's total published output -- we do not hold that figure. */
export interface JournalRow {
  journal: string;
  screened: number;
  positive: number;
  negative: number;
  undeterminable: number;
  /** positive / screened, 0-1. The "AI/ML share" lens ranks on this. */
  positiveRate: number;
  /** Open-access count among this journal's AI/ML methods papers. */
  openAccessPositive: number;
  /** Records from this journal that have been through the enrichment pass, on the same test used
   *  everywhere else in the codebase: `llm_enrichment.provider` is non-null (see
   *  records.query.ts's enrichedOnly clause and StatsService). Counted across every
   *  classification, not just the positives -- the figure answers "how much of this journal's
   *  intake is enriched", and enrichment has only ever run on positives anyway. */
  enriched: number;
  firstYear: number | null;
  lastYear: number | null;
  /** Year with the most AI/ML methods papers; null when the journal has none. */
  peakYear: number | null;
  /** SERIES_START onwards, contiguous, zero-filled. */
  series: JournalYearPoint[];
  /** Everything before SERIES_START, collapsed. */
  pre: { screened: number; positive: number };
}

/** A row without its year series -- what the list endpoint returns, so a 50-row page stays small. */
export type JournalListRow = Omit<JournalRow, 'series' | 'pre'>;

export interface JournalCorpusTotals {
  /** Journals carrying at least one AI/ML methods paper. */
  journals: number;
  /** Journals seen at all, including those whose every paper was screened out. */
  journalsScreened: number;
  /** Screened records that carry a journal name -- journal-scoped, not the whole corpus. */
  screened: number;
  /** AI/ML methods papers that carry a journal name -- journal-scoped, not the whole corpus. */
  positive: number;
  /** Records with no journal name, almost all of them preprints (Europe PMC returns no journal for
   *  a SRC:PPR record). Added to `screened`/`positive` it gives the corpus-wide totals, from the
   *  same aggregation, so a page can say how much of the corpus the journal figures cover without
   *  a second request to /api/stats. */
  withoutJournal: { screened: number; positive: number };
}

export interface JournalListResult {
  generated: string;
  sort: JournalSort;
  minScreened: number;
  /** Rows matching the query before `limit` was applied. */
  total: number;
  corpus: JournalCorpusTotals;
  rows: JournalListRow[];
}

export interface JournalDetailResult {
  generated: string;
  corpus: JournalCorpusTotals;
  journal: JournalRow;
  /** 1-based rank by AI/ML paper count among journals with at least one. */
  rank: number;
  rankOf: number;
  /** Share of ALL Observatory AI/ML methods papers this journal accounts for, 0-1 -- measured
   *  against the corpus-wide positives, preprints included, not just those with a journal. */
  shareOfCorpusPositive: number;
}

interface JournalTable {
  generated: string;
  rows: JournalRow[];
  byName: Map<string, JournalRow>;
  /** Journal names ordered by positive count, descending -- the rank lookup. */
  rankedNames: string[];
  rankIndex: Map<string, number>;
  corpus: JournalCorpusTotals;
}

const CACHE_KEY = 'journal-table';
/** Same 24h as StatsService/CountService, and for the same reason: the corpus is rebuilt every
 *  two months, not continuously. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** This aggregation reads the whole collection once. It runs at boot and at most once a day, so a
 *  generous ceiling is right -- far better than a half-built table. */
const AGGREGATION_MAX_TIME_MS = 180_000;

const MAX_LIMIT = 200;

/** Raw shape of the two-stage aggregation's output, one document per journal, plus one with a
 *  null `_id` for every record that has no journal name. */
interface RawJournalGroup {
  _id: string | null;
  buckets: { y: number | null; c: string | null; n: number; oa: number; enr: number }[];
}

/**
 * Per-journal corpus figures and year-by-year trends.
 *
 * Nothing here queries Mongo per request. One aggregation over the whole collection builds a
 * compact in-memory table (one row per journal, a few MB) at boot, and every endpoint is then a
 * pure read from it. That is deliberate: the MongoDB server is a shared host carrying several other
 * production databases, and grouping the whole collection by journal-and-year is not something to
 * do on a page view. It also needs no new index -- the cost is one sequential pass per restart,
 * bounded by the 24h TTL, with no writes and nothing outside dome_observatory.Content touched.
 *
 * Warm-up is fire-and-forget and non-fatal, matching StatsService: a cold cache costs the first
 * caller one aggregation, it is never wrong.
 *
 * Measured against the MongoDB server, 2026-09-03: the aggregation takes ~24s. Requests off the
 * warm cache are 12-16ms.
 *
 * The rows, ranks and `corpus.screened`/`corpus.positive` cover only the records that carry a
 * journal name -- 819,129 of 876,324 on 2026-09-25; preprints have none -- so they are
 * journal-scoped and must be labelled as such rather than presented as corpus-wide. The records
 * without one are still counted, into `corpus.withoutJournal`, which is what lets a journal's share
 * be measured against every AI/ML methods paper and lets a page state the gap.
 */
@Injectable()
export class JournalsService implements OnModuleInit {
  private readonly logger = new Logger(JournalsService.name);
  private readonly cache = new TtlCache<JournalTable>(CACHE_TTL_MS);

  constructor(@InjectModel('Content') private readonly model: Model<RecordDocument>) {}

  async onModuleInit(): Promise<void> {
    try {
      const started = Date.now();
      const table = await this.getTable();
      this.logger.log(
        `Loaded ${table.rows.length} journals (${table.corpus.journals} with at least one ` +
          `AI/ML methods paper) in ${Date.now() - started}ms`,
      );
    } catch (err) {
      this.logger.warn(
        `Journal table warm-up failed (non-fatal, will retry lazily): ${String(err)}`,
      );
    }
  }

  async list(
    q: string | undefined,
    sort: JournalSort,
    limit: number,
    minScreened: number,
  ): Promise<JournalListResult> {
    const table = await this.getTable();
    const boundedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);

    // Only journals that actually contribute to the corpus can be ranked -- a journal whose every
    // paper was screened out has a 0% share and belongs in neither lens.
    let rows = table.rows.filter((r) => r.positive > 0);

    const needle = q?.trim().toLowerCase();
    if (needle) {
      // Ranked by the same rules as the search page's journal typeahead (prefix beats word-start
      // beats substring), so a journal search behaves identically in both places.
      const names = new Set(
        rankFacetMatches(
          rows.map((r) => r.journal),
          needle,
          MAX_LIMIT,
        ),
      );
      rows = rows.filter((r) => names.has(r.journal));
    }

    if (sort === 'density') {
      rows = rows
        .filter((r) => r.screened >= minScreened)
        .sort((a, b) => b.positiveRate - a.positiveRate || b.positive - a.positive);
    } else {
      rows = [...rows].sort(
        (a, b) => b.positive - a.positive || a.journal.localeCompare(b.journal),
      );
    }

    return {
      generated: table.generated,
      sort,
      minScreened,
      total: rows.length,
      corpus: table.corpus,
      rows: rows.slice(0, boundedLimit).map(toListRow),
    };
  }

  async detail(journal: string): Promise<JournalDetailResult> {
    const table = await this.getTable();
    const row = table.byName.get(journal);
    if (!row) {
      throw new NotFoundException(
        `No journal named "${journal}" in the corpus. Names are matched exactly -- use ` +
          `GET /api/journals?q=... or /api/facets/journal to find the exact spelling.`,
      );
    }
    const rank = table.rankIndex.get(journal);
    const allPositive = table.corpus.positive + table.corpus.withoutJournal.positive;
    return {
      generated: table.generated,
      corpus: table.corpus,
      journal: row,
      rank: rank === undefined ? 0 : rank + 1,
      rankOf: table.rankedNames.length,
      shareOfCorpusPositive: allPositive ? row.positive / allPositive : 0,
    };
  }

  private async getTable(): Promise<JournalTable> {
    const cached = this.cache.get(CACHE_KEY);
    if (cached) return cached;

    let raw: RawJournalGroup[];
    try {
      raw = await this.model
        .aggregate<RawJournalGroup>(buildJournalPipeline())
        .option({ maxTimeMS: AGGREGATION_MAX_TIME_MS, allowDiskUse: true })
        .exec();
    } catch (err) {
      this.logger.warn(`Journal aggregation failed: ${String(err)}`);
      throw new ServiceUnavailableException('Journal statistics are temporarily unavailable');
    }

    const table = shapeJournalTable(raw);
    this.cache.set(CACHE_KEY, table);
    return table;
  }
}

/**
 * Grouped twice on purpose. The first $group reduces the whole collection to one row per
 * journal/year/classification; the second collapses those into one document per journal, so what
 * crosses the wire is one small document per journal rather than several hundred thousand.
 * Pre-SERIES_START years collapse into a single null bucket in the first stage, which cuts the
 * intermediate cardinality substantially and costs nothing the page would have shown.
 *
 * There is no $match: a record with no usable journal name (null, missing, empty, or not a string)
 * is grouped under a null journal instead of dropped, so the table can report the corpus-wide totals
 * alongside the journal-scoped ones. The collection has no journal index, so a $match saved nothing
 * -- the pass is a full scan either way.
 */
export function buildJournalPipeline() {
  return [
    {
      $group: {
        _id: {
          j: {
            $cond: [
              {
                $and: [
                  { $eq: [{ $type: '$publication_metadata.journal' }, 'string'] },
                  { $ne: ['$publication_metadata.journal', ''] },
                ],
              },
              '$publication_metadata.journal',
              null,
            ],
          },
          y: {
            $cond: [
              { $gte: ['$publication_metadata.year', SERIES_START] },
              '$publication_metadata.year',
              null,
            ],
          },
          c: '$llm_classification.classification',
        },
        n: { $sum: 1 },
        oa: { $sum: { $cond: [{ $eq: ['$source.access.open_access', true] }, 1, 0] } },
        // Same expression StatsService and records.query.ts's enrichedOnly filter use, so "enriched"
        // means one thing across the whole service rather than three subtly different things.
        enr: { $sum: { $cond: [{ $ne: ['$llm_enrichment.provider', null] }, 1, 0] } },
      },
    },
    {
      $group: {
        _id: '$_id.j',
        buckets: { $push: { y: '$_id.y', c: '$_id.c', n: '$n', oa: '$oa', enr: '$enr' } },
      },
    },
  ];
}

/** Drops the per-year series so a 50-row listing stays a few KB rather than carrying ~27 points
 *  per journal that the list view never draws. */
function toListRow(row: JournalRow): JournalListRow {
  return {
    journal: row.journal,
    screened: row.screened,
    positive: row.positive,
    negative: row.negative,
    undeterminable: row.undeterminable,
    positiveRate: row.positiveRate,
    openAccessPositive: row.openAccessPositive,
    enriched: row.enriched,
    firstYear: row.firstYear,
    lastYear: row.lastYear,
    peakYear: row.peakYear,
  };
}

/**
 * Turns the aggregation output into the cached table.
 *
 * Exported and pure so the shaping rules -- zero-filled contiguous series, the pre-2000 fold, the
 * peak-year tiebreak -- can be tested without a Mongo model or a boot-time cache load, exactly as
 * rankFacetMatches is in FacetsService.
 */
export function shapeJournalTable(raw: RawJournalGroup[]): JournalTable {
  const rows: JournalRow[] = [];
  const withoutJournal = { screened: 0, positive: 0 };

  for (const group of raw) {
    const journal = group._id;
    if (typeof journal !== 'string' || journal.trim() === '') {
      // No journal to make a row of, but still papers in the corpus: counted, never ranked.
      for (const bucket of group.buckets) {
        const n = bucket.n ?? 0;
        withoutJournal.screened += n;
        if (bucket.c === 'positive') withoutJournal.positive += n;
      }
      continue;
    }

    let screened = 0;
    let positive = 0;
    let negative = 0;
    let undeterminable = 0;
    let openAccessPositive = 0;
    let enriched = 0;
    const pre = { screened: 0, positive: 0 };
    const byYear = new Map<number, { screened: number; positive: number }>();

    for (const bucket of group.buckets) {
      const n = bucket.n ?? 0;
      screened += n;
      enriched += bucket.enr ?? 0;
      if (bucket.c === 'positive') {
        positive += n;
        openAccessPositive += bucket.oa ?? 0;
      } else if (bucket.c === 'negative') {
        negative += n;
      } else if (bucket.c === 'undeterminable') {
        undeterminable += n;
      }

      if (bucket.y === null || bucket.y === undefined) {
        // Both the pre-SERIES_START fold and records with no year at all land here. Keeping them
        // in the totals but out of the chart is the honest handling: they are real papers, they
        // just cannot be placed on a time axis.
        pre.screened += n;
        if (bucket.c === 'positive') pre.positive += n;
        continue;
      }

      const point = byYear.get(bucket.y) ?? { screened: 0, positive: 0 };
      point.screened += n;
      if (bucket.c === 'positive') point.positive += n;
      byYear.set(bucket.y, point);
    }

    const years = [...byYear.keys()].sort((a, b) => a - b);
    // Contiguous and zero-filled: a line chart must not join 2004 straight to 2011 as though the
    // intervening years were never screened.
    const series: JournalYearPoint[] = [];
    if (years.length) {
      for (let year = years[0]; year <= years[years.length - 1]; year++) {
        const point = byYear.get(year);
        series.push({ year, screened: point?.screened ?? 0, positive: point?.positive ?? 0 });
      }
    }

    let peakYear: number | null = null;
    let peakPositive = 0;
    for (const point of series) {
      if (point.positive > peakPositive) {
        peakPositive = point.positive;
        peakYear = point.year;
      }
    }

    rows.push({
      journal,
      screened,
      positive,
      negative,
      undeterminable,
      positiveRate: screened ? positive / screened : 0,
      openAccessPositive,
      enriched,
      firstYear: years.length ? years[0] : null,
      lastYear: years.length ? years[years.length - 1] : null,
      peakYear,
      series,
      pre,
    });
  }

  const byName = new Map(rows.map((r) => [r.journal, r]));
  const rankedNames = rows
    .filter((r) => r.positive > 0)
    .sort((a, b) => b.positive - a.positive || a.journal.localeCompare(b.journal))
    .map((r) => r.journal);
  const rankIndex = new Map(rankedNames.map((name, i) => [name, i]));

  return {
    generated: new Date().toISOString(),
    rows,
    byName,
    rankedNames,
    rankIndex,
    corpus: {
      journals: rankedNames.length,
      journalsScreened: rows.length,
      screened: rows.reduce((sum, r) => sum + r.screened, 0),
      positive: rows.reduce((sum, r) => sum + r.positive, 0),
      withoutJournal,
    },
  };
}
