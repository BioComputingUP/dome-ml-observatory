/**
 * The cards a record's Europe PMC data links become.
 *
 * The pipeline (dome-ml-observatory-triage, `moros_pipeline/scripts/datalinks_resources.py`)
 * reduces every link Europe PMC knows for a paper -- text-mined accessions, data citations,
 * curated cross-references, the BioStudies supplementary entry -- to a finite set of resources,
 * each a stable slug with a label and a category, and stores one summary entry per resource on
 * the record (`data_links.resources[]`, always complete) plus capped link detail
 * (`data_links.links[]`). This file maps a slug to an icon and a card group, and turns each
 * resource into one card alongside the reserved cross-links in outbound-links.ts. The label and
 * category come from the record itself, so a resource this file has never heard of still renders
 * truthfully with the generic style.
 *
 * Logos must be self-hosted under assets/img/ -- the container's CSP is `default-src 'self'`, and a
 * hot-linked ENA or PDBe logo would silently fail to load there.
 */

import { AiMlRecord, DataLinkResource, DataLinks } from './record.model';
import { AssetGroup, CrossLinkedAsset, europePmcArticleUrl } from './outbound-links';

/** The reserved cross-link groups plus one for supplementary material. */
export type DataLinkGroup = AssetGroup | 'Supplementary';

export interface DataLinkAsset extends Omit<CrossLinkedAsset, 'group'> {
  group: DataLinkGroup;
  /** The resource slug, e.g. "pdb" -- also the value of the search page's `dl` filter. */
  resource: string;
  /** True number of links to this resource, before any cap. */
  count: number;
}

interface ResourceStyle {
  group?: DataLinkGroup;
  logo?: string;
  icon?: string;
}

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
};

/** Icon by Europe PMC-style category, for every slug without an override. */
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
};

const CATEGORY_GROUPS: Record<string, DataLinkGroup> = {
  'Code & Notebooks': 'Code',
  Models: 'Models',
  'Supplementary Material': 'Supplementary',
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
};

export function resourceLabel(slug: string): string {
  return RESOURCE_LABELS[slug] ?? slug;
}

/** How Europe PMC came by the link, in words a reader can weigh. */
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
    default:
      return 'recorded by Europe PMC';
  }
}

function styleFor(resource: DataLinkResource): { group: DataLinkGroup; logo?: string; icon: string } {
  const override = RESOURCE_STYLES[resource.resource] ?? {};
  return {
    group: override.group ?? CATEGORY_GROUPS[resource.category] ?? 'Data',
    logo: override.logo,
    icon: override.icon ?? CATEGORY_ICONS[resource.category] ?? DEFAULT_ICON,
  };
}

/**
 * One card per linked resource, in the order the record stores them (largest first). Empty
 * when the record carries no `data_links` block yet, or none of its links resolved to a resource.
 * The card opens the first link the record holds for that resource; where the detail was capped
 * away, it opens the article's Europe PMC page, which lists everything.
 */
export function dataLinkAssets(record: AiMlRecord): DataLinkAsset[] {
  const dl: DataLinks | undefined = record.data_links;
  if (!dl?.resources?.length) return [];
  const fallback = europePmcArticleUrl(record);
  const assets: DataLinkAsset[] = [];
  for (const resource of dl.resources) {
    const first = dl.links?.find((l) => l.resource === resource.resource && l.url);
    const url = first?.url ?? fallback;
    if (!url) continue;
    const style = styleFor(resource);
    const n = resource.count;
    assets.push({
      group: style.group,
      resource: resource.resource,
      count: n,
      label: resource.label || resourceLabel(resource.resource),
      explainer: `${n} ${n === 1 ? 'link' : 'links'} · ${resource.category} · ${obtainedByLabel(resource.obtained_by)}.`,
      url,
      logo: style.logo,
      icon: style.icon,
    });
  }
  return assets;
}

/** A one-line provenance note for the section: when the links were fetched, and whether the
 *  stored detail was capped. Null when no fetch has run for the record yet. */
export function dataLinksNote(record: AiMlRecord): string | null {
  const dl = record.data_links;
  if (!dl?.fetched_at) return null;
  const date = dl.fetched_at.slice(0, 10);
  const total = dl.link_count ?? 0;
  const base = total
    ? `${total} ${total === 1 ? 'link' : 'links'} across ${dl.resources.length} ${dl.resources.length === 1 ? 'resource' : 'resources'}, from Europe PMC on ${date}.`
    : `Europe PMC recorded no data links for this paper as of ${date}.`;
  return dl.truncated
    ? `${base} Only the first links per resource are stored here; Europe PMC lists them all.`
    : base;
}
