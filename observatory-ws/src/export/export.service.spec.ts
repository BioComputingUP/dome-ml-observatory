import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { ExportService } from './export.service';
import { AppConfig } from '../config/configuration';
import { RecordDocument } from '../records/schemas/record.schema';
import { MAX_EXPORT_CHUNK, DEFAULT_EXPORT_CHUNK } from './export.query';

/** Fluent Mongoose Query stub. Every chain method returns itself and records its argument, so a
 *  test can assert on the filter, the sort and the hint -- the three things that make the keyset
 *  walk correct. Mirrors records.service.spec.ts's fakeQuery. */
function fakeQuery(exec: jest.Mock<Promise<unknown>, []>) {
  const q: Record<string, jest.Mock> = {};
  for (const method of ['sort', 'limit', 'lean', 'hint', 'maxTimeMS']) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  q.exec = exec;
  return q;
}

function fakeModel(docs: RecordDocument[]) {
  const exec = jest.fn<Promise<unknown>, []>().mockResolvedValue(docs);
  const query = fakeQuery(exec);
  // Typed on its argument, not bare jest.fn(), so `find.mock.calls[0][0]` below is the filter
  // object rather than `any` -- the assertions on it are the point of these tests.
  const find = jest
    .fn<Record<string, jest.Mock>, [Record<string, unknown>]>()
    .mockReturnValue(query);
  return { model: { find } as unknown as Model<RecordDocument>, find, query, exec };
}

const config = {
  get: jest.fn(() => 30_000),
} as unknown as ConfigService<AppConfig, true>;

function docs(n: number, prefix = 'id'): RecordDocument[] {
  return Array.from({ length: n }, (_, i) => ({ _id: `${prefix}-${i}` }));
}

function service(returned: RecordDocument[]) {
  const m = fakeModel(returned);
  return { svc: new ExportService(m.model, config), ...m };
}

describe('ExportService.chunk', () => {
  it('sorts by _id ascending and pins the plan to the _id index', async () => {
    const { svc, query } = service(docs(3));
    await svc.chunk({});

    expect(query.sort).toHaveBeenCalledWith({ _id: 1 });
    // Without the hint a filtered export can be planned onto class_year_id, which cannot produce
    // _id order and so falls back to an in-memory sort -- the 32MB ceiling this endpoint exists
    // to avoid. See export.service.ts.
    expect(query.hint).toHaveBeenCalledWith({ _id: 1 });
  });

  it('advertises a cursor when the chunk is full, and none when it is short', async () => {
    const full = await service(docs(DEFAULT_EXPORT_CHUNK)).svc.chunk({});
    expect(full.nextCursor).toBe(`id-${DEFAULT_EXPORT_CHUNK - 1}`);

    const short = await service(docs(7)).svc.chunk({});
    expect(short.nextCursor).toBeUndefined();

    const empty = await service([]).svc.chunk({});
    expect(empty.nextCursor).toBeUndefined();
    expect(empty.items).toEqual([]);
  });

  it('resumes after the cursor with $gt, alongside the ordinary filters', async () => {
    const { svc, find } = service(docs(2));
    await svc.chunk({ cursor: 'id-41', class: 'positive' });

    const filter = find.mock.calls[0][0];
    expect(filter._id).toEqual({ $gt: 'id-41' });
    // The classification filter survives alongside it rather than being replaced by the cursor.
    expect(filter.$and).toBeDefined();
  });

  it('omits _id entirely on the first chunk', async () => {
    const { svc, find } = service(docs(2));
    await svc.chunk({});
    expect(find.mock.calls[0][0]).not.toHaveProperty('_id');
  });

  it('clamps limit to the maximum and falls back to the default for junk', async () => {
    const big = service(docs(1));
    await big.svc.chunk({ limit: '99999' });
    expect(big.query.limit).toHaveBeenCalledWith(MAX_EXPORT_CHUNK);

    for (const limit of ['0', '-5', 'abc', '1.5', undefined]) {
      const s = service(docs(1));
      await s.svc.chunk({ limit });
      expect(s.query.limit).toHaveBeenCalledWith(DEFAULT_EXPORT_CHUNK);
    }

    const ok = service(docs(1));
    await ok.svc.chunk({ limit: '250' });
    expect(ok.query.limit).toHaveBeenCalledWith(250);
  });

  it('rejects free text rather than silently ignoring it', async () => {
    const { svc, find } = service(docs(1));
    await expect(svc.chunk({ q: 'protein' })).rejects.toBeInstanceOf(BadRequestException);
    // Rejected before the query is built, not after -- nothing should reach Mongo.
    expect(find).not.toHaveBeenCalled();
  });

  it('treats whitespace-only q as absent, matching parseSearchParams', async () => {
    const { svc, find } = service(docs(1));
    await expect(svc.chunk({ q: '   ' })).resolves.toBeDefined();
    expect(find).toHaveBeenCalled();
  });

  it('applies the export query budget, not the search one', async () => {
    const { svc, query } = service(docs(1));
    await svc.chunk({});
    expect(query.maxTimeMS).toHaveBeenCalledWith(30_000);
  });

  it('lets a database outage through untouched, for MongoUnavailableFilter to turn into a 503', async () => {
    const { svc, exec } = service([]);
    const outage = new Error('MongooseError: buffering timed out after 10000ms');
    exec.mockRejectedValueOnce(outage);
    await expect(svc.chunk({})).rejects.toBe(outage);
  });
});
