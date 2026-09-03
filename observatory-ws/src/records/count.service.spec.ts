import { ConfigService } from '@nestjs/config';
import { CountService } from './count.service';
import { AppConfig } from '../config/configuration';

/** Builds a fake Mongoose Model exposing just the fluent chains CountService calls. `exec` is a
 *  plain jest.fn() returning a Promise (never an `async () => {}` body with no `await` inside it,
 *  which trips @typescript-eslint/require-await) so tests configure sequential resolve/reject
 *  behaviour with mockResolvedValueOnce/mockRejectedValueOnce instead. */
function fakeModel(opts: { estimated?: number; exec: jest.Mock<Promise<number>, []> }) {
  const inner = { exec: opts.exec };
  return {
    estimatedDocumentCount: jest.fn().mockResolvedValue(opts.estimated ?? 0),
    countDocuments: jest.fn(() => ({
      maxTimeMS: jest.fn().mockReturnValue(inner),
      limit: jest.fn().mockReturnValue({ maxTimeMS: jest.fn().mockReturnValue(inner) }),
    })),
  };
}

const fakeConfig = {
  get: jest.fn().mockReturnValue(5000),
} as unknown as ConfigService<AppConfig, true>;

describe('CountService', () => {
  it('uses the free estimatedDocumentCount for an empty filter, never countDocuments', async () => {
    const exec = jest.fn<Promise<number>, []>().mockResolvedValue(0);
    const model = fakeModel({ estimated: 827_061, exec });
    const service = new CountService(model as never, fakeConfig);

    const result = await service.count({}, 'key');

    expect(result).toEqual({ total: 827_061, totalRelation: 'eq' });
    expect(model.estimatedDocumentCount).toHaveBeenCalled();
    expect(model.countDocuments).not.toHaveBeenCalled();
  });

  it('returns an exact count and caches it on a cache miss', async () => {
    const exec = jest.fn<Promise<number>, []>().mockResolvedValue(355_558);
    const model = fakeModel({ exec });
    const service = new CountService(model as never, fakeConfig);

    const result = await service.count({ x: 1 }, 'key-a');

    expect(result).toEqual({ total: 355_558, totalRelation: 'eq' });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('serves a second identical query from cache without calling countDocuments again', async () => {
    const exec = jest.fn<Promise<number>, []>().mockResolvedValue(355_558);
    const model = fakeModel({ exec });
    const service = new CountService(model as never, fakeConfig);

    await service.count({ x: 1 }, 'key-a');
    await service.count({ x: 1 }, 'key-a');

    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('falls back to a bounded count reported as gte when the exact count throws (e.g. maxTimeMS)', async () => {
    const exec = jest
      .fn<Promise<number>, []>()
      .mockRejectedValueOnce(new Error('MongoServerError: operation exceeded time limit'))
      .mockResolvedValueOnce(10_000);
    const model = fakeModel({ exec });
    const service = new CountService(model as never, fakeConfig);

    const result = await service.count({ x: 1 }, 'key-b');

    expect(result).toEqual({ total: 10_000, totalRelation: 'gte' });
  });

  it('reports eq on the bounded fallback if the true count is under the bound', async () => {
    const exec = jest
      .fn<Promise<number>, []>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(42);
    const model = fakeModel({ exec });
    const service = new CountService(model as never, fakeConfig);

    const result = await service.count({ x: 1 }, 'key-c');

    expect(result).toEqual({ total: 42, totalRelation: 'eq' });
  });

  it('does not cache a bounded fallback result (it is a lower bound, not a real count)', async () => {
    const exec = jest
      .fn<Promise<number>, []>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(10_000)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(10_000);
    const model = fakeModel({ exec });
    const service = new CountService(model as never, fakeConfig);

    await service.count({ x: 1 }, 'key-d');
    await service.count({ x: 1 }, 'key-d');

    // Every call re-threw on its first attempt -- if the fallback had been cached, the second
    // call's exec would only fire once (cache hit) instead of twice (fresh miss + fallback again).
    expect(exec).toHaveBeenCalledTimes(4);
  });

  it('degrades to a gte-bound estimate, without throwing, when even the bounded fallback fails', async () => {
    // Reproduces a real failure seen live against the MongoDB server: a rare free-text term's bounded count
    // can ALSO time out, since it still has to scan nearly the whole un-indexed collection to
    // confirm there's no 10,000th match. The search response must stay usable (a real page of
    // results with an honestly-uncertain total), not throw and take the whole request down.
    const exec = jest
      .fn<Promise<number>, []>()
      .mockRejectedValueOnce(new Error('MaxTimeMSExpired'))
      .mockRejectedValueOnce(new Error('MaxTimeMSExpired'));
    const model = fakeModel({ exec });
    const service = new CountService(model as never, fakeConfig);

    const result = await service.count({ q: 'rare-term' }, 'key-f');

    expect(result).toEqual({ total: 10_000, totalRelation: 'gte' });
  });

  it('does not cache the degraded gte-bound estimate either', async () => {
    const exec = jest.fn<Promise<number>, []>().mockRejectedValue(new Error('MaxTimeMSExpired'));
    const model = fakeModel({ exec });
    const service = new CountService(model as never, fakeConfig);

    await service.count({ q: 'rare-term' }, 'key-g');
    await service.count({ q: 'rare-term' }, 'key-g');

    // 2 calls x 2 attempts (exact + fallback) each = 4, not 2 -- a cache hit would have stopped
    // the second call after zero exec() calls.
    expect(exec).toHaveBeenCalledTimes(4);
  });

  it('warm() swallows a failure rather than throwing, since it is only a boot-time optimisation', async () => {
    const exec = jest.fn<Promise<number>, []>().mockRejectedValue(new Error('down'));
    const model = fakeModel({ exec });
    const service = new CountService(model as never, fakeConfig);

    await expect(service.warm({ x: 1 }, 'key-e')).resolves.toBeUndefined();
  });
});
