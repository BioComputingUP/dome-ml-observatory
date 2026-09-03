import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** A typeahead needle longer than this is not a real query. Capped for the same reason as
 *  SearchRecordsDto's: an unbounded string becomes an unbounded regex in rankFacetMatches. */
const MAX_NEEDLE_LENGTH = 200;

export class FacetSearchDto {
  @ApiPropertyOptional({
    description: `Substring to filter suggestions by, case-insensitive. Maximum ${MAX_NEEDLE_LENGTH} characters.`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NEEDLE_LENGTH)
  q?: string;

  @ApiPropertyOptional({
    description: 'Max suggestions to return. Clamped server-side; a non-numeric value is ignored.',
    default: '20',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  limit?: string;
}
