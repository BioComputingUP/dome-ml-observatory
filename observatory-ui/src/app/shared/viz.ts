/** Shared by the Data & Models charts. */

/** Where a mark leads: a router path and its query params. A multi-value param is an array, which
 *  Angular writes as a repeated key (`?fam=a&fam=b`) -- the search URL contract; never comma-join. */
export interface ChartLink {
  path: string;
  queryParams?: Record<string, string | string[]>;
}

/** The six categorical slots, in their validated order (styles.scss). Assigned by position in a
 *  chart's series, never cycled: a seventh series is folded into "Other" by the page. */
export const SERIES_COLORS = [
  'var(--viz-series-1)',
  'var(--viz-series-2)',
  'var(--viz-series-3)',
  'var(--viz-series-4)',
  'var(--viz-series-5)',
  'var(--viz-series-6)',
];
export const MUTED_COLOR = 'var(--viz-muted)';

/**
 * Diverging colour for a lift (a group's share of a value over the corpus share). Binned on
 * log2, so "twice as common" and "half as common" sit the same distance from the grey middle.
 * Within a quarter either way of 1 counts as "about the same".
 */
export function liftColor(lift: number | null): string {
  if (lift === null || !Number.isFinite(lift)) return 'var(--viz-even)';
  if (lift <= 0) return 'var(--viz-less-3)';
  const l = Math.log2(lift);
  if (l <= -1) return 'var(--viz-less-3)';
  if (l <= -0.5) return 'var(--viz-less-2)';
  if (l < -0.32) return 'var(--viz-less-1)';
  if (l <= 0.32) return 'var(--viz-even)';
  if (l < 0.5) return 'var(--viz-more-1)';
  if (l < 1) return 'var(--viz-more-2)';
  return 'var(--viz-more-3)';
}

/** Whether text on a liftColor cell needs to be white. */
export function liftIsDark(lift: number | null): boolean {
  if (lift === null || !Number.isFinite(lift)) return false;
  if (lift <= 0) return true;
  const l = Math.log2(lift);
  return l <= -1 || l >= 1;
}

/** The legend for liftColor, in reading order. */
export const LIFT_LEGEND = [
  { label: 'Half as common or less', color: 'var(--viz-less-3)' },
  { label: 'Less common', color: 'var(--viz-less-2)' },
  { label: 'Slightly less', color: 'var(--viz-less-1)' },
  { label: 'About the same', color: 'var(--viz-even)' },
  { label: 'Slightly more', color: 'var(--viz-more-1)' },
  { label: 'More common', color: 'var(--viz-more-2)' },
  { label: 'Twice as common or more', color: 'var(--viz-more-3)' },
];

/** Rounds an axis maximum up to a clean number (same rule as app-line-chart). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

const INT = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const ONE = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/** A count, or a percentage when `unit` is '%'. */
export function formatValue(value: number, unit = ''): string {
  if (unit === '%') return `${ONE.format(value)}%`;
  return INT.format(value);
}

/** 0-1 as a percentage with one decimal. */
export function formatShare(share: number): string {
  return `${ONE.format(share * 100)}%`;
}
