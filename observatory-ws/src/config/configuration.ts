/**
 * process.env -> a namespaced config object, read via ConfigService.get<T>('mongo.uri') etc.
 * (the same access pattern dome-registry-ws uses, so this reads familiarly to Ivan). Env vars are
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
     *  the database server's unindexed collection (measured: "Tosatto" took 10.0s), well past the 5s filter-only
     *  budget above. See records.service.ts's use of this and internal/indexes.md's index proposal,
     *  which removes the need for this larger budget once run. */
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
