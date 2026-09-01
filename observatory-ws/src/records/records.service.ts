import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
}

/** Every document's _id is a UUID5 string (confirmed against the database server, 2026-09-01), never a Mongo
 *  ObjectId -- backend/src/routes/records.js's `ObjectId.isValid()` guard is wrong for this data
 *  and is deliberately not ported (see internal/ROADMAP.md Phase 5). Matches any UUID version. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RecordsService {
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

    const [items, countResult] = await Promise.all([
      this.fetchPage(filter, sort, skip, pageSize),
      this.countService.count(filter, cacheKey),
    ]);

    return {
      items,
      total: countResult.total,
      totalRelation: countResult.totalRelation,
      page,
      pageSize,
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
  ): Promise<RecordDocument[]> {
    const maxTimeMs = this.config.get('mongo.maxTimeMs', { infer: true });

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
