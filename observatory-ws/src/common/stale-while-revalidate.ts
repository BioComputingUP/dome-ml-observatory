/**
 * Single-value cache that serves stale while ONE background rebuild runs.
 *
 * TtlCache deletes an entry the moment it expires, which means the first caller after expiry
 * waits for the whole rebuild inline -- and every caller arriving *during* that rebuild misses
 * too and starts its own. For the boot-warmed aggregation tables (journals, stats) that turned
 * the daily cache expiry into a pile-up of full-collection aggregations on the shared Mongo
 * host, each visitor waiting tens of seconds. This class exists for exactly that shape: one
 * expensive value, rebuilt rarely, where a stale answer is strictly better than a slow one
 * (the corpus changes only at a bimonthly load, which ends in a restart anyway).
 *
 * Contract:
 * - `get()` with a value present resolves immediately with it -- even past the TTL. Expiry only
 *   kicks off one background rebuild (never more: an in-flight build is shared), whose success
 *   swaps the value in for later callers and whose failure keeps the stale value, reports to
 *   `onError`, and arms a retry floor so a broken database is not hit once per request.
 * - `get()` with no value yet (first fill) awaits the shared build; a failure there rejects
 *   every waiter and clears the in-flight slot so the next call can retry.
 * - The background path is `.catch`ed internally: nothing here can become an unhandled
 *   rejection, which on Node crashes the process.
 *
 * Deliberately no timer: no `OnModuleDestroy` to wire, and no scheduled scan of the shared
 * database for nobody -- a rebuild only ever runs because a request wanted the value.
 */
export class StaleWhileRevalidate<T> {
  private value: T | undefined;
  private builtAt = 0;
  private inFlight: Promise<T> | undefined;
  private nextAttemptAt = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly build: () => Promise<T>,
    private readonly hooks: {
      /** Called with the error of a failed *background* refresh (first-fill failures reject the
       *  callers instead). Log it -- nothing else will see it. */
      onError?: (err: unknown) => void;
      /** How long after a failed refresh before another is attempted. Default 60s. */
      retryMs?: number;
    } = {},
  ) {}

  get(): Promise<T> {
    if (this.value !== undefined) {
      const expired = Date.now() >= this.builtAt + this.ttlMs;
      if (expired && !this.inFlight && Date.now() >= this.nextAttemptAt) {
        // Fire-and-forget on purpose; the stale value answers this caller. The catch is what
        // keeps a failed refresh from becoming an unhandled rejection.
        this.run().catch((err: unknown) => {
          this.nextAttemptAt = Date.now() + (this.hooks.retryMs ?? 60_000);
          this.hooks.onError?.(err);
        });
      }
      return Promise.resolve(this.value);
    }
    // First fill (or every earlier fill failed): all concurrent callers share one build, and a
    // failure propagates to each of them.
    this.inFlight ??= this.run();
    return this.inFlight;
  }

  /** Runs one build, publishing on success. `finally` clears the in-flight slot either way so
   *  the next miss (or the next expiry) can start a fresh build. */
  private run(): Promise<T> {
    const attempt = (async () => {
      const built = await this.build();
      this.value = built;
      this.builtAt = Date.now();
      return built;
    })().finally(() => {
      this.inFlight = undefined;
    });
    this.inFlight = attempt;
    return attempt;
  }
}
