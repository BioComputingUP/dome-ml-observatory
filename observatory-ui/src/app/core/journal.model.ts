/**
 * Shapes returned by observatory-ws's /api/journals endpoints.
 *
 * Mirrors observatory-ws/src/journals/journals.service.ts field for field, duplicated rather than
 * shared -- there is no `-core` package between the two apps (see AGENTS.md). If a field changes
 * there, change it here.
 */

export type JournalSort = 'count' | 'density';

export interface JournalYearPoint {
  year: number;
  screened: number;
  positive: number;
}

/** A journal's row without its year series -- what the list endpoint returns. */
export interface JournalListRow {
  journal: string;
  /** Papers Observatory ingested and classified from this journal. NOT the journal's total
   *  published output, which the corpus does not hold -- every label for this has to say so. */
  screened: number;
  positive: number;
  negative: number;
  undeterminable: number;
  /** positive / screened, 0-1. */
  positiveRate: number;
  openAccessPositive: number;
  firstYear: number | null;
  lastYear: number | null;
  peakYear: number | null;
}

export interface JournalRow extends JournalListRow {
  /** Contiguous and zero-filled from the journal's first year onwards. */
  series: JournalYearPoint[];
  /** Papers before 2000, plus any with no year recorded -- real, but not placeable on the axis. */
  pre: { screened: number; positive: number };
}

export interface JournalCorpusTotals {
  journals: number;
  journalsScreened: number;
  screened: number;
  positive: number;
}

export interface JournalListResult {
  generated: string;
  sort: JournalSort;
  minScreened: number;
  total: number;
  corpus: JournalCorpusTotals;
  rows: JournalListRow[];
}

export interface JournalDetailResult {
  generated: string;
  corpus: JournalCorpusTotals;
  journal: JournalRow;
  rank: number;
  rankOf: number;
  shareOfCorpusPositive: number;
}
