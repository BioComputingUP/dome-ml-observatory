import { Controller, Get, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ExportService } from './export.service';
import { ExportRecordsDto } from './dto/export-records.dto';

/** Response headers the walk is driven by. Named here because main.ts must also list them in
 *  CORS `exposedHeaders` -- a browser client cannot read a custom header otherwise, and the
 *  cursor would be invisible to exactly the callers most likely to hit CORS. */
export const NEXT_CURSOR_HEADER = 'X-Next-Cursor';
export const RECORD_COUNT_HEADER = 'X-Record-Count';

// Limited by the 'export' throttler only. One chunk is up to 1000 documents, so the request
// budget that is generous for /api/records would be far heavier work here -- see app.module.ts
// where both throttlers are configured. At the default 60/min a client still pulls 60,000
// records per minute, walking the whole corpus in well under half an hour.
@SkipThrottle({ default: true })
@ApiTags('export')
@ApiTooManyRequestsResponse({
  description:
    'Export rate limit exceeded -- this endpoint has its own, lower budget than the rest of the ' +
    'API because each request is up to 1000 documents. Back off and retry.',
})
@ApiServiceUnavailableResponse({
  description: 'The corpus database is unreachable -- safe to retry with backoff.',
})
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get()
  @ApiOperation({
    summary: 'Whole-corpus retrieval as NDJSON, one keyset-paginated chunk at a time.',
    description:
      'Returns up to `limit` records as newline-delimited JSON, ordered by `_id`. There is no ' +
      'result window: repeat the request with `cursor` set to the previous response’s ' +
      '`X-Next-Cursor` header until that header is absent, and you have walked the whole ' +
      'matching set.\n\n' +
      'All the filter parameters of `/api/records` apply, so any subset of the corpus can be ' +
      'exported. Free-text `q=` is the one exception and returns 400.\n\n' +
      '```bash\n' +
      'cursor=""\n' +
      'while :; do\n' +
      '  headers=$(mktemp)\n' +
      '  curl -sD "$headers" "https://observatory.dome-ml.org/api/export?class=positive&limit=1000${cursor:+&cursor=$cursor}" >> corpus.ndjson\n' +
      "  cursor=$(grep -i '^x-next-cursor:' \"$headers\" | tr -d '\\r' | cut -d' ' -f2)\n" +
      '  [ -n "$cursor" ] || break\n' +
      'done\n' +
      '```',
  })
  @ApiProduces('application/x-ndjson')
  @ApiOkResponse({
    description:
      'Newline-delimited JSON, one record per line. `X-Record-Count` is how many lines the body ' +
      'holds; `X-Next-Cursor` is the value to pass as `cursor` next time, and is absent on the ' +
      'final chunk.',
    schema: { type: 'string', example: '{"_id":"04fc0915-...","publication_metadata":{...}}\n' },
  })
  @ApiBadRequestResponse({
    description:
      'Free-text search (q=) was supplied -- it cannot be combined with the _id-ordered cursor. ' +
      'Use /api/records instead.',
  })
  async export(@Query() query: ExportRecordsDto, @Res() res: Response): Promise<void> {
    // Awaited before anything is written to the response, deliberately: a Mongo outage must still
    // reach MongoUnavailableFilter's 503, and using @Res() means anything written here is final.
    const { items, nextCursor } = await this.exportService.chunk(query);

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader(RECORD_COUNT_HEADER, String(items.length));
    if (nextCursor) res.setHeader(NEXT_CURSOR_HEADER, nextCursor);

    // Trailing newline on a non-empty body so every line -- including the last -- is a complete
    // NDJSON record, which is what line-oriented readers (jq -c, pandas read_json(lines=True))
    // expect. An empty chunk sends an empty body, not a bare newline.
    res.send(items.length ? items.map((doc) => JSON.stringify(doc)).join('\n') + '\n' : '');
  }
}
