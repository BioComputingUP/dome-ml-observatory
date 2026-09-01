/**
 * Minimal in-process TTL cache -- deliberately dependency-free (no redis/cache-manager) since
 * this app runs as a single container with no shared state requirement: cache misses just cost
 * one more Mongo round trip, they're never wrong. Used by CountService (24h TTL on exact counts)
 * and StatsService (the boot-warmed facet aggregation).
 */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

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
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  get size(): number {
    return this.store.size;
  }
}
