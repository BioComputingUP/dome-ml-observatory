import {
  DESIGNATION_KEYS,
  Designation,
  DesignationKey,
  ElixirNode,
  ResourceEntry,
  ResourceVocab,
  dataSlugs,
  hasDesignation,
} from './resource-vocab';
import {
  CountSeries,
  ENRICHED_EXPR,
  JOURNAL_EXPR,
  LiftCell,
  POSITIVE_MATCH,
  yearExpr,
  alignSeries,
  bump,
  lastYearIsPartial,
  liftCells,
  toCountSeries,
  yearAxis,
} from './series';

/** Routes that mean the resource holds a record deposited for the paper (EBI Search found the
 *  paper cited by the entry), against routes that found an accession written in the paper. */
export const DEPOSIT_ROUTES = ['ebisearch_xref', 'ebisearch_domain'];
export const MENTION_ROUTES = ['tm_accession', 'tm_supplementary'];
/** Routes that, alone, found nothing but the derived BioStudies entry. */
export const DERIVED_ROUTES = ['derived'];

/**
 * Every PMC article with supplementary files has a BioStudies record of them, `S-EPMC<digits>`,
 * which the pipeline derives (route `derived`) and EBI Search also returns (`ebisearch_xref`). It
 * says nothing about the paper's data: on 2026-11-25, 129,381 positives carried a BioStudies entry
 * and about 90 of them linked any study other than their own S-EPMC record. So BioStudies counts
 * for a paper only through a linked identifier that is not one, with that link's own routes; the
 * papers carrying only the automatic record are counted in `scope.derivedBioStudies`.
 */
export const AUTOMATIC_BIOSTUDIES_PREFIX = 'S-EPMC';

export const TOP_JOURNALS_PER_RESOURCE = 10;

export type LinkKind = 'deposited' | 'mentioned' | 'other';

/** The routes of resource entry `$$r`: for BioStudies those of its non-automatic links (`$bio`),
 *  for everything else the entry's own (`routes`, or `obtained_by` on a pre-v1.5.0 element). */
const ROUTES = {
  $cond: [
    { $eq: ['$$r.resource', 'biostudies'] },
    '$bio',
    { $ifNull: ['$$r.routes', ['$$r.obtained_by']] },
  ],
};

/** deposited when any route is a deposit route, else mentioned when any is a text-mining route. */
const LINK_KIND = {
  $let: {
    vars: { rt: ROUTES },
    in: {
      $cond: [
        { $gt: [{ $size: { $setIntersection: ['$$rt', DEPOSIT_ROUTES] } }, 0] },
        'deposited',
        {
          $cond: [
            { $gt: [{ $size: { $setIntersection: ['$$rt', MENTION_ROUTES] } }, 0] },
            'mentioned',
            'other',
          ],
        },
      ],
    },
  },
};

/**
 * The two stages every Data pipeline opens with, after the positives $match. The first reduces a
 * paper to what is needed, including `bio`, the routes of its non-automatic BioStudies links. The
 * second keeps the paper's countable resource entries as `res` [{s, c, k}]: data-kind slugs that
 * some route other than `derived` found (an empty route list counts as nothing found).
 */
