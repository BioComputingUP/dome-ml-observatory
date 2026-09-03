/**
 * process.env -> a namespaced config object, read via ConfigService.get<T>('mongo.uri') etc.
 * (the same access pattern dome-registry-ws uses, so this reads familiarly). Env vars are
 * validated separately in env.validation.ts before this ever runs -- this file just reshapes
 * already-trusted values, no parsing/validation logic belongs here.
 */
export interface AppConfig {
  port: number;
  frontendUrl: string;
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
  };
}

export const configuration = (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:4200',
  mongo: {
    uri: process.env.MONGODB_URI!,
    db: process.env.MONGODB_DB!,
    collection: process.env.MONGODB_COLLECTION!,
    maxTimeMs: parseInt(process.env.MONGO_MAX_TIME_MS ?? '5000', 10),
    searchMaxTimeMs: parseInt(process.env.MONGO_SEARCH_MAX_TIME_MS ?? '20000', 10),
  },
});
