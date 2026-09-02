import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { StatsService, FacetStats } from './stats.service';

@ApiTags('stats')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded (300 requests/minute/IP) -- back off and retry.',
})
@ApiServiceUnavailableResponse({
  description: 'The corpus database is unreachable -- safe to retry with backoff.',
})
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({
    summary:
      "Corpus-wide headline figures and facet counts -- the same numbers observatory-ui's " +
      'search page reads for its metric row and facet panel. Cached; refreshes at most once a day.',
  })
  @ApiOkResponse({
    description:
      'FacetStats -- see observatory-ui/src/app/core/facet-stats.model.ts for the mirrored shape.',
  })
  getStats(): Promise<FacetStats> {
    return this.statsService.getStats();
  }
}
