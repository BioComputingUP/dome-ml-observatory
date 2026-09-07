import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { RecordDocument } from '../records/schemas/record.schema';
import { AppConfig } from '../config/configuration';
import { buildMongoFilter, parseSearchParams } from '../records/records.query';
import { ExportRecordsDto } from './dto/export-records.dto';
import { parseChunkLimit, rejectFreeText } from './export.query';

export interface ExportChunk {
  items: RecordDocument[];
  /** The `_id` to resume from, or undefined when the walk is finished. */
  nextCursor?: string;
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @InjectModel('Content') private readonly model: Model<RecordDocument>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * One chunk of a keyset walk over the corpus.
   *
   * Why this exists at all: /api/records rejects `page * pageSize > 10,000` and that cap is not
   * tunable -- MongoDB 4.2's find().sort() has no allowDiskUse and a deep skip blows its 32MB
   * in-memory sort buffer. Paging cannot reach the end of an 846k-document corpus, so whole-corpus
   * retrieval needs a different shape entirely rather than a bigger number.
   *
   * Keyset pagination has no skip: each chunk asks for the next N documents *after* a known _id.
   * Every document's _id is a UUID5 string with the unique `_id_` index behind it, so
   * `{_id: {$gt: cursor}}` sorted by `_id` is an index-ordered forward scan whose cost is the same
   * for chunk 1 and chunk 500. The whole corpus is reachable, and the sort buffer is never
   * involved. This is the same pattern the sibling MobiDB service's `download_page`/`last_id`
   * uses.
   */
  async chunk(query: ExportRecordsDto): Promise<ExportChunk> {
    rejectFreeText(query.q);

    const limit = parseChunkLimit(query.limit);
    const { filters } = parseSearchParams(query);
    const filter = buildMongoFilter(filters);

    // buildMongoFilter returns either {} or {$and: [...]}, so adding _id at the top level is an
    // implicit AND alongside it -- no need to reach into the $and array.
    const keyed = query.cursor ? { ...filter, _id: { $gt: query.cursor } } : filter;

    const maxTimeMs = this.config.get('mongo.exportMaxTimeMs', { infer: true });

    const items = await this.model
      .find(keyed)
      .sort({ _id: 1 })
      // Pin the plan to the _id index. Without the hint, a filtered export (say class=positive)
      // gives the planner a choice between _id_ and class_year_id -- and class_year_id is
      // (classification, year desc, _id), which cannot produce _id order on its own, so choosing
      // it means an in-memory sort and the 32MB ceiling this endpoint exists to avoid. Safe
      // because free text is rejected above: a $text clause must be served by the text index and
      // would conflict with this hint.
      .hint({ _id: 1 })
      .limit(limit)
      .lean<RecordDocument[]>()
      .maxTimeMS(maxTimeMs)
      .exec();

    // A short chunk means the walk is over. A full chunk always advertises a cursor, even when it
    // happens to have landed exactly on the last document -- the client then makes one final
    // request that returns zero records and no cursor. That extra round trip is the price of not
    // needing a second query to find out whether anything follows.
    const nextCursor = items.length === limit ? items[items.length - 1]._id : undefined;

    return { items, nextCursor };
  }
}
