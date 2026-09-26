import { arcPoints, bobPoints, keyframes, splitAtApex, translate } from './sprite-motion';

describe('translate', () => {
  it('rounds to whole pixels and adds a rotation only when asked', () => {
    expect(translate({ x: 10.4, y: -3.6 })).toBe('translate(10px, -4px)');
    expect(translate({ x: 1, y: 2 }, 0)).toBe('translate(1px, 2px) rotate(0deg)');
    expect(translate({ x: 1, y: 2 }, -14)).toBe('translate(1px, 2px) rotate(-14deg)');
  });
});

describe('arcPoints', () => {
  const from = { x: 0, y: 100 };
  const to = { x: 200, y: 100 };

  it('starts and ends exactly where asked', () => {
    const points = arcPoints(from, to, 50);
    expect(points[0]).toEqual(from);
    expect(points[points.length - 1]).toEqual(to);
  });

  it('peaks `lift` pixels above the straight line, at the midpoint', () => {
    const points = arcPoints(from, to, 50, 16);
    expect(points[8]).toEqual({ x: 100, y: 50 });
    expect(Math.min(...points.map((p) => p.y))).toBe(50);
  });

  it('is a straight line when lift is zero', () => {
    const ys = arcPoints({ x: 0, y: 0 }, { x: 10, y: 20 }, 0, 4).map((p) => p.y);
    expect(ys).toEqual([0, 5, 10, 15, 20]);
  });
});

describe('splitAtApex', () => {
  it('cuts at the highest point and both halves share it', () => {
    const points = arcPoints({ x: 0, y: 100 }, { x: 100, y: 100 }, 40, 10);
    const [rise, fall] = splitAtApex(points);
    expect(rise[rise.length - 1]).toEqual(fall[0]);
    expect(rise[rise.length - 1].y).toBe(60);
    expect([...rise, ...fall.slice(1)]).toEqual(points);
  });

  it('falls back to the middle when there is no interior peak', () => {
    const [a, b] = splitAtApex(arcPoints({ x: 0, y: 0 }, { x: 10, y: 10 }, 0, 4));
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
  });
});

describe('bobPoints', () => {
  it('oscillates around the base and comes back to it', () => {
    const base = { x: 5, y: 50 };
    const points = bobPoints(base, 6, 2, 4);
    expect(points).toHaveLength(9);
    expect(points[0]).toEqual(base);
    expect(points[points.length - 1].y).toBeCloseTo(50);
    expect(points[1].y).toBeCloseTo(44);
    expect(points[3].y).toBeCloseTo(56);
    expect(points.every((p) => p.x === 5)).toBe(true);
  });
});

describe('keyframes', () => {
  it('turns points into transform keyframes', () => {
    expect(keyframes([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toEqual([
      { transform: 'translate(1px, 2px)' },
      { transform: 'translate(3px, 4px)' },
    ]);
  });
});
