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
  },
});
