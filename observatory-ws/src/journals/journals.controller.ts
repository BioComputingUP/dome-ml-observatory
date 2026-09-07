import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  DEFAULT_MIN_SCREENED,
  JournalDetailResult,
  JournalListResult,
  JournalSort,
  JournalsService,
} from './journals.service';
import { JournalDetailDto, JournalListDto } from './dto/journal-query.dto';

const DEFAULT_LIMIT = 50;

/** Query params arrive as strings; a non-numeric one falls back to the default rather than
 *  erroring, matching how FacetsController treats its own `limit`. */
function toInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

// Subject to the 'default' throttler only -- 'export' exists for /api/export's much larger
// per-request cost and would otherwise also apply here. See app.module.ts.
@SkipThrottle({ export: true })
@ApiTags('journals')
@ApiTooManyRequestsResponse({
  description:
    'Rate limit exceeded -- back off and retry. The limit is per client IP over a rolling ' +
    'minute; see the Fair use section of this document for the current value.',
})
@ApiServiceUnavailableResponse({
  description: 'The corpus database is unreachable -- safe to retry with backoff.',
})
@Controller('journals')
export class JournalsController {
  constructor(private readonly journals: JournalsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Journals ranked by AI/ML methods paper count, or by the share of their screened output ' +
      'that is AI/ML. Served from an in-memory table refreshed at most once a day.',
  })
  @ApiOkResponse({ description: 'JournalListResult -- rows omit the per-year series.' })
  list(@Query() query: JournalListDto): Promise<JournalListResult> {
    return this.journals.list(
      query.q,
      (query.sort as JournalSort) ?? 'count',
      toInt(query.limit, DEFAULT_LIMIT),
      toInt(query.minScreened, DEFAULT_MIN_SCREENED),
    );
  }

  @Get('detail')
  @ApiOperation({
    summary:
      'Everything held about one journal: classification totals, its year-by-year trend since ' +
      '2000, and where it ranks in the corpus.',
  })
  @ApiOkResponse({ description: 'JournalDetailResult.' })
  @ApiBadRequestResponse({ description: 'The `journal` parameter is required.' })
  @ApiNotFoundResponse({ description: 'No journal by that exact name appears in the corpus.' })
  detail(@Query() query: JournalDetailDto): Promise<JournalDetailResult> {
    if (!query.journal?.trim()) {
      throw new BadRequestException('A `journal` query parameter is required.');
    }
    return this.journals.detail(query.journal);
  }
}
