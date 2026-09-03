/**
 * Mirrors schema/releases/v1.1.0/ai-ml-landscape.schema.json exactly -- that file (not this one)
 * is the source of truth. If the schema-version skill cuts a new release, update this to match
 * and note it in that release's CHANGELOG entry.
 */

export type Classification = 'positive' | 'negative' | 'undeterminable';

export interface RecordIdentifiers {
  pmid: string | null;
  pmcid: string | null;
  doi: string | null;
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
  journal: string | null;
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
  llm_classification: LlmClassification;
  llm_enrichment: LlmEnrichment;
}

/** True once the enrichment pass has actually populated this record -- not just present-but-null. */
export function isEnriched(record: AiMlRecord): boolean {
  return record.llm_enrichment.provider !== null;
}
