import { Module } from '@nestjs/common';
import { ContentModelModule } from '../database/content-model.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [ContentModelModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
