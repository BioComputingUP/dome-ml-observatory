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

/** Fluent Aggregate stub: `.option()` chains, `.exec()` resolves. Only the index paths use it. */
function fakeAggregate(exec: jest.Mock<Promise<unknown>, []>) {
  const a: Record<string, jest.Mock> = {};
  a.option = jest.fn().mockReturnValue(a);
  a.exec = exec;
  return a;
}

function fakeModel(opts: {
  findExec: jest.Mock<Promise<unknown>, []>;
  aggregateExec?: jest.Mock<Promise<unknown>, []>;
  indexes?: { name: string }[];
}) {
  const aggregateExec = opts.aggregateExec ?? jest.fn<Promise<unknown>, []>().mockResolvedValue([]);
  return {
    find: jest.fn(() => fakeQuery(opts.findExec)),
    aggregate: jest.fn(() => fakeAggregate(aggregateExec)),
    listIndexes: jest.fn().mockResolvedValue(opts.indexes ?? []),
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

/**
 * The initials-first probe. These are the only tests that exercise an index path, so they force the
 * boot-time detection to find the text index rather than assuming its default.
 */
describe('RecordsService.search / author probe', () => {
  const withTextIndex = async (model: ReturnType<typeof fakeModel>, count: CountService) => {
    const service = new RecordsService(model as never, count, fakeConfig());
    await service.onModuleInit();
    return service;
  };

  it('answers an initials-first query off the index when someone really is called that', async () => {
    const model = fakeModel({
      findExec: jest.fn<Promise<unknown>, []>().mockResolvedValue(SOME_DOCS),
      aggregateExec: jest
        .fn<Promise<unknown>, []>()
        .mockResolvedValue([{ _id: 'a' }, { _id: 'b' }]),
      indexes: [{ name: 'positives_text' }],
    });
    const service = await withTextIndex(model, fakeCountService({ total: 2, totalRelation: 'eq' }));

    const result = await service.search({ q: 'G Farrell' });

    expect(result.total).toBe(2);
    // One aggregation (the probe), and find() only to fetch the full documents for those ids --
    // never the slow regex scan this query used to take.
    expect(model.aggregate).toHaveBeenCalledTimes(1);
    const probe = JSON.stringify(model.aggregate.mock.calls[0][0]);
    expect(probe).toContain('$text');
    expect(probe).toContain('publication_metadata.authors');
  });

  it('falls straight through to the ordinary path when nobody is called that', async () => {
    // "T cell" is the shape that makes this a probe rather than a phrase in the main query. Nobody
    // is called "cell T", so the probe returns zero and the search proceeds exactly as before --
    // one wasted indexed round trip, and an unchanged answer.
    const findExec = jest.fn<Promise<unknown>, []>().mockResolvedValue(SOME_DOCS);
    const model = fakeModel({
      findExec,
      aggregateExec: jest.fn<Promise<unknown>, []>().mockResolvedValue([]),
      indexes: [{ name: 'positives_text' }],
    });
    const count = {
      count: jest
        .fn()
        .mockResolvedValueOnce({ total: 0, totalRelation: 'eq' })
        .mockResolvedValue({ total: 46_141, totalRelation: 'eq' }),
    } as unknown as CountService;
    const service = await withTextIndex(model, count);

    const result = await service.search({ q: 'T cell' });

    // The probe's zero is discarded, not returned: the answer is the ordinary path's, fetched
    // through find() rather than the index.
    expect(result.total).toBe(46_141);
    expect(model.aggregate).toHaveBeenCalledTimes(1);
    expect(findExec).toHaveBeenCalled();
  });

  it('never probes with the classification filter cleared -- that is a 500, not a slow query', async () => {
    const model = fakeModel({
      findExec: jest.fn<Promise<unknown>, []>().mockResolvedValue([]),
      indexes: [{ name: 'positives_text' }],
    });
    const service = await withTextIndex(model, fakeCountService());

    await service.search({ q: 'G Farrell', class: '' });

    expect(model.aggregate).not.toHaveBeenCalled();
  });
});
