import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, mongo } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { CountService } from './count.service';
import { RecordDocument } from './schemas/record.schema';
import { AppConfig } from '../config/configuration';
import {
  buildMongoFilter,
  buildPagination,
  buildPromotedFilter,
  buildSortSpec,
  canonicalCacheKey,
  parseSearchParams,
  PromotedRow,
  rankPromoted,
  RawSearchParams,
  SortOrder,
} from './records.query';

export interface SearchResult {
  items: RecordDocument[];
  total: number;
  totalRelation: 'eq' | 'gte';
  page: number;
  pageSize: number;
  /** True when fetching this page itself hit its time budget and gave up (items is [] in that
   *  case) -- distinct from a genuine the database server outage, which throws through untouched to
   *  MongoUnavailableFilter's 503 instead (see isSearchTimeout below). Only reachable for a
   *  free-text (q=) search: filter-only searches stay within the ordinary 5s budget. Since
   *  records.query.ts's AND-of-terms rewrite this should be rare -- it used to be the routine
   *  outcome for any multi-word query that didn't appear as one literal phrase. */
  timedOut?: boolean;
}

/** The promotion tier for one search: the narrower filter whose matches go first, plus the query
 *  text needed to rank them. `filter` is null when there is nothing worth promoting. */
interface Promoted {
  filter: ReturnType<typeof buildPromotedFilter>;
  q: string;
}

/** Every document's _id is a UUID5 string (confirmed against the database server, 2026-09-01), never a Mongo
 *  ObjectId -- backend/src/routes/records.js's `ObjectId.isValid()` guard is wrong for this data
 *  and is deliberately not ported (see internal/ROADMAP.md Phase 5). Matches any UUID version. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * How many results the promotion tier may reorder -- four pages' worth.
 *
 * The bound is what keeps this affordable on an un-indexed collection. Measured against the database server with
 * an `_id`-only projection: 118-520ms typical for the title tier (`deep learning` 196ms,
 * `graph neural network` 289ms, `random forest` 312ms), rising to ~3.4s only when the tier matches
 * almost nothing and Mongo has to scan the positives to prove it -- the same cost shape a rare term
 * already has today, and well inside the 20s free-text budget.
 *
 * Past this depth results fall back to plain `_id` order. That is a deliberate trade: the point is
 * to put the obviously-right answers on page 1, not to rank 355k documents without an index.
 */
const PROMOTE_CAP = 100;

/**
 * True only for a server-side query time-limit expiry (maxTimeMS exceeded on a live, connected
 * the database server) -- MongoServerError code 50 / codeName 'MaxTimeMSExpired'. Deliberately NOT true for a
 * connection-level failure: a disconnected/unreachable the database server throws a `mongoose.MongooseError`
 * (buffered-command timeout), a completely different class from `mongo.MongoServerError` -- see
 * mongo-unavailable.filter.ts's own comment on that split. That distinction is exactly what keeps
 * this catch from ever masking a real outage as a mere "your search was slow" result: only this
 * one specific, narrow error shape is caught here; everything else (a real outage included)
 * rethrows and reaches MongoUnavailableFilter's 503 unchanged.
 */
function isSearchTimeout(err: unknown): boolean {
  return (
    err instanceof mongo.MongoServerError &&
    (err.code === 50 || err.codeName === 'MaxTimeMSExpired')
  );
}

