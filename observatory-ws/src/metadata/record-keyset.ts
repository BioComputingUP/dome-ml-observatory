import { FilterQuery } from 'mongoose';
import { RecordDocument } from '../records/schemas/record.schema';

/**
 * The keyset OAI-PMH harvests and sitemap chunks page by: `(record_modified, _id)` over positives.
 *
 * The `record_modified_positive` index (`{record_modified: 1, _id: 1}`, partial on
 * `llm_classification.classification: "positive"`, built by the sister repository's
 * ensure_indexes.py) serves both. Every query here repeats that equality, which is what lets the
 * planner use a partial index at all.
 *
 * No hint: resuming uses an `$or` of two bounded ranges -- later datestamps, or the same datestamp
 * and a later `_id` -- and each branch has to be planned on its own bounds to stay cheap. The v1.6.0
 * migration gave every existing document one identical stamp, so "same datestamp, later _id" is
 * the branch that does the work for a first harvest; a single `$gte` range filtered afterwards would
 * rescan every earlier tie on every page.
 */

export const POSITIVE = { 'llm_classification.classification': 'positive' } as const;

export const DATESTAMP_SORT = { record_modified: 1, _id: 1 } as const;

/** Where a page ended: its last datestamp and `_id`. */
export interface DatestampKey {
  t: string;
  i: string;
}

/** Datestamps as stored and as OAI-PMH writes them: UTC to the second with a literal Z. */
export function toDatestamp(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/** Positives with a datestamp inside the (inclusive) range, after `after` when resuming. */
export function datestampFilter(
  range: { from?: string; until?: string },
  after?: DatestampKey,
): FilterQuery<RecordDocument> {
  const upper = range.until ? { $lte: range.until } : {};
  if (after) {
    return {
      ...POSITIVE,
      $or: [
        { record_modified: { $gt: after.t, ...upper } },
        { record_modified: after.t, _id: { $gt: after.i } },
      ],
    };
  }
  return {
    ...POSITIVE,
    record_modified: { $type: 'string', ...(range.from ? { $gte: range.from } : {}), ...upper },
  };
}
