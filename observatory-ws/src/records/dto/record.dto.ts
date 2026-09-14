import { ApiProperty } from '@nestjs/swagger';

/**
 * Documents the response shape for Swagger only -- responses are returned as-is from Mongo's
 * `.lean()` (see records.service.ts), never instantiated as this class or serialized through it.
 * Mirrors observatory-ui/src/app/core/record.model.ts, duplicated deliberately rather than shared
 * (there is no `-core` package in this project, by design -- see AGENTS.md) -- source of truth
 * for the real shape is schema/releases/v1.4.0/ai-ml-landscape.schema.json.
 */
class RecordIdentifiersDto {
  @ApiProperty({ type: String, nullable: true }) pmid!: string | null;
  @ApiProperty({ type: String, nullable: true }) pmcid!: string | null;
  @ApiProperty({ type: String, nullable: true }) doi!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Europe PMC\'s own accession, e.g. "PPR18364". A Europe PMC article URL is ' +
      '/article/{epmc_source}/{epmc_id}. Null until the preprint capture pass runs.',
  })
  epmc_id!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Reserved for a future linking pass.',
  })
  dome_registry!: string | null;
  @ApiProperty({ type: String, nullable: true }) bioai_repo!: string | null;
  @ApiProperty({ type: String, nullable: true }) huggingface!: string | null;
  @ApiProperty({ type: String, nullable: true }) kaggle!: string | null;
  @ApiProperty({ type: String, nullable: true }) zenodo!: string | null;
}

class PublicationMetadataDto {
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'May contain embedded HTML-ish tags.',
  })
  abstract!: string | null;
  @ApiProperty({ type: String, nullable: true }) authors!: string | null;
  @ApiProperty({ type: Number, nullable: true }) year!: number | null;
  @ApiProperty({ type: String, nullable: true }) journal!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Preprint server name as Europe PMC records it, e.g. "bioRxiv". Null on journal articles, ' +
      'and null on preprints until the capture pass runs.',
  })
  preprint_server!: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Europe PMC citation count. Null means "not available", never zero -- sort and display ' +
      'must treat the two differently.',
  })
  citation_count!: number | null;
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'When citation_count was fetched. Null wherever citation_count is null.',
  })
  citation_count_updated!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Where citation_count came from, e.g. "europepmc".',
  })
  citation_source!: string | null;
}

class SourceAccessDto {
  @ApiProperty({ type: Boolean, nullable: true }) open_access!: boolean | null;
  @ApiProperty({ type: String, nullable: true }) license!: string | null;
  @ApiProperty({ type: Boolean, nullable: true }) fulltext_available!: boolean | null;
}

class SourceDto {
  @ApiProperty({ type: String, nullable: true }) abstract_source!: string | null;
  @ApiProperty({ type: String, nullable: true }) metadata_repair_sources!: string | null;
  @ApiProperty({
    enum: ['llm', 'human_curated', 'registry_confirmed'],
    description:
      "Who decided this record's classification. Never null -- a null provider on " +
      'llm_classification only fails to say "machine", which is why this field exists.',
  })
  decision_provenance!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['MED', 'PPR', 'PMC', 'AGR', 'PAT', 'CBA', 'CTX', 'ETH', 'HIR', 'NBK'],
    description:
      'Which Europe PMC index the record came from. PPR is the authoritative preprint marker. ' +
      'Null until the capture pass runs.',
  })
  epmc_source!: string | null;
  @ApiProperty({ type: SourceAccessDto }) access!: SourceAccessDto;
}

class ContentFiltersDto {
  @ApiProperty({ type: [String] }) mesh_headings!: string[];
  @ApiProperty({ type: [String] }) pub_types!: string[];
  @ApiProperty({ type: [String] }) keywords_author!: string[];
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'EDAM tier 1, max_tags 1.',
  })
  domain_tier1!: string | null;
  @ApiProperty({ type: [String], description: 'EDAM tier 2, max_tags 2.' })
  domain_tier2!: string[];
  @ApiProperty({ type: [String], description: 'EDAM tier 3, max_tags 3.' })
  domain_tier3!: string[];
  @ApiProperty({ type: [String], description: 'max_tags 2.' })
  learning_paradigm!: string[];
  @ApiProperty({ type: [String], description: 'max_tags 3.' })
  model_family!: string[];
  @ApiProperty({ type: [String] }) model_type!: string[];
}

class DataLinkResourceDto {
  @ApiProperty({
    description:
      'Stable resource key assigned by the pipeline catalogue -- "pdb", "uniprot", "geo", ' +
      '"zenodo", "biostudies", ... The record page keys its cards and icons on it and ' +
      '/api/records filters on it (?dl=pdb).',
  })
  resource!: string;
  @ApiProperty({ description: 'Display name, e.g. "Protein Data Bank in Europe".' })
  label!: string;
  @ApiProperty({ description: 'Europe PMC-style grouping, e.g. "Protein Structures".' })
  category!: string;
  @ApiProperty({ type: String, nullable: true }) id_scheme!: string | null;
  @ApiProperty({ type: String, nullable: true }) publisher!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'tm_accession (text-mined from the article), tm_supplementary (from supplementary files), ' +
      'ext_links (a data citation or external link) or derived (the BioStudies entry).',
  })
  obtained_by!: string | null;
  @ApiProperty({ description: 'True number of links to this resource, before any cap.' })
  count!: number;
}

