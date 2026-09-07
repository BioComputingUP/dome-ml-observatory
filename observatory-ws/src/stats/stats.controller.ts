import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { StatsService, FacetStats } from './stats.service';

// Subject to the 'default' throttler only -- 'export' exists for /api/export's much larger
// per-request cost and would otherwise also apply here. See app.module.ts.
@SkipThrottle({ export: true })
@ApiTags('stats')
@ApiTooManyRequestsResponse({
  description:
    'Rate limit exceeded -- back off and retry. The limit is per client IP over a rolling ' +
    'minute; see the Fair use section of this document for the current value.',
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
