import { BadRequestException } from '@nestjs/common';

/**
 * Chunk sizing for the keyset walk.
 *
 * 1000 matches the ceiling the sibling MobiDB service uses for the same job
 * (`DOWNLOAD_PAGE_SIZE_LIMIT`), and is what makes the whole corpus retrievable in a few hundred
 * requests rather than tens of thousands. It is also small enough that a chunk can be buffered
 * before responding, which is what lets the handler set X-Next-Cursor as a header -- headers
 * cannot be set once a streamed body has started.
 */
export const DEFAULT_EXPORT_CHUNK = 1000;
export const MAX_EXPORT_CHUNK = 1000;

/** Clamps rather than rejects an oversized `limit`: asking for more than the maximum is a
 *  reasonable thing for a client to try, and silently giving it the maximum is friendlier than a
 *  400 -- unlike /api/records' result window, nothing here is lost by clamping, because the
 *  cursor still walks to the end either way. */
export function parseChunkLimit(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_EXPORT_CHUNK) : DEFAULT_EXPORT_CHUNK;
}

/**
 * Free text and a keyset walk cannot be combined, and the reason is worth stating in the error
 * rather than leaving a caller to guess.
 *
 * A `q=` search takes one of two paths in records.query.ts: the `positives_text` index (a `$text`
 * clause, which Mongo cannot combine with the `_id` hint this walk depends on -- a text query is
 * served by the text index or not at all) or a regex fallback across title/abstract/authors. The
 * fallback would re-scan the matching slice of the corpus on every chunk, turning a whole-corpus
 * walk into hundreds of full scans.
 */
export function rejectFreeText(q: string | undefined): void {
  if (!q?.trim()) return;
  throw new BadRequestException(
    'Free-text search (q=) is not supported on /api/export: a text query cannot be combined ' +
      'with the _id-ordered cursor this endpoint pages on. Use /api/records for free-text ' +
      'search, or export a filtered slice here and search it locally.',
  );
}
