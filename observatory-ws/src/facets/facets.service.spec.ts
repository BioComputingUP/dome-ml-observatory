import { rankFacetMatches } from './facets.service';

// Journal names below are real values from the live corpus, not invented -- the ordering problem
// this fixes was only visible against the actual data.
const JOURNALS = [
  '2013 ACM Conference on Bioinformatics, Computational Biology and Biomedical Informatics : ACM - BCB 2013',
  'ACM-BCB ... : the ... ACM Conference on Bioinformatics, Computational Biology and Biomedicine',
  'Advances in bioinformatics',
  'BMC bioinformatics',
  'Bioinformatics (Oxford, England)',
  'Bioinformatics advances',
  'Briefings in bioinformatics',
  'Genomics, proteomics & bioinformatics',
  'IEEE/ACM transactions on computational biology and bioinformatics',
];

describe('rankFacetMatches', () => {
  it('puts journals whose name STARTS with the query above ones that merely contain it', () => {
    // Exactly two entries in JOURNALS start with the query; both must come before everything else.
    const top = rankFacetMatches(JOURNALS, 'bioinformatics', 2);
    expect(top).toEqual(['Bioinformatics advances', 'Bioinformatics (Oxford, England)']);
  });

  it('no longer leads with the conference proceedings that alphabetically sorted first', () => {
    // The reported bug: typing "bioinformatics" returned "2013 ACM Conference on
    // Bioinformatics..." before the journal actually called Bioinformatics.
    const top = rankFacetMatches(JOURNALS, 'bioinformatics', 5);
    expect(top[0]).not.toMatch(/^2013 ACM/);
    expect(top).toContain('Bioinformatics (Oxford, England)');
  });

  it('ranks an exact match first of all', () => {
    const values = [
      'Bioinformatics advances',
      'Bioinformatics',
      'Bioinformatics (Oxford, England)',
    ];
    expect(rankFacetMatches(values, 'bioinformatics', 3)[0]).toBe('Bioinformatics');
  });

  it('ranks a word-start match above a mid-word one', () => {
    const values = ['Nonbioinformatics review', 'Genomics, proteomics & bioinformatics'];
    expect(rankFacetMatches(values, 'bioinformatics', 2)[0]).toBe(
      'Genomics, proteomics & bioinformatics',
    );
  });

  it('treats an opening bracket as a word start, not a mid-word position', () => {
    const values = ['Xbioinformatics', 'Journal (bioinformatics section)'];
    expect(rankFacetMatches(values, 'bioinformatics', 2)[0]).toBe(
      'Journal (bioinformatics section)',
    );
  });

  it('prefers the shorter name when two rank equally', () => {
    const values = [
      'Bioinformatics Research and Applications11th International Symposium, ISBRA 2015',
      'Bioinformatics advances',
    ];
    expect(rankFacetMatches(values, 'bioinformatics', 2)[0]).toBe('Bioinformatics advances');
  });

  it('is deterministic when rank and length both tie', () => {
    const values = ['Bioinformatics bbb', 'Bioinformatics aaa'];
    expect(rankFacetMatches(values, 'bioinformatics', 2)).toEqual([
      'Bioinformatics aaa',
      'Bioinformatics bbb',
    ]);
  });

  it('excludes non-matches and honours the limit', () => {
    expect(rankFacetMatches(JOURNALS, 'bioinformatics', 3)).toHaveLength(3);
    expect(rankFacetMatches(JOURNALS, 'nothing matches this', 10)).toEqual([]);
  });

  it('does not treat the query as a regex', () => {
    const values = ['Cell (Cambridge, Mass.)', 'C.ll'];
    expect(rankFacetMatches(values, 'c.ll', 5)).toEqual(['C.ll']);
  });
});
