import { Component, computed, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface ChartSeries {
  /** Stable key, used for tracking and for the table's column header. */
  key: string;
  label: string;
  /** One of the validated --viz-series-* tokens. See styles.scss. */
  color: string;
  values: number[];
}

/** Logical drawing space. The SVG scales to its container via viewBox, so these are not pixels --
 *  they are the coordinate system every computed path below is expressed in. */
const W = 860;
const H = 300;
const PAD = { top: 16, right: 20, bottom: 34, left: 56 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Rounds an axis maximum up to a clean number, so ticks read 0 / 1,000 / 2,000 rather than
 *  0 / 873 / 1,746. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

/**
 * A small multi-series line chart, drawn as inline SVG.
 *
 * Hand-rolled rather than pulling in a charting library: this repo has no chart dependency and
 * already draws its figures this way (the About pipeline, the home constellation), and the
 * requirement here is one chart type with a fixed shape, not a plotting toolkit.
 *
 * Deliberately single-axis. Two measures on two y-scales is the most common way a chart lies, so
 * counts and percentages are separate instances of this component stacked vertically, never one
 * chart with two axes.
 *
 * Every value is reachable three ways -- the axis, the hover/focus readout, and a table the
 * component always renders (visually hidden by default, revealed by [showTable]). The tooltip
 * enhances; it never gates.
 */
@Component({
  selector: 'app-line-chart',
  imports: [DecimalPipe],
  templateUrl: './line-chart.html',
  styleUrl: './line-chart.scss',
})
export class LineChart {
  readonly series = input.required<ChartSeries[]>();
  /** X labels, one per point -- years here. */
  readonly labels = input.required<(string | number)[]>();
  readonly caption = input<string>('');
  /** Appended to every rendered value, e.g. '%'. */
  readonly unit = input<string>('');
  /** Fixes the y-axis top (used by the share panel, where 100 is the meaningful ceiling). */
  readonly maxOverride = input<number | null>(null);
  /** Reveals the data table that is otherwise present for assistive tech only. */
  readonly showTable = input<boolean>(false);
  readonly tableLabel = input<string>('Year');

  readonly W = W;
  readonly H = H;
  readonly PAD = PAD;
  readonly plotW = PLOT_W;
  readonly plotH = PLOT_H;

  /** Index under the pointer/keyboard cursor, or null when neither is on the chart. */
  readonly activeIndex = signal<number | null>(null);

  readonly count = computed(() => this.labels().length);

  readonly max = computed(() => {
    const override = this.maxOverride();
    if (override !== null) return override;
    const highest = Math.max(0, ...this.series().flatMap((s) => s.values));
    return niceMax(highest);
  });

  /** Five gridlines including both ends -- enough to read a value off, few enough to stay quiet. */
  readonly yTicks = computed(() => {
    const max = this.max();
    return [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      value: max * f,
      y: PAD.top + PLOT_H - f * PLOT_H,
    }));
  });

  /** Year labels, thinned so they never collide: a 27-year series at this width fits ~9. */
  readonly xTicks = computed(() => {
    const labels = this.labels();
    if (!labels.length) return [];
    const stride = Math.max(1, Math.ceil(labels.length / 9));
    return labels
      .map((label, i) => ({ label, i, x: this.xAt(i) }))
      // Always keep the last point: the most recent year is the one readers look for first.
      .filter(({ i }) => i % stride === 0 || i === labels.length - 1);
  });

  readonly paths = computed(() =>
    this.series().map((s) => ({
      ...s,
      d: s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${this.xAt(i)} ${this.yAt(v)}`).join(' '),
      // The end marker doubles as the anchor for the direct label -- see the template.
      endX: this.xAt(s.values.length - 1),
      endY: this.yAt(s.values[s.values.length - 1] ?? 0),
    })),
  );

  /** Crosshair position and the per-series readout for the active point. */
  readonly active = computed(() => {
    const i = this.activeIndex();
    if (i === null || i < 0 || i >= this.count()) return null;
    return {
      index: i,
      label: this.labels()[i],
      x: this.xAt(i),
      // Percentages of the logical box, so the HTML tooltip tracks the SVG however it is scaled.
      xPercent: (this.xAt(i) / W) * 100,
      points: this.series().map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        value: s.values[i] ?? 0,
        y: this.yAt(s.values[i] ?? 0),
      })),
    };
  });

  /** Keeps the tooltip inside the chart at both ends rather than letting it hang off the edge. */
  readonly tooltipSide = computed(() => ((this.active()?.xPercent ?? 0) > 60 ? 'left' : 'right'));

  readonly rows = computed(() =>
    this.labels().map((label, i) => ({
      label,
      values: this.series().map((s) => s.values[i] ?? 0),
    })),
  );

  xAt(i: number): number {
    const count = this.count();
    if (count <= 1) return PAD.left + PLOT_W / 2;
    return PAD.left + (i / (count - 1)) * PLOT_W;
  }

  yAt(value: number): number {
    const max = this.max();
    return PAD.top + PLOT_H - (max ? value / max : 0) * PLOT_H;
  }

  /** Maps a pointer position to the nearest point. Readers aim at a year, not at a 2px line, so
   *  the whole plot area is the hit target and the crosshair snaps.
   *
   *  `host` is typed as Element, not SVGSVGElement: Angular's template type-checker infers an
   *  #ref on an <svg> as HTMLElement, and getBoundingClientRect is all this needs. */
  onPointerMove(event: PointerEvent, host: Element): void {
    const box = host.getBoundingClientRect();
    if (!box.width) return;
    const x = ((event.clientX - box.left) / box.width) * W;
    const count = this.count();
    if (count <= 1) {
      this.activeIndex.set(count - 1);
      return;
    }
    const ratio = (x - PAD.left) / PLOT_W;
    this.activeIndex.set(Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1)))));
  }

  clearActive(): void {
    this.activeIndex.set(null);
  }

  /** Same readout on keyboard as on hover -- the chart is focusable and arrow keys walk it. */
  onKeydown(event: KeyboardEvent): void {
    const count = this.count();
    if (!count) return;
    const current = this.activeIndex();
    let next: number | null;
    if (event.key === 'ArrowRight') next = current === null ? 0 : Math.min(count - 1, current + 1);
    else if (event.key === 'ArrowLeft') next = current === null ? count - 1 : Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else if (event.key === 'Escape') next = null;
    else return;
    event.preventDefault();
    this.activeIndex.set(next);
  }

  onFocus(): void {
    if (this.activeIndex() === null && this.count()) this.activeIndex.set(this.count() - 1);
  }
}
