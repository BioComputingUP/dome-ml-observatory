import { ApiProperty } from '@nestjs/swagger';

/**
 * Documents the response shape for Swagger only -- responses are returned as-is from Mongo's
 * `.lean()` (see records.service.ts), never instantiated as this class or serialized through it.
 * Mirrors observatory-ui/src/app/core/record.model.ts, duplicated deliberately rather than shared
 * (there is no `-core` package in this project, by design -- see AGENTS.md) -- source of truth
 * for the real shape is schema/releases/v1.1.0/ai-ml-landscape.schema.json.
 */
class RecordIdentifiersDto {
  @ApiProperty({ type: String, nullable: true }) pmid!: string | null;
  @ApiProperty({ type: String, nullable: true }) pmcid!: string | null;
  @ApiProperty({ type: String, nullable: true }) doi!: string | null;
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
  @ApiProperty({ type: Number, nullable: true }) citation_count!: number | null;
}

class SourceAccessDto {
  @ApiProperty({ type: Boolean, nullable: true }) open_access!: boolean | null;
  @ApiProperty({ type: String, nullable: true }) license!: string | null;
  @ApiProperty({ type: Boolean, nullable: true }) fulltext_available!: boolean | null;
}

class SourceDto {
  @ApiProperty({ type: String, nullable: true }) abstract_source!: string | null;
  @ApiProperty({ type: String, nullable: true }) metadata_repair_sources!: string | null;
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
  @ApiProperty({ type: LlmClassificationDto })
  llm_classification!: LlmClassificationDto;
  @ApiProperty({ type: LlmEnrichmentDto }) llm_enrichment!: LlmEnrichmentDto;
}
