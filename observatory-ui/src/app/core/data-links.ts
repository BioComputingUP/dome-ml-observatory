/**
 * The cards a record's data links become.
 *
 * The pipeline (dome-ml-observatory-triage, `moros_pipeline/scripts/build_data_links.py`) merges
 * every route that links a paper to an asset -- Europe PMC's text-mined accessions, data citations
 * and BioStudies supplementary entry, and (schema v1.5.0) EBI Search's database-side links, where a
 * repository, bio.tools or the DOME Registry names the paper -- into one list of resources, each a
 * stable slug with a label and a category. It files every link under its home resource and
 * deduplicates, so one accession is one link however many routes found it, and stores one summary
 * entry per resource on the record (`data_links.resources[]`, always complete) plus capped link
 * detail (`data_links.links[]`). This file maps a slug to an icon and a card group, and turns each
 * resource into one card alongside the reserved cross-links in outbound-links.ts. The label and
 * category come from the record itself, so a resource this file has never heard of still renders
 * truthfully with the generic style.
 *
 * Every card is one click from the source. A resource with a single stored link makes the whole
 * card that link. A resource with several shows its first entries as chips (each its own link),
 * the rest of the stored entries behind an expander, and -- where the source has one page listing
 * them all, or Europe PMC does and the stored detail is incomplete -- a "See all" link.
 *
 * Logos must be self-hosted under assets/img/ -- the container's CSP is `default-src 'self'`, and a
 * hot-linked ENA or PDBe logo would silently fail to load there.
 */

import { AiMlRecord, DataLink, DataLinkResource, DataLinks } from './record.model';
import { AssetGroup, CrossLinkedAsset, crossLinkedAssets, europePmcArticleUrl } from './outbound-links';

/** The reserved cross-link groups plus one for supplementary material. */
export type DataLinkGroup = AssetGroup | 'Supplementary';

/** How many of a resource's entries a card shows before its expander. */
export const INLINE_CHIPS = 5;

/** One stored entry: the accession, the entry's title where the source gave one, and its link. */
export interface DataLinkChip {
  id: string;
  title: string | null;
  url: string | null;
}

export interface DataLinkAsset extends Omit<CrossLinkedAsset, 'group' | 'url'> {
  group: DataLinkGroup;
  /** Unique among a record's cards: the resource slug, or `xref:` + label for a reserved cross-link. */
  key: string;
  /** The resource slug, e.g. "pdb" -- also the value of the search page's `dl` filter. Empty for a
   *  reserved cross-link card. */
  resource: string;
  /** True number of links to this resource, before any cap. */
  count: number;
  /** Where the whole card links when it stands for exactly one entry; null when the card lists its
   *  entries as chips instead. */
  url: string | null;
  /** The stored entries of a multi-link card (at most 50). Empty for a single-link card. */
  links: DataLinkChip[];
  /** One page listing every entry, when there is one worth offering. */
  seeAll: { label: string; url: string } | null;
}

interface ResourceStyle {
  group?: DataLinkGroup;
  logo?: string;
  icon?: string;
}

/** The routes that are EBI Search rather than Europe PMC (schema v1.5.0). */
const EBISEARCH_ROUTES = new Set(['ebisearch_xref', 'ebisearch_domain']);

/** Per-slug overrides: where a logo exists in assets/img/, or the category's default is wrong. */
const RESOURCE_STYLES: Record<string, ResourceStyle> = {
  zenodo: { logo: 'assets/img/zenodo-logo.svg' },
  kaggle: { logo: 'assets/img/Kaggle_logo.png' },
  huggingface: { group: 'Models', logo: 'assets/img/hf-logo.svg', icon: 'icon-microchip' },
  github: { group: 'Code', logo: 'assets/img/GitHub-Mark-64px.png', icon: 'icon-code-branch' },
  software_heritage: { group: 'Code', icon: 'icon-archive' },
  code_ocean: { group: 'Code', icon: 'icon-code' },
  biomodels: { group: 'Models', icon: 'icon-sitemap' },
  alphafold: { icon: 'icon-microchip' },
  biostudies: { group: 'Supplementary', icon: 'icon-archive' },
  rrid: { icon: 'icon-tag' },
  // The -cropped variant, as on the home and integrations pages: the full SVG is mostly empty canvas.
  dome_registry: { logo: 'assets/img/DOME_Registry_Rounded-cropped.svg' },
};

