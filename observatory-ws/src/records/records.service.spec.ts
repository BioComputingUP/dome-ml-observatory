import { mongo } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { RecordsService } from './records.service';
import { CountService } from './count.service';
import { AppConfig } from '../config/configuration';
import { RecordDocument } from './schemas/record.schema';

/** Fluent Mongoose Query stub -- every chain method returns itself except `exec`, which is a
 *  plain jest.fn() so tests can configure resolve/reject behaviour directly (never an
 *  `async () => {}` body with no `await` inside it, which trips @typescript-eslint/require-await).
 *  Mirrors count.service.spec.ts's fakeModel pattern. */
function fakeQuery(exec: jest.Mock<Promise<unknown>, []>) {
  const q: Record<string, jest.Mock> = {};
  for (const method of ['sort', 'skip', 'limit', 'lean']) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  q.maxTimeMS = jest.fn().mockReturnValue(q);
  q.exec = exec;
  return q;
}

function fakeModel(opts: { findExec: jest.Mock<Promise<unknown>, []> }) {
  return {
    find: jest.fn(() => fakeQuery(opts.findExec)),
  };
}

/** `mongo.maxTimeMs` (5000) for filter-only searches, `mongo.searchMaxTimeMs` (20000) for a
 *  free-text one -- see configuration.ts. Distinguishing the two in the fake config lets tests
 *  confirm fetchPage actually selects the right budget rather than always using one. */
function fakeConfig() {
  return {
    get: jest.fn((key: string) => (key === 'mongo.searchMaxTimeMs' ? 20_000 : 5_000)),
  } as unknown as ConfigService<AppConfig, true>;
}

function fakeCountService(
  result: { total: number; totalRelation: 'eq' | 'gte' } = { total: 1, totalRelation: 'eq' },
) {
  return { count: jest.fn().mockResolvedValue(result) } as unknown as CountService;
}

const SOME_DOCS = [{ _id: 'a' }, { _id: 'b' }] as unknown as RecordDocument[];

describe('RecordsService.search / fetchPage', () => {
  it('returns the fetched page and count on a normal search', async () => {
    const findExec = jest.fn<Promise<unknown>, []>().mockResolvedValue(SOME_DOCS);
    const model = fakeModel({ findExec });
    const service = new RecordsService(
      model as never,
      fakeCountService({ total: 2, totalRelation: 'eq' }),
      fakeConfig(),
    );

    const result = await service.search({});

    expect(result.items).toBe(SOME_DOCS);
    expect(result.total).toBe(2);
    expect(result.timedOut).toBeUndefined();
  });

  it('uses the larger searchMaxTimeMs budget when q is present, not the filter-only maxTimeMs', async () => {
    const findExec = jest.fn<Promise<unknown>, []>().mockResolvedValue([]);
    const model = fakeModel({ findExec });
    const service = new RecordsService(model as never, fakeCountService(), fakeConfig());

    await service.search({ q: 'random forest sepsis' });

    const lastQuery = model.find.mock.results[model.find.mock.results.length - 1].value as {
      maxTimeMS: jest.Mock;
    };
    expect(lastQuery.maxTimeMS).toHaveBeenCalledWith(20_000);
  });

  it('uses the ordinary maxTimeMs budget when q is absent', async () => {
    const findExec = jest.fn<Promise<unknown>, []>().mockResolvedValue([]);
    const model = fakeModel({ findExec });
    const service = new RecordsService(model as never, fakeCountService(), fakeConfig());

    await service.search({});

    const lastQuery = model.find.mock.results[model.find.mock.results.length - 1].value as {
      maxTimeMS: jest.Mock;
    };
    expect(lastQuery.maxTimeMS).toHaveBeenCalledWith(5_000);
  });

  it('degrades to an empty page with timedOut:true on a server-side maxTimeMS expiry, without throwing', async () => {
    // Reproduces the exact live failure this fix targets: a free-text query with no matching
    // literal phrase used to force a full-collection scan that blew maxTimeMS -- a
    // mongo.MongoServerError code 50 / codeName 'MaxTimeMSExpired', thrown on a perfectly healthy,
    // connected the MongoDB server. That must degrade the search, not fail it and not report a false outage.
    const timeoutErr = new mongo.MongoServerError({
      message: 'operation exceeded time limit',
      code: 50,
      codeName: 'MaxTimeMSExpired',
    });
    const findExec = jest.fn<Promise<unknown>, []>().mockRejectedValue(timeoutErr);
    const model = fakeModel({ findExec });
    const service = new RecordsService(
      model as never,
      fakeCountService({ total: 10_000, totalRelation: 'gte' }),
      fakeConfig(),
    );

    const result = await service.search({ q: 'random forest sepsis' });

    expect(result.items).toEqual([]);
    expect(result.timedOut).toBe(true);
    // The count is independent of the page fetch (CountService degrades on its own) and must not
    // be discarded just because the page fetch gave up -- see records.service.ts's header comment.
    expect(result.total).toBe(10_000);
  });

  it('lets a genuine connection-level failure propagate untouched, so MongoUnavailableFilter still reports a real outage as 503', async () => {
    // A disconnected/unreachable MongoDB server throws mongoose.MongooseError (a buffered-command timeout),
    // a completely different class from mongo.MongoServerError -- isSearchTimeout must not catch
    // this, or a real outage would be misreported as merely "your search was slow".
    const outageErr = new Error('MongooseError: buffering timed out after 10000ms');
    const findExec = jest.fn<Promise<unknown>, []>().mockRejectedValue(outageErr);
    const model = fakeModel({ findExec });
    const service = new RecordsService(model as never, fakeCountService(), fakeConfig());

    await expect(service.search({ q: 'anything' })).rejects.toBe(outageErr);
  });

  it('does not catch a MongoServerError that is not a timeout (e.g. a genuine query error)', async () => {
    const otherErr = new mongo.MongoServerError({
      message: 'some other server error',
      code: 2,
      codeName: 'BadValue',
    });
    const findExec = jest.fn<Promise<unknown>, []>().mockRejectedValue(otherErr);
    const model = fakeModel({ findExec });
    const service = new RecordsService(model as never, fakeCountService(), fakeConfig());

    await expect(service.search({ q: 'anything' })).rejects.toBe(otherErr);
  });
});
