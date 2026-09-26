import { TRANSPARENT } from '../../shared/pixel-sprite/pixel-sprite';
import { CROC_FRAME, FIRE_CROC, MECHA, MECHA_FRAME } from './team-sprites';

/** The art is hand-typed text, so the cheap mistakes -- a row one cell short, a letter that is not
 *  in the palette -- are caught here rather than as a hole in the picture. */
describe.each([
  ['fire crocodile', FIRE_CROC, CROC_FRAME],
  ['giant robot', MECHA, MECHA_FRAME],
])('%s sprite', (_name, art, frameIndex) => {
  it('has one frame per named pose', () => {
    expect(art.frames).toHaveLength(Object.keys(frameIndex).length);
    expect(Object.values(frameIndex).sort()).toEqual(art.frames.map((_, i) => i));
  });

  it('is the same rectangle in every frame', () => {
    const height = art.frames[0].length;
    const width = art.frames[0][0].length;
    expect(height).toBeGreaterThan(0);
    for (const frame of art.frames) {
      expect(frame).toHaveLength(height);
      for (const row of frame) {
        expect(row).toHaveLength(width);
      }
    }
  });

  it('uses only palette colours and transparency', () => {
    const allowed = new Set([TRANSPARENT, ...Object.keys(art.palette)]);
    for (const frame of art.frames) {
      for (const row of frame) {
        for (const ch of row) {
          expect(allowed.has(ch)).toBe(true);
        }
      }
    }
  });

  it('has a valid hex colour for every palette entry', () => {
    for (const colour of Object.values(art.palette)) {
      expect(colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
