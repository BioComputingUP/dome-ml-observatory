import { TestBed } from '@angular/core/testing';
import { PixelArt, PixelSprite, toRects } from './pixel-sprite';

const PALETTE = { R: '#ff0000', G: '#00ff00' };

describe('toRects', () => {
  it('merges a row of one character into a single rect and skips transparent cells', () => {
    expect(toRects(['.RR.', 'RRRR'], PALETTE)).toEqual([
      { x: 1, y: 0, width: 2, fill: '#ff0000' },
      { x: 0, y: 1, width: 4, fill: '#ff0000' },
    ]);
  });

  it('starts a new rect where the colour changes', () => {
    expect(toRects(['RRGG'], PALETTE)).toEqual([
      { x: 0, y: 0, width: 2, fill: '#ff0000' },
      { x: 2, y: 0, width: 2, fill: '#00ff00' },
    ]);
  });

  it('produces nothing for blank rows or characters outside the palette', () => {
    expect(toRects(['....', 'XXXX'], PALETTE)).toEqual([]);
  });
});

describe('PixelSprite', () => {
  const art: PixelArt = {
    palette: PALETTE,
    frames: [
      ['RR..', '..GG'],
      ['RRRR', 'RRRR'],
    ],
  };

  function render(frame: number, scale = 4) {
    const fixture = TestBed.createComponent(PixelSprite);
    fixture.componentRef.setInput('art', art);
    fixture.componentRef.setInput('frame', frame);
    fixture.componentRef.setInput('scale', scale);
    fixture.detectChanges();
    return fixture;
  }

  it('sizes the SVG from the grid and the scale, in whole cells', () => {
    const svg = render(0).nativeElement.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 4 2');
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('8');
  });

  it('draws one rect per run of the chosen frame', () => {
    const fixture = render(0);
    const rects = () => Array.from(fixture.nativeElement.querySelectorAll('rect') as NodeListOf<SVGRectElement>);
    expect(rects().map((r) => r.getAttribute('fill'))).toEqual(['#ff0000', '#00ff00']);

    fixture.componentRef.setInput('frame', 1);
    fixture.detectChanges();
    expect(rects()).toHaveLength(2);
    expect(rects().map((r) => r.getAttribute('width'))).toEqual(['4', '4']);
  });

  it('clamps an out-of-range frame instead of drawing nothing', () => {
    const fixture = render(7);
    expect(fixture.nativeElement.querySelectorAll('rect')).toHaveLength(2);
  });

  it('is hidden from assistive technology', () => {
    const svg = render(0).nativeElement.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
