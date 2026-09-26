import { Component, computed, input } from '@angular/core';

/** A sprite drawn as rows of characters: each character is one cell keyed into `palette`, and
 *  `.` is transparent. Every frame must have the same dimensions. Kept as text rather than an
 *  image file so the art is readable and reviewable in a diff, and ships inside the bundle with no
 *  extra request and nothing for the CSP to think about. */
export interface PixelArt {
  readonly palette: Readonly<Record<string, string>>;
  readonly frames: readonly (readonly string[])[];
}

/** One horizontal run of same-coloured cells, i.e. one `<rect>`. */
export interface PixelRun {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly fill: string;
}

export const TRANSPARENT = '.';

/** Merge each row's runs of one character into a single rect, so a 28x26 sprite is ~150 rects
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

/** Crisp inline-SVG pixel art: one `<rect>` per horizontal run under `shape-rendering: crispEdges`,
 *  scaled by a whole number of CSS pixels per cell so the cells stay square. Decorative only, so
 *  the SVG is `aria-hidden`; anything it illustrates has to be said in text next to it. */
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
  /** CSS pixels per cell. */
  readonly scale = input(3);

  readonly width = computed(() => this.art().frames[0]?.[0]?.length ?? 0);
  readonly height = computed(() => this.art().frames[0]?.length ?? 0);
  readonly pxWidth = computed(() => this.width() * this.scale());
  readonly pxHeight = computed(() => this.height() * this.scale());
  readonly rects = computed(() => {
    const { frames, palette } = this.art();
    if (!frames.length) {
      return [];
    }
    const i = Math.min(Math.max(0, Math.trunc(this.frame())), frames.length - 1);
    return toRects(frames[i], palette);
  });
}
