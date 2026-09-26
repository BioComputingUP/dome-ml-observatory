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
  isYearSort,
  tokenizeQuery,
  searchTerms,
  termPattern,
  parseAuthorName,
  authorInterpretations,
  leadingInitialsName,
  authorClause,
  buildAuthorProbeFilter,
  buildPromotedFilter,
  rankPromoted,
  canUseTextIndex,
  buildTextSearch,
  buildTextSearchFilter,
  parseQueryGroups,
  queryExpansions,
  identifierQuery,
  textSearchWords,
  shouldFallBackFromText,
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

  it('reads a repeated list param as a multi-value filter', () => {
    const { filters } = parseSearchParams({ mesh: ['Humans', 'Animals'] });
    expect(filters.meshHeadings).toEqual(['Humans', 'Animals']);
  });

  it('keeps a comma INSIDE a value instead of splitting on it', () => {
    // The regression this encoding exists to prevent: this journal used to parse as the two-value
    // filter ['Bioinformatics Advances (Oxford', 'England)'] and match nothing.
    expect(
      parseSearchParams({ jrnl: 'Bioinformatics Advances (Oxford, England)' }).filters.journal,
    ).toEqual(['Bioinformatics Advances (Oxford, England)']);
    expect(parseSearchParams({ mesh: 'Neoplasms, Second Primary' }).filters.meshHeadings).toEqual([
      'Neoplasms, Second Primary',
    ]);
    // The EDAM domain vocabulary ships comma-bearing terms of its own.
    expect(
      parseSearchParams({ d1: 'Allergy, clinical immunology and immunotherapeutics' }).filters
        .domainTier1,
    ).toEqual(['Allergy, clinical immunology and immunotherapeutics']);
  });

  it('leaves an absent or empty list param undefined, not an empty array', () => {
    expect(parseSearchParams({}).filters.meshHeadings).toBeUndefined();
    expect(parseSearchParams({ mesh: '' }).filters.meshHeadings).toBeUndefined();
    expect(parseSearchParams({ mesh: [' ', ''] }).filters.meshHeadings).toBeUndefined();
  });

  it('still comma-splits `class`, the one param whose values can never contain a comma', () => {
    expect(parseSearchParams({ class: 'positive,negative' }).filters.classification).toEqual([
      'positive',
      'negative',
    ]);
    // And the explicitly-cleared signal still round-trips -- canUseTextIndex depends on it.
    expect(parseSearchParams({ class: '' }).filters.classification).toEqual([]);
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

  // A record with no year sorted first under year_asc (BSON puts null below every number): page 1
  // of "Oldest first" opened with 22 year-less conference abstracts on 2026-09-26. The year sorts
  // therefore carry a filter as well as an order, in both directions so they list the same set.
  it('marks both year sorts as wanting only records with a year, and no other sort', () => {
    expect(parseSearchParams({ sort: 'year_asc' }).filters.hasYear).toBe(true);
    expect(parseSearchParams({ sort: 'year_desc' }).filters.hasYear).toBe(true);
    for (const sort of ['relevance', 'citations_desc', 'citations_asc', 'bogus', undefined]) {
      expect(parseSearchParams({ sort }).filters.hasYear).toBeUndefined();
    }
    expect(isYearSort('year_asc')).toBe(true);
    expect(isYearSort('citations_asc')).toBe(false);
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
    // "covid 19" carries no possible author reading (a digit is not a name), so this pins the plain
    // term-AND shape on its own. The author branch that a name-shaped query adds is the test below.
    const filter = buildMongoFilter({ ...emptyFilters, q: 'covid 19' });
    expect(filter).toEqual({
      $and: [
        {
          $or: [
            { 'publication_metadata.title': { $regex: '\\bcovid', $options: 'i' } },
            { 'publication_metadata.abstract': { $regex: '\\bcovid', $options: 'i' } },
            { 'publication_metadata.authors': { $regex: '\\bcovid', $options: 'i' } },
          ],
        },
        {
          $or: [
            { 'publication_metadata.title': { $regex: '\\b19', $options: 'i' } },
            { 'publication_metadata.abstract': { $regex: '\\b19', $options: 'i' } },
            { 'publication_metadata.authors': { $regex: '\\b19', $options: 'i' } },
          ],
        },
      ],
    });
  });

  it('ORs the author readings ALONGSIDE the term AND, never in place of it', () => {
    // The term AND has to survive intact: this is an ordinary topical search that merely happens to
    // look like a name. All the author branch adds is the handful of papers by an author called
    // "Forest R" or "Random F".
    const filter = buildMongoFilter({ ...emptyFilters, q: 'random forest' });
    expect(filter.$and).toHaveLength(1);
    const branches = (filter.$and?.[0] as { $or: Record<string, unknown>[] }).$or;
    expect(branches).toHaveLength(3);
    expect(branches[0]).toHaveProperty('$and');
    expect((branches[0] as { $and: unknown[] }).$and).toHaveLength(2);
    expect(JSON.stringify(branches.slice(1))).toContain('publication_metadata.authors');
  });

  it('finds a name the corpus cannot spell the way it was typed', () => {
    // No given name is stored anywhere in the corpus, so the term AND for "Gavin Farrell" matches
    // nothing at all. The reconstructed "Farrell G" clause is the only thing that can match, which
    // is why the author branch is part of the filter rather than only the ranking.
    const built = JSON.stringify(buildMongoFilter({ ...emptyFilters, q: 'Gavin Farrell' }));
    expect(built).toContain('Farrell\\\\s+G');
    // Dotted initials are the same story: the term "S.C.E" appears in no document either.
    const dotted = JSON.stringify(buildMongoFilter({ ...emptyFilters, q: 'S.C.E. Tosatto' }));
    expect(dotted).toContain('Tosatto\\\\s+SCE');
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

  it("places the classification clause before the free-text clauses -- measured 2,566ms vs 5,809ms on the MongoDB server; see buildMongoFilter's comment", () => {
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

  it('keeps only numeric-year records for a year sort, unless a year range already does', () => {
    // $type, not $ne null: one interval on class_year_id's year key rather than two, and it says
    // what a year sort needs -- a number to order by.
    expect(buildMongoFilter({ ...emptyFilters, hasYear: true })).toEqual({
      $and: [{ 'publication_metadata.year': { $type: 'number' } }],
    });
    // A bound is a number comparison, which already excludes null and missing years.
    expect(buildMongoFilter({ ...emptyFilters, hasYear: true, yearMin: 2020 })).toEqual({
      $and: [{ 'publication_metadata.year': { $gte: 2020 } }],
    });
    // Through the parser, alongside the default classification.
    expect(buildMongoFilter(parseSearchParams({ sort: 'year_asc' }).filters)).toEqual({
      $and: [
        { 'llm_classification.classification': { $eq: 'positive' } },
        { 'publication_metadata.year': { $type: 'number' } },
      ],
    });
    expect(buildMongoFilter(parseSearchParams({ sort: 'relevance' }).filters)).toEqual({
      $and: [{ 'llm_classification.classification': { $eq: 'positive' } }],
    });
  });

  it('expands an empty-string licence request to match both "" and null (measured on the MongoDB server: 208,649 "" docs, 71,025 null docs)', () => {
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
  it('sorts relevance by _id -- the only indexed field on the MongoDB server today', () => {
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
  it('keys a year-sorted count apart from the unsorted one -- they count different sets', () => {
    expect(canonicalCacheKey({ ...emptyFilters, hasYear: true })).not.toBe(
      canonicalCacheKey(emptyFilters),
    );
  });

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
  it('recognises the surname+initials form the corpus stores, however it is punctuated', () => {
    expect(parseAuthorName('Farrell G')).toMatchObject({ surname: 'Farrell', initials: 'G' });
    expect(parseAuthorName('Farrell G.')).toMatchObject({ surname: 'Farrell', initials: 'G' });
    expect(parseAuthorName('Farrell, G')).toMatchObject({ surname: 'Farrell', initials: 'G' });
    expect(parseAuthorName('Farrell,G')).toMatchObject({ surname: 'Farrell', initials: 'G' });
    expect(parseAuthorName('Tosatto SCE')).toMatchObject({ surname: 'Tosatto', initials: 'SCE' });
    expect(parseAuthorName('Tosatto S C E')).toMatchObject({ surname: 'Tosatto', initials: 'SCE' });
  });

  it('no longer requires the initials to be capitals -- people type names in lower case', () => {
    // The old guard was "initials must be UPPERCASE", which made "farrell g" a slow, unranked
    // single-word scan. Shape does the guarding now: a lone letter is never a word.
    expect(parseAuthorName('farrell g')).toMatchObject({ surname: 'farrell', initials: 'G' });
    expect(parseAuthorName('tosatto s.c.e.')).toMatchObject({
      surname: 'tosatto',
      initials: 'SCE',
    });
  });

  it('handles non-ASCII and multi-part surnames', () => {
    expect(parseAuthorName('Grønning AGB')).toMatchObject({ surname: 'Grønning', initials: 'AGB' });
    expect(parseAuthorName("O'Brien K")).toMatchObject({ surname: "O'Brien", initials: 'K' });
    expect(parseAuthorName('van der Berg J')).toMatchObject({
      surname: 'van der Berg',
      initials: 'J',
    });
  });

  it('does NOT claim ordinary topical queries', () => {
    // Treating "single cell" as a surname+initials pair would put a wrong $text phrase in front of
    // a real search. Every one of these still yields `given` interpretations, which only ever widen
    // the filter -- but none of them reaches the phrase path.
    expect(parseAuthorName('random forest')).toBeUndefined();
    expect(parseAuthorName('single cell')).toBeUndefined();
    expect(parseAuthorName('deep learning')).toBeUndefined();
    expect(parseAuthorName('DNA methylation')).toBeUndefined();
  });

  it('does not claim an initials-first query -- that is the probe path, not the phrase path', () => {
    expect(parseAuthorName('G Farrell')).toBeUndefined();
    expect(parseAuthorName('T cell')).toBeUndefined();
  });

  it('does not claim queries that are not a surname and initials at all', () => {
    expect(parseAuthorName('Farrell')).toBeUndefined();
    // Two authors pasted together: "Attafi" is not initials, so "Farrell G Attafi" is not a
    // surname. Claiming it would put a phrase that matches nothing in front of a working query.
    expect(parseAuthorName('Farrell G Attafi O')).toBeUndefined();
  });
});

describe('authorInterpretations', () => {
  const shapes = (q: string) =>
    authorInterpretations(q).map((n) => `${n.shape}:${n.surname} ${n.initials}`);

  it('reads a stored-form name one way only', () => {
    expect(shapes('Farrell G')).toEqual(['pubmed:Farrell G']);
    expect(shapes('farrell g')).toEqual(['pubmed:farrell G']);
    expect(shapes('LEE JH')).toEqual(['pubmed:LEE JH']);
  });

  it('reads an initials-first name, including the dotted form', () => {
    expect(shapes('G Farrell')).toEqual(['leading:Farrell G']);
    expect(shapes('g farrell')).toEqual(['leading:farrell G']);
    expect(shapes('S.C.E. Tosatto')).toEqual(['leading:Tosatto SCE']);
    expect(shapes('J van der Berg')).toEqual(['leading:van der Berg J']);
  });

  it('does not read a leading acronym as initials', () => {
    // "DNA methylation" and "RNA seq" are what people actually type. An all-caps token at the front
    // is an acronym far more often than a person, so it only ever produces the weaker `given`
    // reading, which widens the filter instead of hijacking it.
    expect(shapes('DNA methylation')).toEqual(['given:methylation DNA', 'given:DNA M']);
    expect(shapes('SCE Tosatto')).toEqual(['given:Tosatto SCE', 'given:SCE T']);
  });

  it('tries both orders when no initials were typed at all', () => {
    expect(shapes('Gavin Farrell')).toEqual(['given:Farrell G', 'given:Gavin F']);
    expect(shapes('Farrell Gavin')).toEqual(['given:Gavin F', 'given:Farrell G']);
    // Only the first given name's initial: records carry "Tosatto S" as often as "Tosatto SC", and
    // authorClause lets initials extend, so the shorter reading finds both.
    expect(shapes('Silvio Carlo Tosatto')).toEqual(['given:Tosatto S', 'given:Carlo Tosatto S']);
    // Three tokens do not get the surname-first reading: "Silvio Carlo" is not a surname anyone
    // holds, and every extra interpretation is another regex over the authors field.
    expect(shapes('Gavin van Berg')).toEqual(['given:Berg G', 'given:van Berg G']);
  });

  it('unwraps a fully quoted name but leaves a mixed phrase query alone', () => {
    expect(shapes('"Farrell G"')).toEqual(['pubmed:Farrell G']);
    expect(authorInterpretations('"random forest" sepsis')).toEqual([]);
  });

  it('normalises a curly apostrophe to the one the corpus stores', () => {
    expect(shapes('O’Brien K')).toEqual(["pubmed:O'Brien K"]);
  });

  it('claims nothing that cannot be a name', () => {
    expect(authorInterpretations('covid 19')).toEqual([]);
    expect(authorInterpretations('C++ parser')).toEqual([]);
    expect(authorInterpretations('neuro')).toEqual([]);
    expect(authorInterpretations('Farrell G Attafi O')).toEqual([]);
    expect(authorInterpretations('a b c d e')).toEqual([]);
  });
});

describe('leadingInitialsName', () => {
  it('claims the initials-first spellings, whatever their case or punctuation', () => {
    expect(leadingInitialsName('G Farrell')).toMatchObject({ surname: 'Farrell', initials: 'G' });
    expect(leadingInitialsName('g farrell')).toMatchObject({ surname: 'farrell', initials: 'G' });
    expect(leadingInitialsName('G. Farrell')).toMatchObject({ surname: 'Farrell', initials: 'G' });
    expect(leadingInitialsName('S.C.E. Tosatto')).toMatchObject({
      surname: 'Tosatto',
      initials: 'SCE',
    });
  });

  it('claims the shapes a topical query can share -- which is why it drives a probe, not a phrase', () => {
    expect(leadingInitialsName('T cell')).toMatchObject({ surname: 'cell', initials: 'T' });
  });

  it('leaves every other shape to the paths that already handle them', () => {
    expect(leadingInitialsName('Farrell G')).toBeUndefined();
    expect(leadingInitialsName('Gavin Farrell')).toBeUndefined();
    expect(leadingInitialsName('SCE Tosatto')).toBeUndefined();
  });
});

describe('buildAuthorProbeFilter', () => {
  const filters = (raw: Record<string, string>) => parseSearchParams(raw).filters;

  it('asks the narrow question only: is anyone called this?', () => {
    const probe = JSON.stringify(buildAuthorProbeFilter(filters({ q: 'G Farrell' })));
    expect(probe).toContain('"$search":"\\"Farrell G\\""');
    expect(probe).toContain('publication_metadata.authors');
    // No title or abstract branch: that is what makes a wrong guess an exact zero rather than a
    // plausible-looking wrong answer.
    expect(probe).not.toContain('publication_metadata.title');
    expect(probe).not.toContain('publication_metadata.abstract');
  });

  it('carries the classification predicate the partial index requires', () => {
    const probe = JSON.stringify(buildAuthorProbeFilter(filters({ q: 'G Farrell' })));
    expect(probe).toContain('llm_classification.classification');
  });

  it('is null whenever a $text query would be illegal or pointless', () => {
    // class= cleared is the 500, not the slow query -- see canUseTextIndex.
    expect(buildAuthorProbeFilter(filters({ q: 'G Farrell', class: '' }))).toBeNull();
    expect(buildAuthorProbeFilter(filters({ q: 'G Farrell', class: 'negative' }))).toBeNull();
    expect(buildAuthorProbeFilter(filters({ q: 'Farrell G' }))).toBeNull();
    expect(buildAuthorProbeFilter(filters({ q: 'Gavin Farrell' }))).toBeNull();
    expect(buildAuthorProbeFilter(filters({}))).toBeNull();
  });

  it('carries the other filters, so a probe hit is never wider than the search', () => {
    const probe = JSON.stringify(
      buildAuthorProbeFilter(filters({ q: 'G Farrell', oa: 'true', year: '2020-' })),
    );
    expect(probe).toContain('source.access.open_access');
    expect(probe).toContain('publication_metadata.year');
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

  it('matches a multi-part surname whatever the spacing', () => {
    const berg = { surname: 'van der Berg', initials: 'J' };
    expect(matches('Halford E, van der Berg J, Dixon A', berg)).toBe(true);
    expect(matches('van der Berg JH', berg)).toBe(true);
  });

  it('matches through a hyphenated initial, which Europe PMC writes for some names', () => {
    expect(matches('Lee J-H, Kim S', { surname: 'Lee', initials: 'J' })).toBe(true);
    expect(matches('Lee J-H, Kim S', { surname: 'Lee', initials: 'JH' })).toBe(false);
  });

  it('matches the first author even when the stored string starts with whitespace', () => {
    expect(matches('  Farrell G, Attafi OA', farrellG)).toBe(true);
  });

  it('is still anchored: a name particle does not match a different surname', () => {
    expect(matches('De Nardo M, Rossi A', { surname: 'de', initials: 'N' })).toBe(false);
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
    // Title mentions of the surname stay out of this tier. A single-term query gives rankPromoted
    // nothing to order by, so papers merely ABOUT a Farrell would fill the cap ahead of the ones
    // she wrote.
    expect(promoted).not.toContain('publication_metadata.title');
  });

  it('promotes the same way when the name was typed initials-first or in lower case', () => {
    for (const q of ['farrell g', 'G Farrell', 'Farrell, G.']) {
      const promoted = JSON.stringify(buildPromotedFilter(filters({ q })));
      expect(promoted).toContain('publication_metadata.authors');
      expect(promoted).not.toContain('publication_metadata.title');
    }
  });

  it('keeps the title tier for a given-name query, where the words could be a topic', () => {
    // A query with no initials in it reads as a name only weakly -- "random forest" produces the
    // same shape as "Gavin Farrell". Dropping the title tier for those author clauses would rank an
    // ordinary topical search by entirely the wrong thing, so both tiers are kept and ordered.
    for (const q of ['Gavin Farrell', 'random forest']) {
      const promoted = JSON.stringify(buildPromotedFilter(filters({ q })));
      expect(promoted).toContain('publication_metadata.title');
      expect(promoted).toContain('publication_metadata.authors');
    }
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

describe('canUseTextIndex', () => {
  const filters = (raw: Record<string, string>) => parseSearchParams(raw).filters;

  it('is true for an ordinary multi-word positives-only search', () => {
    expect(canUseTextIndex(filters({ q: 'random forest' }))).toBe(true);
  });

  it('is FALSE when the classification filter is cleared', () => {
    // This is a correctness guard, not an optimisation. positives_text is a partial index, and
    // MongoDB 4.2 rejects a $text query that does not carry its filter predicate outright --
    // confirmed against the live collection. Getting this wrong is a 500, not a slow query.
    expect(canUseTextIndex(filters({ q: 'random forest', class: '' }))).toBe(false);
  });

  it('is false for any classification other than positives-only', () => {
    expect(canUseTextIndex(filters({ q: 'random forest', class: 'negative' }))).toBe(false);
    expect(canUseTextIndex(filters({ q: 'random forest', class: 'positive,negative' }))).toBe(
      false,
    );
  });

  it('is false with no free text at all', () => {
    expect(canUseTextIndex(filters({}))).toBe(false);
    expect(canUseTextIndex(filters({ oa: 'true' }))).toBe(false);
  });

  it('is true for a lone bare word: a whole word with its inflections, from the index', () => {
    // "dome" used to take the scan path and match "domestic"; the index answers the word itself.
    expect(canUseTextIndex(filters({ q: 'neuro' }))).toBe(true);
    expect(canUseTextIndex(filters({ q: 'transformer' }))).toBe(true);
  });

  it('is false when every term asks for word beginnings, which a stemmed index cannot give', () => {
    expect(canUseTextIndex(filters({ q: 'neuro*' }))).toBe(false);
    expect(canUseTextIndex(filters({ q: 'neuro* imaging' }))).toBe(true);
  });

  it('is true for an author-shaped query, which is a phrase rather than a fragment', () => {
    expect(canUseTextIndex(filters({ q: 'Farrell G' }))).toBe(true);
    expect(canUseTextIndex(filters({ q: 'farrell g' }))).toBe(true);
    expect(canUseTextIndex(filters({ q: 'Gavin Farrell' }))).toBe(true);
  });

  it('is true for an initials-first query too: the probe runs first, and a miss searches the surname', () => {
    expect(canUseTextIndex(filters({ q: 'G Farrell' }))).toBe(true);
  });

  it('is true for a single QUOTED phrase', () => {
    expect(canUseTextIndex(filters({ q: '"random forest"' }))).toBe(true);
  });
});

describe('buildTextSearch', () => {
  it('passes ordinary terms BARE so they stem', () => {
    // Quoting a term turns stemming off: "prediction" matched 3,415 on the probe where bare
    // prediction matched 5,320. The regex clauses alongside do the AND, so bare is safe here.
    expect(buildTextSearch('random forest')).toBe('random forest');
  });

  it('passes a user-quoted phrase BARE too, leaving adjacency to the regex', () => {
    // A $text phrase is a literal adjacency test, but termPattern's phrase regex is markup- and
    // hyphen-tolerant on purpose. ANDing a quoted $text clause on top of it dropped exactly the
    // "random-forest"/"<i>In Vitro</i>" matches the regex had just found.
    expect(buildTextSearch('"random forest" sepsis')).toBe('random forest sepsis');
  });

  it('turns an author-shaped query into a phrase, in any case or punctuation', () => {
    expect(buildTextSearch('Farrell G')).toBe('"Farrell G"');
    expect(buildTextSearch('Farrell G.')).toBe('"Farrell G"');
    expect(buildTextSearch('Farrell, G')).toBe('"Farrell G"');
    expect(buildTextSearch('Tosatto SCE')).toBe('"Tosatto SCE"');
    expect(buildTextSearch('farrell g')).toBe('"farrell G"');
    expect(buildTextSearch('Tosatto S C E')).toBe('"Tosatto SCE"');
  });

  it('leaves the other author shapes on bare terms', () => {
    // "G Farrell" gets the probe instead, and a given-name query has no phrase to make: the words
    // themselves must still select the candidates the regexes will filter.
    expect(buildTextSearch('G Farrell')).toBe('Farrell');
    expect(buildTextSearch('Gavin Farrell')).toBe('Gavin Farrell');
  });

  it('drops a lone letter, which stems to nothing and only widens the candidate set', () => {
    expect(buildTextSearch('Farrell G Attafi O')).toBe('Farrell Attafi');
  });
});

describe('buildTextSearchFilter', () => {
  const filters = (raw: Record<string, string>) => parseSearchParams(raw).filters;

  it('returns null when the text index is not usable', () => {
    expect(buildTextSearchFilter(filters({ q: 'random forest', class: '' }))).toBeNull();
    expect(buildTextSearchFilter(filters({ q: 'neuro*' }))).toBeNull();
    expect(buildTextSearchFilter(filters({}))).toBeNull();
  });

  it('keeps the regex clauses alongside $text -- they are what preserve recall', () => {
    // Measured live: this composite returns identical counts to the regex-only filter
    // (random forest 45,116; deep learning 70,661). $text only selects candidates.
    const built = JSON.stringify(buildTextSearchFilter(filters({ q: 'random forest' })));
    expect(built).toContain('$text');
    expect(built).toContain('publication_metadata.title');
    expect(built).toContain('publication_metadata.abstract');
  });

  it('never puts a quoted phrase in $text, so the regex keeps deciding adjacency', () => {
    // Regression guard for the composite. The markup/hyphen tolerance proved in the termPattern
    // tests above is only reachable if $text does not AND a literal phrase on top of it.
    const built = JSON.stringify(buildTextSearchFilter(filters({ q: '"random forest"' })));
    expect(built).toContain('"$search":"random forest"');
    expect(built).not.toContain('\\"random forest\\"');
  });

  it('carries the classification predicate the partial index requires', () => {
    const built = JSON.stringify(buildTextSearchFilter(filters({ q: 'random forest' })));
    expect(built).toContain('llm_classification.classification');
  });

  it('carries the other filters too, so the index path never widens a search', () => {
    const built = JSON.stringify(
      buildTextSearchFilter(filters({ q: 'random forest', oa: 'true', year: '2020-' })),
    );
    expect(built).toContain('source.access.open_access');
    expect(built).toContain('publication_metadata.year');
  });
});

describe('shouldFallBackFromText', () => {
  const f = parseSearchParams({ q: 'random forest' }).filters;

  it('falls back only on zero -- every other recall risk is handled by the guard', () => {
    expect(shouldFallBackFromText(f, 0)).toBe(true);
    expect(shouldFallBackFromText(f, 1)).toBe(false);
    expect(shouldFallBackFromText(f, 45116)).toBe(false);
  });
});

describe('data resources filter (schema v1.4.0)', () => {
  it('reads dl as a repeatable, verbatim list', () => {
    expect(parseSearchParams({ dl: 'pdb' }).filters.dataResources).toEqual(['pdb']);
    expect(parseSearchParams({ dl: ['pdb', 'geo'] }).filters.dataResources).toEqual(['pdb', 'geo']);
    expect(parseSearchParams({}).filters.dataResources).toBeUndefined();
  });

  it('matches any linked resource through the array of subdocuments', () => {
    const filter = buildMongoFilter({ ...emptyFilters, dataResources: ['pdb', 'zenodo'] });
    expect(JSON.stringify(filter)).toContain(
      JSON.stringify({ 'data_links.resources.resource': { $in: ['pdb', 'zenodo'] } }),
    );
  });
});

describe('canonicalCacheKey and the data resources filter', () => {
  it('keys a dl-filtered count separately from the unfiltered one, order-insensitively', () => {
    // Without this the count cache would answer ?dl=pdb with the unfiltered total.
    expect(canonicalCacheKey({ ...emptyFilters, dataResources: ['pdb'] })).not.toBe(
      canonicalCacheKey(emptyFilters),
    );
    expect(canonicalCacheKey({ ...emptyFilters, dataResources: ['pdb', 'geo'] })).toBe(
      canonicalCacheKey({ ...emptyFilters, dataResources: ['geo', 'pdb'] }),
    );
  });
});

describe('parseQueryGroups', () => {
  it('reads a trailing * as the word-beginning marker and strips it before anything can escape it', () => {
    const [group] = parseQueryGroups('neuro*');
    expect(group.typed).toBe('neuro');
    expect(group.alternatives).toEqual([
      { text: 'neuro', words: ['neuro'], prefix: true, source: 'typed' },
    ]);
    const built = JSON.stringify(buildMongoFilter({ ...emptyFilters, q: 'neuro*' }));
    expect(built).toContain('\\\\bneuro"');
    expect(built).not.toContain('\\\\*');
  });

  it('drops a lone star and a term shorter than two characters', () => {
    expect(parseQueryGroups('* a cell')).toEqual([expect.objectContaining({ typed: 'cell' })]);
  });

  it('splits a hyphenated term into words, so "single-cell" also finds "single cell"', () => {
    const [group] = parseQueryGroups('single-cell');
    expect(group.alternatives[0].words).toEqual(['single', 'cell']);
    const re = new RegExp(termPattern(group.alternatives[0].words.join(' ')), 'i');
    expect(re.test('single cell RNA')).toBe(true);
    expect(re.test('single-cell RNA')).toBe(true);
  });

  it('adds the vocabulary spellings of a method name or acronym', () => {
    const [group] = parseQueryGroups('svm');
    expect(group.alternatives[0]).toEqual({
      text: 'svm',
      words: ['svm'],
      prefix: false,
      source: 'typed',
    });
    expect(group.alternatives.map((alt) => alt.text)).toContain('support vector machine');
    expect(group.alternatives.length).toBeLessThanOrEqual(4);
  });

  it('expands a quoted phrase as one term, never its words separately', () => {
    const quoted = parseQueryGroups('"support vector machine"');
    expect(quoted).toHaveLength(1);
    expect(quoted[0].alternatives.map((alt) => alt.text)).toContain('SVM');
    const bare = parseQueryGroups('support vector machine');
    expect(bare).toHaveLength(3);
    expect(bare.every((group) => group.alternatives.length === 1)).toBe(true);
  });

  it('never expands a word-beginning term', () => {
    expect(parseQueryGroups('svm*')[0].alternatives).toHaveLength(1);
  });
});

describe('buildMongoFilter with synonyms', () => {
  type Clause = { $or: Record<string, { $regex: string; $options?: string }>[] };

  it('ORs every spelling inside the term clause, and matches an acronym whole and case-sensitively', () => {
    // "svm" carries no author reading (one token), so the group clause is the filter's first
    // element: the typed word, then the vocabulary's "support vector machine", SVC and SVR.
    const filter = buildMongoFilter({ ...emptyFilters, q: 'svm' });
    const clause = (filter.$and as Clause[])[0];
    const titles = clause.$or.map((c) => c['publication_metadata.title']).filter(Boolean);
    expect(titles.length).toBeGreaterThanOrEqual(3);
    expect(titles[1]).toEqual({ $regex: termPattern('support vector machine'), $options: 'i' });
    // \bann would be "annual" and \bsom "somatic": an acronym is never a word beginning.
    const acronym = titles.find((p) => p.$regex === '\\bSVCs?\\b');
    expect(acronym).toBeDefined();
    expect(acronym?.$options).toBeUndefined();
  });

  it('keeps the typed word case-insensitive and word-start anchored, as before', () => {
    const filter = buildMongoFilter({ ...emptyFilters, q: 'svm' });
    expect((filter.$and as Clause[])[0].$or[0]).toEqual({
      'publication_metadata.title': { $regex: '\\bsvm', $options: 'i' },
    });
  });
});

describe('queryExpansions', () => {
  it('lists what each term was also searched as, and nothing for plain words', () => {
    expect(queryExpansions('random forest')).toEqual([]);
    const [svm] = queryExpansions('svm sepsis');
    expect(svm.term).toBe('svm');
    expect(svm.alternatives).toContain('support vector machine');
  });
});

describe('textSearchWords and buildTextSearch with frequencies', () => {
  const df = (table: Record<string, number>) => (word: string) => table[word];

  it('lists every word the index might be asked for, lower-cased, spellings included', () => {
    expect(textSearchWords('Random Forest')).toEqual(['random', 'forest']);
    expect(textSearchWords('svm')).toEqual(
      expect.arrayContaining(['svm', 'support', 'vector', 'machine']),
    );
    expect(textSearchWords('neuro* imaging')).toEqual(['imaging']);
    expect(textSearchWords('Farrell G')).toEqual([]);
  });

  it('hands $text the rarest word only -- "machine" is in 191k positives, "vector" in 41k', () => {
    // Measured live: all three words 10.0s, "vector" alone 1.3s, the same 29,918 results.
    const table = { support: 76_848, vector: 41_213, machine: 191_139 };
    expect(buildTextSearch('support vector machine', df(table))).toBe('vector');
  });

  it('picks the cheapest term, one word per spelling', () => {
    const table = {
      svm: 21_510,
      support: 76_848,
      vector: 41_213,
      machine: 191_139,
      svc: 900,
      svr: 1_200,
      sepsis: 5_000,
    };
    // "sepsis" alone selects the term AND; "svm" comes along for the reading "svm S" -- see below.
    expect(buildTextSearch('svm sepsis', df(table))).toBe('sepsis svm');
    expect(buildTextSearch('svm', df(table))).toBe('svm vector SVC SVR');
  });

  it('skips a word the index does not know (a stop word, a typo) when another can select', () => {
    expect(buildTextSearch('the dome', df({ the: 0, dome: 66 }))).toBe('dome');
  });

  it('sends every word when nothing could be measured, as it always did', () => {
    expect(buildTextSearch('random forest sepsis')).toBe('random forest sepsis');
    expect(buildTextSearch('the of', df({ the: 0, of: 0 }))).toBe('the of');
  });

  it('never hands $text a word-beginning term', () => {
    expect(buildTextSearch('neuro* imaging', df({ imaging: 60_000, neuro: 1_740 }))).toBe(
      'imaging',
    );
  });

  it('always carries the surname of an author reading the filter keeps', () => {
    // "Gavin Farrell" is matched as the author "Farrell G" OR as the two words. Selecting by the
    // rarest word alone ("gavin", 25 positives) found none of Farrell G's papers, and the query
    // fell to the 16s scan -- measured live. The surname is what selects them.
    const table = { gavin: 25, farrell: 84 };
    expect(buildTextSearch('Gavin Farrell', df(table))).toBe('Farrell Gavin');
    expect(buildTextSearch('Wei Wang', df({ wei: 6_770, wang: 55_700 }))).toBe('Wang Wei');
  });

  it('leaves a reading whose surname is a very common word to the scan path', () => {
    // "support vector machine" reads as the authors "machine S" and "vector machine S". Carrying
    // "machine" (191k positives) would cost the 10s union this exists to avoid; "vector" is kept.
    const table = { support: 76_848, vector: 41_213, machine: 191_139 };
    const filters = parseSearchParams({ q: 'support vector machine' }).filters;
    const built = JSON.stringify(buildTextSearchFilter(filters, df(table)));
    expect(built).toContain('"$search":"vector"');
    // authorClause anchors a surname on a comma or the string start: `(^\s*|,\s*)machine\s+S`.
    expect(built).not.toContain('\\\\s*)machine\\\\s+S');
    expect(built).toContain('\\\\s*)vector\\\\s+machine\\\\s+S');
    // The scan path keeps every reading.
    expect(JSON.stringify(buildMongoFilter(filters))).toContain('\\\\s*)machine\\\\s+S');
  });

  it('covers the term AND with a surname word when one is already required', () => {
    const table = { protein: 30_265, structure: 60_651, prediction: 181_471 };
    expect(buildTextSearch('protein structure prediction', df(table))).toBe('structure');
  });

  it('puts the chosen word into the filter', () => {
    const built = JSON.stringify(
      buildTextSearchFilter(
        parseSearchParams({ q: 'support vector machine' }).filters,
        df({ support: 76_848, vector: 41_213, machine: 191_139 }),
      ),
    );
    expect(built).toContain('"$search":"vector"');
  });
});

describe('identifierQuery', () => {
  const f = (q: string) => parseSearchParams({ q }).filters;

  it('looks a DOI up case-insensitively, with or without a prefix, and drops a trailing full stop', () => {
    for (const q of [
      '10.1016/j.synbio.2026.06.002',
      'https://doi.org/10.1016/j.synbio.2026.06.002',
      'doi:10.1016/J.SYNBIO.2026.06.002',
      '10.1016/j.synbio.2026.06.002.',
    ]) {
      const built = JSON.stringify(identifierQuery(f(q)));
      expect(built).toContain('identifiers.doi');
      expect(built.toLowerCase()).toContain('j\\\\.synbio\\\\.2026\\\\.06\\\\.002$');
      expect(built).toContain('"$options":"i"');
    }
  });

  it('looks a PMID or PMCID up exactly', () => {
    expect(identifierQuery(f('42433271'))).toEqual({
      $and: [
        { 'llm_classification.classification': { $eq: 'positive' } },
        { 'identifiers.pmid': '42433271' },
      ],
    });
    expect(JSON.stringify(identifierQuery(f('pmc13351394')))).toContain(
      '"identifiers.pmcid":"PMC13351394"',
    );
  });

  it('carries the classification and the other filters, so total agrees with every other route', () => {
    const built = JSON.stringify(
      identifierQuery(parseSearchParams({ q: '42433271', class: '', oa: 'true' }).filters),
    );
    expect(built).not.toContain('llm_classification');
    expect(built).toContain('source.access.open_access');
  });

  it('is null for anything that is not an identifier', () => {
    for (const q of ['random forest', '2024', 'dome', '10.5 mg', 'Farrell G']) {
      expect(identifierQuery(f(q))).toBeNull();
    }
  });
});
