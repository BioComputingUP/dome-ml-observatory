import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartLink, formatValue } from '../viz';

export interface BumpSeries {
  key: string;
  label: string;
  /** Counts aligned to `labels`; ranks are computed from them. */
  values: number[];
  link?: ChartLink;
}

/** Height of one rank row, in px: the SVG and the label column share it so they line up. */
const ROW = 30;
const W = 600;

/**
 * Rank by year: which of a handful of series leads, and who overtakes whom.
 *
 * Every line is grey until one is picked; picking (hover, focus or tap on its name) draws it in the
 * accent colour with its rank at each year. Names sit in an HTML column beside the plot, ordered by
 * the last year's rank, so they stay legible at any width; the plot itself stretches. A series
 * absent in a year (no papers) has no rank there and its line breaks.
 */
@Component({
  selector: 'app-bump-chart',
  imports: [RouterLink],
  templateUrl: './bump-chart.html',
  styleUrl: './bump-chart.scss',
})
export class BumpChart {
  readonly series = input.required<BumpSeries[]>();
  readonly labels = input.required<number[]>();
  readonly caption = input<string>('');

  readonly ROW = ROW;
  readonly W = W;
  readonly picked = signal<string | null>(null);
  readonly showTable = signal(false);

  /** rank[seriesIndex][yearIndex], 1-based, null when the series has no papers that year. */
  readonly ranks = computed(() => {
    const series = this.series();
    const totals = series.map((s) => s.values.reduce((a, b) => a + b, 0));
    const ranks: (number | null)[][] = series.map(() => []);
    this.labels().forEach((_, i) => {
      series
        .map((s, k) => ({ k, v: s.values[i] ?? 0 }))
        .filter((e) => e.v > 0)
        .sort((a, b) => b.v - a.v || totals[b.k] - totals[a.k])
        .forEach((e, r) => (ranks[e.k][i] = r + 1));
      series.forEach((_, k) => {
        if (ranks[k][i] === undefined) ranks[k][i] = null;
      });
    });
    return ranks;
  });

  readonly height = computed(() => this.series().length * ROW);

  private x(i: number): number {
    const n = this.labels().length;
    return n <= 1 ? W / 2 : 8 + (i / (n - 1)) * (W - 16);
  }

  private y(rank: number): number {
    return (rank - 0.5) * ROW;
  }

  readonly lines = computed(() =>
    this.series().map((s, k) => {
      let d = '';
      let pen = false;
      this.ranks()[k].forEach((r, i) => {
        if (r === null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${this.x(i)} ${this.y(r)} `;
        pen = true;
      });
      const points = this.ranks()[k]
        .map((r, i) => (r === null ? null : { x: this.x(i), y: this.y(r), r }))
        .filter((p): p is { x: number; y: number; r: number } => p !== null);
      return { key: s.key, d: d.trim(), points };
    }),
  );

  /** Names in the order of the last year's rank; unranked last. */
  readonly names = computed(() => {
    const last = this.labels().length - 1;
    return this.series()
      .map((s, k) => ({ ...s, rank: this.ranks()[k][last] ?? null, first: this.firstRank(k) }))
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  });

  private firstRank(k: number): { rank: number; year: number } | null {
    const i = this.ranks()[k].findIndex((r) => r !== null);
    return i < 0 ? null : { rank: this.ranks()[k][i]!, year: this.labels()[i] };
  }

  readonly readout = computed(() => {
    const key = this.picked();
    const s = this.names().find((n) => n.key === key);
    if (!s) return null;
    const last = this.labels()[this.labels().length - 1];
    const now = s.rank ? `${ordinal(s.rank)} in ${last}` : `not used in ${last}`;
    const then = s.first ? `${ordinal(s.first.rank)} in ${s.first.year}` : '';
    const total = s.values.reduce((a, b) => a + b, 0);
    return `${s.label}: ${then ? `${then}, ` : ''}${now}. ${formatValue(total)} papers in these years.`;
  });

  readonly xTicks = computed(() => {
    const labels = this.labels();
    // Few labels: on a phone the plot is a third of the screen wide. The last year always shows,
    // and a thinned label too close to it gives way.
    const n = labels.length;
    const stride = Math.max(1, Math.ceil(n / 4));
    return labels
      .map((label, i) => ({ label, left: (this.x(i) / W) * 100, i }))
      .filter(({ i }) => i === n - 1 || (i % stride === 0 && n - 1 - i >= stride));
  });

  count(n: number): string {
    return formatValue(n);
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
