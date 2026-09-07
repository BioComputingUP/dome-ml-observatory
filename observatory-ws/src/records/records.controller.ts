import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { RecordsService, SearchResult } from './records.service';
import { SearchRecordsDto } from './dto/search-records.dto';
import { PaginatedRecordsDto } from './dto/paginated.dto';
import { RecordDto } from './dto/record.dto';
import { RecordDocument } from './schemas/record.schema';

// Subject to the 'default' throttler only -- 'export' exists for /api/export's much larger
// per-request cost and would otherwise also apply here. See app.module.ts.
@SkipThrottle({ export: true })
@ApiTags('records')
@ApiTooManyRequestsResponse({
  description:
    'Rate limit exceeded -- back off and retry. The limit is per client IP over a rolling ' +
    'minute; see the Fair use section of this document for the current value.',
})
@ApiServiceUnavailableResponse({
  description: 'The corpus database is unreachable -- safe to retry with backoff.',
})
@Controller('records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Get()
  @ApiOperation({
    summary: 'Paginated search over the corpus. Parameters mirror the Search page’s own filters.',
  })
  @ApiOkResponse({ type: PaginatedRecordsDto })
  @ApiBadRequestResponse({
    description:
      'page x pageSize exceeds the 10,000-record result window -- narrow the filters, or use ' +
      '/api/export to walk the whole matching set with a cursor.',
  })
  search(@Query() query: SearchRecordsDto): Promise<SearchResult> {
    // SearchRecordsDto's fields are already exactly RawSearchParams's shape (see that DTO's
    // header comment) -- no mapping needed between the validated HTTP query and the pure parser.
    return this.recordsService.search(query);
  }

  @Get(':pid')
  @ApiOperation({
    summary: 'A single record by its PID (the same identifier used in /record/:pid URLs).',
  })
  @ApiOkResponse({ type: RecordDto })
  findOne(@Param('pid') pid: string): Promise<RecordDocument> {
    return this.recordsService.findByPid(pid);
  }
}
