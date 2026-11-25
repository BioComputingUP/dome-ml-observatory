import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartLink, formatShare, formatValue } from '../viz';

export interface BarSegment {
  key: string;
  value: number;
}

export interface RankedBar {
  key: string;
  label: string;
  /** Short tags beside the label (designations). */
  badges?: string[];
  /** Segments, in the order of `segmentLegend`; they sum to the bar's length. */
  segments: BarSegment[];
  /** The bar's label link (the resource's detail). */
  link?: ChartLink;
  /** A second, explicit link at the row's end (the papers in Search). */
  searchLink?: ChartLink;
  selected?: boolean;
}

export interface SegmentKey {
  key: string;
  label: string;
  color: string;
}

/**
 * A ranked list of horizontal bars, each split into a few segments, with the total at the end.
 * Plain HTML: the label is the row's link, the bar is decoration with the numbers spelled out
 * beside it and in each row's accessible name, so nothing depends on reading a length.
 */
@Component({
  selector: 'app-ranked-bars',
  imports: [RouterLink],
  templateUrl: './ranked-bars.html',
  styleUrl: './ranked-bars.scss',
})
export class RankedBars {
  readonly rows = input.required<RankedBar[]>();
  readonly segmentLegend = input.required<SegmentKey[]>();
  readonly caption = input<string>('');
  readonly unitLabel = input<string>('papers');

  readonly max = computed(() =>
    Math.max(1, ...this.rows().map((r) => r.segments.reduce((a, s) => a + s.value, 0))),
  );

  readonly drawn = computed(() => {
    const legend = new Map(this.segmentLegend().map((k) => [k.key, k]));
    const max = this.max();
    return this.rows().map((row) => {
      const total = row.segments.reduce((a, s) => a + s.value, 0);
      return {
        ...row,
        total,
        segments: row.segments
          .filter((s) => s.value > 0)
          .map((s) => ({
            ...s,
            width: (s.value / max) * 100,
            color: legend.get(s.key)?.color ?? 'var(--viz-muted)',
            label: legend.get(s.key)?.label ?? s.key,
          })),
        description:
          `${row.label}: ${formatValue(total)} ${this.unitLabel()}` +
          row.segments
            .filter((s) => s.value > 0)
            .map((s) => `, ${formatValue(s.value)} ${legend.get(s.key)?.label.toLowerCase() ?? s.key} (${formatShare(total ? s.value / total : 0)})`)
            .join(''),
      };
    });
  });

  count(n: number): string {
    return formatValue(n);
  }
}
