import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { RecordDocument } from '../records/schemas/record.schema';
import { AppConfig } from '../config/configuration';

/**
 * Fields the typeahead can search, mapped to their Mongo path. Deliberately does NOT include
 * `keywords_author`: it has 694,411 distinct values on the live corpus (measured against the database server,
 * 2026-09-01) -- too many to cache in memory sensibly, and a per-keystroke Mongo query against an
 * un-indexed array field on that collection measured ~3s. observatory-ui's search page ships that
 * field as a plain text input with no suggestions instead (Phase 7) -- see internal/ROADMAP.md.
 */
const FIELD_PATHS: Record<string, string> = {
  journal: 'publication_metadata.journal',
  mesh_headings: 'content_filters.mesh_headings',
  pub_types: 'content_filters.pub_types',
  license: 'source.access.license',
};

export const ALLOWED_FACET_FIELDS = Object.keys(FIELD_PATHS);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Builds an in-memory value cache per allowed field at boot (measured ~5s total across all four:
 * journal 1.6s, mesh 2.1s, pub_types 1.6s, license negligible) and serves every /api/facets/:field
 * request from it -- no Mongo round trip per keystroke. Cardinalities (journal 12,753; mesh
 * 23,222; pub_types 141; license 10) are small enough that holding all of them (~36k strings, a
 * few MB) in process memory is cheap, and the corpus only changes 6-12x/year so staleness between
 * deploys is a non-issue.
 */
@Injectable()
export class FacetsService implements OnModuleInit {
  private readonly logger = new Logger(FacetsService.name);
  private readonly cache = new Map<string, string[]>();

  constructor(
    @InjectModel('Content') private readonly model: Model<RecordDocument>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all(ALLOWED_FACET_FIELDS.map((field) => this.loadField(field)));
  }

  private async loadField(field: string): Promise<void> {
    const path = FIELD_PATHS[field];
    const maxTimeMs = this.config.get('mongo.maxTimeMs', { infer: true });
    try {
      const values = await this.model.distinct(path).maxTimeMS(Math.max(maxTimeMs, 10_000)).exec();
      const cleaned = (values as unknown[])
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .sort((a, b) => a.localeCompare(b));
      this.cache.set(field, cleaned);
      this.logger.log(`Loaded ${cleaned.length} distinct values for facet "${field}"`);
    } catch (err) {
      // Non-fatal: this field's typeahead just returns empty suggestions until the next boot
      // (or the database server comes back) rather than crashing the whole app over a convenience feature.
      this.logger.warn(
        `Failed to load facet "${field}" (will serve empty until next boot): ${String(err)}`,
      );
      this.cache.set(field, []);
    }
  }

  search(field: string, q: string | undefined, limit: number | undefined): string[] {
    if (!ALLOWED_FACET_FIELDS.includes(field)) {
      throw new BadRequestException(
        `Unknown facet field "${field}". Allowed: ${ALLOWED_FACET_FIELDS.join(', ')}. ` +
          `"keywords_author" is deliberately excluded -- see this endpoint's docs.`,
      );
    }
    const values = this.cache.get(field) ?? [];
    const needle = q?.trim().toLowerCase();
    const matches = needle ? values.filter((v) => v.toLowerCase().includes(needle)) : values;
    const boundedLimit = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    return matches.slice(0, boundedLimit);
  }
}
