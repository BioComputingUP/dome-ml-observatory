import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { RecordsService, SearchResult } from './records.service';
import { SearchRecordsDto } from './dto/search-records.dto';
import { PaginatedRecordsDto } from './dto/paginated.dto';
import { RecordDto } from './dto/record.dto';
import { RecordDocument } from './schemas/record.schema';

@ApiTags('records')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded (300 requests/minute/IP) -- back off and retry.',
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
      'page x pageSize exceeds the 10,000-record result window -- narrow the filters, or use bulk download for whole-corpus work.',
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
