import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ContentModelModule } from '../database/content-model.module';

@Module({
  imports: [ContentModelModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
