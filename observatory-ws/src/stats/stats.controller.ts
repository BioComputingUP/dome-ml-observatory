import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatsService, FacetStats } from './stats.service';

@ApiTags('stats')
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
