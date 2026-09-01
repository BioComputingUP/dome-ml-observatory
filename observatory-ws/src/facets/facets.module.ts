import { Module } from '@nestjs/common';
import { FacetsController } from './facets.controller';
import { FacetsService } from './facets.service';
import { ContentModelModule } from '../database/content-model.module';

@Module({
  imports: [ContentModelModule],
  controllers: [FacetsController],
  providers: [FacetsService],
})
export class FacetsModule {}
