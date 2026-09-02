import { BadRequestException } from '@nestjs/common';
import {
  buildMongoFilter,
  buildPagination,
  buildSortSpec,
  canonicalCacheKey,
  DEFAULT_CLASSIFICATION,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ParsedFilters,
  parseSearchParams,
  tokenizeQuery,
  searchTerms,
  termPattern,
  parseAuthorName,
  authorClause,
  buildPromotedFilter,
  rankPromoted,
} from './records.query';

/** A filters object with every field left at its "untouched" default -- individual tests spread
 *  over this rather than repeating all 17 fields every time. */
const emptyFilters: ParsedFilters = { classification: [] };

describe('parseSearchParams', () => {
  it('defaults classification to positive when class is absent entirely', () => {
    const { filters } = parseSearchParams({});
    expect(filters.classification).toEqual(DEFAULT_CLASSIFICATION);
  });

  it('treats an explicitly empty class= as cleared, not defaulted', () => {
    const { filters } = parseSearchParams({ class: '' });
    expect(filters.classification).toEqual([]);
  });

  it('parses an explicit multi-value class list and drops unknown values', () => {
    const { filters } = parseSearchParams({ class: 'positive,bogus,negative' });
    expect(filters.classification).toEqual(['positive', 'negative']);
  });

  it('parses an open-ended lower year bound ("2020-") without the Number(\'\')===0 bug', () => {
    const { filters } = parseSearchParams({ year: '2020-' });
    expect(filters.yearMin).toBe(2020);
    expect(filters.yearMax).toBeUndefined();
  });

  it('parses an open-ended upper year bound ("-2020")', () => {
    const { filters } = parseSearchParams({ year: '-2020' });
    expect(filters.yearMin).toBeUndefined();
    expect(filters.yearMax).toBe(2020);
  });

  it('parses a closed year range', () => {
    const { filters } = parseSearchParams({ year: '2020-2024' });
    expect(filters).toMatchObject({ yearMin: 2020, yearMax: 2024 });
  });

  it('parses booleans strictly, treating anything other than "true"/"false" as unset', () => {
    expect(parseSearchParams({ oa: 'true' }).filters.openAccess).toBe(true);
    expect(parseSearchParams({ oa: 'false' }).filters.openAccess).toBe(false);
    expect(parseSearchParams({ oa: 'yes' }).filters.openAccess).toBeUndefined();
    expect(parseSearchParams({}).filters.openAccess).toBeUndefined();
  });

  it('splits comma-separated list params and trims whitespace', () => {
    const { filters } = parseSearchParams({ mesh: ' Humans , Animals ,,' });
    expect(filters.meshHeadings).toEqual(['Humans', 'Animals']);
  });

  it('leaves an absent list param undefined, not an empty array', () => {
    expect(parseSearchParams({}).filters.meshHeadings).toBeUndefined();
  });

  it('trims and drops an empty free-text query', () => {
    expect(parseSearchParams({ q: '  ' }).filters.q).toBeUndefined();
    expect(parseSearchParams({ q: '  transformer  ' }).filters.q).toBe('transformer');
  });

  it('falls back to the relevance sort for an invalid or absent value', () => {
    expect(parseSearchParams({}).sort).toBe('relevance');
    expect(parseSearchParams({ sort: 'bogus' }).sort).toBe('relevance');
    expect(parseSearchParams({ sort: 'year_desc' }).sort).toBe('year_desc');
  });

  it('accepts both citation sort values', () => {
    expect(parseSearchParams({ sort: 'citations_desc' }).sort).toBe('citations_desc');
    expect(parseSearchParams({ sort: 'citations_asc' }).sort).toBe('citations_asc');
  });

  it('parses every remaining list filter (d1-mt, jrnl, lic, kw, ptype)', () => {
    const { filters } = parseSearchParams({
      lic: 'cc by',
      jrnl: 'Nature',
      kw: 'ai',
      ptype: 'Review',
      d1: 'biology',
      d2: 'genomics',
      d3: 'variant-calling',
      para: 'supervised',
      fam: 'transformer',
      mt: 'llm',
    });
    expect(filters).toMatchObject({
      license: ['cc by'],
      journal: ['Nature'],
      keywordsAuthor: ['ai'],
      pubTypes: ['Review'],
      domainTier1: ['biology'],
      domainTier2: ['genomics'],
      domainTier3: ['variant-calling'],
      learningParadigm: ['supervised'],
      modelFamily: ['transformer'],
      modelType: ['llm'],
    });
  });

  it('parses enrichedOnly', () => {
    expect(parseSearchParams({ enriched: 'true' }).filters.enrichedOnly).toBe(true);
    expect(parseSearchParams({}).filters.enrichedOnly).toBeUndefined();
  });
});

