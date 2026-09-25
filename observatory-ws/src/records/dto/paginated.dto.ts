import { ApiProperty } from '@nestjs/swagger';
import { RecordDto } from './record.dto';

export class QueryExpansionDto {
  @ApiProperty({ example: 'svm', description: 'The term as typed.' })
  term!: string;

  @ApiProperty({
    type: [String],
    example: ['support vector machine', 'SVC', 'SVR'],
    description: 'The other spellings it was also searched as, from the published vocabulary.',
  })
  alternatives!: string[];
}

export class SearchInfoDto {
  @ApiProperty({
    enum: ['word', 'prefix', 'author', 'identifier'],
    description:
      "How the free text was matched. 'word': whole words and their inflections, from the " +
      "index (the ordinary case). 'prefix': word beginnings, on the scan path -- a `*` term, a " +
      'cleared class filter, or the automatic retry after the index found nothing for the words ' +
      "as typed. 'author': the initials-first name probe answered. 'identifier': a DOI, PMID or " +
      'PMCID looked up directly.',
  })
  matched!: 'word' | 'prefix' | 'author' | 'identifier';

  @ApiProperty({ type: [QueryExpansionDto] })
  expansions!: QueryExpansionDto[];
}

/**
 * Response shape for GET /api/records. Extends observatory-ui's SearchResult
 * (records.service.ts) additively -- `totalRelation` is a new field the existing
 * `{ items, total, page, pageSize }` consumers can simply ignore.
 */
export class PaginatedRecordsDto {
  @ApiProperty({ type: [RecordDto] })
  items!: RecordDto[];

  // corpus-figures: the positives total on 2026-09-25, refreshed after each load.
  @ApiProperty({
    description: 'Result count for this filter combination.',
    example: 367_348,
  })
  total!: number;

  @ApiProperty({
    enum: ['eq', 'gte'],
    description:
      "'eq' is an exact count. 'gte' means the exact count timed out on the MongoDB server's un-indexed " +
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

  @ApiProperty({
    required: false,
    type: SearchInfoDto,
    description: 'How `q` was matched. Absent when there was no free text.',
  })
  search?: SearchInfoDto;
}
