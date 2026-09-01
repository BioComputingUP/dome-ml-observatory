import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { ContentModelModule } from '../database/content-model.module';

@Module({
  imports: [ContentModelModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