describe('buildPagination', () => {
  it('defaults to page 1, pageSize 25', () => {
    expect(buildPagination(undefined, undefined)).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
    });
  });

  it('computes skip correctly for a later page', () => {
    expect(buildPagination('3', '25')).toEqual({
      page: 3,
      pageSize: 25,
      skip: 50,
    });
  });

  it('clamps an oversized pageSize to the maximum', () => {
    expect(buildPagination('1', '9999')).toEqual({
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      skip: 0,
    });
  });

  it('falls back to page 1 for a non-positive or non-integer page', () => {
    expect(buildPagination('0', undefined).page).toBe(1);
    expect(buildPagination('-5', undefined).page).toBe(1);
    expect(buildPagination('abc', undefined).page).toBe(1);
    expect(buildPagination('2.5', undefined).page).toBe(1);
  });

  it('rejects a result window beyond MAX_RESULT_WINDOW instead of silently truncating', () => {
    // 401 * 25 = 10025 > 10,000
    expect(() => buildPagination('401', '25')).toThrow(BadRequestException);
  });

  it('accepts a request landing exactly on the result window boundary', () => {
    // 400 * 25 = 10,000, the boundary itself
    expect(() => buildPagination('400', '25')).not.toThrow();
  });
});

describe('buildMongoFilter', () => {
  it('returns an empty filter (matches everything) when nothing is set', () => {
    expect(buildMongoFilter(emptyFilters)).toEqual({});
  });

  it('builds one \\b-anchored, escaped, case-insensitive $or-of-fields clause per term (AND-of-terms, not one literal phrase)', () => {
    const filter = buildMongoFilter({ ...emptyFilters, q: 'random forest' });
    expect(filter).toEqual({
      $and: [
        {
          $or: [
            { 'publication_metadata.title': { $regex: '\\brandom', $options: 'i' } },
            { 'publication_metadata.abstract': { $regex: '\\brandom', $options: 'i' } },
            { 'publication_metadata.authors': { $regex: '\\brandom', $options: 'i' } },
          ],
        },
        {
          $or: [
            { 'publication_metadata.title': { $regex: '\\bforest', $options: 'i' } },
            { 'publication_metadata.abstract': { $regex: '\\bforest', $options: 'i' } },
            { 'publication_metadata.authors': { $regex: '\\bforest', $options: 'i' } },
          ],
        },
      ],
    });
  });

  it('escapes regex metacharacters within a term (ReDoS/mismatch guard) after the \\b prefix', () => {
    const filter = buildMongoFilter({ ...emptyFilters, q: 'C++' });
    expect(filter).toEqual({
      $and: [
        {
          $or: [
            { 'publication_metadata.title': { $regex: '\\bC\\+\\+', $options: 'i' } },
            { 'publication_metadata.abstract': { $regex: '\\bC\\+\\+', $options: 'i' } },
            { 'publication_metadata.authors': { $regex: '\\bC\\+\\+', $options: 'i' } },
          ],
        },
      ],
    });
  });

  it("places the classification clause before the free-text clauses -- measured 2,566ms vs 5,809ms on the database server; see buildMongoFilter's comment", () => {
    const filter = buildMongoFilter({ classification: ['positive'], q: 'transformer' });
    expect(filter.$and?.[0]).toEqual({
      'llm_classification.classification': { $eq: 'positive' },
    });
  });

  it('filters by a single classification with $eq (cheaper than $in, and required for a future partial-index match)', () => {
    const filter = buildMongoFilter({
      ...emptyFilters,
      classification: ['positive'],
    });
    expect(filter).toEqual({
      $and: [{ 'llm_classification.classification': { $eq: 'positive' } }],
    });
  });

  it('filters by multiple classifications with $in', () => {
    const filter = buildMongoFilter({
      ...emptyFilters,
      classification: ['positive', 'negative'],
    });
    expect(filter).toEqual({
      $and: [
        {
          'llm_classification.classification': {
            $in: ['positive', 'negative'],
          },
        },
      ],
    });
  });

  it('applies no classification clause when classification is empty (cleared)', () => {
    expect(buildMongoFilter({ ...emptyFilters, classification: [] })).toEqual({});
  });

  it('maps openAccess/fulltextAvailable booleans onto their nested fields', () => {
    const filter = buildMongoFilter({
      ...emptyFilters,
      openAccess: true,
      fulltextAvailable: false,
    });
    expect(filter).toEqual({
      $and: [{ 'source.access.open_access': true }, { 'source.access.fulltext_available': false }],
    });
  });

  it('builds a year range with only the provided bound(s)', () => {
    expect(buildMongoFilter({ ...emptyFilters, yearMin: 2020 })).toEqual({
      $and: [{ 'publication_metadata.year': { $gte: 2020 } }],
    });
    expect(buildMongoFilter({ ...emptyFilters, yearMax: 2024 })).toEqual({
      $and: [{ 'publication_metadata.year': { $lte: 2024 } }],
    });
  });

  it('expands an empty-string licence request to match both "" and null (measured on the database server: 208,649 "" docs, 71,025 null docs)', () => {
    const filter = buildMongoFilter({ ...emptyFilters, license: [''] });
    expect(filter).toEqual({
      $and: [{ 'source.access.license': { $in: ['', null] } }],
    });
  });

  it('leaves a non-empty licence request untouched (no null added) when "" was not requested', () => {
    const filter = buildMongoFilter({ ...emptyFilters, license: ['cc by'] });
    expect(filter).toEqual({
      $and: [{ 'source.access.license': { $in: ['cc by'] } }],
    });
  });

  it('uses $in for every array-overlap facet (any-element-matches, same as hasAnyOverlap)', () => {
    const filter = buildMongoFilter({
      ...emptyFilters,
      meshHeadings: ['Humans', 'Animals'],
    });
    expect(filter).toEqual({
      $and: [{ 'content_filters.mesh_headings': { $in: ['Humans', 'Animals'] } }],
    });
  });

  it('adds the enriched-only clause only when true', () => {
    expect(buildMongoFilter({ ...emptyFilters, enrichedOnly: true })).toEqual({
      $and: [{ 'llm_enrichment.provider': { $ne: null } }],
    });
    expect(buildMongoFilter({ ...emptyFilters, enrichedOnly: false })).toEqual({});
  });

  it('combines multiple active filters with $and', () => {
    const filter = buildMongoFilter({
      classification: ['positive'],
      openAccess: true,
      yearMin: 2020,
    });
    expect(filter).toEqual({
      $and: [
        { 'llm_classification.classification': { $eq: 'positive' } },
        { 'source.access.open_access': true },
        { 'publication_metadata.year': { $gte: 2020 } },
      ],
    });
  });
});