/** Icon by category, for every slug without an override. */
const CATEGORY_ICONS: Record<string, string> = {
  'Nucleotide Sequences': 'icon-database',
  'Protein Sequences': 'icon-database',
  'Protein Structures': 'icon-crosslink',
  'Genomes & Assemblies': 'icon-database',
  'Gene Expression': 'icon-chart-bar',
  'Genomic Variation': 'icon-database',
  'Clinical Trials': 'icon-heartbeat',
  'Chemicals & Compounds': 'icon-flask',
  Proteomics: 'icon-database',
  Metabolomics: 'icon-flask',
  Imaging: 'icon-images',
  'Pathways & Interactions': 'icon-sitemap',
  'Ontologies & Annotations': 'icon-tags',
  'Cell Lines & Reagents': 'icon-eye-dropper',
  'Data Citations': 'icon-database',
  'Supplementary Material': 'icon-archive',
  'Code & Notebooks': 'icon-code',
  Models: 'icon-microchip',
  'Software Registries': 'icon-code',
  'Transparency Reports': 'icon-classification',
};

const CATEGORY_GROUPS: Record<string, DataLinkGroup> = {
  'Code & Notebooks': 'Code',
  'Software Registries': 'Code',
  Models: 'Models',
  'Supplementary Material': 'Supplementary',
  'Transparency Reports': 'Annotation',
};

const DEFAULT_ICON = 'icon-database';

/**
 * Display names for the facet panel, which only sees slugs (the API facets on
 * `data_links.resources.resource`). Mirrors the pipeline catalogue's labels; a slug missing here
 * is shown as itself, never hidden.
 */
export const RESOURCE_LABELS: Record<string, string> = {
  ena: 'European Nucleotide Archive',
  ena_assembly: 'ENA genome assembly',
  refseq: 'NCBI RefSeq',
  bioproject: 'BioProject',
  biosample: 'BioSample',
  ensembl: 'Ensembl',
  igsr: 'IGSR / 1000 Genomes',
  gisaid: 'GISAID',
  mgnify: 'MGnify',
  uniprot: 'UniProt',
  uniparc: 'UniParc',
  pfam: 'Pfam',
  interpro: 'InterPro',
  rfam: 'Rfam',
  rnacentral: 'RNAcentral',
  treefam: 'TreeFam',
  pdb: 'Protein Data Bank in Europe',
  emdb: 'Electron Microscopy Data Bank',
  empiar: 'EMPIAR',
  alphafold: 'AlphaFold DB',
  cath: 'CATH',
  geo: 'Gene Expression Omnibus',
  arrayexpress: 'ArrayExpress / BioStudies',
  hpa: 'Human Protein Atlas',
  refsnp: 'dbSNP',
  dbgap: 'dbGaP',
  ega: 'European Genome-phenome Archive',
  gwas: 'GWAS Catalog',
  omim: 'OMIM',
  orphanet: 'Orphanet',
  hgnc: 'HGNC',
  clinicaltrials: 'ClinicalTrials.gov',
  eudract: 'EU Clinical Trials Register',
  chembl: 'ChEMBL',
  chebi: 'ChEBI',
  rhea: 'Rhea',
  brenda: 'BRENDA',
  pride: 'PRIDE',
  metabolights: 'MetaboLights',
  bioimage_archive: 'BioImage Archive',
  reactome: 'Reactome',
  intact: 'IntAct',
  mint: 'MINT',
  complexportal: 'Complex Portal',
  biomodels: 'BioModels',
  go: 'Gene Ontology',
  efo: 'Experimental Factor Ontology',
  cellosaurus: 'Cellosaurus',
  rrid: 'Research Resource Identifiers',
  ebisc: 'EBiSC',
  hipsci: 'HipSci',
  hpscreg: 'hPSCreg',
  coriell: 'Coriell Biorepository',
  proteomexchange: 'ProteomeXchange',
  biostudies: 'BioStudies',
  zenodo: 'Zenodo',
  dryad: 'Dryad',
  figshare: 'figshare',
  osf: 'Open Science Framework',
  mendeley_data: 'Mendeley Data',
  dataverse: 'Dataverse',
  pangaea: 'PANGAEA',
  gigadb: 'GigaDB',
  morphosource: 'MorphoSource',
  gbif: 'GBIF',
  tcia: 'The Cancer Imaging Archive',
  icpsr: 'ICPSR',
  ieee_dataport: 'IEEE DataPort',
  '4tu': '4TU.ResearchData',
  edinburgh_datashare: 'Edinburgh DataShare',
  apollo: 'Apollo (Cambridge)',
  code_ocean: 'Code Ocean',
  kaggle: 'Kaggle',
  huggingface: 'Hugging Face',
  github: 'GitHub',
  software_heritage: 'Software Heritage',
  doi: 'Data DOI',
  // Schema v1.5.0: found through EBI Search.
  biotools: 'bio.tools',
  dome_registry: 'DOME Registry',
  iprox: 'iProX',
  jpost: 'jPOST',
  panorama: 'Panorama Public',
  massive: 'MassIVE',
  node: 'NODE',
  eva: 'European Variation Archive',
  dgva: 'DGVa',
  expression_atlas: 'Single Cell Expression Atlas',
  fairdomhub: 'FAIRDOMHub',
  physiome: 'Physiome Model Repository',
  cellcollective: 'Cell Collective',
};

