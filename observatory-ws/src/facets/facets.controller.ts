import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { FacetsService } from './facets.service';
import { FacetSearchDto } from './dto/facet-search.dto';

@ApiTags('facets')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded (300 requests/minute/IP) -- back off and retry.',
})
@ApiServiceUnavailableResponse({
  description: 'The corpus database is unreachable -- safe to retry with backoff.',
})
@Controller('facets')
export class FacetsController {
  constructor(private readonly facetsService: FacetsService) {}

  @Get(':field')
  @ApiOperation({
    summary:
      'Typeahead suggestions for a facet field. Allowed fields: journal, mesh_headings, ' +
      'pub_types, license. keywords_author is deliberately not offered -- see /api for why.',
  })
  @ApiOkResponse({ type: [String] })
  search(@Param('field') field: string, @Query() query: FacetSearchDto): string[] {
    const limit = query.limit !== undefined ? Number(query.limit) : undefined;
    return this.facetsService.search(field, query.q, limit);
  }
}