describe('tokenizeQuery', () => {
  it('splits on whitespace', () => {
    expect(tokenizeQuery('random forest sepsis')).toEqual(['random', 'forest', 'sepsis']);
  });

  it('collapses repeated whitespace and trims', () => {
    expect(tokenizeQuery('  deep   learning  ')).toEqual(['deep', 'learning']);
  });

  it('keeps a "quoted phrase" as a single term', () => {
    expect(tokenizeQuery('"cell type" transformer')).toEqual(['cell type', 'transformer']);
  });

  it('caps at MAX_QUERY_TERMS (8) rather than erroring on a long paste', () => {
    const words = Array.from({ length: 12 }, (_, i) => `word${i}`).join(' ');
    expect(tokenizeQuery(words)).toHaveLength(8);
    expect(tokenizeQuery(words)[0]).toBe('word0');
  });
});

describe('buildSortSpec', () => {
  it('sorts relevance by _id -- the only indexed field on the database server today', () => {
    expect(buildSortSpec('relevance')).toEqual({ _id: 1 });
  });

  it('adds an _id tiebreak to both year sorts so paginated pages never repeat/skip a row', () => {
    expect(buildSortSpec('year_desc')).toEqual({
      'publication_metadata.year': -1,
      _id: 1,
    });
    expect(buildSortSpec('year_asc')).toEqual({
      'publication_metadata.year': 1,
      _id: 1,
    });
  });

  // citation_count is null for every record today (schema v1.1.0 forward-compatible placeholder)
  // -- this pins the wiring, not a claim that citation counts exist yet. See records.query.ts's
  // buildSortSpec doc comment.
  it('adds an _id tiebreak to both citation sorts', () => {
    expect(buildSortSpec('citations_desc')).toEqual({
      'publication_metadata.citation_count': -1,
      _id: 1,
    });
    expect(buildSortSpec('citations_asc')).toEqual({
      'publication_metadata.citation_count': 1,
      _id: 1,
    });
  });
});

