import { Module } from '@nestjs/common';
import { ContentModelModule } from '../database/content-model.module';
import { OaiController } from './oai.controller';
import { OaiService } from './oai.service';

@Module({
  imports: [ContentModelModule],
  controllers: [OaiController],
  providers: [OaiService],
})
export class OaiModule {}
