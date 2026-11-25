import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartLink, formatValue, niceMax } from '../viz';

export interface MultiplePanel {
  key: string;
  label: string;
  /** Aligned to `labels`. */
  values: number[];
  /** A short line under the label, e.g. "12,301 papers". */
  note?: string;
  link?: ChartLink;
}

const W = 240;
const H = 84;
const PAD = { top: 6, right: 6, bottom: 4, left: 6 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/**
 * A grid of small line charts, one per series.
 *
 * How the Data & Models pages show 16 model families or a dozen resources over time without 16
 * colours on one tangle of lines: every panel is the same hue and the panel's title names it.
 *
 * Two scales, switched under the grid. "Each its own" (the default) fits every panel to its own
 * peak, so the shape of a small series is readable; the peak is printed on the panel, so a
 * reader never mistakes a 0.3% line for a 40% one. "Same scale" puts every panel on one axis, so a
 * panel that looks twice as high is twice as high.
 *
 * Hover or arrow keys on a panel show that year's value in the panel header; the table under the
 * grid holds every value. When the last year is still filling, its point is drawn hollow.
 */
@Component({
  selector: 'app-small-multiples',
  imports: [RouterLink],
  templateUrl: './small-multiples.html',
  styleUrl: './small-multiples.scss',
})
export class SmallMultiples {
  readonly panels = input.required<MultiplePanel[]>();
  readonly labels = input.required<number[]>();
  readonly caption = input<string>('');
  /** '%' formats values as percentages. */
  readonly unit = input<string>('');
  readonly lastPartial = input<boolean>(false);
  readonly color = input<string>('var(--viz-series-2)');

  readonly W = W;
  readonly H = H;
  readonly showTable = signal(false);
  readonly shared = signal(false);
  /** Panel key and year index under the cursor. */
  readonly active = signal<{ key: string; i: number } | null>(null);

  readonly max = computed(() =>
    niceMax(Math.max(0, ...this.panels().flatMap((p) => p.values))),
  );

  private panelMax(values: number[]): number {
    return this.shared() ? this.max() : niceMax(Math.max(0, ...values));
  }

  readonly drawn = computed(() => {
    const n = this.labels().length;
    const x = (i: number) => PAD.left + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
    const partial = this.lastPartial() && n > 1;
    return this.panels().map((p) => {
      const max = this.panelMax(p.values);
      const y = (v: number) => PAD.top + PLOT_H - (max ? v / max : 0) * PLOT_H;
      const full = partial ? p.values.slice(0, -1) : p.values;
      const line = full.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ');
      const area = full.length
        ? `${line} L${x(full.length - 1)} ${PAD.top + PLOT_H} L${x(0)} ${PAD.top + PLOT_H} Z`
        : '';
      const last = p.values.length - 1;
      return {
        ...p,
        line,
        area,
        // The still-filling year joins the line dashed, so it never reads as a real drop.
        tail: partial && last > 0 ? `M${x(last - 1)} ${y(p.values[last - 1])} L${x(last)} ${y(p.values[last])}` : '',
        endX: x(last),
        endY: y(p.values[last] ?? 0),
        top: formatValue(max, this.unit()),
        x,
        y,
      };
    });
  });

  /** The header readout for a panel: the hovered year, or the latest full year. */
  readout(panel: MultiplePanel): string {
    const labels = this.labels();
    const a = this.active();
    let i = a?.key === panel.key ? a.i : labels.length - 1;
    if (a?.key !== panel.key && this.lastPartial() && labels.length > 1) i -= 1;
    if (i < 0) return '';
    return `${labels[i]}: ${formatValue(panel.values[i] ?? 0, this.unit())}`;
  }

  activeX(panel: { key: string; x: (i: number) => number }): number | null {
    const a = this.active();
    return a?.key === panel.key ? panel.x(a.i) : null;
  }

  onPointerMove(event: PointerEvent, key: string, host: Element): void {
    const box = host.getBoundingClientRect();
    const n = this.labels().length;
    if (!box.width || !n) return;
    const ratio = (((event.clientX - box.left) / box.width) * W - PAD.left) / PLOT_W;
    this.active.set({ key, i: Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))) });
  }

  onKeydown(event: KeyboardEvent, key: string): void {
    const n = this.labels().length;
    if (!n) return;
    const a = this.active();
    const current = a?.key === key ? a.i : n - 1;
    let next: number;
    if (event.key === 'ArrowRight') next = Math.min(n - 1, current + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = n - 1;
    else if (event.key === 'Escape') {
      this.active.set(null);
      return;
    } else return;
    event.preventDefault();
    this.active.set({ key, i: next });
  }

  clear(): void {
    this.active.set(null);
  }

  format(value: number): string {
    return formatValue(value, this.unit());
  }
}
