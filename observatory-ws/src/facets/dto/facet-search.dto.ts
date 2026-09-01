import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class FacetSearchDto {
  @ApiPropertyOptional({
    description: 'Substring to filter suggestions by, case-insensitive.',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Max suggestions to return.',
    default: '20',
  })
  @IsOptional()
  @IsString()
  limit?: string;
}
