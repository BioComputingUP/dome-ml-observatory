import { TestBed } from '@angular/core/testing';
import { ChartSeries, LineChart } from './line-chart';

const SERIES: ChartSeries[] = [
  { key: 'positive', label: 'AI/ML methods papers', color: 'var(--viz-series-1)', values: [10, 30, 20] },
  { key: 'screened', label: 'All papers screened', color: 'var(--viz-series-2)', values: [40, 60, 50] },
];

function makeChart(series = SERIES, labels: (string | number)[] = [2020, 2021, 2022]) {
  const fixture = TestBed.createComponent(LineChart);
  fixture.componentRef.setInput('series', series);
  fixture.componentRef.setInput('labels', labels);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('LineChart', () => {
  describe('scale', () => {
    it('rounds the axis maximum up to a clean number', () => {
      // 60 would put the top gridline on an arbitrary value; ticks have to read 0/25/50/75/100.
      expect(makeChart().max()).toBe(75);
      expect(makeChart([{ ...SERIES[0], values: [873] }]).max()).toBe(1000);
      expect(makeChart([{ ...SERIES[0], values: [12] }]).max()).toBe(15);
    });

    it('honours an explicit maximum, so a percentage panel tops out at 100', () => {
      const fixture = TestBed.createComponent(LineChart);
      fixture.componentRef.setInput('series', [{ ...SERIES[0], values: [76.5, 80] }]);
      fixture.componentRef.setInput('labels', [2020, 2021]);
      fixture.componentRef.setInput('maxOverride', 100);
      fixture.detectChanges();
      expect(fixture.componentInstance.max()).toBe(100);
    });

    it('never divides by zero when every value is zero', () => {
      const chart = makeChart([{ ...SERIES[0], values: [0, 0, 0] }]);
      expect(chart.max()).toBe(1);
      expect(Number.isFinite(chart.yAt(0))).toBe(true);
    });

    it('puts a single point in the middle rather than at x=0', () => {
      const chart = makeChart([{ ...SERIES[0], values: [5] }], [2020]);
      expect(chart.xAt(0)).toBe(chart.PAD.left + chart.plotW / 2);
    });
  });

  describe('axis labels', () => {
    it('thins crowded year labels but always keeps the most recent one', () => {
      const years = Array.from({ length: 27 }, (_, i) => 2000 + i);
      const chart = makeChart([{ ...SERIES[0], values: years.map(() => 1) }], years);
      const ticks = chart.xTicks();
      expect(ticks.length).toBeLessThanOrEqual(10);
      expect(ticks[ticks.length - 1].label).toBe(2026);
    });

    it('labels every point when there is room', () => {
      expect(makeChart().xTicks().map((t) => t.label)).toEqual([2020, 2021, 2022]);
    });
  });

  describe('readout', () => {
    it('reports every series at the active point, not just the hovered line', () => {
      const chart = makeChart();
      chart.activeIndex.set(1);
      expect(chart.active()?.points.map((p) => [p.label, p.value])).toEqual([
        ['AI/ML methods papers', 30],
        ['All papers screened', 60],
      ]);
    });

    it('has no readout when nothing is active', () => {
      expect(makeChart().active()).toBeNull();
    });

    it('flips the tooltip to the left half past the midpoint, so it stays on the chart', () => {
      const chart = makeChart();
      chart.activeIndex.set(0);
      expect(chart.tooltipSide()).toBe('right');
      chart.activeIndex.set(2);
      expect(chart.tooltipSide()).toBe('left');
    });
  });

  describe('keyboard', () => {
    const press = (chart: LineChart, key: string) => {
      const event = new KeyboardEvent('keydown', { key });
      chart.onKeydown(event);
      return event;
    };

    it('walks points with the arrow keys and clamps at both ends', () => {
      const chart = makeChart();
      chart.activeIndex.set(0);
      press(chart, 'ArrowLeft');
      expect(chart.activeIndex()).toBe(0);
      press(chart, 'ArrowRight');
      press(chart, 'ArrowRight');
      press(chart, 'ArrowRight');
      expect(chart.activeIndex()).toBe(2);
    });

    it('jumps to either end, and Escape dismisses the readout', () => {
      const chart = makeChart();
      press(chart, 'End');
      expect(chart.activeIndex()).toBe(2);
      press(chart, 'Home');
      expect(chart.activeIndex()).toBe(0);
      press(chart, 'Escape');
      expect(chart.activeIndex()).toBeNull();
    });

    it('ignores keys it does not handle, leaving the page scroll alone', () => {
      const chart = makeChart();
      const event = press(chart, 'a');
      expect(event.defaultPrevented).toBe(false);
      expect(chart.activeIndex()).toBeNull();
    });

    it('opens on the most recent point when focused, which is what readers look for first', () => {
      const chart = makeChart();
      chart.onFocus();
      expect(chart.activeIndex()).toBe(2);
    });
  });

  describe('table', () => {
    it('always builds a row per point, so no value is reachable only by hovering', () => {
      expect(makeChart().rows()).toEqual([
        { label: 2020, values: [10, 40] },
        { label: 2021, values: [30, 60] },
        { label: 2022, values: [20, 50] },
      ]);
    });
  });
});