describe('canonicalCacheKey', () => {
  it('produces the same key regardless of array value order', () => {
    const a = canonicalCacheKey({ ...emptyFilters, meshHeadings: ['b', 'a'] });
    const b = canonicalCacheKey({ ...emptyFilters, meshHeadings: ['a', 'b'] });
    expect(a).toBe(b);
  });

  it('produces different keys for logically different filters', () => {
    const a = canonicalCacheKey({ classification: ['positive'] });
    const b = canonicalCacheKey({ classification: ['negative'] });
    expect(a).not.toBe(b);
  });

  it('is stable for the exact same input', () => {
    const filters: ParsedFilters = {
      classification: ['positive'],
      yearMin: 2020,
    };
    expect(canonicalCacheKey(filters)).toBe(canonicalCacheKey(filters));
  });
});

describe('searchTerms', () => {
  it('drops single-character terms, which cost a full regex pass and narrow nothing', () => {
    expect(searchTerms('Farrell G')).toEqual(['Farrell']);
    expect(searchTerms('a b cell')).toEqual(['cell']);
  });

  it('strips trailing sentence punctuation before the length floor applies', () => {
    // Regression: "G." is two characters, so it survived the floor and turned an author search into
    // "surname AND a token ending in G." -- 7 hits where "Farrell G" gave 94.
    expect(searchTerms('Farrell G.')).toEqual(['Farrell']);
    expect(searchTerms('Farrell, G')).toEqual(['Farrell']);
    expect(searchTerms('random forest.')).toEqual(['random', 'forest']);
  });

  it('leaves ordinary multi-word queries alone', () => {
    expect(searchTerms('random forest sepsis')).toEqual(['random', 'forest', 'sepsis']);
  });
});

describe('termPattern', () => {
  it('word-anchors a single term', () => {
    expect(termPattern('cell')).toBe('\\bcell');
  });

  it('escapes regex metacharacters in user input', () => {
    expect(termPattern('c.ll')).toBe('\\bc\\.ll');
  });

  it('lets a phrase span inline markup, which real titles carry', () => {
    // "<i>In Vitro</i> Fertilization" must match the phrase "in vitro"; a literal space never would.
    const re = new RegExp(termPattern('in vitro'), 'i');
    expect(re.test('Outcome of <i>In Vitro</i> Fertilization Cycles')).toBe(true);
  });

  it('lets a phrase span a hyphen', () => {
    expect(new RegExp(termPattern('random forest'), 'i').test('a random-forest model')).toBe(true);
  });

  it('still requires the words to be adjacent', () => {
    expect(new RegExp(termPattern('random forest'), 'i').test('random survival forest')).toBe(
      false,
    );
  });
});

describe('parseAuthorName', () => {
  it('recognises the surname+initials form the corpus stores and the UI asks for', () => {
    expect(parseAuthorName('Farrell G')).toEqual({ surname: 'Farrell', initials: 'G' });
    expect(parseAuthorName('Farrell G.')).toEqual({ surname: 'Farrell', initials: 'G' });
    expect(parseAuthorName('Farrell, G')).toEqual({ surname: 'Farrell', initials: 'G' });
    expect(parseAuthorName('Tosatto SCE')).toEqual({ surname: 'Tosatto', initials: 'SCE' });
  });

  it('handles non-ASCII surnames', () => {
    expect(parseAuthorName('Grønning AGB')).toEqual({ surname: 'Grønning', initials: 'AGB' });
  });

  it('does NOT claim ordinary topical queries -- lowercase initials are the guard', () => {
    // Treating "single cell" as an author would spend a whole extra collection scan proving it
    // matches nothing.
    expect(parseAuthorName('random forest')).toBeUndefined();
    expect(parseAuthorName('single cell')).toBeUndefined();
    expect(parseAuthorName('deep learning')).toBeUndefined();
    expect(parseAuthorName('farrell g')).toBeUndefined();
  });

  it('does not claim queries that are not two tokens', () => {
    expect(parseAuthorName('Farrell')).toBeUndefined();
    expect(parseAuthorName('Farrell G Attafi O')).toBeUndefined();
  });
});