export function paperStages(
  vocab: ResourceVocab,
  maxYear: number,
  keep: Record<string, unknown> = {},
) {
  const slugs = dataSlugs(vocab);
  return [
    {
      $project: {
        _id: 0,
        ...keep,
        resources: { $ifNull: ['$data_links.resources', []] },
        bio: {
          $setUnion: [
            {
              $map: {
                input: {
                  $filter: {
                    input: { $ifNull: ['$data_links.links', []] },
                    as: 'l',
                    cond: {
                      $and: [
                        { $eq: ['$$l.resource', 'biostudies'] },
                        {
                          $ne: [
                            {
                              $substrCP: [
                                { $ifNull: ['$$l.id', ''] },
                                0,
                                AUTOMATIC_BIOSTUDIES_PREFIX.length,
                              ],
                            },
                            AUTOMATIC_BIOSTUDIES_PREFIX,
                          ],
                        },
                      ],
                    },
                  },
                },
                as: 'l',
                in: '$$l.obtained_by',
              },
            },
          ],
        },
        y: yearExpr(maxYear),
      },
    },
    {
      $project: {
        ...Object.fromEntries(Object.keys(keep).map((k) => [k, 1])),
        y: 1,
        auto: {
          $and: [{ $in: ['biostudies', '$resources.resource'] }, { $eq: [{ $size: '$bio' }, 0] }],
        },
        res: {
          $map: {
            input: {
              $filter: {
                input: '$resources',
                as: 'r',
                cond: {
                  $and: [
                    { $in: ['$$r.resource', slugs] },
                    {
                      $let: {
                        vars: { rt: ROUTES },
                        in: {
                          $and: [
                            { $gt: [{ $size: '$$rt' }, 0] },
                            { $not: [{ $setIsSubset: ['$$rt', DERIVED_ROUTES] }] },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
            as: 'r',
            in: { s: '$$r.resource', c: '$$r.category', k: LINK_KIND },
          },
        },
      },
    },
  ];
}

/** Tag -> the data slugs carrying it: the four designations, and one `node:<code>` per Node. */
export function tagSlugs(vocab: ResourceVocab): { t: string; s: string[] }[] {
  const data = dataSlugs(vocab).map((slug) => vocab.resources.get(slug)!);
  const tags: { t: string; s: string[] }[] = DESIGNATION_KEYS.map((key) => ({
    t: key,
    s: data.filter((r) => hasDesignation(r, key)).map((r) => r.slug),
  }));
  for (const node of vocab.elixirNodes) {
    tags.push({
      t: `node:${node.code}`,
      s: data.filter((r) => r.elixir_nodes.includes(node.code)).map((r) => r.slug),
    });
  }
  return tags.filter((tag) => tag.s.length > 0);
}

/**
 * Pipeline A: one pass over the positives. Projects each paper down to its year, whether it is
 * enriched, its model families and its kept resources (slug, category, link kind), then counts in
 * one $facet. Every branch is bounded by the resource catalogue (90 slugs) times the years.
 */
export function buildDataFacetPipeline(vocab: ResourceVocab, maxYear: number) {
  return [
    { $match: POSITIVE_MATCH },
    ...paperStages(vocab, maxYear, { e: ENRICHED_EXPR, fam: '$content_filters.model_family' }),
    {
      $facet: {
        byYear: [
          {
            $group: {
              _id: '$y',
              positive: { $sum: 1 },
              linking: { $sum: { $cond: [{ $gt: [{ $size: '$res' }, 0] }, 1, 0] } },
              enrichedLinking: {
                $sum: { $cond: [{ $and: ['$e', { $gt: [{ $size: '$res' }, 0] }] }, 1, 0] },
              },
              derived: { $sum: { $cond: ['$auto', 1, 0] } },
            },
          },
        ],
        resources: [
          { $unwind: '$res' },
          { $group: { _id: { s: '$res.s', y: '$y', k: '$res.k' }, n: { $sum: 1 } } },
        ],
        categories: [
          {
            $project: {
              y: 1,
              cats: { $setUnion: [{ $map: { input: '$res', as: 'r', in: '$$r.c' } }] },
            },
          },
          { $unwind: '$cats' },
          { $group: { _id: { c: '$cats', y: '$y' }, n: { $sum: 1 } } },
        ],
        tags: [
          {
            $project: {
              y: 1,
              tags: {
                $map: {
                  input: {
                    $filter: {
                      input: { $literal: tagSlugs(vocab) },
                      as: 't',
                      cond: {
                        $gt: [
                          {
                            $size: {
                              $setIntersection: [
                                '$$t.s',
                                { $map: { input: '$res', as: 'r', in: '$$r.s' } },
                              ],
                            },
                          },
                          0,
                        ],
                      },
                    },
                  },
                  as: 't',
                  in: '$$t.t',
                },
              },
            },
          },
          { $unwind: '$tags' },
          { $group: { _id: { t: '$tags', y: '$y' }, n: { $sum: 1 } } },
        ],
        resourceEnriched: [
          { $match: { e: true } },
          { $unwind: '$res' },
          { $group: { _id: '$res.s', n: { $sum: 1 } } },
        ],
        resourceFamily: [
          { $match: { e: true } },
          { $unwind: '$res' },
          { $unwind: '$fam' },
          { $group: { _id: { s: '$res.s', f: '$fam' }, n: { $sum: 1 } } },
        ],
        linkingFamily: [
          { $match: { e: true, 'res.0': { $exists: true } } },
          { $unwind: '$fam' },
          { $group: { _id: '$fam', n: { $sum: 1 } } },
        ],
      },
    },
  ];
}

/** Pipeline B: resource by journal, streamed; only the top journals per resource are kept. */
export function buildResourceJournalPipeline(vocab: ResourceVocab, maxYear: number) {
  return [
    { $match: POSITIVE_MATCH },
    ...paperStages(vocab, maxYear, { j: JOURNAL_EXPR }),
    { $project: { j: 1, s: '$res.s' } },
    { $match: { j: { $ne: null }, 's.0': { $exists: true } } },
    { $unwind: '$s' },
    { $group: { _id: { s: '$s', j: '$j' }, n: { $sum: 1 } } },
  ];
}

export interface RawDataFacet {
  byYear: {
    _id: number | null;
    positive: number;
    linking: number;
    enrichedLinking: number;
    derived: number;
  }[];
  resources: { _id: { s: string; y: number | null; k: LinkKind }; n: number }[];
  categories: { _id: { c: string | null; y: number | null }; n: number }[];
  tags: { _id: { t: string; y: number | null }; n: number }[];
  resourceEnriched: { _id: string; n: number }[];
  resourceFamily: { _id: { s: string; f: unknown }; n: number }[];
  linkingFamily: { _id: unknown; n: number }[];
}

export type RawResourceJournal = { _id: { s: string; j: string }; n: number };

export interface ResourceRow extends ResourceEntry {
  /** AI/ML methods papers linking the resource. */
  papers: number;
  /** Of those, how the link was found (see LinkKind). */
  deposited: number;
  mentioned: number;
  other: number;
  /** Aligned to the table's `years`. */
  series: number[];
  /** Enriched papers linking it, the base of its model-family cells. */
  enriched: number;
}

export interface TagSummary {
  /** A designation key, or `node:<code>`. */
  key: string;
  label: string;
  status: 'sourced' | 'pending';
  source: string | null;
  /** Data resources carrying the tag, whether or not any paper links them. */
  resources: number;
  /** Papers linking at least one of them. */
  papers: number;
  series: number[];
}

export interface DataOverview {
  generated: string;
  years: number[];
  lastYearPartial: boolean;
  scope: {
    positive: number;
    /** Positives linking at least one data resource (kind `data`, derived-only entries left out). */
    linking: number;
    enrichedLinking: number;
    /** Positives whose only BioStudies link is their own automatic supplementary-files record. */
    derivedBioStudies: number;
    /** Catalogue slugs that are not data resources, by kind; never ranked. */
    excludedKinds: { kind: string; slugs: string[] }[];
  };
  positiveByYear: number[];
  linkingByYear: number[];
  designations: TagSummary[];
  nodes: (ElixirNode & { resources: number; papers: number })[];
  categories: CountSeries[];
  resources: ResourceRow[];
  /** Model-family share among enriched papers linking any data resource: the baseline the
   *  resource-by-family lift is measured against. */
  families: { value: string; count: number }[];
  resourceFamilies: { slug: string; enriched: number; cells: LiftCell[] }[];
}

export interface ResourceDetail {
  generated: string;
  years: number[];
  lastYearPartial: boolean;
  resource: ResourceRow;
  topJournals: { journal: string; papers: number }[];
  families: LiftCell[];
}

export interface DataTable {
  overview: DataOverview;
  details: Map<string, ResourceDetail>;
}

function label(value: unknown): string | null {
  if (Array.isArray(value)) return label(value[0]);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Pure; see shapeModelsTable. */
export function shapeDataTable(
  facet: RawDataFacet,
  journals: RawResourceJournal[],
  vocab: ResourceVocab,
  generated: string,
): DataTable {
  const by = (key: 'positive' | 'linking' | 'enrichedLinking' | 'derived') =>
    new Map(facet.byYear.map((r) => [r._id, r[key]] as [number | null, number]));
  const positiveBy = by('positive');
  const linkingBy = by('linking');
  const sumAll = (m: Map<number | null, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  const years = yearAxis([...linkingBy.entries()].filter(([, n]) => n > 0).map(([y]) => y));

  const perYear = new Map<string, Map<number | null, number>>();
  const kinds = new Map<string, Record<LinkKind, number>>();
  for (const row of facet.resources) {
    bump(perYear, row._id.s, row._id.y, row.n);
    const k = kinds.get(row._id.s) ?? { deposited: 0, mentioned: 0, other: 0 };
    k[row._id.k] += row.n;
    kinds.set(row._id.s, k);
  }
  const enrichedBy = new Map(facet.resourceEnriched.map((r) => [r._id, r.n]));

  const resources: ResourceRow[] = [];
  for (const [slug, byYear] of perYear) {
    const entry = vocab.resources.get(slug);
    if (!entry) continue; // the pipeline only keeps vocabulary slugs; belt and braces
    const k = kinds.get(slug)!;
    resources.push({
      ...entry,
      papers: k.deposited + k.mentioned + k.other,
      ...k,
      series: alignSeries(byYear, years),
      enriched: enrichedBy.get(slug) ?? 0,
    });
  }
  resources.sort((a, b) => b.papers - a.papers || a.slug.localeCompare(b.slug));

  const categories = new Map<string, Map<number | null, number>>();
  for (const row of facet.categories) {
    const c = label(row._id.c);
    if (c) bump(categories, c, row._id.y, row.n);
  }

  const tagYears = new Map<string, Map<number | null, number>>();
  for (const row of facet.tags) bump(tagYears, row._id.t, row._id.y, row.n);
  const tagCounts = tagSlugs(vocab);
  const summarise = (
    key: string,
    designation: Designation | undefined,
    fallback: string,
  ): TagSummary => {
    const byYear = tagYears.get(key) ?? new Map<number | null, number>();
    return {
      key,
      label: designation?.label ?? fallback,
      status: designation?.status ?? 'pending',
      source: designation?.source ?? null,
      resources: tagCounts.find((t) => t.t === key)?.s.length ?? 0,
      papers: sumAll(byYear),
      series: alignSeries(byYear, years),
    };
  };
  const designations = DESIGNATION_KEYS.map((key: DesignationKey) =>
    summarise(key, vocab.designations[key], key),
  );
  const nodes = vocab.elixirNodes.map((node) => {
    const tag = summarise(`node:${node.code}`, vocab.designations.elixir_nodes, node.name);
    return { ...node, resources: tag.resources, papers: tag.papers };
  });

  const familyTotals = new Map<string, number>();
  for (const row of facet.linkingFamily) {
    const f = label(row._id);
    if (f) familyTotals.set(f, (familyTotals.get(f) ?? 0) + row.n);
  }
  const enrichedLinking = sumAll(by('enrichedLinking'));
  const resFam = new Map<string, Map<string, number>>();
  for (const row of facet.resourceFamily) {
    const f = label(row._id.f);
    if (!f) continue;
    const m = resFam.get(row._id.s) ?? new Map<string, number>();
    m.set(f, (m.get(f) ?? 0) + row.n);
    resFam.set(row._id.s, m);
  }
  const familyCells = (r: ResourceRow) =>
    liftCells(
      resFam.get(r.slug) ?? new Map<string, number>(),
      r.enriched,
      familyTotals,
      enrichedLinking,
    );

  const excluded = new Map<string, string[]>();
  for (const entry of vocab.resources.values()) {
    if (entry.kind === 'data') continue;
    excluded.set(entry.kind, [...(excluded.get(entry.kind) ?? []), entry.slug]);
  }

  const overview: DataOverview = {
    generated,
    years,
    lastYearPartial: lastYearIsPartial(years, generated),
    scope: {
      positive: sumAll(positiveBy),
      linking: sumAll(linkingBy),
      enrichedLinking,
      derivedBioStudies: sumAll(by('derived')),
      excludedKinds: [...excluded.entries()]
        .map(([kind, slugs]) => ({ kind, slugs: slugs.sort() }))
        .sort((a, b) => a.kind.localeCompare(b.kind)),
    },
    positiveByYear: alignSeries(positiveBy, years),
    linkingByYear: alignSeries(linkingBy, years),
    designations,
    nodes,
    categories: toCountSeries(categories, years),
    resources,
    families: [...familyTotals.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    resourceFamilies: resources.map((r) => ({
      slug: r.slug,
      enriched: r.enriched,
      cells: familyCells(r),
    })),
  };

  const topJournals = new Map<string, { journal: string; papers: number }[]>();
  for (const row of journals) {
    const list = topJournals.get(row._id.s) ?? [];
    list.push({ journal: row._id.j, papers: row.n });
    topJournals.set(row._id.s, list);
  }
  const details = new Map<string, ResourceDetail>();
  for (const r of resources) {
    details.set(r.slug, {
      generated,
      years,
      lastYearPartial: overview.lastYearPartial,
      resource: r,
      topJournals: (topJournals.get(r.slug) ?? [])
        .sort((a, b) => b.papers - a.papers || a.journal.localeCompare(b.journal))
        .slice(0, TOP_JOURNALS_PER_RESOURCE),
      families: familyCells(r),
    });
  }
  return { overview, details };
}
