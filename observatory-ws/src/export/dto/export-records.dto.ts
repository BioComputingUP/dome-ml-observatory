import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SearchRecordsDto } from '../../records/dto/search-records.dto';
import { MAX_EXPORT_CHUNK, DEFAULT_EXPORT_CHUNK } from '../export.query';

/**
 * Every filter param /api/records accepts, minus the three that cannot mean anything on a keyset
 * walk: `page` and `pageSize` (superseded by `cursor`/`limit`) and `sort` (the walk is always
 * `_id` ascending -- that ordering is what makes the cursor stable, see export.service.ts).
 *
 * Derived with OmitType rather than retyped so a new filter added to SearchRecordsDto is
 * automatically exportable. Its validation metadata (MaxLength, ArrayMaxSize, the repeatable-param
 * array normalisation) is copied across by the mapped type, so the two endpoints accept byte-for-
 * byte identical filter values.
 *
 * `q` is deliberately INHERITED rather than omitted, even though export rejects it. The global
 * ValidationPipe runs with `whitelist: true`, so an undeclared param is stripped silently before
 * any handler sees it -- omitting `q` here would turn `?q=protein` into "your filter was quietly
 * ignored and you got the whole corpus" instead of the 400 that explains why. See
 * ExportService.chunk.
 */
export class ExportRecordsDto extends OmitType(SearchRecordsDto, [
  'page',
  'pageSize',
  'sort',
] as const) {
  @ApiPropertyOptional({
    description:
      'The `_id` of the last record in the previous chunk, taken from that response’s ' +
      '`X-Next-Cursor` header. Omit for the first chunk. Records are returned in ascending ' +
      '`_id` order, so a cursor is simply the position to resume from.',
    example: '04fc0915-fded-5146-8847-4da33cf3a059',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @ApiPropertyOptional({
    description: `Records per chunk. Capped at ${MAX_EXPORT_CHUNK}; a missing or non-numeric value gives ${DEFAULT_EXPORT_CHUNK}.`,
    default: String(DEFAULT_EXPORT_CHUNK),
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  limit?: string;
}
