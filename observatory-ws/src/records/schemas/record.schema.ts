import { Schema } from 'mongoose';

/**
 * Mirrors schema/releases/v1.1.0/ai-ml-landscape.schema.json -- that file is the source of truth,
 * this is just enough shape for Mongoose/TypeScript to be useful. `strict: false` is deliberate:
 * unknown fields pass through untouched rather than being silently stripped, so a schema bump
 * upstream (dome-observatory-triage) doesn't lose data here before schema/ and this file catch up.
 *
 * `_id` MUST be declared `String` explicitly. Every document's `_id` is a UUID5 string (confirmed
 * against the MongoDB server directly, 2026-09-01: e.g. "04fc0915-fded-5146-8847-4da33cf3a059"), not a Mongo
 * ObjectId -- without this, Mongoose defaults to ObjectId casting and every `findById`/`_id`
 * lookup silently fails to match anything.
 */
export const RECORD_SCHEMA_DEFINITION = new Schema(
  {
    _id: { type: String, required: true },
    schema_version: String,
  },
  {
    strict: false,
    versionKey: false,
    id: false,
    // Collection name is set per-connection at registration time (records.module.ts), from
    // config -- The MongoDB server's real collection is `Content`, confirmed live; nothing here hardcodes it.
  },
);

/** Loose type for a raw record document as read with `.lean()` -- deliberately not the full
 *  AiMlRecord shape (that lives in observatory-ui and isn't duplicated here per the "no shared
 *  -core package" decision). `_id` and the handful of fields this service actually branches on
 *  are typed; everything else passes through as unknown, matched by the schema's `strict: false`. */
export interface RecordDocument {
  _id: string;
  schema_version?: string;
  publication_metadata?: { year?: number | null; [key: string]: unknown };
  llm_classification?: {
    classification?: string | null;
    [key: string]: unknown;
  };
  llm_enrichment?: { provider?: string | null; [key: string]: unknown };
  source?: {
    access?: {
      open_access?: boolean | null;
      license?: string | null;
      fulltext_available?: boolean | null;
    };
  };
  content_filters?: Record<string, unknown>;
  [key: string]: unknown;
}
