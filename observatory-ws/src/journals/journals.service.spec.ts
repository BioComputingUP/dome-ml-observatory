import { SERIES_START, buildJournalPipeline, shapeJournalTable } from './journals.service';

/** Builds the aggregation's own output shape, so the tests exercise the real contract. */
function group(
  journal: string,
  buckets: [number | null, string | null, number, number?][],
): { _id: string; buckets: { y: number | null; c: string | null; n: number; oa: number }[] } {
  return {
    _id: journal,
    buckets: buckets.map(([y, c, n, oa]) => ({ y, c, n, oa: oa ?? 0 })),
  };
}

describe('shapeJournalTable', () => {
  it('totals each classification and derives the AI/ML share', () => {
    const table = shapeJournalTable([
      group('Bioinformatics (Oxford, England)', [
        [2020, 'positive', 30, 12],
        [2020, 'negative', 60],
        [2020, 'undeterminable', 10],
      ]),
    ]);
    const row = table.byName.get('Bioinformatics (Oxford, England)')!;
    expect(row).toMatchObject({
      screened: 100,
      positive: 30,
      negative: 60,
      undeterminable: 10,
      positiveRate: 0.3,
      openAccessPositive: 12,
    });
  });

  it('zero-fills the gaps in a series rather than joining across them', () => {
    // A chart that draws 2002 straight to 2005 claims three years of output the journal did not
    // have. The empty years have to be present and zero.
    const table = shapeJournalTable([
      group('Sparse journal', [
        [2002, 'positive', 4],
        [2005, 'positive', 6],
      ]),
    ]);
    const row = table.byName.get('Sparse journal')!;
    expect(row.series.map((p) => p.year)).toEqual([2002, 2003, 2004, 2005]);
    expect(row.series.map((p) => p.positive)).toEqual([4, 0, 0, 6]);
    expect(row).toMatchObject({ firstYear: 2002, lastYear: 2005, peakYear: 2005 });
  });

  it('folds the null year bucket into `pre` and keeps it out of the series', () => {
    // The aggregation collapses everything before SERIES_START (and anything with no year at all)
    // into one null bucket. Those are real papers and belong in the totals; they just cannot be
    // placed on a time axis.
    const table = shapeJournalTable([
      group('Old journal', [
        [null, 'positive', 7],
        [null, 'negative', 3],
        [2001, 'positive', 2],
      ]),
    ]);
    const row = table.byName.get('Old journal')!;
    expect(row.pre).toEqual({ screened: 10, positive: 7 });
    expect(row.series).toEqual([{ year: 2001, screened: 2, positive: 2 }]);
    expect(row.screened).toBe(12);
    expect(row.positive).toBe(9);
  });

  it('ranks by AI/ML paper count and excludes journals with none', () => {
    const table = shapeJournalTable([
      group('Few', [[2020, 'positive', 5]]),
      group('Many', [[2020, 'positive', 50]]),
      group('None', [[2020, 'negative', 900]]),
    ]);
    expect(table.rankedNames).toEqual(['Many', 'Few']);
    expect(table.rankIndex.get('Many')).toBe(0);
    expect(table.corpus).toMatchObject({
      journals: 2,
      journalsScreened: 3,
      screened: 955,
      positive: 55,
    });
  });

  it('reports no peak year for a journal with no AI/ML papers', () => {
    const table = shapeJournalTable([group('None', [[2020, 'negative', 12]])]);
    const row = table.byName.get('None')!;
    expect(row.peakYear).toBeNull();
    expect(row.positiveRate).toBe(0);
  });

  it('skips a blank journal name rather than creating an unnameable row', () => {
    expect(shapeJournalTable([group('   ', [[2020, 'positive', 3]])]).rows).toEqual([]);
  });
});

describe('buildJournalPipeline', () => {
  /** The pipeline is a plain BSON literal; reading it back as JSON keeps these assertions free of
   *  `any` gymnastics over Mongo's deeply-nested stage types. */
  const stages = (): unknown[] => JSON.parse(JSON.stringify(buildJournalPipeline())) as unknown[];

  it('excludes documents with no usable journal name', () => {
    expect(stages()[0]).toEqual({
      $match: { 'publication_metadata.journal': { $type: 'string', $ne: '' } },
    });
  });

  it('collapses pre-2000 years into a single null bucket', () => {
    expect(stages()[1]).toMatchObject({
      $group: {
        _id: {
          y: {
            $cond: [
              { $gte: ['$publication_metadata.year', SERIES_START] },
              '$publication_metadata.year',
              null,
            ],
          },
        },
      },
    });
  });

  it('regroups by journal so the driver receives one document per journal, not per year', () => {
    const pipeline = stages();
    expect(pipeline).toHaveLength(3);
    expect(pipeline[2]).toMatchObject({ $group: { _id: '$_id.j' } });
  });
});
