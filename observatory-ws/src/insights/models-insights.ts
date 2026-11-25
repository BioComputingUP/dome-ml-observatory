import {
  CountSeries,
  ENRICHED_EXPR,
  JOURNAL_EXPR,
  LiftCell,
  POSITIVE_MATCH,
  yearExpr,
  bump,
  lastYearIsPartial,
  liftCells,
  toCountSeries,
  yearAxis,
} from './series';

/** A journal needs this many enriched papers to appear in the journal-by-family grid; below it a
 *  share is two or three papers and the shading is noise. A journal looked up by name is answered
 *  whatever its size, with its count, so the page can say how little it rests on. */
export const JOURNAL_MIN_ENRICHED = 100;
/** Rows of the journal grid the overview carries. */
export const JOURNAL_ROWS = 40;
/** Model types carried with a full series; the rest are summed into `tail`. */
export const TOP_MODEL_TYPES = 40;
/** Rising and falling: windows of this many full years, a minimum of papers across both windows,
 *  and how many of each the overview lists. */
export const MOVER_WINDOW = 3;
export const MOVER_MIN_PAPERS = 30;
export const MOVER_COUNT = 8;

const ENRICHED_MATCH = { ...POSITIVE_MATCH, 'llm_enrichment.provider': { $ne: null } };

/**
 * Pipeline A: one pass over the positives, the small groups in one $facet. Each branch's output
 * is bounded by the vocabularies (16 families, 5 paradigms, 4 uses, 13 tier-1 domains) times the
 * years, plus one row per journal with an enriched paper, which is a few thousand short rows. The
 * open-vocabulary model types and the journal-by-family grid run as their own pipelines because
 * they grow with the corpus and a $facet result is a single document capped at 16 MB.
 */
