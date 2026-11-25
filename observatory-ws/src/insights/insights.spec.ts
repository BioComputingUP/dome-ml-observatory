import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Model } from 'mongoose';
import { RecordDocument } from '../records/schemas/record.schema';
import { currentReleaseDir } from '../common/schema-version';
import {
  AUTOMATIC_BIOSTUDIES_PREFIX,
  RawDataFacet,
  buildDataFacetPipeline,
  buildResourceJournalPipeline,
  paperStages,
  shapeDataTable,
  tagSlugs,
} from './data-insights';
import {
  JOURNAL_MIN_ENRICHED,
  MOVER_MIN_PAPERS,
  RawModelsFacet,
  TOP_MODEL_TYPES,
  buildModelTypePipeline,
  buildModelsFacetPipeline,
  computeMovers,
  foldModelTypes,
  shapeModelsTable,
} from './models-insights';
import { InsightsService } from './insights.service';
import { ResourceEntry, dataSlugs, loadResourceVocab, parseResourceVocab } from './resource-vocab';
import { SERIES_START, liftCells, yearAxis, yearExpr } from './series';

const GENERATED = '2026-11-25T12:00:00.000Z';

function entry(slug: string, over: Partial<ResourceEntry> = {}): ResourceEntry {
  return {
    slug,
    label: slug.toUpperCase(),
    category: 'Cat',
    kind: 'data',
    host: null,
    embl_ebi: false,
    gcbr: null,
    elixir_cdr: null,
    elixir_edd: null,
    elixir_nodes: [],
    ...over,
  };
}

const VOCAB = parseResourceVocab({
  designations: {
    embl_ebi: { label: 'EMBL-EBI', status: 'sourced' },
    gcbr: { label: 'Global Core Biodata Resource', status: 'sourced', source: 'https://gbc' },
    elixir_cdr: { label: 'ELIXIR Core Data Resource', status: 'pending' },
    elixir_edd: { label: 'ELIXIR Deposition Database', status: 'pending' },
    elixir_nodes: { label: 'ELIXIR Node', status: 'pending' },
  },
  elixir_nodes: [
    { code: 'CH', name: 'Switzerland' },
    { code: 'IT', name: 'Italy' },
  ],
  resources: [
    entry('pdb', { embl_ebi: true, gcbr: 'Protein Data Bank', category: 'Protein Structures' }),
    entry('geo', { category: 'Gene Expression' }),
    entry('cellosaurus', { gcbr: 'Cellosaurus', elixir_nodes: ['CH'] }),
    entry('biostudies', { embl_ebi: true, category: 'Supplementary Material' }),
    entry('biotools', { kind: 'software_registry' }),
    entry('go', { kind: 'ontology' }),
  ],
});

// ---------------------------------------------------------------------------------------------
// The published vocabulary
// ---------------------------------------------------------------------------------------------

