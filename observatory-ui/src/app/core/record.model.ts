/**
 * Mirrors schema/releases/v1.5.0/ai-ml-landscape.schema.json exactly -- that file (not this one)
 * is the source of truth. If the schema-version skill cuts a new release, update this to match
 * and note it in that release's CHANGELOG entry.
 */

export type Classification = 'positive' | 'negative' | 'undeterminable';

export interface RecordIdentifiers {
  pmid: string | null;
  pmcid: string | null;
  doi: string | null;
  /** Europe PMC's own accession, e.g. "PPR18364". A Europe PMC article URL is
   *  /article/{epmc_source}/{epmc_id}. Optional because nothing populates it yet -- see
   *  preprint.md -- so every record in the corpus and the dev fixture is missing the key
   *  entirely, not merely null. */
  epmc_id?: string | null;
  /** Reserved for a future linking pass -- always null until then. */
  dome_registry: string | null;
  bioai_repo: string | null;
  huggingface: string | null;
  kaggle: string | null;
  zenodo: string | null;
}

export interface PublicationMetadata {
  title: string | null;
  /** Can contain embedded HTML-ish tags (e.g. "<h4>Background</h4>") -- sanitize before render. */
  abstract: string | null;
  /** Comma-separated plain-text string, e.g. "Liang L, Liang H, He M". */
  authors: string | null;
  year: number | null;
  /** Null on 56,863 preprints, which have no journal by definition rather than by omission --
   *  read `preprint_server` for those. See core/venue.ts, which resolves the one venue row. */
  journal: string | null;
  /** Preprint server name as Europe PMC records it, e.g. "bioRxiv". Optional for the same reason
   *  as `epmc_id`: schema v1.3.0 defines it, nothing populates it yet, so core/venue.ts falls
   *  back to deriving it from the DOI prefix until the backfill runs. */
  preprint_server?: string | null;
  /** Europe PMC citation count, real since the 2026-09-03 load (~98% of the corpus). `null` means
   *  "not available" -- no Europe PMC record answered for this paper's identifiers -- never zero,
   *  so anything displaying it has to distinguish the two. */
  citation_count: number | null;
}

export interface SourceAccess {
  open_access: boolean | null;
  license: string | null;
  fulltext_available: boolean | null;
}

export interface Source {
  abstract_source: string | null;
  metadata_repair_sources: string | null;
  /** Who decided this record's classification: 'llm' | 'human_curated' | 'registry_confirmed'.
   *  Optional here only because the 200-record dev fixture predates schema v1.2.0. */
  decision_provenance?: string;
  /** Which Europe PMC index the record came from, as Europe PMC codes it -- MED, PPR, PMC, AGR,
   *  ETH, CTX, ... 'PPR' is the authoritative preprint marker; optional until the capture pass runs. */
  epmc_source?: string | null;
  access: SourceAccess;
}

export interface ContentFilters {
  mesh_headings: string[];
  pub_types: string[];
  keywords_author: string[];
  /** EDAM topic branch tier 1 (broadest). Single-select -- max_tags: 1. */
  domain_tier1: string | null;
  /** EDAM topic branch tier 2. Multi-select -- max_tags: 2. */
  domain_tier2: string[];
  /** EDAM topic branch tier 3 (most specific). Multi-select -- max_tags: 3. */
  domain_tier3: string[];
  /** How the model learns. Multi-select -- max_tags: 2. */
  learning_paradigm: string[];
  /** What kind of system/method family. Multi-select -- max_tags: 3. */
  model_family: string[];
  /** Deliberately open free text, normalized against a seed vocab where possible. */
  model_type: string[];
}

/**
 * One linked external resource, summarised -- the unit the record page renders a card for and
 * the search page facets on. Always complete for the record, even when `links` below is capped.
 */
export interface DataLinkResource {
  /** Stable key -- "pdb", "uniprot", "geo", "zenodo", "biostudies", ... -- assigned by the
   *  pipeline's resource catalogue. core/data-links.ts maps it to an icon and a group. */
  resource: string;
  /** Display name, e.g. "Protein Data Bank in Europe". */
  label: string;
  /** Europe PMC-style grouping, e.g. "Protein Structures", "Data Citations". */
  category: string;
  /** The identifier scheme as Europe PMC named it ("PDBe", "ENA", "DOI"). */
  id_scheme: string | null;
  publisher: string | null;
  /** How Europe PMC found it: tm_accession (text-mined from the article), tm_supplementary
   *  (text-mined from supplementary files), ext_links (a data citation or external link),
   *  derived (BioStudies supplementary entry). */
  obtained_by: string | null;
  /** True number of links to this resource, before any cap. */
  count: number;
  /** Every route that found a link to this resource (schema v1.5.0): tm_accession,
   *  tm_supplementary, ext_links, derived, ebisearch_xref, ebisearch_domain. Absent on a record the
   *  v1.5.0 build has not reached. */
  routes?: string[];
  /** One page at the source listing every entry of this resource for the paper, where the source
   *  has one (schema v1.5.0). */
  browse_url?: string | null;
}

/** One link. `links` is capped at 50 per resource / 300 per record; `resources[].count` and
 *  `link_count` keep the true totals. */
export interface DataLink {
  resource: string;
  id: string;
  url: string | null;
  title: string | null;
  obtained_by: string | null;
  relationship: string | null;
  section: string | null;
  frequency: number | null;
  /** Which of the paper's identifiers the EBI Search entry named (schema v1.5.0); null for the
   *  Europe PMC routes. */
  matched_by?: 'pmid' | 'pmcid' | 'doi' | null;
  /** The EBI Search domain that asserted the link, e.g. "sra-study" (schema v1.5.0). */
  source_domain?: string | null;
}

/**
 * Europe PMC's data links for the paper (schema v1.4.0). Two layers with distinct null meanings:
 * `has_data: null` means the summary was never captured; `fetched_at: null` means no link fetch
 * has run yet -- a fetch that found nothing sets `fetched_at`, `link_count: 0`, `resources: []`.
 */
export interface DataLinks {
  has_data: boolean | null;
  tags: string[];
  accession_types: string[];
  db_cross_references: string[];
  fetched_at: string | null;
  sources: string[];
  link_count: number | null;
  truncated: boolean | null;
  resources: DataLinkResource[];
  links: DataLink[];
}

/** Shared shape between llm_classification and llm_enrichment -- see schema README for why. */
export interface LlmRunProvenance {
  provider: string | null;
  model_tier: string | null;
  model_id: string | null;
  mode: string | null;
  rationale: string | null;
  prompt_version: string | null;
  ruleset_sha256: string | null;
  batch_id: string | null;
  timestamp: string | null;
}

export interface LlmClassification extends LlmRunProvenance {
  classification: Classification | null;
}

export interface LlmEnrichment extends LlmRunProvenance {
  vocab_violations: string[] | null;
  parse_status: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_hit_tokens: number | null;
  parse_fallback_used: boolean | null;
}

export interface AiMlRecord {
  _id: string;
  schema_version: string;
  identifiers: RecordIdentifiers;
  publication_metadata: PublicationMetadata;
  source: Source;
  content_filters: ContentFilters;
  /** Optional for the same reason as `epmc_id`: defined by schema v1.4.0, absent as a key on every
   *  document until the in-place migration runs, and the dev fixture predates it. */
  data_links?: DataLinks;
  llm_classification: LlmClassification;
  llm_enrichment: LlmEnrichment;
}

/** True once the enrichment pass has actually populated this record -- not just present-but-null. */
export function isEnriched(record: AiMlRecord): boolean {
  return record.llm_enrichment.provider !== null;
}
