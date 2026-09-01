import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Deliberately thin: every field is left as an optional raw string (or absent) and handed
 * untouched to records.query.ts's parseSearchParams, which does all real parsing/defaulting --
 * that split keeps the one place that must exactly replicate observatory-ui's search-params.ts
 * pure, dependency-free and unit-testable without an HTTP request in the picture (see
 * records.query.spec.ts). This DTO's job is only the HTTP-layer contract: what param names exist,
 * their basic types for Swagger, and (via the global ValidationPipe's `whitelist: true`) rejecting
 * anything else silently becoming a filter.
 *
 * Param names match observatory-ui/src/app/core/search-params.ts's PARAM map exactly -- a shared
 * search results URL from the frontend is a valid query string here with no translation.
 */
export class SearchRecordsDto {
  @ApiPropertyOptional({ description: 'Free text over title and abstract.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated classification values. Absent = defaults to positive; ' +
      'present-but-empty ("class=") = explicitly cleared, matches every classification.',
    example: 'positive,negative',
  })
  @IsOptional()
  @IsString()
  class?: string;

  @ApiPropertyOptional({
    description: 'Open access only.',
    enum: ['true', 'false'],
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  oa?: string;

  @ApiPropertyOptional({
    description: 'Full text available.',
    enum: ['true', 'false'],
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  ft?: string;

  @ApiPropertyOptional({
    description: 'Inclusive year range, either bound optional.',
    example: '2020-2026',
  })
  @IsOptional()
  @IsString()
  year?: string;

  @ApiPropertyOptional({ description: 'Comma-separated licence values.' })
  @IsOptional()
  @IsString()
  lic?: string;

  @ApiPropertyOptional({ description: 'Comma-separated journal names.' })
  @IsOptional()
  @IsString()
  jrnl?: string;

  @ApiPropertyOptional({ description: 'Comma-separated MeSH headings.' })
  @IsOptional()
  @IsString()
  mesh?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated author keywords. Exact match only -- see /api/facets for why there is no typeahead for this field.',
  })
  @IsOptional()
  @IsString()
  kw?: string;

  @ApiPropertyOptional({ description: 'Comma-separated publication types.' })
  @IsOptional()
  @IsString()
  ptype?: string;

  @ApiPropertyOptional({
    description: 'EDAM domain tier 1 (single-select vocabulary, comma-separated for OR).',
  })
  @IsOptional()
  @IsString()
  d1?: string;

  @ApiPropertyOptional({ description: 'EDAM domain tier 2.' })
  @IsOptional()
  @IsString()
  d2?: string;

  @ApiPropertyOptional({ description: 'EDAM domain tier 3.' })
  @IsOptional()
  @IsString()
  d3?: string;

  @ApiPropertyOptional({ description: 'Learning paradigm.' })
  @IsOptional()
  @IsString()
  para?: string;

  @ApiPropertyOptional({ description: 'Model family.' })
  @IsOptional()
  @IsString()
  fam?: string;

  @ApiPropertyOptional({ description: 'Model type.' })
  @IsOptional()
  @IsString()
  mt?: string;

  @ApiPropertyOptional({
    description: 'Only records the enrichment pass has touched.',
    enum: ['true', 'false'],
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  enriched?: string;

  @ApiPropertyOptional({
    enum: ['relevance', 'year_desc', 'year_asc'],
    default: 'relevance',
  })
  @IsOptional()
  @IsIn(['relevance', 'year_desc', 'year_asc'])
  sort?: string;

  @ApiPropertyOptional({ description: '1-indexed page number.', default: '1' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({
    description: 'Results per page, max 100.',
    default: '25',
  })
  @IsOptional()
  @IsString()
  pageSize?: string;
}
