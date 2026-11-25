/** Small, shape-complete responses for the Data & Models specs. Not a spec itself. */
import { DataOverview, ModelsOverview, ResourceRow } from '../core/insights.model';

const YEARS = [2023, 2024, 2025, 2026];

export function modelsFixture(): ModelsOverview {
  const cells = [
    { value: 'deep learning', count: 60, share: 0.6, lift: 1.5 },
    { value: 'classical machine learning', count: 40, share: 0.4, lift: 0.8 },
  ];
  return {
    generated: '2026-11-25T12:00:00Z',
    years: YEARS,
    lastYearPartial: true,
    coverage: { positive: 1000, enriched: 400, withModelUse: 350 },
    positiveByYear: [200, 250, 300, 250],
    enrichedByYear: [80, 100, 120, 100],
    withUseByYear: [60, 90, 110, 90],
    families: [
      { value: 'deep learning', total: 200, series: [30, 50, 70, 50] },
      { value: 'classical machine learning', total: 160, series: [50, 40, 40, 30] },
    ],
    paradigms: [{ value: 'supervised', total: 300, series: [70, 80, 90, 60] }],
    uses: [
      { value: 'trained in this study', total: 300, series: [55, 80, 95, 70] },
      { value: 'fine-tuned or adapted', total: 50, series: [5, 10, 15, 20] },
    ],
    modelTypes: {
      distinct: 3,
      top: [
        { value: 'random forest', total: 90, series: [30, 25, 20, 15] },
        { value: 'transformer', total: 70, series: [5, 15, 25, 25] },
      ],
      tail: { distinct: 1, total: 4 },
    },
    movers: {
      recentYears: [2023, 2025],
      previousYears: [2020, 2022],
      minPapers: 30,
      rising: [{ value: 'transformer', recent: 45, previous: 5, recentShare: 0.15, previousShare: 0.02, change: 13 }],
      falling: [{ value: 'random forest', recent: 75, previous: 90, recentShare: 0.25, previousShare: 0.4, change: -15 }],
    },
    journals: {
      minEnriched: 100,
      qualifying: 1,
      rows: [{ name: 'Bioinformatics (Oxford, England)', enriched: 100, cells }],
    },
    domains: [{ name: 'Medicine', enriched: 150, cells }],
  };
}

export function resourceRow(slug: string, over: Partial<ResourceRow> = {}): ResourceRow {
  return {
    slug,
    label: slug.toUpperCase(),
    category: 'Protein Structures',
    kind: 'data',
    host: null,
    embl_ebi: false,
    gcbr: null,
    elixir_cdr: null,
    elixir_edd: null,
    elixir_nodes: [],
    papers: 10,
    deposited: 4,
    mentioned: 6,
    other: 0,
    series: [2, 3, 3, 2],
    enriched: 8,
    ...over,
  };
}

export function dataFixture(): DataOverview {
  return {
    generated: '2026-11-25T12:00:00Z',
    years: YEARS,
    lastYearPartial: true,
    scope: {
      positive: 1000,
      linking: 120,
      enrichedLinking: 60,
      derivedBioStudies: 300,
      excludedKinds: [
        { kind: 'code', slugs: ['github'] },
        { kind: 'software_registry', slugs: ['biotools'] },
      ],
    },
    positiveByYear: [200, 250, 300, 250],
    linkingByYear: [60, 70, 80, 50],
    designations: [
      { key: 'embl_ebi', label: 'EMBL-EBI', status: 'sourced', source: null, resources: 1, papers: 50, series: [10, 10, 20, 10] },
      { key: 'elixir_cdr', label: 'ELIXIR Core Data Resource', status: 'pending', source: null, resources: 0, papers: 0, series: [0, 0, 0, 0] },
      { key: 'elixir_edd', label: 'ELIXIR Deposition Database', status: 'pending', source: null, resources: 0, papers: 0, series: [0, 0, 0, 0] },
      { key: 'gcbr', label: 'Global Core Biodata Resource', status: 'sourced', source: 'https://gbc', resources: 1, papers: 50, series: [10, 10, 20, 10] },
    ],
    nodes: [],
    categories: [{ value: 'Gene Expression', total: 70, series: [20, 20, 20, 10] }],
    resources: [
      resourceRow('geo', { category: 'Gene Expression', papers: 70, deposited: 10, mentioned: 60 }),
      resourceRow('pdb', { embl_ebi: true, gcbr: 'Protein Data Bank', papers: 50 }),
    ],
    families: [{ value: 'deep learning', count: 40 }],
    resourceFamilies: [
      { slug: 'geo', enriched: 30, cells: [{ value: 'deep learning', count: 10, share: 0.33, lift: 0.5 }] },
      { slug: 'pdb', enriched: 20, cells: [{ value: 'deep learning', count: 18, share: 0.9, lift: 1.4 }] },
    ],
  };
}