class DataLinkDto {
  @ApiProperty() resource!: string;
  @ApiProperty({ description: 'The accession or DOI.' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) obtained_by!: string | null;
  @ApiProperty({ type: String, nullable: true }) relationship!: string | null;
  @ApiProperty({ type: String, nullable: true }) section!: string | null;
  @ApiProperty({ type: Number, nullable: true }) frequency!: number | null;
}

class DataLinksDto {
  @ApiProperty({
    type: Boolean,
    nullable: true,
    description:
      "Europe PMC's hasData flag for the record. Null = never captured; false = captured, no data.",
  })
  has_data!: boolean | null;
  @ApiProperty({ type: [String], description: 'Europe PMC dataLinksTagsList values.' })
  tags!: string[];
  @ApiProperty({ type: [String], description: 'Text-mined accession types, e.g. ["pdb","geo"].' })
  accession_types!: string[];
  @ApiProperty({ type: [String], description: 'Curated database cross-references, by name.' })
  db_cross_references!: string[];
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'When the links were last fetched. Null = no link fetch yet; a fetch that found nothing ' +
      'sets this with link_count 0.',
  })
  fetched_at!: string | null;
  @ApiProperty({ type: [String], description: 'Which routes produced the links.' })
  sources!: string[];
  @ApiProperty({ type: Number, nullable: true, description: 'True total before caps.' })
  link_count!: number | null;
  @ApiProperty({ type: Boolean, nullable: true, description: 'links[] hit a cap.' })
  truncated!: boolean | null;
  @ApiProperty({
    type: [DataLinkResourceDto],
    description: 'One entry per linked resource; always complete.',
  })
  resources!: DataLinkResourceDto[];
  @ApiProperty({
    type: [DataLinkDto],
    description: 'Link detail, capped at 50 per resource / 300 per record.',
  })
  links!: DataLinkDto[];
}

class LlmRunProvenanceDto {
  @ApiProperty({ type: String, nullable: true }) provider!: string | null;
  @ApiProperty({ type: String, nullable: true }) model_tier!: string | null;
  @ApiProperty({ type: String, nullable: true }) model_id!: string | null;
  @ApiProperty({ type: String, nullable: true }) mode!: string | null;
  @ApiProperty({ type: String, nullable: true }) rationale!: string | null;
  @ApiProperty({ type: String, nullable: true }) prompt_version!: string | null;
  @ApiProperty({ type: String, nullable: true }) ruleset_sha256!: string | null;
  @ApiProperty({ type: String, nullable: true }) batch_id!: string | null;
  @ApiProperty({ type: String, nullable: true }) timestamp!: string | null;
}

class LlmClassificationDto extends LlmRunProvenanceDto {
  @ApiProperty({
    enum: ['positive', 'negative', 'undeterminable'],
    nullable: true,
  })
  classification!: 'positive' | 'negative' | 'undeterminable' | null;
}

class LlmEnrichmentDto extends LlmRunProvenanceDto {
  @ApiProperty({ type: [String], nullable: true }) vocab_violations!: string[] | null;
  @ApiProperty({ type: String, nullable: true }) parse_status!: string | null;
  @ApiProperty({ type: Number, nullable: true }) input_tokens!: number | null;
  @ApiProperty({ type: Number, nullable: true }) output_tokens!: number | null;
  @ApiProperty({ type: Number, nullable: true }) cache_hit_tokens!: number | null;
  @ApiProperty({ type: Boolean, nullable: true }) parse_fallback_used!: boolean | null;
}

export class RecordDto {
  @ApiProperty({
    description: 'Deterministic UUID5 PID -- the same paper always mints the same value.',
  })
  _id!: string;

  @ApiProperty({ example: '1.1.0' }) schema_version!: string;
  @ApiProperty({ type: RecordIdentifiersDto })
  identifiers!: RecordIdentifiersDto;
  @ApiProperty({ type: PublicationMetadataDto })
  publication_metadata!: PublicationMetadataDto;
  @ApiProperty({ type: SourceDto }) source!: SourceDto;
  @ApiProperty({ type: ContentFiltersDto }) content_filters!: ContentFiltersDto;
  @ApiProperty({
    type: DataLinksDto,
    description:
      "Europe PMC's data links for the paper (schema v1.4.0). Absent as a key on documents " +
      'written before the v1.4.0 migration.',
  })
  data_links!: DataLinksDto;
  @ApiProperty({ type: LlmClassificationDto })
  llm_classification!: LlmClassificationDto;
  @ApiProperty({ type: LlmEnrichmentDto }) llm_enrichment!: LlmEnrichmentDto;
}