@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);

  constructor(
    @InjectModel('Content') private readonly model: Model<RecordDocument>,
    private readonly countService: CountService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async search(raw: RawSearchParams): Promise<SearchResult> {
    const { filters, sort } = parseSearchParams(raw);
    const { page, pageSize, skip } = buildPagination(raw.page, raw.pageSize);
    const filter = buildMongoFilter(filters);
    const cacheKey = canonicalCacheKey(filters);
    const hasFreeText = Boolean(filters.q);

    // The promoted tier only ever reorders; `filter` alone still decides what matches, so the
    // count below is unaffected by it.
    const promoted =
      hasFreeText && sort === 'relevance'
        ? { filter: buildPromotedFilter(filters), q: filters.q as string }
        : undefined;

    const [pageResult, countResult] = await Promise.all([
      this.fetchPage(filter, sort, skip, pageSize, hasFreeText, promoted),
      this.countService.count(filter, cacheKey),
    ]);

    return {
      items: pageResult.items,
      total: countResult.total,
      totalRelation: countResult.totalRelation,
      page,
      pageSize,
      timedOut: pageResult.timedOut,
    };
  }

  async findByPid(pid: string): Promise<RecordDocument> {
    if (!UUID_PATTERN.test(pid)) {
      throw new BadRequestException('Invalid record id: expected a UUID');
    }
    const maxTimeMs = this.config.get('mongo.maxTimeMs', { infer: true });
    const doc = await this.model.findById(pid).lean<RecordDocument>().maxTimeMS(maxTimeMs).exec();
    if (!doc) throw new NotFoundException(`No record with id ${pid}`);
    return doc;
  }

  private async fetchPage(
    filter: ReturnType<typeof buildMongoFilter>,
    sort: SortOrder,
    skip: number,
    limit: number,
    hasFreeText: boolean,
    promoted?: Promoted,
  ): Promise<{ items: RecordDocument[]; timedOut?: boolean }> {
    // A free-text search gets a larger budget than a filter-only one -- measured live against
    // the database server: a rare author surname ("Tosatto") is a genuine ~10s query on this unindexed
    // collection, well past the 5s filter-only budget. See configuration.ts's searchMaxTimeMs.
    const maxTimeMs = hasFreeText
      ? this.config.get('mongo.searchMaxTimeMs', { infer: true })
      : this.config.get('mongo.maxTimeMs', { infer: true });

    try {
      return { items: await this.runFetch(filter, sort, skip, limit, maxTimeMs, promoted) };
    } catch (err) {
      if (!isSearchTimeout(err)) throw err; // a real outage -- let MongoUnavailableFilter handle it
      this.logger.warn(
        `Search exceeded its ${maxTimeMs}ms budget and gave up rather than erroring the whole request: ${String(err)}`,
      );
      return { items: [], timedOut: true };
    }
  }

  private async runFetch(
    filter: ReturnType<typeof buildMongoFilter>,
    sort: SortOrder,
    skip: number,
    limit: number,
    maxTimeMs: number,
    promoted?: Promoted,
  ): Promise<RecordDocument[]> {
    // 'relevance' sorts by _id, the only indexed field on the database server's Content collection -- a plain
    // find().sort() is cheap and safe at any depth within MAX_RESULT_WINDOW (measured: skip
    // 300,000 took 2.85s with no sort-buffer error, vs. year-sorted skip 9,000+ failing outright).
    if (sort === 'relevance') {
      if (promoted?.filter) {
        return this.runPromotedFetch(filter, promoted, skip, limit, maxTimeMs);
      }
      return this.model
        .find(filter)
        .sort(buildSortSpec(sort))
        .skip(skip)
        .limit(limit)
        .lean<RecordDocument[]>()
        .maxTimeMS(maxTimeMs)
        .exec();
    }

    // Year/citation sorts: MongoDB 4.2's find().sort() has no allowDiskUse and a 32MB in-memory
    // sort ceiling -- confirmed failing past ~skip 9,000 on this collection (see
    // internal/ROADMAP.md Phase 5). The aggregation pipeline below sorts only the handful of
    // fields a non-_id sort might need (a few dozen bytes/doc instead of ~3.5KB), with
    // allowDiskUse as a second line of defence, then re-fetches the full documents by _id and
    // restores the sorted order in JS -- measured 1.6s vs. 5.4s for sorting full documents via
    // aggregation, and it never hits the find() ceiling. Projecting both year and citation_count
    // unconditionally (rather than branching on which sort is active) costs nothing measurable and
    // keeps this one pipeline shape valid for every non-'relevance' SortOrder, present and future.
    const sortSpec = buildSortSpec(sort);
    const idRows = await this.model
      .aggregate<{ _id: string }>([
        { $match: filter },
        {
          $project: {
            _id: 1,
            'publication_metadata.year': 1,
            'publication_metadata.citation_count': 1,
          },
        },
        { $sort: sortSpec },
        { $skip: skip },
        { $limit: limit },
      ])
      .option({ maxTimeMS: maxTimeMs, allowDiskUse: true })
      .exec();

    if (idRows.length === 0) return [];
    return this.fetchByIds(
      idRows.map((row) => row._id),
      maxTimeMs,
    );
  }

  /**
   * Puts the promoted tier first, then the rest of the matches, without changing which documents
   * match or how many there are.
   *
   * Let P be the first PROMOTE_CAP ids of the promoted filter in `_id` order, reordered by
   * rankPromoted. Because the promoted filter is a strict subset of `filter`, the result is exactly
   * `P` followed by `filter \ P` in `_id` order -- one permutation of the same set. That is what
   * makes the total count still correct and pagination exact: every page is a slice of one fixed
   * sequence, so nothing repeats and nothing is skipped at a page boundary.
   *
   * Costs one extra query. The id+title projection keeps it cheap (see PROMOTE_CAP), and the
   * ranking itself is in-process over at most 100 rows.
   */
  private async runPromotedFetch(
    filter: ReturnType<typeof buildMongoFilter>,
    promoted: Promoted,
    skip: number,
    limit: number,
    maxTimeMs: number,
  ): Promise<RecordDocument[]> {
    // Projecting the title here is what lets rankPromoted work without a second round trip.
    const rows = await this.model
      .find(promoted.filter as ReturnType<typeof buildMongoFilter>, {
        _id: 1,
        'publication_metadata.title': 1,
      })
      .sort({ _id: 1 })
      .limit(PROMOTE_CAP)
      .lean<PromotedRow[]>()
      .maxTimeMS(maxTimeMs)
      .exec();

    const promotedIds = rankPromoted(rows, promoted.q);
    const rest = { $and: [filter, { _id: { $nin: promotedIds } }] };

    // Past the promoted tier entirely: page straight into the remainder, offset by however many
    // promoted rows precede it.
    if (skip >= promotedIds.length) {
      return this.model
        .find(rest)
        .sort({ _id: 1 })
        .skip(skip - promotedIds.length)
        .limit(limit)
        .lean<RecordDocument[]>()
        .maxTimeMS(maxTimeMs)
        .exec();
    }

    const head = await this.fetchByIds(promotedIds.slice(skip, skip + limit), maxTimeMs);
    if (head.length >= limit) return head;

    // The promoted tier ran out mid-page. Everything before this point in the sequence is promoted,
    // so the remainder starts from its own beginning -- no skip.
    const tail = await this.model
      .find(rest)
      .sort({ _id: 1 })
      .limit(limit - head.length)
      .lean<RecordDocument[]>()
      .maxTimeMS(maxTimeMs)
      .exec();

    return [...head, ...tail];
  }

  /** Fetches full documents for an ordered id list and restores that order -- `$in` does not
   *  preserve it. `_id` is the collection's only index, so this lookup is always cheap. */
  private async fetchByIds(ids: string[], maxTimeMs: number): Promise<RecordDocument[]> {
    if (ids.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: ids } })
      .lean<RecordDocument[]>()
      .maxTimeMS(maxTimeMs)
      .exec();
    const byId = new Map(docs.map((doc) => [doc._id, doc]));
    return ids.map((id) => byId.get(id)).filter((doc): doc is RecordDocument => doc !== undefined);
  }
}
