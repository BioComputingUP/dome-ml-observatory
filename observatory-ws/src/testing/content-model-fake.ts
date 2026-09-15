import { Model } from 'mongoose';
import { RecordDocument } from '../records/schemas/record.schema';

/**
 * An in-memory stand-in for the Content model that actually evaluates the filters it is given,
 * for specs where the query IS the behaviour -- keyset paging, datestamp ranges -- and a stub that
 * only records its arguments would prove nothing. It supports exactly what the metadata and OAI
 * queries use (dotted-path equality, $type:'string', $gt/$gte/$lt/$lte, $or/$and, sort, limit,
 * cursor) and throws on anything else, so a query that grows past it fails loudly.
 *
 * Test-only: tsconfig.build.json excludes src/testing from the build.
 */

type Filter = Record<string, unknown>;

interface FakeQuery {
  sort(spec: Record<string, 1 | -1>): FakeQuery;
  limit(n: number): FakeQuery;
  lean(): FakeQuery;
  maxTimeMS(ms?: number): FakeQuery;
  exec(): Promise<RecordDocument | RecordDocument[] | null>;
  cursor(options?: unknown): AsyncIterable<RecordDocument>;
}

export interface FakeContentModel {
  model: Model<RecordDocument>;
  /** Every filter passed to find / findOne, in order. */
  filters: Filter[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueAt(doc: unknown, path: string): unknown {
  let node = doc;
  for (const part of path.split('.')) {
    if (!isObject(node)) return undefined;
    node = node[part];
  }
  return node;
}

/** MongoDB order for the values these queries compare: missing and null first. */
function compare(a: unknown, b: unknown): number {
  if (a === undefined || a === null) return b === undefined || b === null ? 0 : -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  throw new Error(`fake content model: cannot compare ${typeof a} with ${typeof b}`);
}

function meets(value: unknown, condition: unknown): boolean {
  if (!isObject(condition) || !Object.keys(condition).some((k) => k.startsWith('$'))) {
    return value === condition;
  }
  return Object.entries(condition).every(([op, arg]) => {
    const comparable = typeof value === typeof arg;
    switch (op) {
      case '$type':
        if (arg !== 'string')
          throw new Error(`fake content model: unsupported $type ${String(arg)}`);
        return typeof value === 'string';
      case '$gt':
        return comparable && compare(value, arg) > 0;
      case '$gte':
        return comparable && compare(value, arg) >= 0;
      case '$lt':
        return comparable && compare(value, arg) < 0;
      case '$lte':
        return comparable && compare(value, arg) <= 0;
      default:
        throw new Error(`fake content model: unsupported operator ${op}`);
    }
  });
}

export function matches(doc: unknown, filter: Filter): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return (condition as Filter[]).some((f) => matches(doc, f));
    if (key === '$and') return (condition as Filter[]).every((f) => matches(doc, f));
    if (key.startsWith('$')) throw new Error(`fake content model: unsupported operator ${key}`);
    return meets(valueAt(doc, key), condition);
  });
}

export function fakeContentModel(docs: readonly RecordDocument[]): FakeContentModel {
  const filters: Filter[] = [];

  const query = (filter: Filter, single: boolean): FakeQuery => {
    filters.push(filter);
    let sortSpec: Array<[string, 1 | -1]> = [];
    let limitN: number | undefined;
    const run = (): RecordDocument[] => {
      let out = docs.filter((d) => matches(d, filter));
      if (sortSpec.length) {
        out = [...out].sort((a, b) => {
          for (const [key, direction] of sortSpec) {
            const c = compare(valueAt(a, key), valueAt(b, key));
            if (c) return c * direction;
          }
          return 0;
        });
      }
      if (limitN !== undefined) out = out.slice(0, limitN);
      return out.map((d) => structuredClone(d));
    };
    const q: FakeQuery = {
      sort(spec) {
        sortSpec = Object.entries(spec);
        return q;
      },
      limit(n) {
        limitN = n;
        return q;
      },
      lean: () => q,
      maxTimeMS: () => q,
      exec: () => Promise.resolve(single ? (run()[0] ?? null) : run()),
      cursor: () => {
        const items = run();
        return {
          async *[Symbol.asyncIterator]() {
            for (const item of items) yield await Promise.resolve(item);
          },
        };
      },
    };
    return q;
  };

  const model = {
    find: (filter: Filter) => query(filter, false),
    findOne: (filter: Filter) => query(filter, true),
  };
  return { model: model as unknown as Model<RecordDocument>, filters };
}