export function resourceLabel(slug: string): string {
  return RESOURCE_LABELS[slug] ?? slug;
}

/** How a route came by the link, in words a reader can weigh. */
export function obtainedByLabel(obtainedBy: string | null | undefined): string {
  switch (obtainedBy) {
    case 'tm_accession':
      return 'text-mined from the article by Europe PMC';
    case 'tm_supplementary':
      return 'text-mined from the supplementary files by Europe PMC';
    case 'ext_links':
      return 'a data citation or external link recorded by Europe PMC';
    case 'derived':
      return 'the supplementary files as archived in BioStudies';
    case 'ebisearch_xref':
    case 'ebisearch_domain':
      return 'recorded by the repository, found through EBI Search';
    default:
      return 'recorded by Europe PMC';
  }
}

/** Who vouches for a resource's links, from every route that found them -- "and recorded by the
 *  repository" when the article and the repository agree. */
export function provenanceLabel(resource: DataLinkResource): string {
  const routes = resource.routes?.length ? resource.routes : [resource.obtained_by ?? ''];
  const fromEbi = routes.some((route) => EBISEARCH_ROUTES.has(route));
  const epmc = routes.filter((route) => route && !EBISEARCH_ROUTES.has(route));
  if (fromEbi && epmc.length) return `${obtainedByLabel(epmc[0])}, and recorded by the repository`;
  if (fromEbi) return obtainedByLabel('ebisearch_xref');
  return obtainedByLabel(resource.obtained_by);
}

function styleFor(resource: DataLinkResource): { group: DataLinkGroup; logo?: string; icon: string } {
  const override = RESOURCE_STYLES[resource.resource] ?? {};
  return {
    group: override.group ?? CATEGORY_GROUPS[resource.category] ?? 'Data',
    logo: override.logo,
    icon: override.icon ?? CATEGORY_ICONS[resource.category] ?? DEFAULT_ICON,
  };
}

/** The source's own listing page when the record carries one; otherwise Europe PMC's article page,
 *  but only where a Europe PMC route found the resource (Europe PMC lists those) and the stored
 *  detail is incomplete. Null when the chips already show everything. */