export function buildModelsFacetPipeline(maxYear: number) {
  const unwindCount = (field: string) => [
    { $match: { e: true } },
    { $unwind: `$${field}` },
    { $group: { _id: { y: '$y', v: `$${field}` }, n: { $sum: 1 } } },
  ];
  return [
    { $match: POSITIVE_MATCH },
    {
      $project: {
        _id: 0,
        y: yearExpr(maxYear),
        e: ENRICHED_EXPR,
        j: JOURNAL_EXPR,
        d: '$content_filters.domain_tier1',
        fam: '$content_filters.model_family',
        para: '$content_filters.learning_paradigm',
        use: '$content_filters.model_use',
      },
    },
    {
      $facet: {
        byYear: [
          {
            $group: {
              _id: '$y',
              positive: { $sum: 1 },
              enriched: { $sum: { $cond: ['$e', 1, 0] } },
              withUse: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        '$e',
                        { $gt: [{ $cond: [{ $isArray: '$use' }, { $size: '$use' }, 0] }, 0] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
        family: unwindCount('fam'),
        paradigm: unwindCount('para'),
        use: unwindCount('use'),
        journals: [
          { $match: { e: true, j: { $ne: null } } },
          { $group: { _id: '$j', n: { $sum: 1 } } },
        ],
        domains: [{ $match: { e: true } }, { $group: { _id: '$d', n: { $sum: 1 } } }],
        domainFamily: [
          { $match: { e: true } },
          { $unwind: '$fam' },
          { $group: { _id: { d: '$d', v: '$fam' }, n: { $sum: 1 } } },
        ],
      },
    },
  ];
}

/** Pipeline B: every model type by year. Open vocabulary, so it streams as a cursor. */
export function buildModelTypePipeline(maxYear: number) {
  return [
    { $match: ENRICHED_MATCH },
    { $project: { _id: 0, y: yearExpr(maxYear), t: '$content_filters.model_type' } },
    { $unwind: '$t' },
    { $group: { _id: { y: '$y', v: '$t' }, n: { $sum: 1 } } },
  ];
}

/** Pipeline C: every journal by model family. */
export function buildJournalFamilyPipeline() {
  return [
    { $match: ENRICHED_MATCH },
    { $project: { _id: 0, j: JOURNAL_EXPR, fam: '$content_filters.model_family' } },
    { $match: { j: { $ne: null } } },
    { $unwind: '$fam' },
    { $group: { _id: { j: '$j', v: '$fam' }, n: { $sum: 1 } } },
  ];
}

type YearValue = { _id: { y: number | null; v: unknown }; n: number };

export interface RawModelsFacet {
  byYear: { _id: number | null; positive: number; enriched: number; withUse: number }[];
  family: YearValue[];
  paradigm: YearValue[];
  use: YearValue[];
  journals: { _id: string; n: number }[];
  domains: { _id: unknown; n: number }[];
  domainFamily: { _id: { d: unknown; v: unknown }; n: number }[];
}

export type RawModelType = YearValue;
export type RawJournalFamily = { _id: { j: string; v: unknown }; n: number };

export interface Mover {
  value: string;
  /** Papers carrying the type in each window. */
  recent: number;
  previous: number;
  /** Share of enriched papers in each window, 0-1. */
  recentShare: number;
  previousShare: number;
  /** recentShare - previousShare, in percentage points. */
  change: number;
}

export interface GroupProfile {
  /** A journal name or a tier-1 domain. */
  name: string;
  enriched: number;
  cells: LiftCell[];
}

export interface ModelsOverview {
  generated: string;
  years: number[];
  /** The last year on the axis is the calendar year the table was built in. */
  lastYearPartial: boolean;
  coverage: {
    positive: number;
    enriched: number;
    /** Enriched papers that carry model_use, which only prompts e2 and e3 fill. */
    withModelUse: number;
  };
  positiveByYear: number[];
  enrichedByYear: number[];
  withUseByYear: number[];
  families: CountSeries[];
  paradigms: CountSeries[];
  uses: CountSeries[];
  modelTypes: {
    /** Distinct model types after case-folding. */
    distinct: number;
    top: CountSeries[];
    tail: { distinct: number; total: number };
  };
  movers: {
    recentYears: [number, number];
    previousYears: [number, number];
    minPapers: number;
    rising: Mover[];
    falling: Mover[];
  };
  journals: { minEnriched: number; qualifying: number; rows: GroupProfile[] };
  domains: GroupProfile[];
}

export interface JournalModelProfile {
  generated: string;
  profile: GroupProfile;
  /** 1-based rank by enriched papers among journals with any. */
  rank: number;
  rankOf: number;
  minEnriched: number;
  corpusEnriched: number;
}

export interface ModelsTable {
  overview: ModelsOverview;
  /** Every journal with an enriched paper, for the by-name lookup. */
  journals: Map<string, { profile: GroupProfile; rank: number }>;
}

function label(value: unknown): string | null {
  if (Array.isArray(value)) return label(value[0]);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function fold(rows: YearValue[]): Map<string, Map<number | null, number>> {
  const map = new Map<string, Map<number | null, number>>();
  for (const row of rows) {
    const value = label(row._id.v);
    if (value) bump(map, value, row._id.y, row.n);
  }
  return map;
}

function totals(series: CountSeries[]): Map<string, number> {
  return new Map(series.map((s) => [s.value, s.total]));
}

/**
 * Model types are free text where the seed vocabulary had no match, so "Random forest" and
 * "random forest" both occur. Grouped case-insensitively, shown in the spelling used most.
 */
export function foldModelTypes(rows: RawModelType[]): Map<string, Map<number | null, number>> {
  const byKey = new Map<string, Map<number | null, number>>();
  const spellings = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const value = label(row._id.v);
    if (!value) continue;
    const key = value.toLowerCase();
    bump(byKey, key, row._id.y, row.n);
    const s = spellings.get(key) ?? new Map<string, number>();
    s.set(value, (s.get(value) ?? 0) + row.n);
    spellings.set(key, s);
  }
  const out = new Map<string, Map<number | null, number>>();
  for (const [key, byYear] of byKey) {
    const best = [...spellings.get(key)!.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
    out.set(best, byYear);
  }
  return out;
}

/**
 * Change in share between the last MOVER_WINDOW full years and the MOVER_WINDOW before them. The
 * year the table is built in is never "full", so it is left out of both windows.
 */
export function computeMovers(
  types: Map<string, Map<number | null, number>>,
  enrichedByYear: Map<number | null, number>,
  generated: string,
): ModelsOverview['movers'] {
  const lastFull = new Date(generated).getUTCFullYear() - 1;
  const recentYears: [number, number] = [lastFull - MOVER_WINDOW + 1, lastFull];
  const previousYears: [number, number] = [
    lastFull - 2 * MOVER_WINDOW + 1,
    lastFull - MOVER_WINDOW,
  ];
  const sum = (m: Map<number | null, number>, [a, b]: [number, number]) => {
    let t = 0;
    for (let y = a; y <= b; y++) t += m.get(y) ?? 0;
    return t;
  };
  const recentBase = sum(enrichedByYear, recentYears);
  const previousBase = sum(enrichedByYear, previousYears);
  const movers: Mover[] = [];
  if (recentBase && previousBase) {
    for (const [value, byYear] of types) {
      const recent = sum(byYear, recentYears);
      const previous = sum(byYear, previousYears);
      if (recent + previous < MOVER_MIN_PAPERS) continue;
      const recentShare = recent / recentBase;
      const previousShare = previous / previousBase;
      movers.push({
        value,
        recent,
        previous,
        recentShare,
        previousShare,
        change: (recentShare - previousShare) * 100,
      });
    }
  }
  const byChange = [...movers].sort(
    (a, b) => b.change - a.change || a.value.localeCompare(b.value),
  );
  return {
    recentYears,
    previousYears,
    minPapers: MOVER_MIN_PAPERS,
    rising: byChange.filter((m) => m.change > 0).slice(0, MOVER_COUNT),
    falling: byChange
      .filter((m) => m.change < 0)
      .reverse()
      .slice(0, MOVER_COUNT),
  };
}

/** Turns the three pipelines' output into the cached table. Pure, so the shaping rules can be
 *  tested without a database. */
export function shapeModelsTable(
  facet: RawModelsFacet,
  types: RawModelType[],
  journalFamily: RawJournalFamily[],
  generated: string,
): ModelsTable {
  const positiveBy = new Map<number | null, number>();
  const enrichedBy = new Map<number | null, number>();
  const withUseBy = new Map<number | null, number>();
  for (const row of facet.byYear) {
    positiveBy.set(row._id, row.positive);
    enrichedBy.set(row._id, row.enriched);
    withUseBy.set(row._id, row.withUse);
  }
  const sumAll = (m: Map<number | null, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const enrichedTotal = sumAll(enrichedBy);

  // The axis runs over the years that have enriched papers; positives before the first such year
  // say nothing about models.
  const years = yearAxis([...enrichedBy.entries()].filter(([, n]) => n > 0).map(([y]) => y));
  const aligned = (m: Map<number | null, number>) => years.map((y) => m.get(y) ?? 0);

  const families = toCountSeries(fold(facet.family), years);
  const familyTotals = totals(families);

  const typeMap = foldModelTypes(types);
  const allTypes = toCountSeries(typeMap, years);
  const tail = allTypes.slice(TOP_MODEL_TYPES);

  // Journals: every one with an enriched paper is looked up by name; the overview carries the
  // largest JOURNAL_ROWS of those over the threshold.
  const journalFamilies = new Map<string, Map<string, number>>();
  for (const row of journalFamily) {
    const fam = label(row._id.v);
    if (!fam) continue;
    const m = journalFamilies.get(row._id.j) ?? new Map<string, number>();
    m.set(fam, (m.get(fam) ?? 0) + row.n);
    journalFamilies.set(row._id.j, m);
  }
  const journalRanked = [...facet.journals].sort((a, b) => b.n - a.n || a._id.localeCompare(b._id));
  const journals = new Map<string, { profile: GroupProfile; rank: number }>();
  journalRanked.forEach((row, i) => {
    journals.set(row._id, {
      rank: i + 1,
      profile: {
        name: row._id,
        enriched: row.n,
        cells: liftCells(
          journalFamilies.get(row._id) ?? new Map<string, number>(),
          row.n,
          familyTotals,
          enrichedTotal,
        ),
      },
    });
  });
  const qualifying = journalRanked.filter((r) => r.n >= JOURNAL_MIN_ENRICHED);

  const domainFamilies = new Map<string, Map<string, number>>();
  for (const row of facet.domainFamily) {
    const d = label(row._id.d);
    const fam = label(row._id.v);
    if (!d || !fam) continue;
    const m = domainFamilies.get(d) ?? new Map<string, number>();
    m.set(fam, (m.get(fam) ?? 0) + row.n);
    domainFamilies.set(d, m);
  }
  const domainTotals = new Map<string, number>();
  for (const row of facet.domains) {
    const d = label(row._id);
    if (d) domainTotals.set(d, (domainTotals.get(d) ?? 0) + row.n);
  }
  const domains = [...domainTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => ({
      name,
      enriched: n,
      cells: liftCells(
        domainFamilies.get(name) ?? new Map<string, number>(),
        n,
        familyTotals,
        enrichedTotal,
      ),
    }));

  const overview: ModelsOverview = {
    generated,
    years,
    lastYearPartial: lastYearIsPartial(years, generated),
    coverage: {
      positive: sumAll(positiveBy),
      enriched: enrichedTotal,
      withModelUse: sumAll(withUseBy),
    },
    positiveByYear: aligned(positiveBy),
    enrichedByYear: aligned(enrichedBy),
    withUseByYear: aligned(withUseBy),
    families,
    paradigms: toCountSeries(fold(facet.paradigm), years),
    uses: toCountSeries(fold(facet.use), years),
    modelTypes: {
      distinct: allTypes.length,
      top: allTypes.slice(0, TOP_MODEL_TYPES),
      tail: { distinct: tail.length, total: tail.reduce((a, s) => a + s.total, 0) },
    },
    movers: computeMovers(typeMap, enrichedBy, generated),
    journals: {
      minEnriched: JOURNAL_MIN_ENRICHED,
      qualifying: qualifying.length,
      rows: qualifying.slice(0, JOURNAL_ROWS).map((r) => journals.get(r._id)!.profile),
    },
    domains,
  };
  return { overview, journals };
}
