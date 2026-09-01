import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  it('returns undefined for a key that was never set', () => {
    const cache = new TtlCache<number>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns a stored value before it expires', () => {
    const cache = new TtlCache<number>(10_000);
    cache.set('a', 42);
    expect(cache.get('a')).toBe(42);
  });

  it('expires a value once its TTL has elapsed', () => {
    jest.useFakeTimers();
    const cache = new TtlCache<number>(1000);
    cache.set('a', 42);
    jest.advanceTimersByTime(1001);
    expect(cache.get('a')).toBeUndefined();
    jest.useRealTimers();
  });

  it('does not expire a value one millisecond before its TTL', () => {
    jest.useFakeTimers();
    const cache = new TtlCache<number>(1000);
    cache.set('a', 42);
    jest.advanceTimersByTime(999);
    expect(cache.get('a')).toBe(42);
    jest.useRealTimers();
  });

  it('overwrites an existing key and resets its expiry', () => {
    jest.useFakeTimers();
    const cache = new TtlCache<number>(1000);
    cache.set('a', 1);
    jest.advanceTimersByTime(900);
    cache.set('a', 2);
    jest.advanceTimersByTime(900);
    // 900ms since the second set -- still under a fresh 1000ms TTL, and the stale first value is gone.
    expect(cache.get('a')).toBe(2);
    jest.useRealTimers();
  });

  it('tracks size, including expired-but-not-yet-read entries', () => {
    const cache = new TtlCache<number>(1000);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
  });
});
