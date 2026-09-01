import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';
import { CountService } from './count.service';
import { ContentModelModule } from '../database/content-model.module';
import { buildMongoFilter, canonicalCacheKey, parseSearchParams } from './records.query';

@Module({
  imports: [ContentModelModule],
  controllers: [RecordsController],
  providers: [RecordsService, CountService],
  exports: [RecordsService],
})
export class RecordsModule implements OnModuleInit {
  private readonly logger = new Logger(RecordsModule.name);

  constructor(private readonly countService: CountService) {}

  /** Warms the count cache for the default (class=positive) search at boot, so the first real
   *  page load never pays the cold ~4.4s unbounded count measured against the database server -- see
   *  CountService and internal/ROADMAP.md Phase 5. Runs once; failure is logged, not fatal (the
   *  app must still serve /api/health while the database server is unreachable -- see health.controller.ts). */
  async onModuleInit(): Promise<void> {
    const { filters } = parseSearchParams({});
    const filter = buildMongoFilter(filters);
    const cacheKey = canonicalCacheKey(filters);
    await this.countService.warm(filter, cacheKey);
  }
}