function seeAllFor(
  resource: DataLinkResource,
  stored: DataLink[],
  articlePage: string | null,
): DataLinkAsset['seeAll'] {
  const label = resource.label || resourceLabel(resource.resource);
  if (resource.browse_url) {
    return { label: `See all ${resource.count} at ${label}`, url: resource.browse_url };
  }
  const routes = resource.routes?.length ? resource.routes : [resource.obtained_by ?? ''];
  const fromEpmc = routes.some((route) => route && !EBISEARCH_ROUTES.has(route));
  if (fromEpmc && stored.length < resource.count && articlePage) {
    return { label: `See all ${resource.count} at Europe PMC`, url: articlePage };
  }
  return null;
}

/**
 * One card per linked resource, in the order the record stores them (largest first). Empty when
 * the record carries no `data_links` block yet, or none of its links resolved to a resource.
 */
export function dataLinkAssets(record: AiMlRecord): DataLinkAsset[] {
  const dl: DataLinks | undefined = record.data_links;
  if (!dl?.resources?.length) return [];
  const articlePage = europePmcArticleUrl(record);
  const assets: DataLinkAsset[] = [];
  for (const resource of dl.resources) {
    const stored = (dl.links ?? []).filter((l) => l.resource === resource.resource);
    const single = resource.count === 1 && stored.length === 1 && !!stored[0].url;
    const style = styleFor(resource);
    const n = resource.count;
    assets.push({
      group: style.group,
      key: resource.resource,
      resource: resource.resource,
      count: n,
      label: resource.label || resourceLabel(resource.resource),
      explainer: `${n} ${n === 1 ? 'link' : 'links'} · ${resource.category} · ${provenanceLabel(resource)}.`,
      url: single ? stored[0].url : null,
      links: single ? [] : stored.map((l) => ({ id: l.id, title: l.title, url: l.url })),
      seeAll: single ? null : seeAllFor(resource, stored, articlePage),
      logo: style.logo,
      icon: style.icon,
    });
  }
  return assets;
}

/** The chips a multi-link card shows -- its first INLINE_CHIPS entries, or all of them once
 *  expanded -- and how many the expander still hides. */
export function chipsFor(asset: DataLinkAsset, expanded: boolean): { shown: DataLinkChip[]; more: number } {
  const shown = expanded ? asset.links : asset.links.slice(0, INLINE_CHIPS);
  return { shown, more: asset.links.length - shown.length };
}

/**
 * The record page's cards: the reserved cross-links (identifiers.*), then the data links. A DOME
 * Registry entry the data links carry is shown once, as the data-link card, which can hold every
 * entry naming the paper; `identifiers.dome_registry` holds only the first.
 */
export function recordAssets(record: AiMlRecord): DataLinkAsset[] {
  const dataLinks = dataLinkAssets(record);
  const domeInLinks = dataLinks.some((a) => a.resource === 'dome_registry');
  const identifiers = domeInLinks ? { ...record.identifiers, dome_registry: null } : record.identifiers;
  const crossLinks = crossLinkedAssets({ ...record, identifiers }).map(
    (a): DataLinkAsset => ({ ...a, key: `xref:${a.label}`, resource: '', count: 1, links: [], seeAll: null }),
  );
  return [...crossLinks, ...dataLinks];
}

/** A one-line provenance note for the section: when the links were fetched, from which sources,
 *  and whether the stored detail was capped. Null when no fetch has run for the record yet. */
export function dataLinksNote(record: AiMlRecord): string | null {
  const dl = record.data_links;
  if (!dl?.fetched_at) return null;
  const date = dl.fetched_at.slice(0, 10);
  const sources = dl.sources?.includes('ebisearch') ? 'Europe PMC and EBI Search' : 'Europe PMC';
  const total = dl.link_count ?? 0;
  const base = total
    ? `${total} ${total === 1 ? 'link' : 'links'} across ${dl.resources.length} ${dl.resources.length === 1 ? 'resource' : 'resources'}, from ${sources} on ${date}.`
    : `${sources} recorded no data links for this paper as of ${date}.`;
  return dl.truncated
    ? `${base} Only the first links per resource are stored here; the sources list them all.`
    : base;
}
