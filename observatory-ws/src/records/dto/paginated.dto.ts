import { ApiProperty } from '@nestjs/swagger';
import { RecordDto } from './record.dto';

/**
 * Response shape for GET /api/records. Extends observatory-ui's SearchResult
 * (records.service.ts) additively -- `totalRelation` is a new field the existing
 * `{ items, total, page, pageSize }` consumers can simply ignore, per ROADMAP.md Phase 5.
 */
export class PaginatedRecordsDto {
  @ApiProperty({ type: [RecordDto] })
  items!: RecordDto[];

  @ApiProperty({
    description: 'Result count for this filter combination.',
    example: 355_558,
  })
  total!: number;

  @ApiProperty({
    enum: ['eq', 'gte'],
    description:
      "'eq' is an exact count. 'gte' means the exact count timed out on the database server's un-indexed " +
      'collection and `total` is a cheap lower bound instead -- render it as e.g. "10,000+".',
  })
  totalRelation!: 'eq' | 'gte';

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({
    required: false,
    description:
      'True when fetching this page hit its time budget and gave up (items is empty in that ' +
      'case) -- distinct from a real outage, which is a 503 instead. Only reachable for a ' +
      'free-text (q=) search. See RecordsService.fetchPage.',
  })
  timedOut?: boolean;
}