describe('resource vocabulary', () => {
  it('loads the CURRENT release and ranks only data-kind slugs', () => {
    const vocab = loadResourceVocab(currentReleaseDir());
    expect(vocab.resources.size).toBeGreaterThan(50);
    const ranked = dataSlugs(vocab);
    expect(ranked).toContain('pdb');
    expect(ranked).not.toContain('biotools');
    expect(ranked).not.toContain('dome_registry');
    expect(vocab.designations.gcbr?.status).toBe('sourced');
  });

  it('is empty, not fatal, for a release without the file', () => {
    expect(loadResourceVocab('/nonexistent').resources.size).toBe(0);
  });

  it('tags carry only data slugs, and a Node with no resource yields no tag', () => {
    const tags = Object.fromEntries(tagSlugs(VOCAB).map((t) => [t.t, t.s]));
    expect(tags.embl_ebi).toEqual(['biostudies', 'pdb']);
    expect(tags.gcbr).toEqual(['cellosaurus', 'pdb']);
    expect(tags['node:CH']).toEqual(['cellosaurus']);
    expect(tags['node:IT']).toBeUndefined();
    expect(tags.elixir_cdr).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------------------------

describe('pipelines', () => {
  it('put a year on the axis only between SERIES_START and the build year', () => {
    expect(yearExpr(2026)).toEqual({
      $cond: [
        {
          $and: [
            { $gte: ['$publication_metadata.year', SERIES_START] },
            { $lte: ['$publication_metadata.year', 2026] },
          ],
        },
        '$publication_metadata.year',
        null,
      ],
    });
  });

  it('every pipeline opens on the positives, so the class_year_id index serves it', () => {
    for (const p of [
      buildModelsFacetPipeline(2026),
      buildModelTypePipeline(2026),
      buildDataFacetPipeline(VOCAB, 2026),
      buildResourceJournalPipeline(VOCAB, 2026),
    ]) {
      expect(p[0]).toMatchObject({ $match: { 'llm_classification.classification': 'positive' } });
    }
    expect(buildModelTypePipeline(2026)[0]).toEqual({
      $match: {
        'llm_classification.classification': 'positive',
        'llm_enrichment.provider': { $ne: null },
      },
    });
  });

  it('keeps only data-kind slugs, and judges BioStudies by its non-automatic links', () => {
    const json = JSON.stringify(paperStages(VOCAB, 2026));
    expect(json).toContain(JSON.stringify(['biostudies', 'cellosaurus', 'geo', 'pdb']));
    expect(json).not.toContain('"biotools"');
    expect(json).toContain(`"${AUTOMATIC_BIOSTUDIES_PREFIX}"`);
    // The derived-only test must require a non-empty route list.
    expect(json).toContain('{"$gt":[{"$size":"$$rt"},0]}');
    // Curated submissions and the kept /datalinks external links count as deposits.
    expect(json).toContain('"submission"');
    expect(json).toContain('"ext_links"');
  });

  it('runs the open-vocabulary groups as their own pipelines, not inside the $facet', () => {
    const facet = buildModelsFacetPipeline(2026).find((s) => '$facet' in s) as {
      $facet: Record<string, unknown>;
    };
    expect(Object.keys(facet.$facet)).not.toContain('modelType');
    expect(Object.keys(facet.$facet)).not.toContain('journalFamily');
  });
});

// ---------------------------------------------------------------------------------------------
// Models shaping
// ---------------------------------------------------------------------------------------------

const yv = (y: number | null, v: unknown, n: number) => ({ _id: { y, v }, n });

function modelsFacet(over: Partial<RawModelsFacet> = {}): RawModelsFacet {
  return {
    byYear: [
      { _id: null, positive: 50, enriched: 0, withUse: 0 },
      { _id: 2024, positive: 100, enriched: 40, withUse: 30 },
      { _id: 2025, positive: 120, enriched: 60, withUse: 60 },
    ],
    family: [
      yv(2024, 'deep learning', 30),
      yv(2025, 'deep learning', 50),
      yv(2025, 'classical machine learning', 20),
    ],
    paradigm: [yv(2025, 'supervised', 55)],
    use: [yv(2025, 'trained in this study', 58)],
    journals: [
      { _id: 'Big', n: JOURNAL_MIN_ENRICHED },
      { _id: 'Small', n: 3 },
    ],
    domains: [
      { _id: 'Medicine', n: 80 },
      { _id: null, n: 20 },
    ],
    domainFamily: [{ _id: { d: 'Medicine', v: 'deep learning' }, n: 70 }],
    ...over,
  };
}

describe('shapeModelsTable', () => {
  const table = shapeModelsTable(
    modelsFacet(),
    [yv(2025, 'Random forest', 5), yv(2025, 'random forest', 7), yv(2024, 'SVM', 2)],
    [
      { _id: { j: 'Big', v: 'deep learning' }, n: 90 },
      { _id: { j: 'Small', v: 'classical machine learning' }, n: 3 },
    ],
    GENERATED,
  );
  const o = table.overview;

  it('aligns every series to the years that have enriched papers', () => {
    expect(o.years).toEqual([2024, 2025]);
    expect(o.enrichedByYear).toEqual([40, 60]);
    expect(o.positiveByYear).toEqual([100, 120]);
    expect(o.coverage).toEqual({ positive: 270, enriched: 100, withModelUse: 90 });
    expect(o.families[0]).toEqual({ value: 'deep learning', total: 80, series: [30, 50] });
  });

  it('marks the build year as partial only when it is on the axis', () => {
    expect(o.lastYearPartial).toBe(false);
    expect(yearAxis([2026, 2024])).toEqual([2024, 2025, 2026]);
  });

  it('groups model types case-insensitively under their most used spelling', () => {
    expect(o.modelTypes.top.map((t) => [t.value, t.total])).toEqual([
      ['random forest', 12],
      ['SVM', 2],
    ]);
    expect(o.modelTypes.distinct).toBe(2);
    expect(o.modelTypes.tail).toEqual({ distinct: 0, total: 0 });
  });

  it('folds types past the top into a counted tail', () => {
    const many = Array.from({ length: TOP_MODEL_TYPES + 3 }, (_, i) => yv(2025, `t${i}`, 100 - i));
    const t = shapeModelsTable(modelsFacet(), many, [], GENERATED).overview.modelTypes;
    expect(t.top).toHaveLength(TOP_MODEL_TYPES);
    expect(t.tail.distinct).toBe(3);
  });

  it('lists only journals over the threshold, but answers any journal by name', () => {
    expect(o.journals.rows.map((r) => r.name)).toEqual(['Big']);
    expect(o.journals.qualifying).toBe(1);
    const small = table.journals.get('Small')!;
    expect(small.rank).toBe(2);
    expect(small.profile.enriched).toBe(3);
  });

  it('measures lift against the corpus share of each family', () => {
    const big = o.journals.rows[0].cells.find((c) => c.value === 'deep learning')!;
    // Big: 90 of 100 deep learning; corpus: 80 of 100.
    expect(big.share).toBeCloseTo(0.9);
    expect(big.lift).toBeCloseTo(0.9 / 0.8);
    expect(o.domains.map((d) => d.name)).toEqual(['Medicine']);
  });
});

describe('computeMovers', () => {
  it('compares the last three full years with the three before, leaving out the build year', () => {
    const enriched = new Map<number | null, number>(
      [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => [y, 100]),
    );
    const types = foldModelTypes([
      ...[2020, 2021, 2022].map((y) => yv(y, 'old', 20)),
      ...[2023, 2024, 2025].map((y) => yv(y, 'old', 5)),
      ...[2023, 2024, 2025].map((y) => yv(y, 'new', 20)),
      yv(2026, 'new', 1000), // the build year counts for nothing
      yv(2025, 'rare', MOVER_MIN_PAPERS - 1),
    ]);
    const m = computeMovers(types, enriched, GENERATED);
    expect(m.recentYears).toEqual([2023, 2025]);
    expect(m.previousYears).toEqual([2020, 2022]);
    expect(m.rising.map((x) => [x.value, Math.round(x.change)])).toEqual([['new', 20]]);
    expect(m.falling.map((x) => [x.value, Math.round(x.change)])).toEqual([['old', -15]]);
  });
});

describe('liftCells', () => {
  it('is null where the corpus has none of a value', () => {
    const cells = liftCells(
      new Map([['a', 1]]),
      2,
      new Map([
        ['a', 0],
        ['b', 5],
      ]),
      10,
    );
    expect(cells.find((c) => c.value === 'a')!.lift).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Data shaping
// ---------------------------------------------------------------------------------------------

function dataFacet(over: Partial<RawDataFacet> = {}): RawDataFacet {
  return {
    byYear: [
      { _id: 2024, positive: 100, linking: 10, enrichedLinking: 4, derived: 30 },
      { _id: 2025, positive: 200, linking: 30, enrichedLinking: 10, derived: 60 },
      { _id: null, positive: 5, linking: 0, enrichedLinking: 0, derived: 1 },
    ],
    resources: [
      { _id: { s: 'pdb', y: 2024, k: 'mentioned' }, n: 4 },
      { _id: { s: 'pdb', y: 2025, k: 'deposited' }, n: 6 },
      { _id: { s: 'geo', y: 2025, k: 'mentioned' }, n: 20 },
      { _id: { s: 'unknown_slug', y: 2025, k: 'other' }, n: 99 },
    ],
    categories: [{ _id: { c: 'Gene Expression', y: 2025 }, n: 20 }],
    tags: [
      { _id: { t: 'embl_ebi', y: 2024 }, n: 4 },
      { _id: { t: 'embl_ebi', y: 2025 }, n: 6 },
    ],
    resourceEnriched: [{ _id: 'pdb', n: 5 }],
    resourceFamily: [{ _id: { s: 'pdb', f: 'deep learning' }, n: 5 }],
    linkingFamily: [
      { _id: 'deep learning', n: 7 },
      { _id: 'classical machine learning', n: 7 },
    ],
    ...over,
  };
}

describe('shapeDataTable', () => {
  const journals = Array.from({ length: 12 }, (_, i) => ({
    _id: { s: 'pdb', j: `J${i}` },
    n: i + 1,
  }));
  const table = shapeDataTable(dataFacet(), journals, VOCAB, GENERATED);
  const o = table.overview;

  it('ranks the vocabulary resources by papers, and drops a slug the vocabulary lacks', () => {
    expect(o.resources.map((r) => [r.slug, r.papers])).toEqual([
      ['geo', 20],
      ['pdb', 10],
    ]);
    const pdb = o.resources.find((r) => r.slug === 'pdb')!;
    expect([pdb.deposited, pdb.mentioned, pdb.other]).toEqual([6, 4, 0]);
    expect(pdb.series).toEqual([4, 6]);
    expect(pdb.gcbr).toBe('Protein Data Bank');
  });

  it('states the scope: linking papers, the automatic BioStudies record, the unranked kinds', () => {
    expect(o.scope.positive).toBe(305);
    expect(o.scope.linking).toBe(40);
    expect(o.scope.derivedBioStudies).toBe(91);
    expect(o.scope.excludedKinds).toEqual([
      { kind: 'ontology', slugs: ['go'] },
      { kind: 'software_registry', slugs: ['biotools'] },
    ]);
  });

  it('reports each designation with its status, and every Node from the vocabulary', () => {
    const ebi = o.designations.find((d) => d.key === 'embl_ebi')!;
    expect([ebi.status, ebi.resources, ebi.papers, ebi.series]).toEqual(['sourced', 2, 10, [4, 6]]);
    expect(o.designations.find((d) => d.key === 'elixir_cdr')!.status).toBe('pending');
    expect(o.nodes.map((n) => [n.code, n.resources])).toEqual([
      ['CH', 1],
      ['IT', 0],
    ]);
  });

  it('keeps the top ten journals per resource for its detail', () => {
    const detail = table.details.get('pdb')!;
    expect(detail.topJournals).toHaveLength(10);
    expect(detail.topJournals[0]).toEqual({ journal: 'J11', papers: 12 });
    const dl = detail.families.find((c) => c.value === 'deep learning')!;
    expect(dl.share).toBe(1);
    expect(dl.lift).toBeCloseTo(1 / (7 / 14));
  });
});

// ---------------------------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------------------------

describe('InsightsService', () => {
  function serviceWith(exec: jest.Mock): InsightsService {
    const aggregate = jest.fn().mockReturnValue({ option: jest.fn().mockReturnValue({ exec }) });
    return new InsightsService({ aggregate } as unknown as Model<RecordDocument>);
  }

  it('answers 503 when the first build fails', async () => {
    const service = serviceWith(jest.fn().mockRejectedValue(new Error('down')));
    await expect(service.modelsOverview()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('answers 404 for a journal with no enriched paper', async () => {
    const exec = jest
      .fn()
      .mockResolvedValueOnce([modelsFacet()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = serviceWith(exec);
    await expect(service.journalProfile('Nope')).rejects.toBeInstanceOf(NotFoundException);
    const big = await service.journalProfile('Big');
    expect([big.rank, big.rankOf, big.profile.enriched]).toEqual([1, 2, JOURNAL_MIN_ENRICHED]);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('answers 404 for a resource no paper links', async () => {
    const exec = jest.fn().mockResolvedValueOnce([dataFacet()]).mockResolvedValueOnce([]);
    const service = serviceWith(exec);
    await expect(service.resourceDetail('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
