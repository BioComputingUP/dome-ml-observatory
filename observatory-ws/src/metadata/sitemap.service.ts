import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TtlCache } from '../common/ttl-cache';
import { AppConfig } from '../config/configuration';
import { RecordDocument } from '../records/schemas/record.schema';
import { recordUrl } from './metadata-urls';
import { DATESTAMP_SORT, datestampFilter, DatestampKey } from './record-keyset';
import { SITEMAP_CHUNK, SitemapEntry } from './sitemap';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PROJECTION = { _id: 1, record_modified: 1 } as const;

interface KeyDoc {
  _id: string;
  record_modified: string;
}

/** One sitemap file of record URLs: where it starts, and its newest datestamp. */
export interface RecordsChunk {
  /** The last key of the previous chunk; undefined for the first. */
  after?: DatestampKey;
  lastmod: string;
}

/**
 * Record URLs for crawlers: positives only (non-positive pages carry `noindex`), 50,000 per file,
 * each with its `record_modified` as `lastmod`.
 *
 * The chunk boundaries come from one walk over the `record_modified_positive` index's keys, done
 * on the first sitemap request rather than at boot (the boot warm-up is a timed contract --
 * AGENTS.md) and cached for 24 hours. A record that changes inside that window moves to the end of
 * the keyset, so for up to a day it can appear in two files or be missed by one crawl; the next walk
 * puts it right.
 */
@Injectable()
export class SitemapService {
  private readonly cache = new TtlCache<RecordsChunk[]>(CACHE_TTL_MS);
  private pending?: Promise<RecordsChunk[]>;

  constructor(
    @InjectModel('Content') private readonly model: Model<RecordDocument>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async chunks(): Promise<RecordsChunk[]> {
    const cached = this.cache.get('chunks');
    if (cached) return cached;
    // Concurrent first requests share one walk.
    this.pending ??= this.walk().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  /** The URLs of chunk `n` (1-based), or undefined past the last chunk. */
  async records(n: number): Promise<SitemapEntry[] | undefined> {
    const chunk = (await this.chunks())[n - 1];
    if (!chunk) return undefined;
    const docs = await this.model
      .find(datestampFilter({}, chunk.after), KEY_PROJECTION)
      .sort(DATESTAMP_SORT)
      .limit(SITEMAP_CHUNK)
      .lean<KeyDoc[]>()
      .maxTimeMS(this.maxTimeMs())
      .exec();
    const origin = this.config.get('publicOrigin', { infer: true });
    return docs.map((d) => ({ loc: recordUrl(origin, d._id), lastmod: d.record_modified }));
  }

  private async walk(): Promise<RecordsChunk[]> {
    const chunks: RecordsChunk[] = [];
    let seen = 0;
    let previous: DatestampKey | undefined;
    const cursor = this.model
      .find(datestampFilter({}), KEY_PROJECTION)
      .sort(DATESTAMP_SORT)
      .lean<KeyDoc[]>()
      .maxTimeMS(this.maxTimeMs())
      .cursor({ batchSize: 10_000 });
    for await (const doc of cursor) {
      if (seen % SITEMAP_CHUNK === 0)
        chunks.push({ after: previous, lastmod: doc.record_modified });
      // Ascending datestamps, so the chunk's newest is its last.
      chunks[chunks.length - 1].lastmod = doc.record_modified;
      previous = { t: doc.record_modified, i: doc._id };
      seen += 1;
    }
    this.cache.set('chunks', chunks);
    return chunks;
  }

  private maxTimeMs(): number {
    return this.config.get('mongo.exportMaxTimeMs', { infer: true });
  }
}
