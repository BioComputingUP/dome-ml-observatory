import { TestBed } from '@angular/core/testing';
import { PixelArt, PixelSprite, toPaths, toRects } from './pixel-sprite';

const PALETTE = { R: '#ff0000', G: '#00ff00' };

describe('toRects', () => {
  it('merges a row of one character into a single run and skips transparent cells', () => {
    expect(toRects(['.RR.', 'RRRR'], PALETTE)).toEqual([
      { x: 1, y: 0, width: 2, fill: '#ff0000' },
      { x: 0, y: 1, width: 4, fill: '#ff0000' },
    ]);
  });

  it('starts a new run where the colour changes', () => {
    expect(toRects(['RRGG'], PALETTE)).toEqual([
      { x: 0, y: 0, width: 2, fill: '#ff0000' },
      { x: 2, y: 0, width: 2, fill: '#00ff00' },
    ]);
  });

  it('produces nothing for blank rows or characters outside the palette', () => {
    expect(toRects(['....', 'XXXX'], PALETTE)).toEqual([]);
  });
});

describe('toPaths', () => {
  it('gathers the runs of each colour into one path, in first-seen order', () => {
    expect(toPaths(toRects(['RRGG', 'RR..'], PALETTE))).toEqual([
      { fill: '#ff0000', d: 'M0 0h2v1h-2zM0 1h2v1h-2z' },
      { fill: '#00ff00', d: 'M2 0h2v1h-2z' },
    ]);
  });

  it('produces nothing for no runs', () => {
    expect(toPaths([])).toEqual([]);
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

  it('sizes the SVG from the grid and the scale, crisp at a whole number of pixels per cell', () => {
    const svg = render(0).nativeElement.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 4 2');
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('8');
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges');
  });

  it('anti-aliases a fractional scale and sizes it to two decimals', () => {
    const svg = render(0, 0.6).nativeElement.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('2.4');
    expect(svg.getAttribute('height')).toBe('1.2');
    expect(svg.getAttribute('shape-rendering')).toBe('geometricPrecision');
  });

  it('draws one path per colour of the chosen frame', () => {
    const fixture = render(0);
    const paths = () => Array.from(fixture.nativeElement.querySelectorAll('path') as NodeListOf<SVGPathElement>);
    expect(paths().map((p) => p.getAttribute('fill'))).toEqual(['#ff0000', '#00ff00']);

    fixture.componentRef.setInput('frame', 1);
    fixture.detectChanges();
    expect(paths()).toHaveLength(1);
    expect(paths()[0].getAttribute('d')).toBe('M0 0h4v1h-4zM0 1h4v1h-4z');
  });

  it('clamps an out-of-range frame instead of drawing nothing', () => {
    const fixture = render(7);
    expect(fixture.nativeElement.querySelectorAll('path')).toHaveLength(1);
  });

  it('is hidden from assistive technology', () => {
    const svg = render(0).nativeElement.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
