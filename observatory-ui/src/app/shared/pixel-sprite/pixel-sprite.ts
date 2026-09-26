import { Component, computed, input } from '@angular/core';

/** A sprite drawn as rows of characters: each character is one cell keyed into `palette`, and
 *  `.` is transparent. Every frame must have the same dimensions. Kept as text rather than an
 *  image file so the art is readable and reviewable in a diff, and ships inside the bundle with no
 *  extra request and nothing for the CSP to think about. */
export interface PixelArt {
  readonly palette: Readonly<Record<string, string>>;
  readonly frames: readonly (readonly string[])[];
}

/** One horizontal run of same-coloured cells: one cell tall, `width` cells wide. */
export interface PixelRun {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly fill: string;
}

/** Every run of one colour, as a single SVG path. */
export interface PixelPath {
  readonly fill: string;
  readonly d: string;
}

export const TRANSPARENT = '.';

/** Merge each row's runs of one character into a single run, so a 28x26 sprite is ~150 runs
 *  rather than ~500. A character missing from the palette is skipped like a transparent one, so a
 *  typo in the art degrades to a hole rather than a black blot. */
export function toRects(rows: readonly string[], palette: Readonly<Record<string, string>>): PixelRun[] {
  const runs: PixelRun[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) {
        end++;
      }
      const fill = palette[ch];
      if (ch !== TRANSPARENT && fill) {
        runs.push({ x, y, width: end - x, fill });
      }
      x = end;
    }
  });
  return runs;
}

/** Gather all of one colour's runs into one path (`M x y h w v 1 h -w z` per run), in the order
 *  the colours first appear. One path per colour rather than one rect per run matters at a
 *  fractional scale: a rasteriser computes coverage for a whole path at once, so cells of one
 *  colour that abut still meet at full coverage, where separately anti-aliased rects would leave a
 *  faint seam along every shared edge. */
export function toPaths(runs: readonly PixelRun[]): PixelPath[] {
  const byFill = new Map<string, string[]>();
  for (const r of runs) {
    const parts = byFill.get(r.fill) ?? [];
    parts.push(`M${r.x} ${r.y}h${r.width}v1h-${r.width}z`);
    byFill.set(r.fill, parts);
  }
  return [...byFill].map(([fill, parts]) => ({ fill, d: parts.join('') }));
}

/** `41 * 0.6` is 24.599999999999998 in floating point; the attribute wants 24.6. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Inline-SVG pixel art: one `<path>` per palette colour. At a whole number of CSS pixels per
 *  cell the SVG is drawn with `shape-rendering: crispEdges`, so every cell is a square block of
 *  screen pixels; at a fractional scale it is anti-aliased instead, because snapping 0.6px rows to
 *  whole pixels would drop some rows altogether. Decorative only, so the SVG is `aria-hidden`;
 *  anything it illustrates has to be said in text next to it. */
@Component({
  selector: 'app-pixel-sprite',
  imports: [],
  templateUrl: './pixel-sprite.html',
  styleUrl: './pixel-sprite.scss',
})
export class PixelSprite {
  readonly art = input.required<PixelArt>();
  /** Index into `art.frames`; out-of-range values clamp to the nearest frame. */
  readonly frame = input(0);
  /** CSS pixels per cell. A whole number keeps the pixels crisp; a fraction shrinks smoothly. */
  readonly scale = input(3);

  readonly width = computed(() => this.art().frames[0]?.[0]?.length ?? 0);
  readonly height = computed(() => this.art().frames[0]?.length ?? 0);
  readonly pxWidth = computed(() => round2(this.width() * this.scale()));
  readonly pxHeight = computed(() => round2(this.height() * this.scale()));
  readonly rendering = computed(() => (Number.isInteger(this.scale()) ? 'crispEdges' : 'geometricPrecision'));
  readonly paths = computed(() => {
    const { frames, palette } = this.art();
    if (!frames.length) {
      return [];
    }
    const i = Math.min(Math.max(0, Math.trunc(this.frame())), frames.length - 1);
    return toPaths(toRects(frames[i], palette));
  });
}