describe('authorClause', () => {
  const matches = (authors: string, name: { surname: string; initials: string }) => {
    const clause = authorClause(name) as {
      'publication_metadata.authors': { $regex: string; $options: string };
    };
    const spec = clause['publication_metadata.authors'];
    return new RegExp(spec.$regex, spec.$options).test(authors);
  };
  const farrellG = { surname: 'Farrell', initials: 'G' };

  it('matches the author at the start, middle and end of the list', () => {
    expect(matches('Farrell G, Attafi OA, Fragkouli S', farrellG)).toBe(true);
    expect(matches('Halford E, Farrell G, Dixon A', farrellG)).toBe(true);
    expect(matches('Halford E, Dixon A, Farrell G.', farrellG)).toBe(true);
  });

  it('allows the initials to extend, as PubMed author search does', () => {
    expect(matches('Halford E, Farrell GP, Dixon A', farrellG)).toBe(true);
  });

  it('does not match a different surname that merely contains it', () => {
    expect(matches('Satija R, Farrell JA, Regev A', farrellG)).toBe(false);
    expect(matches("Hou J, O'Farrell M, Veddegjerde R", farrellG)).toBe(false);
    expect(matches('Farrelly CM.', farrellG)).toBe(false);
  });
});

describe('buildPromotedFilter', () => {
  const filters = (raw: Record<string, string>) => parseSearchParams(raw).filters;

  it('returns null when there is no free text to promote on', () => {
    expect(buildPromotedFilter(filters({}))).toBeNull();
    expect(buildPromotedFilter(filters({ oa: 'true' }))).toBeNull();
  });

  it('promotes exact author matches for an author-shaped query', () => {
    const promoted = JSON.stringify(buildPromotedFilter(filters({ q: 'Farrell G' })));
    expect(promoted).toContain('publication_metadata.authors');
    expect(promoted).not.toContain('publication_metadata.abstract');
  });

  it('promotes title matches for anything else, never abstract-only ones', () => {
    const promoted = JSON.stringify(buildPromotedFilter(filters({ q: 'random forest' })));
    expect(promoted).toContain('publication_metadata.title');
    expect(promoted).not.toContain('publication_metadata.abstract');
  });

  it('carries the other filters, so promotion never widens what matches', () => {
    const promoted = JSON.stringify(
      buildPromotedFilter(filters({ q: 'random forest', oa: 'true', year: '2020-' })),
    );
    expect(promoted).toContain('source.access.open_access');
    expect(promoted).toContain('publication_metadata.year');
    expect(promoted).toContain('llm_classification.classification');
  });

  it('keeps the cheap classification clause first, as buildMongoFilter does', () => {
    const promoted = buildPromotedFilter(filters({ q: 'random forest' })) as { $and: object[] };
    expect(Object.keys(promoted.$and[0])).toEqual(['llm_classification.classification']);
  });
});

describe('rankPromoted', () => {
  const row = (id: string, title: string) => ({ _id: id, publication_metadata: { title } });

  it('puts a phrase match ahead of the same words apart, and both ahead of any order', () => {
    const rows = [
      row('any-order', 'Forest cover predicted by random sampling'),
      row('in-order', 'A random survival forest model'),
      row('phrase', 'A random forest classifier'),
    ];
    expect(rankPromoted(rows, 'random forest')).toEqual(['phrase', 'in-order', 'any-order']);
  });

  it('matches a phrase across inline markup', () => {
    const rows = [
      row('plain', 'Vitro studies of in something'),
      row('marked', 'An <i>in vitro</i> assay'),
    ];
    expect(rankPromoted(rows, 'in vitro')[0]).toBe('marked');
  });

  it('preserves input order when nothing separates the rows -- keeps paging stable', () => {
    const rows = [row('a', 'Alpha'), row('b', 'Beta'), row('c', 'Gamma')];
    expect(rankPromoted(rows, 'transformer')).toEqual(['a', 'b', 'c']);
  });

  it('tolerates a missing title', () => {
    expect(rankPromoted([{ _id: 'x' }], 'random forest')).toEqual(['x']);
  });
});
