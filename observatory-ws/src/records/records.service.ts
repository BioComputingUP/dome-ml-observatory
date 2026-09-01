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
  buildSortSpec,
  canonicalCacheKey,
  parseSearchParams,
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

/** Every document's _id is a UUID5 string (confirmed against the database server, 2026-09-01), never a Mongo
 *  ObjectId -- backend/src/routes/records.js's `ObjectId.isValid()` guard is wrong for this data
 *  and is deliberately not ported (see internal/ROADMAP.md Phase 5). Matches any UUID version. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const [pageResult, countResult] = await Promise.all([
      this.fetchPage(filter, sort, skip, pageSize, hasFreeText),
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
  ): Promise<{ items: RecordDocument[]; timedOut?: boolean }> {
    // A free-text search gets a larger budget than a filter-only one -- measured live against
    // the database server: a rare author surname ("Tosatto") is a genuine ~10s query on this unindexed
    // collection, well past the 5s filter-only budget. See configuration.ts's searchMaxTimeMs.
    const maxTimeMs = hasFreeText
      ? this.config.get('mongo.searchMaxTimeMs', { infer: true })
      : this.config.get('mongo.maxTimeMs', { infer: true });

    try {
      return { items: await this.runFetch(filter, sort, skip, limit, maxTimeMs) };
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
  ): Promise<RecordDocument[]> {
    // 'relevance' sorts by _id, the only indexed field on the database server's Content collection -- a plain
    // find().sort() is cheap and safe at any depth within MAX_RESULT_WINDOW (measured: skip
    // 300,000 took 2.85s with no sort-buffer error, vs. year-sorted skip 9,000+ failing outright).
    if (sort === 'relevance') {
      return this.model
        .find(filter)
        .sort(buildSortSpec(sort))
        .skip(skip)
        .limit(limit)
        .lean<RecordDocument[]>()
        .maxTimeMS(maxTimeMs)
        .exec();
    }

    // Year sorts: MongoDB 4.2's find().sort() has no allowDiskUse and a 32MB in-memory sort
    // ceiling -- confirmed failing past ~skip 9,000 on this collection (see
    // internal/ROADMAP.md Phase 5). The aggregation pipeline below sorts only {_id, year} (a few
    // dozen bytes/doc instead of ~3.5KB), with allowDiskUse as a second line of defence, then
    // re-fetches the full documents by _id and restores the sorted order in JS -- measured 1.6s
    // vs. 5.4s for sorting full documents via aggregation, and it never hits the find() ceiling.
    const sortSpec = buildSortSpec(sort);
    const idRows = await this.model
      .aggregate<{ _id: string }>([
        { $match: filter },
        { $project: { _id: 1, 'publication_metadata.year': 1 } },
        { $sort: sortSpec },
        { $skip: skip },
        { $limit: limit },
      ])
      .option({ maxTimeMS: maxTimeMs, allowDiskUse: true })
      .exec();

    if (idRows.length === 0) return [];

    const ids = idRows.map((row) => row._id);
    const docs = await this.model
      .find({ _id: { $in: ids } })
      .lean<RecordDocument[]>()
      .maxTimeMS(maxTimeMs)
      .exec();
    const byId = new Map(docs.map((doc) => [doc._id, doc]));
    // $in does not preserve input order -- restore the order the sort actually produced.
    return ids.map((id) => byId.get(id)).filter((doc): doc is RecordDocument => doc !== undefined);
  }
}
