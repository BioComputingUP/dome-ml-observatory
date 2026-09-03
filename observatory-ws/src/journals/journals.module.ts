import { Module } from '@nestjs/common';
import { JournalsController } from './journals.controller';
import { JournalsService } from './journals.service';
import { ContentModelModule } from '../database/content-model.module';

@Module({
  imports: [ContentModelModule],
  controllers: [JournalsController],
  providers: [JournalsService],
})
export class JournalsModule {}
