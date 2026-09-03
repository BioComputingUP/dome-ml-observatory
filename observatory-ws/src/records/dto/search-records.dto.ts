import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Nothing in a real search is longer than this. Without a cap, one request can build an
 *  arbitrarily long regex and make the server do arbitrarily much work for it -- nginx's own URL
 *  limits bound it in the shipped topology, but the API should not depend on what fronts it. */
const MAX_PARAM_LENGTH = 200;

/** Ceiling on values in one repeatable filter (?jrnl=A&jrnl=B&...), which become a Mongo $in.
 *  Well above any real facet selection; the journal facet UI caps far lower. */
const MAX_LIST_VALUES = 50;

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

/**
 * Marks a REPEATABLE multi-value filter param (`?jrnl=A&jrnl=B`).
 *
 * Express hands a single occurrence back as a string and a repeated one as an array; this
 * normalises both to an array so records.query.ts's readList sees one shape. Repeated keys, rather
 * than one comma-joined value, are what make a facet value containing a comma expressible --
 * "Bioinformatics Advances (Oxford, England)" and the EDAM vocabulary's own comma-bearing terms
 * were previously split into junk filter values that matched nothing.
 */
function RepeatableParam(description: string) {
  return function (target: object, propertyKey: string): void {
    ApiPropertyOptional({
      description: `${description} Repeatable -- pass the key once per value (?k=A&k=B). Values are matched verbatim, so names containing commas work; a single comma-joined value is now ONE value, not a list.`,
      type: [String],
    })(target, propertyKey);
    IsOptional()(target, propertyKey);
    Transform(({ value }: { value: unknown }) =>
      value === undefined ? undefined : Array.isArray(value) ? value : [value],
    )(target, propertyKey);
    IsString({ each: true })(target, propertyKey);
    ArrayMaxSize(MAX_LIST_VALUES)(target, propertyKey);
    MaxLength(MAX_PARAM_LENGTH, { each: true })(target, propertyKey);
  };
}

export class SearchRecordsDto {
  @ApiPropertyOptional({
    description: `Free text over title, abstract and authors. Maximum ${MAX_PARAM_LENGTH} characters.`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PARAM_LENGTH)
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

  @RepeatableParam('Licence values.')
  lic?: string | string[];

  @RepeatableParam('Journal names.')
  jrnl?: string | string[];

  @RepeatableParam('MeSH headings.')
  mesh?: string | string[];

  @RepeatableParam(
    'Author keywords. Exact match only -- see /api/facets for why there is no typeahead for this field.',
  )
  kw?: string | string[];

  @RepeatableParam('Publication types.')
  ptype?: string | string[];

  @RepeatableParam('EDAM domain tier 1.')
  d1?: string | string[];

  @RepeatableParam('EDAM domain tier 2.')
  d2?: string | string[];

  @RepeatableParam('EDAM domain tier 3.')
  d3?: string | string[];

  @RepeatableParam('Learning paradigm.')
  para?: string | string[];

  @RepeatableParam('Model family.')
  fam?: string | string[];

  @RepeatableParam('Model type.')
  mt?: string | string[];

  @ApiPropertyOptional({
    description: 'Only records the enrichment pass has touched.',
    enum: ['true', 'false'],
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  enriched?: string;

  @ApiPropertyOptional({
    description:
      'citations_desc/citations_asc sort on publication_metadata.citation_count, which is null ' +
      'for every record in the current corpus (a forward-compatible schema placeholder) -- wired ' +
      'now so the option works unchanged once that field is populated.',
    enum: ['relevance', 'year_desc', 'year_asc', 'citations_desc', 'citations_asc'],
    default: 'relevance',
  })
  @IsOptional()
  @IsIn(['relevance', 'year_desc', 'year_asc', 'citations_desc', 'citations_asc'])
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
