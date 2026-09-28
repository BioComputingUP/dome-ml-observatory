/**
 * Minimal in-process TTL cache -- deliberately dependency-free (no redis/cache-manager) since
 * this app runs as a single container with no shared state requirement: cache misses just cost
 * one more Mongo round trip, they're never wrong. Used by the keyed, many-entry caches:
 * CountService (24h TTL on exact counts), TermFrequencyService, OaiService, SitemapService and
 * RecordsService's ranked heads. The single-value boot-warmed tables (JournalsService,
 * StatsService) use StaleWhileRevalidate instead: get() here DELETES on expiry, so the first
 * caller after the TTL would wait a full rebuild out inline -- fine for a 15ms count, wrong for
 * a 24s aggregation.
 */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();

  /** `maxEntries` bounds the cache: past it the oldest entry goes, whatever its age. */
  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number = Number.POSITIVE_INFINITY,
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      // Map iterates in insertion order, so the first key is the oldest.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  get size(): number {
    return this.store.size;
  }
}
