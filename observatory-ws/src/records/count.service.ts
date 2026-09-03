import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { TtlCache } from '../common/ttl-cache';
import { RecordDocument } from './schemas/record.schema';
import { AppConfig } from '../config/configuration';

export interface CountResult {
  total: number;
  totalRelation: 'eq' | 'gte';
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // corpus is refreshed 6-12x/year -- see ROADMAP.md
const BOUNDED_COUNT_LIMIT = 10_000;

/**
 * Counting is the expensive part of a search on the MongoDB server's un-indexed Content collection -- measured
 * 2026-09-01: an unbounded countDocuments() on the default filter took 4.4s cold (192ms bounded to
 * 10k), vs. 724ms to fetch a page of results.
 *
 * Strategy: empty filter -> free estimatedDocumentCount(); cache hit -> return cached; miss ->
 * try an exact count under a time budget; timeout -> fall back to a cheap bounded count reported
 * as `totalRelation: 'gte'` so callers can render "10,000+" rather than a wrong exact number.
 *
 * That bounded fallback is NOT reliably cheap, though -- confirmed live against the MongoDB server: a
 * `.limit(10000)` count can only stop early once it finds 10,000 matches, so for a *rare* free-
 * text term (e.g. "transformer", ~10,939 hits out of 827,061 -- barely over the bound) it still
 * has to scan nearly the entire un-indexed collection to confirm that, and can time out too. If
 * even the fallback fails, count() does NOT throw: it degrades to reporting the bound itself
 * (`total: BOUNDED_COUNT_LIMIT, totalRelation: 'gte'`) rather than failing the whole search --
 * RecordsService.search() fetches the actual page and counts in parallel, and a slow/uncertain
 * count must never discard a page of results that was fetched successfully (fetching is fast
 * regardless of match density -- the same "transformer" query returns a page in well under a
 * second; only *counting* it is what's expensive here).
 */
@Injectable()
export class CountService {
  private readonly logger = new Logger(CountService.name);
  private readonly cache = new TtlCache<number>(CACHE_TTL_MS);

  constructor(
    @InjectModel('Content') private readonly model: Model<RecordDocument>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async count(filter: FilterQuery<RecordDocument>, cacheKey: string): Promise<CountResult> {
    if (Object.keys(filter).length === 0) {
      const total = await this.model.estimatedDocumentCount();
      return { total, totalRelation: 'eq' };
    }

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return { total: cached, totalRelation: 'eq' };
    }

    const maxTimeMs = this.config.get('mongo.maxTimeMs', { infer: true });
    try {
      const total = await this.model.countDocuments(filter).maxTimeMS(maxTimeMs).exec();
      this.cache.set(cacheKey, total);
      return { total, totalRelation: 'eq' };
    } catch (err) {
      // Most likely a maxTimeMS timeout on a cold, un-indexed count -- fall back to a cheap
      // bounded count rather than surfacing a 500 for what is, from the caller's perspective, a
      // perfectly valid search that's merely slow to count exactly.
      this.logger.warn(
        `Exact count timed out or failed, falling back to bounded count: ${String(err)}`,
      );
      try {
        const total = await this.model
          .countDocuments(filter)
          .limit(BOUNDED_COUNT_LIMIT)
          .maxTimeMS(maxTimeMs)
          .exec();
        return {
          total,
          totalRelation: total >= BOUNDED_COUNT_LIMIT ? 'gte' : 'eq',
        };
      } catch (fallbackErr) {
        // Even the bounded fallback can time out for a rare free-text term -- see this class's
        // header comment. Reporting the bound itself as a 'gte' lower estimate keeps the overall
        // search response usable (a page of real results, with an honestly-uncertain total)
        // instead of failing a request whose actual items were fetched just fine.
        this.logger.warn(
          `Bounded count also timed out or failed, reporting ${BOUNDED_COUNT_LIMIT}+ as a lower estimate: ${String(fallbackErr)}`,
        );
        return { total: BOUNDED_COUNT_LIMIT, totalRelation: 'gte' };
      }
    }
  }

  /** Warms the two counts every page load actually needs (empty filter is already free via
   *  estimatedDocumentCount, so it isn't worth warming) -- called once at boot from
   *  RecordsModule's onModuleInit, so the first real request never pays a cold count. */
  async warm(defaultFilter: FilterQuery<RecordDocument>, defaultCacheKey: string): Promise<void> {
    try {
      await this.count(defaultFilter, defaultCacheKey);
      this.logger.log('Warmed count cache for the default (class=positive) query');
    } catch (err) {
      this.logger.warn(`Count cache warm-up failed (non-fatal, will retry lazily): ${String(err)}`);
    }
  }
}
