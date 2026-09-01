import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FacetPanel } from './facet-panel';
import { SearchFilters } from '../../core/records.service';
import { FacetStats } from '../../core/facet-stats.model';

/** A complete, valid FacetStats -- the template reads several of its fields (license, pubTypes,
 *  corpus.*) even though these tests only exercise the year logic, and Angular's zoneless change
 *  detection can run a template pass when fake timers advance (see the debounce tests below), so
 *  a partial/undefined-field mock would throw mid-test on an unrelated `.map()`. */
const STATS_WITH_YEAR_RANGE: FacetStats = {
  generated: '2026-09-01T00:00:00.000Z',
  schema_version: '1.1.0',
  source: 'full-corpus',
  records_counted: 355_558,
  corpus: {
    total: 827_061,
    positive: 355_558,
    negative: 464_581,
    undeterminable: 6_922,
    openAccess: 204_335,
    fulltextAvailable: 229_325,
    enriched: 0,
  },
  corpus_provenance: 'test fixture',
  facets: {
    classification: [],
    license: [],
    pubTypes: [],
    domainTier1: [],
    learningParadigm: [],
    modelFamily: [],
    yearRange: { min: 1963, max: 2027 },
  },
};

const EMPTY_FILTERS: SearchFilters = {};

function setup() {
  const fixture = TestBed.createComponent(FacetPanel);
  const component = fixture.componentInstance;
  fixture.componentRef.setInput('filters', EMPTY_FILTERS);
  fixture.componentRef.setInput('stats', STATS_WITH_YEAR_RANGE);
  const emitted: Partial<SearchFilters>[] = [];
  component.filtersChange.subscribe((patch) => emitted.push(patch));
  return { fixture, component, emitted };
}

describe('FacetPanel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FacetPanel] }).compileComponents();
  });

  it('creates', () => {
    const { component } = setup();
    expect(component).toBeTruthy();
  });

  describe('stepYear', () => {
    it('seeds an empty yearMin from the search-space MINIMUM on the first press, regardless of arrow direction', () => {
      // Reproduces the fix for the reported bug: pressing an arrow on an empty field must land on
      // a sensible seed (the earliest searchable year), not jump straight there via a browser-
      // native <input type="number" min> quirk and then require many clicks to climb back up.
      const { component, emitted } = setup();
      component.stepYear('yearMin', 1);
      expect(emitted).toEqual([{ yearMin: 1963 }]);
    });

    it('seeds an empty yearMax from the search-space MAXIMUM, not the minimum', () => {
      const { component, emitted } = setup();
      component.stepYear('yearMax', -1);
      expect(emitted).toEqual([{ yearMax: 2027 }]);
    });

    it('steps by 1 from the current value once it is set (not re-seeding)', () => {
      const { fixture, component, emitted } = setup();
      fixture.componentRef.setInput('filters', { yearMin: 2000 } satisfies SearchFilters);
      component.stepYear('yearMin', 1);
      expect(emitted).toEqual([{ yearMin: 2001 }]);
    });

    it('clamps to the search-space bounds -- never below the minimum or above the maximum', () => {
      const { fixture, component, emitted } = setup();
      fixture.componentRef.setInput('filters', { yearMin: 1963 } satisfies SearchFilters);
      component.stepYear('yearMin', -1);
      expect(emitted).toEqual([{ yearMin: 1963 }]);
    });

    it('enforces yearMin <= yearMax: stepping yearMin past the existing yearMax clamps to it', () => {
      const { fixture, component, emitted } = setup();
      fixture.componentRef.setInput('filters', { yearMin: 2000, yearMax: 2000 } satisfies SearchFilters);
      component.stepYear('yearMin', 1);
      expect(emitted).toEqual([{ yearMin: 2000 }]);
    });

    it('enforces yearMin <= yearMax the other way: stepping yearMax below the existing yearMin clamps to it', () => {
      const { fixture, component, emitted } = setup();
      fixture.componentRef.setInput('filters', { yearMin: 2000, yearMax: 2000 } satisfies SearchFilters);
      component.stepYear('yearMax', -1);
      expect(emitted).toEqual([{ yearMax: 2000 }]);
    });

    it('does nothing when stats have not loaded yet (no bounds to seed from)', () => {
      const fixture = TestBed.createComponent(FacetPanel);
      const component = fixture.componentInstance;
      fixture.componentRef.setInput('filters', EMPTY_FILTERS);
      fixture.componentRef.setInput('stats', null);
      const emitted: Partial<SearchFilters>[] = [];
      component.filtersChange.subscribe((patch) => emitted.push(patch));

      component.stepYear('yearMin', 1);

      expect(emitted).toEqual([]);
    });
  });

  describe('onYearInput (typed input, debounced 500ms)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('commits once, after the debounce, not per keystroke', () => {
      const { component, emitted } = setup();
      component.onYearInput('yearMin', '2');
      component.onYearInput('yearMin', '20');
      component.onYearInput('yearMin', '202');
      component.onYearInput('yearMin', '2020');
      expect(emitted).toEqual([]); // nothing yet -- still within the debounce window

      vi.advanceTimersByTime(500);

      expect(emitted).toEqual([{ yearMin: 2020 }]);
    });

    it('commits undefined (clears the bound) for an empty string', () => {
      const { component, emitted } = setup();
      component.onYearInput('yearMax', '');
      vi.advanceTimersByTime(500);
      expect(emitted).toEqual([{ yearMax: undefined }]);
    });

    it('waits rather than committing on an incomplete, non-integer value (e.g. a bare "-")', () => {
      const { component, emitted } = setup();
      component.onYearInput('yearMin', '-');
      vi.advanceTimersByTime(500);
      expect(emitted).toEqual([]);
    });

    it('clamps a typed value to the search-space bounds, same as stepYear', () => {
      const { component, emitted } = setup();
      component.onYearInput('yearMin', '1800');
      vi.advanceTimersByTime(500);
      expect(emitted).toEqual([{ yearMin: 1963 }]);
    });
  });

  describe('yearSummary', () => {
    it('renders a closed range, an open lower bound, an open upper bound, and nothing when unset', () => {
      const { fixture, component } = setup();
      expect(component.yearSummary()).toBe('');

      fixture.componentRef.setInput('filters', { yearMin: 2020, yearMax: 2024 } satisfies SearchFilters);
      expect(component.yearSummary()).toBe('2020–2024');

      fixture.componentRef.setInput('filters', { yearMin: 2020 } satisfies SearchFilters);
      expect(component.yearSummary()).toBe('From 2020');

      fixture.componentRef.setInput('filters', { yearMax: 2024 } satisfies SearchFilters);
      expect(component.yearSummary()).toBe('To 2024');
    });
  });

  describe('countOf', () => {
    it('counts a list filter, and reads 0 for an unset one', () => {
      const { fixture, component } = setup();
      expect(component.countOf('journal')).toBe(0);
      fixture.componentRef.setInput('filters', { journal: ['Nature', 'Science'] } satisfies SearchFilters);
      expect(component.countOf('journal')).toBe(2);
    });
  });
});
