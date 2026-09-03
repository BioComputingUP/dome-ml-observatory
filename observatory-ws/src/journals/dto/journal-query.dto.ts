import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class JournalListDto {
  @ApiPropertyOptional({
    description:
      'Substring to filter journals by, case-insensitive. Ranked by the same rules as ' +
      '/api/facets/journal (prefix beats word-start beats substring).',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description:
      '"count" ranks by number of AI/ML methods papers. "density" ranks by the share of a ' +
      "journal's screened papers that are AI/ML methods papers, subject to minScreened.",
    enum: ['count', 'density'],
    default: 'count',
  })
  @IsOptional()
  @IsIn(['count', 'density'])
  sort?: string;

  @ApiPropertyOptional({ description: 'Max rows to return (max 200).', default: '50' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({
    description:
      'Minimum screened papers for a journal to appear in the "density" ranking. Ignored by ' +
      '"count". Guards against a journal with two screened papers ranking first at 100%.',
    default: '100',
  })
  @IsOptional()
  @IsString()
  minScreened?: string;
}

export class JournalDetailDto {
  @ApiPropertyOptional({
    description:
      'Exact journal name, as stored in the corpus. A query param rather than a path segment ' +
      'because journal names contain slashes, commas and brackets.',
    example: 'Bioinformatics (Oxford, England)',
  })
  @IsOptional()
  @IsString()
  journal?: string;
}
