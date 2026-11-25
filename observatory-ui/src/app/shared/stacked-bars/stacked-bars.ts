import { Component, computed, input, signal } from '@angular/core';
import { MUTED_COLOR, SERIES_COLORS, formatShare, formatValue } from '../viz';

export interface StackSeries {
  key: string;
  label: string;
  /** Counts, aligned to `labels`. */
  values: number[];
}

/**
 * One 100% stacked column per year: how a year's papers split between a handful of categories.
 *
 * Colours follow the series' position in the input (the validated slot order in styles.scss), and
 * a series keyed `other` is always the muted grey, so the page decides the order once and a filter
 * never repaints a category. Up to six coloured series; the page folds the rest into `other`.
 * Each column shows its counts on hover, focus or tap; the table holds them all.
 */
@Component({
  selector: 'app-stacked-bars',
  templateUrl: './stacked-bars.html',
  styleUrl: './stacked-bars.scss',
})
export class StackedBars {
  readonly series = input.required<StackSeries[]>();
  readonly labels = input.required<number[]>();
  readonly caption = input<string>('');
  /** Columns with fewer papers than this are drawn faded: a share of six papers is noise. */
  readonly minTotal = input<number>(20);
  readonly lastPartial = input<boolean>(false);

  readonly showTable = signal(false);
  readonly activeIndex = signal<number | null>(null);

  readonly colored = computed(() => {
    let slot = 0;
    return this.series().map((s) => ({
      ...s,
      color: s.key === 'other' ? MUTED_COLOR : SERIES_COLORS[slot++ % SERIES_COLORS.length],
    }));
  });

  readonly columns = computed(() => {
    const series = this.colored();
    return this.labels().map((label, i) => {
      const total = series.reduce((a, s) => a + (s.values[i] ?? 0), 0);
      return {
        label,
        i,
        total,
        thin: total < this.minTotal(),
        partial: this.lastPartial() && i === this.labels().length - 1,
        // Drawn bottom-up in series order, so the first series sits on the baseline.
        segments: series
          .map((s) => ({
            key: s.key,
            label: s.label,
            color: s.color,
            value: s.values[i] ?? 0,
            share: total ? (s.values[i] ?? 0) / total : 0,
          }))
          .filter((seg) => seg.value > 0),
      };
    });
  });

  /** Year labels thinned to about eight, always keeping the last. */
  showLabel(i: number): boolean {
    const n = this.labels().length;
    const stride = Math.max(1, Math.ceil(n / 8));
    // The last year always shows; a thinned label too close to it gives way.
    if (i === n - 1) return true;
    return i % stride === 0 && n - 1 - i >= stride;
  }

  readonly active = computed(() => {
    const i = this.activeIndex();
    return i === null ? null : (this.columns()[i] ?? null);
  });

  /** Keeps the tooltip on the chart: anchored left of the column past the middle. */
  readonly tooltipLeft = computed(() => {
    const i = this.activeIndex();
    const n = this.labels().length;
    if (i === null || !n) return null;
    return ((i + 0.5) / n) * 100;
  });

  onKeydown(event: KeyboardEvent): void {
    const n = this.labels().length;
    if (!n) return;
    const current = this.activeIndex() ?? n - 1;
    let next: number | null;
    if (event.key === 'ArrowRight') next = Math.min(n - 1, current + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = n - 1;
    else if (event.key === 'Escape') next = null;
    else return;
    event.preventDefault();
    this.activeIndex.set(next);
  }

  share(value: number): string {
    return formatShare(value);
  }

  count(value: number): string {
    return formatValue(value);
  }
}
