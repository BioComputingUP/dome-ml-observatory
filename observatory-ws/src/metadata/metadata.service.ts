import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CURRENT_SCHEMA_VERSION } from '../common/schema-version';
import { AppConfig } from '../config/configuration';
import { RecordsService } from '../records/records.service';
import { JsonNode } from './json-node';
import { recordLinkset } from './linkset';
import { MetadataContext, recordJsonLd } from './record-jsonld.mapper';
import { VocabIndex } from './vocab-index';

/** The per-record projections, over the same lookup /api/records/:pid uses. */
@Injectable()
export class MetadataService {
  /** Read once: the vocabularies belong to the deployed schema release. */
  readonly vocab = VocabIndex.load();

  constructor(
    private readonly records: RecordsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  get context(): MetadataContext {
    return {
      origin: this.config.get('publicOrigin', { infer: true }),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      vocab: this.vocab,
    };
  }

  async jsonld(pid: string): Promise<JsonNode> {
    return recordJsonLd(await this.records.findByPid(pid), this.context);
  }

  async linkset(pid: string): Promise<JsonNode> {
    return recordLinkset(await this.records.findByPid(pid), this.context.origin);
  }
}
