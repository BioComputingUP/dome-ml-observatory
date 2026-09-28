import { StaleWhileRevalidate } from './stale-while-revalidate';

/** A promise with its settle handles exposed, so a test controls exactly when a build finishes. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets promise continuations queued by a resolve/reject actually run under fake timers. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('StaleWhileRevalidate', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('awaits the build on first fill and resolves with its value', async () => {
    const cache = new StaleWhileRevalidate<number>(1000, () => Promise.resolve(42));
    await expect(cache.get()).resolves.toBe(42);
  });

  it('shares ONE build across concurrent first-fill callers', async () => {
    const gate = deferred<number>();
    const build = jest.fn(() => gate.promise);
    const cache = new StaleWhileRevalidate<number>(1000, build);

    const a = cache.get();
    const b = cache.get();
    const c = cache.get();
    gate.resolve(7);

    await expect(Promise.all([a, b, c])).resolves.toEqual([7, 7, 7]);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild inside the TTL', async () => {
    jest.useFakeTimers();
    const build = jest.fn(() => Promise.resolve(1));
    const cache = new StaleWhileRevalidate<number>(1000, build);

    await cache.get();
    jest.advanceTimersByTime(999);
    await expect(cache.get()).resolves.toBe(1);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('past the TTL, serves the stale value immediately and rebuilds once in the background', async () => {
    jest.useFakeTimers();
    const gate = deferred<number>();
    const build = jest
      .fn<Promise<number>, []>()
      .mockImplementationOnce(() => Promise.resolve(1))
      .mockImplementation(() => gate.promise);
    const cache = new StaleWhileRevalidate<number>(1000, build);

    await cache.get();
    jest.advanceTimersByTime(1001);

    // Every caller during the rebuild gets the stale value at once, and only one build runs.
    await expect(cache.get()).resolves.toBe(1);
    await expect(cache.get()).resolves.toBe(1);
    expect(build).toHaveBeenCalledTimes(2);

    gate.resolve(2);
    await settle();
    await expect(cache.get()).resolves.toBe(2);
  });

  it('keeps the stale value when a background refresh fails, reports it, and applies the retry floor', async () => {
    jest.useFakeTimers();
    const onError = jest.fn();
    const build = jest
      .fn<Promise<number>, []>()
      .mockImplementationOnce(() => Promise.resolve(1))
      .mockImplementation(() => Promise.reject(new Error('mongo down')));
    const cache = new StaleWhileRevalidate<number>(1000, build, { onError, retryMs: 60_000 });

    await cache.get();
    jest.advanceTimersByTime(1001);
    await expect(cache.get()).resolves.toBe(1); // triggers the failing refresh
    await settle();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(2);

    // Inside the retry floor: still stale, no new attempt.
    jest.advanceTimersByTime(30_000);
    await expect(cache.get()).resolves.toBe(1);
    expect(build).toHaveBeenCalledTimes(2);

    // Past the floor: one more attempt.
    jest.advanceTimersByTime(31_000);
    await expect(cache.get()).resolves.toBe(1);
    await settle();
    expect(build).toHaveBeenCalledTimes(3);
  });

  it('rejects every waiter on a failed first fill and lets the next call retry', async () => {
    const gate = deferred<number>();
    const build = jest
      .fn<Promise<number>, []>()
      .mockImplementationOnce(() => gate.promise)
      .mockImplementation(() => Promise.resolve(5));
    const cache = new StaleWhileRevalidate<number>(1000, build);

    const a = cache.get();
    const b = cache.get();
    gate.reject(new Error('first fill failed'));

    await expect(a).rejects.toThrow('first fill failed');
    await expect(b).rejects.toThrow('first fill failed');
    expect(build).toHaveBeenCalledTimes(1);

    // The in-flight slot was cleared, so a later call builds afresh.
    await expect(cache.get()).resolves.toBe(5);
    expect(build).toHaveBeenCalledTimes(2);
  });
});
