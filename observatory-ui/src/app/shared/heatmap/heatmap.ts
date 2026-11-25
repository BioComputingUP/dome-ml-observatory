import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartLink, LIFT_LEGEND, formatShare, formatValue, liftColor, liftIsDark } from '../viz';

export interface HeatCell {
  value: string;
  count: number;
  share: number;
  lift: number | null;
}

export interface HeatRow {
  key: string;
  label: string;
  /** The row's base, e.g. its number of enriched papers. */
  total: number;
  cells: HeatCell[];
  /** Highlights a row the reader picked (a searched-for journal). */
  highlight?: boolean;
  link?: ChartLink;
}

export interface HeatColumn {
  key: string;
  label: string;
}

/**
 * Rows by columns, each cell shaded by lift: how much more or less common the column's value is in
 * this row than across the whole. Blue is less, orange more, grey about the same; the number in
 * the cell is the row's share, so the colour says "unusual" and the figure says "how much".
 *
 * Drawn as an HTML table rather than SVG: it is already the accessible table, every cell is a
 * real link to the matching search, and on a phone the grid scrolls sideways under sticky row
 * labels instead of shrinking past legibility.
 */
@Component({
  selector: 'app-heatmap',
  imports: [RouterLink],
  templateUrl: './heatmap.html',
  styleUrl: './heatmap.scss',
})
export class Heatmap {
  readonly rows = input.required<HeatRow[]>();
  readonly columns = input.required<HeatColumn[]>();
  readonly caption = input<string>('');
  /** What a row's total counts, for the readout: "papers", "enriched papers". */
  readonly unitLabel = input<string>('papers');
  /** Builds the link for one cell; null leaves the cell plain. */
  readonly cellLink = input<((row: HeatRow, column: HeatColumn) => ChartLink | null) | null>(null);
  /** A cell resting on fewer papers than this keeps its figure but gets no colour: a lift drawn
   *  from one or two papers is noise. */
  readonly minCount = input<number>(5);

  readonly legend = LIFT_LEGEND;
  readonly active = signal<{ row: HeatRow; column: HeatColumn; cell: HeatCell } | null>(null);

  readonly grid = computed(() =>
    this.rows().map((row) => {
      const byValue = new Map(row.cells.map((c) => [c.value, c]));
      return {
        row,
        cells: this.columns().map((column) => {
          const cell = byValue.get(column.key) ?? { value: column.key, count: 0, share: 0, lift: null };
          const shaded = cell.count >= this.minCount();
          return {
            column,
            cell,
            color: shaded ? liftColor(cell.lift) : 'transparent',
            dark: shaded ? liftIsDark(cell.lift) : false,
            faint: !shaded,
            text: cell.count ? formatShare(cell.share).replace('.0%', '%') : '',
            link: this.cellLink()?.(row, column) ?? null,
          };
        }),
      };
    }),
  );

  describe(row: HeatRow, column: HeatColumn, cell: HeatCell): string {
    const base = `${row.label}, ${column.label}: ${formatValue(cell.count)} of ${formatValue(row.total)} ${this.unitLabel()} (${formatShare(cell.share)})`;
    if (cell.count < this.minCount() || cell.lift === null) return base;
    const lift = cell.lift;
    const near = lift > 0.87 && lift < 1.15;
    return `${base}, ${near ? 'about the overall share' : `${lift.toFixed(1)} times the overall share`}`;
  }

  count(n: number): string {
    return formatValue(n);
  }
}
