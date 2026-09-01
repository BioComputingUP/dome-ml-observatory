import {
  paramsToQuery,
  queryToParams,
  queryToHttpParams,
  activeFilterCount,
  isDefaultClassification,
  DEFAULT_PAGE_SIZE,
} from './search-params';
import { SearchQuery } from './records.service';

describe('search-params', () => {
  describe('paramsToQuery', () => {
    it('applies the positive default when classification is absent entirely', () => {
      expect(paramsToQuery({}).filters.classification).toEqual(['positive']);
    });

    it('respects an explicitly cleared classification instead of snapping back to the default', () => {
      // This is the whole reason classificationParam emits '' rather than omitting the key:
      // a user who clears the chip must stay cleared on reload.
      expect(paramsToQuery({ class: '' }).filters.classification).toEqual([]);
    });

    it('parses an explicit classification list', () => {
      expect(paramsToQuery({ class: 'negative,undeterminable' }).filters.classification).toEqual([
        'negative',
        'undeterminable',
      ]);
    });

    it('drops classification values that are not real classifications', () => {
      expect(paramsToQuery({ class: 'positive,banana' }).filters.classification).toEqual(['positive']);
    });

    it('parses booleans, and treats anything else as unset', () => {
      expect(paramsToQuery({ oa: 'true' }).filters.openAccess).toBe(true);
      expect(paramsToQuery({ oa: 'false' }).filters.openAccess).toBe(false);
      expect(paramsToQuery({ oa: 'yes' }).filters.openAccess).toBeUndefined();
      expect(paramsToQuery({}).filters.openAccess).toBeUndefined();
    });

    it('parses a full year range, and tolerates open-ended ones', () => {
      expect(paramsToQuery({ year: '2020-2026' }).filters).toMatchObject({ yearMin: 2020, yearMax: 2026 });
      expect(paramsToQuery({ year: '2020-' }).filters).toMatchObject({ yearMin: 2020, yearMax: undefined });
      expect(paramsToQuery({ year: '-2026' }).filters).toMatchObject({ yearMin: undefined, yearMax: 2026 });
    });

    it('splits comma lists and trims whitespace', () => {
      expect(paramsToQuery({ mesh: 'Humans, Algorithms ,Male' }).filters.meshHeadings).toEqual([
        'Humans',
        'Algorithms',
        'Male',
      ]);
    });

    it('treats an empty list param as unset rather than an empty array', () => {
      expect(paramsToQuery({ mesh: ',, ' }).filters.meshHeadings).toBeUndefined();
    });

    it('falls back to sensible defaults for junk sort and page values', () => {
      const q = paramsToQuery({ sort: 'sideways', page: '-4' });
      expect(q.sort).toBe('relevance');
      expect(q.page).toBe(1);
      expect(q.pageSize).toBe(DEFAULT_PAGE_SIZE);
    });

    it('ignores a whitespace-only free-text query', () => {
      expect(paramsToQuery({ q: '   ' }).q).toBeUndefined();
    });
  });

  describe('queryToParams', () => {
    const base: SearchQuery = {
      filters: { classification: ['positive'] },
      sort: 'relevance',
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    };

    it('omits everything at its default, keeping a fresh search URL clean', () => {
      const params = queryToParams(base);
      expect(Object.values(params).every((v) => v === null)).toBe(true);
    });

    it('emits an empty classification when the user cleared it', () => {
      expect(queryToParams({ ...base, filters: { classification: [] } })['class']).toBe('');
    });

    it('serialises lists as comma-joined values', () => {
      const params = queryToParams({ ...base, filters: { ...base.filters, modelFamily: ['deep learning', 'ensemble learning'] } });
      expect(params['fam']).toBe('deep learning,ensemble learning');
    });

    it('serialises page and sort only when non-default', () => {
      expect(queryToParams({ ...base, page: 3 })['page']).toBe('3');
      expect(queryToParams({ ...base, sort: 'year_desc' })['sort']).toBe('year_desc');
    });
  });

  describe('round trip', () => {
    it('survives a full-fat query unchanged', () => {
      const original: SearchQuery = {
        q: 'random forest',
        filters: {
          classification: ['negative'],
          openAccess: true,
          fulltextAvailable: false,
          yearMin: 2015,
          yearMax: 2026,
          license: ['cc by', 'cc by-nc'],
          journal: ['Scientific reports'],
          meshHeadings: ['Humans'],
          keywordsAuthor: ['Machine Learning'],
          pubTypes: ['Journal Article'],
          domainTier1: ['Computer science'],
          domainTier2: ['Machine learning'],
          domainTier3: ['Tomography'],
          learningParadigm: ['supervised'],
          modelFamily: ['deep learning'],
          modelType: ['random forest'],
          enrichedOnly: true,
        },
        sort: 'year_desc',
        page: 4,
        pageSize: DEFAULT_PAGE_SIZE,
      };

      const params = queryToParams(original);
      const nonNull: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) if (v !== null) nonNull[k] = v;

      expect(paramsToQuery(nonNull)).toEqual(original);
    });

    it('round-trips a default (untouched) query back to the same defaults', () => {
      const original = paramsToQuery({});
      const params = queryToParams(original);
      const nonNull: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) if (v !== null) nonNull[k] = v;
      expect(paramsToQuery(nonNull).filters.classification).toEqual(['positive']);
    });

    it('round-trips a cleared classification as still cleared', () => {
      const cleared = paramsToQuery({ class: '' });
      const params = queryToParams(cleared);
      expect(paramsToQuery({ class: params['class'] ?? undefined }).filters.classification).toEqual([]);
    });
  });

  describe('activeFilterCount', () => {
    it('does not count the positive default as a user-applied filter', () => {
      expect(activeFilterCount({ classification: ['positive'] })).toBe(0);
    });

    it('counts a changed classification', () => {
      expect(activeFilterCount({ classification: ['negative'] })).toBe(1);
    });

    it('counts each applied filter group once', () => {
      expect(
        activeFilterCount({
          classification: ['positive'],
          openAccess: true,
          yearMin: 2020,
          modelFamily: ['deep learning'],
          meshHeadings: ['Humans', 'Algorithms'],
        }),
      ).toBe(4);
    });

    it('counts openAccess=false as an applied filter, not as unset', () => {
      expect(activeFilterCount({ openAccess: false })).toBe(1);
    });

    it('does not count a cleared classification -- clearing narrows nothing', () => {
      expect(activeFilterCount({ classification: [] })).toBe(0);
    });
  });

  describe('isDefaultClassification', () => {
    it('is true only for exactly the positive default', () => {
      expect(isDefaultClassification(['positive'])).toBe(true);
      expect(isDefaultClassification(['positive', 'negative'])).toBe(false);
      expect(isDefaultClassification([])).toBe(false);
      expect(isDefaultClassification(undefined)).toBe(false);
    });
  });

  describe('queryToHttpParams', () => {
    const base: SearchQuery = { filters: {}, sort: 'relevance', page: 1, pageSize: 25 };

    it('drops every param queryToParams reports as null (at-default)', () => {
      const params = queryToHttpParams(base);
      const dropped = ['q', 'oa', 'ft', 'year', 'lic', 'jrnl', 'mesh', 'kw', 'ptype', 'd1', 'd2', 'd3', 'para', 'fam', 'mt', 'enriched', 'sort', 'page', 'class'];
      expect(dropped.filter((key) => params.has(key))).toEqual([]);
    });

    it('always sends pageSize, which is never part of the URL itself', () => {
      expect(queryToHttpParams(base).get('pageSize')).toBe('25');
      expect(queryToHttpParams({ ...base, pageSize: 100 }).get('pageSize')).toBe('100');
    });

    it('keeps an explicitly-cleared classification as the literal empty string, not dropped', () => {
      const params = queryToHttpParams({ ...base, filters: { classification: [] } });
      expect(params.has('class')).toBe(true);
      expect(params.get('class')).toBe('');
      // The wire form must be exactly "class=" -- confirms toString() doesn't silently drop it.
      expect(params.toString().split('&')).toContain('class=');
    });

    it('carries every other non-default filter through as its queryToParams string', () => {
      const params = queryToHttpParams({
        ...base,
        q: 'transformer',
        filters: { classification: ['positive', 'negative'], yearMin: 2020, journal: ['Nature'] },
      });
      expect(params.get('q')).toBe('transformer');
      expect(params.get('class')).toBe('positive,negative');
      expect(params.get('year')).toBe('2020-');
      expect(params.get('jrnl')).toBe('Nature');
    });
  });
});
