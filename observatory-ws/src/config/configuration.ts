/**
 * process.env -> a namespaced config object, read via ConfigService.get<T>('mongo.uri') etc.
 * (the same access pattern dome-registry-ws uses, so this reads familiarly). Env vars are
 * validated separately in env.validation.ts before this ever runs -- this file just reshapes
 * already-trusted values, no parsing/validation logic belongs here.
 */
export interface AppConfig {
  port: number;
  frontendUrl: string;
  rateLimit: {
    /** Requests per minute per client IP for the ordinary read endpoints. */
    perMinute: number;
    /** Requests per minute per client IP for /api/export specifically. Lower, because one
     *  request there is up to 1000 documents rather than at most 100. */
    exportPerMinute: number;
  };
  mongo: {
    uri: string;
    db: string;
    collection: string;
    maxTimeMs: number;
    /** Budget for a free-text search (q= present) specifically, applied in RecordsService.fetchPage
     *  -- separate from maxTimeMs because a rare author surname or term is a genuine ~10s query on
     *  the MongoDB server's collection (measured pre-index: "Tosatto" took 10.0s), well past the 5s filter-only
     *  budget above. The positives_text index cut the indexed cases to well under 4s, but a lone
     *  bare word deliberately still takes the regex path, so this budget stays. */
    searchMaxTimeMs: number;
    /** Budget for one /api/export chunk. Larger than maxTimeMs because a chunk is up to 1000
     *  documents rather than 25, but still bounded -- an export that cannot finish a chunk inside
     *  this is a signal something is wrong with the plan, not something to wait out. */
    exportMaxTimeMs: number;
  };
  matomo: {
    /** Tracking endpoint, ending in matomo.php -- the library asserts on that suffix. */
    url: string;
    siteId: string;
    /** Empty disables API tracking entirely. Required for `cip` to be honoured, so without it the
     *  data would attribute every request to this server rather than the client. */
    token: string;
    /** Prefixed to the request path when reporting, so hits are attributed to the public site
     *  rather than to an internal container hostname. */
    publicOrigin: string;
  };
}

/** The rolling window both throttlers measure over. Not configurable: every published limit is
 *  quoted per minute, and a different window would make the documented numbers wrong. */
export const RATE_LIMIT_TTL_MS = 60_000;

export const configuration = (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:4200',
  rateLimit: {
    perMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE ?? '1200', 10),
    exportPerMinute: parseInt(process.env.EXPORT_RATE_LIMIT_PER_MINUTE ?? '60', 10),
  },
  mongo: {
    uri: process.env.MONGODB_URI!,
    db: process.env.MONGODB_DB!,
    collection: process.env.MONGODB_COLLECTION!,
    maxTimeMs: parseInt(process.env.MONGO_MAX_TIME_MS ?? '5000', 10),
    searchMaxTimeMs: parseInt(process.env.MONGO_SEARCH_MAX_TIME_MS ?? '20000', 10),
    exportMaxTimeMs: parseInt(process.env.MONGO_EXPORT_MAX_TIME_MS ?? '30000', 10),
  },
  matomo: {
    url: process.env.MATOMO_URL ?? 'https://matomo.biocomputingup.it/matomo.php',
    siteId: process.env.MATOMO_SITE_ID ?? '',
    token: process.env.MATOMO_TOKEN ?? '',
    publicOrigin: process.env.MATOMO_PUBLIC_ORIGIN ?? 'https://observatory.dome-ml.org',
  },
});
