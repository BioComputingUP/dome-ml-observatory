/**
 * Year handling shared by the Models and Data tables. Same rule as JournalsService: years from
 * SERIES_START on get a point on the time axis; earlier years, and records with no year, stay in
 * every total but on no chart.
 */
export const SERIES_START = 2000;

/** `publication_metadata.year` when it lies between SERIES_START and `maxYear` (the year the table
 *  is built in: a handful of papers carry next year's date), else null. Written as JournalsService
 *  writes it; MongoDB 4.2 has no $isNumber, and the field is an integer or null. */
export function yearExpr(maxYear: number) {
  return {
    $cond: [
      {
        $and: [
          { $gte: ['$publication_metadata.year', SERIES_START] },
          { $lte: ['$publication_metadata.year', maxYear] },
        ],
      },
      '$publication_metadata.year',
      null,
    ],
  };
}

/** A usable journal name, or null (absent, empty, or not a string -- almost all preprints). */
export const JOURNAL_EXPR = {
  $cond: [
    {
      $and: [
        { $eq: [{ $type: '$publication_metadata.journal' }, 'string'] },
        { $ne: ['$publication_metadata.journal', ''] },
      ],
    },
    '$publication_metadata.journal',
    null,
  ],
};

/** The test "enriched" means everywhere in this service (StatsService, records.query.ts). */
export const ENRICHED_EXPR = { $ne: ['$llm_enrichment.provider', null] };

export const POSITIVE_MATCH = { 'llm_classification.classification': 'positive' };

/** A value counted per year: `total` includes the years off the axis, `series` is aligned to the
 *  table's `years`. */
export interface CountSeries {
  value: string;
  total: number;
  series: number[];
}

/** Contiguous years from the first to the last year that has any count. */
export function yearAxis(years: Iterable<number | null | undefined>): number[] {
  const real = [...years].filter((y): y is number => typeof y === 'number');
  if (!real.length) return [];
  const first = Math.min(...real);
  const last = Math.max(...real);
  const axis: number[] = [];
  for (let y = first; y <= last; y++) axis.push(y);
  return axis;
}

/** Counts keyed by year -> an array aligned to `axis`, zero-filled. */
export function alignSeries(byYear: Map<number | null, number>, axis: number[]): number[] {
  return axis.map((y) => byYear.get(y) ?? 0);
}

/** Adds `n` to `map[key][year]`, creating both levels as needed. */
export function bump(
  map: Map<string, Map<number | null, number>>,
  key: string,
  year: number | null | undefined,
  n: number,
): void {
  const inner = map.get(key) ?? new Map<number | null, number>();
  const y = typeof year === 'number' ? year : null;
  inner.set(y, (inner.get(y) ?? 0) + n);
  map.set(key, inner);
}

/** Every per-year map in `map` as a CountSeries, largest total first, ties by name. */
export function toCountSeries(
  map: Map<string, Map<number | null, number>>,
  axis: number[],
): CountSeries[] {
  return [...map.entries()]
    .map(([value, byYear]) => ({
      value,
      total: [...byYear.values()].reduce((a, b) => a + b, 0),
      series: alignSeries(byYear, axis),
    }))
    .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
}

/** One cell of a "this group against the corpus" grid: count, its share of the group, and the
 *  lift -- that share over the same value's share of the whole. 1 means "as common as anywhere". */
export interface LiftCell {
  value: string;
  count: number;
  share: number;
  lift: number | null;
}

export function liftCells(
  counts: Map<string, number>,
  groupTotal: number,
  corpusCounts: Map<string, number>,
  corpusTotal: number,
): LiftCell[] {
  return [...corpusCounts.keys()].map((value) => {
    const count = counts.get(value) ?? 0;
    const share = groupTotal ? count / groupTotal : 0;
    const corpusShare = corpusTotal ? (corpusCounts.get(value) ?? 0) / corpusTotal : 0;
    return { value, count, share, lift: corpusShare ? share / corpusShare : null };
  });
}

/** True when the table's last year is the calendar year it was built in, so the page can say
 *  that year is still filling. */
export function lastYearIsPartial(axis: number[], generated: string): boolean {
  return axis.length > 0 && axis[axis.length - 1] >= new Date(generated).getUTCFullYear();
}
