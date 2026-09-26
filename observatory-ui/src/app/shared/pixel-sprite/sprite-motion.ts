/** Pure geometry for moving a sprite around with the Web Animations API. Nothing here touches the
 *  DOM, so it is unit-tested directly and the component that uses it stays short. */

/** A position in CSS pixels. Viewport space, when it comes from getBoundingClientRect(). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A `transform` value for one point, rounded to whole pixels: `shape-rendering: crispEdges`
 *  keeps the SVG's own edges sharp, but a sub-pixel translate would blur them again. A rotation
 *  is appended only when asked for, and then always, because two keyframes interpolate cleanly
 *  only when their transform lists have the same shape. */
export function translate(p: Point, rotateDeg?: number): string {
  const t = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  return rotateDeg === undefined ? t : `${t} rotate(${rotateDeg}deg)`;
}

/** One keyframe per point, for `element.animate()` with linear easing. */
export function keyframes(points: readonly Point[], rotateDeg?: number): Keyframe[] {
  return points.map((p) => ({ transform: translate(p, rotateDeg) }));
}

/** Points along a parabola from `from` to `to` whose apex sits `lift` px above the straight line
 *  between them, sampled evenly in time. Screen y grows downward, so "above" means smaller y. */
export function arcPoints(from: Point, to: Point, lift: number, samples = 16): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    points.push({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t - 4 * lift * t * (1 - t),
    });
  }
  return points;
}

/** Split a path at its highest point into two runs that share that point, so a caller can do
 *  something between them (say, change which layer the sprite paints on) while it is in the air.
 *  A path with no interior peak is split in the middle instead, so both halves can still animate. */
export function splitAtApex(points: readonly Point[]): [Point[], Point[]] {
  let apex = 0;
  points.forEach((p, i) => {
    if (p.y < points[apex].y) {
      apex = i;
    }
  });
  if (apex === 0 || apex === points.length - 1) {
    apex = Math.floor(points.length / 2);
  }
  return [points.slice(0, apex + 1), points.slice(apex)];
}

/** A gentle up-and-down hover around `base`: `cycles` full sine waves of `amplitude` px, ending
 *  back at `base`. */
export function bobPoints(base: Point, amplitude: number, cycles: number, samplesPerCycle = 12): Point[] {
  const total = cycles * samplesPerCycle;
  const points: Point[] = [];
  for (let i = 0; i <= total; i++) {
    points.push({ x: base.x, y: base.y - amplitude * Math.sin((2 * Math.PI * i) / samplesPerCycle) });
  }
  return points;
}
