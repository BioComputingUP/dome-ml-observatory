import { Module } from '@nestjs/common';
import { ContentModelModule } from '../database/content-model.module';
import { RecordsModule } from '../records/records.module';
import { CatalogService } from './catalog.service';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { SitemapService } from './sitemap.service';

/**
 * FAIR metadata over the stored records, computed on request: per-record JSON-LD and Signposting
 * linkset, the sitemaps, and the corpus catalogue. Nothing is stored twice -- the documents stay
 * the validated, versioned shape the sister repository writes, and each standard is a projection
 * of them (see this app's README, "FAIR metadata").
 */
@Module({
  imports: [ContentModelModule, RecordsModule],
  controllers: [MetadataController],
  providers: [MetadataService, SitemapService, CatalogService],
  exports: [MetadataService],
})
export class MetadataModule {}
