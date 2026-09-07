import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { RecordDocument } from '../records/schemas/record.schema';
import { AppConfig } from '../config/configuration';

/**
 * Fields the typeahead can search, mapped to their Mongo path. Deliberately does NOT include
 * `keywords_author`: it has 694,411 distinct values on the live corpus (measured against the MongoDB server,
 * 2026-09-01) -- too many to cache in memory sensibly, and a per-keystroke Mongo query against an
 * un-indexed array field on that collection measured ~3s. observatory-ui's search page ships that
 * field as a plain text input with no suggestions instead.
 */
const FIELD_PATHS: Record<string, string> = {
  journal: 'publication_metadata.journal',
  // Around 30 distinct values once the preprint capture pass populates it (see preprint.md), so
  // nothing like the keywords_author case above -- it caches trivially, and answers empty until
  // then. Measured against the real corpus 2026-09-07: the boot-time distinct takes 2.2s and runs
  // inside the existing Promise.all, so it adds nothing serial to boot and the Dockerfile's
  // HEALTHCHECK --start-period is unaffected.
  preprint_server: 'publication_metadata.preprint_server',
  mesh_headings: 'content_filters.mesh_headings',
  pub_types: 'content_filters.pub_types',
  license: 'source.access.license',
};

export const ALLOWED_FACET_FIELDS = Object.keys(FIELD_PATHS);

/** Scopes every typeahead to the positives -- the search page's whole search space (see Part 2 of
 *  the search repair; observatory-ui's facet-panel.ts no longer offers a classification filter).
 *  Without this, e.g. the journal typeahead could suggest a journal that exists only among the
 *  464,581 screened-out records and matches nothing a search here can ever return. */
const POSITIVE_FILTER = { 'llm_classification.classification': 'positive' };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * How well a suggestion matches what was typed. Lower is better.
 *
 * A plain `includes()` filter over an alphabetically-sorted cache put
 * "2013 ACM Conference on Bioinformatics, Computational Biology and Biomedical Informatics..."
 * above "Bioinformatics (Oxford, England)" for the query "bioinformatics" -- the journal whose name
 * *starts* with what you typed was pushed off the end of the list by conference proceedings that
 * merely contain the word. Nobody searches that way.
 *
 * Prefix beats word-start beats substring, which is how every typeahead people are used to behaves.
 */
function matchRank(value: string, needle: string): number {
  const lower = value.toLowerCase();
  if (lower === needle) return 0;
  if (lower.startsWith(needle)) return 1;
  // \b would also fire mid-token on punctuation ("proteomics & bioinformatics" is a genuine
  // word-start, "non-bioinformatics" is not); a space or an opening bracket is the honest test.
  if (new RegExp(`[\\s([]${escapeForRegex(needle)}`).test(lower)) return 2;
  return 3;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ranks the cached values against what was typed and returns the best `limit` of them.
 *
 * Exported (and pure) so the ordering rules can be tested directly -- FacetsService itself needs a
 * Mongo model and a boot-time cache load, neither of which says anything about ranking.
 */
export function rankFacetMatches(values: string[], needle: string, limit: number): string[] {
  // Rank, then take -- taking first would discard the best matches before they were compared.
  // The cache is a few thousand entries per field, so ranking all of them costs nothing measurable
  // and still needs no Mongo round trip per keystroke.
  return values
    .filter((v) => v.toLowerCase().includes(needle))
    .map((value) => ({ value, rank: matchRank(value, needle) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        // Shorter first at equal rank: "Bioinformatics (Oxford, England)" is a likelier target
        // than "Bioinformatics Research and Applications11th International Symposium...".
        a.value.length - b.value.length ||
        a.value.localeCompare(b.value),
    )
    .slice(0, limit)
    .map((m) => m.value);
}

/**
 * Builds an in-memory value cache per allowed field at boot, scoped to the positives, and serves
 * every /api/facets/:field request from it -- no Mongo round trip per keystroke. Cardinalities are
 * small enough (a few thousand journals, a few dozen publication types, single-digit licences)
 * that holding all of them in process memory is cheap, and the corpus only changes 6-12x/year so
 * staleness between deploys is a non-issue.
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
      const values = await this.model
        .distinct(path, POSITIVE_FILTER)
        .maxTimeMS(Math.max(maxTimeMs, 10_000))
        .exec();
      const cleaned = (values as unknown[])
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .sort((a, b) => a.localeCompare(b));
      this.cache.set(field, cleaned);
      this.logger.log(`Loaded ${cleaned.length} distinct values for facet "${field}"`);
    } catch (err) {
      // Non-fatal: this field's typeahead just returns empty suggestions until the next boot
      // (or the MongoDB server comes back) rather than crashing the whole app over a convenience feature.
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
    const boundedLimit = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    if (!needle) return values.slice(0, boundedLimit);
    return rankFacetMatches(values, needle, boundedLimit);
  }
}
