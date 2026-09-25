import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { TtlCache } from '../common/ttl-cache';
import { RecordDocument } from './schemas/record.schema';
import { AppConfig } from '../config/configuration';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // the corpus changes only at a load, which ends with a restart

/**
 * How many positives the text index knows a word in -- what decides which word of a query is
 * handed to `$text` (see buildTextSearch in records.query.ts).
 *
 * `$text` OR's its words, so its candidate set is the union of their postings, and the regex
 * clauses then have to run over all of it. Measured live: "support vector machine" with all three
 * words was 10.0s because "machine" alone is in 191k positives; with "vector" only, 1.3s for the
 * identical 29,918 results. One indexed count per word tells the two apart, and costs 40-210ms
 * uncached ("cell", 44k, in 211ms). Frequencies are static between loads, so they are cached for
 * the day, like the counts.
 *
 * A word whose lookup fails -- a timeout, an absent index -- is recorded as infinitely common for
 * the same day, never retried per query and never thrown: the query then simply selects by another
 * word, or by every word as it used to. Only ever called from the index path, after
 * canUseTextIndex, so the positives-only predicate the partial index demands is always present.
 */
@Injectable()
export class TermFrequencyService {
  private readonly logger = new Logger(TermFrequencyService.name);
  private readonly cache = new TtlCache<number>(CACHE_TTL_MS);

  constructor(
    @InjectModel('Content') private readonly model: Model<RecordDocument>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Frequency per distinct word. `Number.POSITIVE_INFINITY` marks a word that could not be measured. */
  async lookup(words: string[]): Promise<Map<string, number>> {
    const distinct = [...new Set(words)];
    const counts = await Promise.all(distinct.map((word) => this.frequency(word)));
    return new Map(distinct.map((word, i) => [word, counts[i]]));
  }

  private async frequency(word: string): Promise<number> {
    const cached = this.cache.get(word);
    if (cached !== undefined) return cached;

    const maxTimeMs = this.config.get('mongo.searchMaxTimeMs', { infer: true });
    let count: number;
    try {
      count = await this.model
        .countDocuments({
          'llm_classification.classification': 'positive',
          $text: { $search: word },
        })
        .maxTimeMS(maxTimeMs)
        .exec();
    } catch (err) {
      this.logger.warn(
        `Could not measure how common "${word}" is; treating it as common for the day: ${String(err)}`,
      );
      count = Number.POSITIVE_INFINITY;
    }
    this.cache.set(word, count);
    return count;
  }
}
