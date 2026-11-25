import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StaleWhileRevalidate } from '../common/stale-while-revalidate';
import { RecordDocument } from '../records/schemas/record.schema';
import {
  DataOverview,
  DataTable,
  RawDataFacet,
  RawResourceJournal,
  ResourceDetail,
  buildDataFacetPipeline,
  buildResourceJournalPipeline,
  shapeDataTable,
} from './data-insights';
import {
  JournalModelProfile,
  JOURNAL_MIN_ENRICHED,
  ModelsOverview,
  ModelsTable,
  RawJournalFamily,
  RawModelType,
  RawModelsFacet,
  buildJournalFamilyPipeline,
  buildModelTypePipeline,
  buildModelsFacetPipeline,
  shapeModelsTable,
} from './models-insights';
import { ResourceVocab, loadResourceVocab } from './resource-vocab';

/** Same 24h as the stats and journals tables: the corpus changes with each load, not continuously. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Each pipeline reads the positives once. Generous, as for JournalsService: better a slow build
 *  at boot or once a day than a half-built table. */
const AGGREGATION_MAX_TIME_MS = 180_000;

/**
 * The corpus-level figures behind the Data and Models pages.
 *
 * Like JournalsService, nothing here queries Mongo per request: each page is one in-memory table,
 * built by a few aggregations over the positives and served stale past its 24h TTL while ONE
 * background rebuild runs (StaleWhileRevalidate).
 *
 * Unlike JournalsService, the first build is NOT awaited before the app listens. It starts in
 * onApplicationBootstrap, i.e. after the facets, stats and journals warm-ups have finished, and is
 * left to run, so boot time and the Dockerfile's HEALTHCHECK --start-period are unchanged and the
 * shared database host never runs these scans at the same time as the journals one. A request that
 * arrives before the first build finishes waits for that same build rather than starting another;
 * only a failed first build answers 503.
 *
 * The aggregations read the positives only (the class_year_id index serves that $match) and never
 * touch another collection. Models reads only enriched papers' tags, Data only the data-kind
 * resources the published vocabulary lists (vocab/data-resources.json, schema v1.9.0).
 */
@Injectable()
export class InsightsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InsightsService.name);
  private readonly vocab: ResourceVocab = loadResourceVocab();

  private readonly models = new StaleWhileRevalidate<ModelsTable>(
    CACHE_TTL_MS,
    () => this.buildModels(),
    {
      onError: (err) =>
        this.logger.warn(
          `Background models-table rebuild failed (stale table still served): ${String(err)}`,
        ),
    },
  );

  private readonly data = new StaleWhileRevalidate<DataTable>(
    CACHE_TTL_MS,
    () => this.buildData(),
    {
      onError: (err) =>
        this.logger.warn(
          `Background data-table rebuild failed (stale table still served): ${String(err)}`,
        ),
    },
  );

  constructor(@InjectModel('Content') private readonly model: Model<RecordDocument>) {}

  onApplicationBootstrap(): void {
    // One after the other, never together, and never awaited here (see the class comment).
    void this.models
      .get()
      .then(() => this.data.get())
      .catch((err: unknown) =>
        this.logger.warn(
          `Insights warm-up failed (non-fatal, will retry on first request): ${String(err)}`,
        ),
      );
  }

  async modelsOverview(): Promise<ModelsOverview> {
    return (await this.table(this.models, 'Model')).overview;
  }

  async journalProfile(journal: string): Promise<JournalModelProfile> {
    const table = await this.table(this.models, 'Model');
    const hit = table.journals.get(journal);
    if (!hit) {
      throw new NotFoundException(
        `No enriched AI/ML methods paper from a journal named "${journal}". Names are matched ` +
          'exactly -- /api/journals?q=... gives the spelling.',
      );
    }
    return {
      generated: table.overview.generated,
      profile: hit.profile,
      rank: hit.rank,
      rankOf: table.journals.size,
      minEnriched: JOURNAL_MIN_ENRICHED,
      corpusEnriched: table.overview.coverage.enriched,
    };
  }

  async dataOverview(): Promise<DataOverview> {
    return (await this.table(this.data, 'Data')).overview;
  }

  async resourceDetail(slug: string): Promise<ResourceDetail> {
    const table = await this.table(this.data, 'Data');
    const detail = table.details.get(slug);
    if (!detail) {
      throw new NotFoundException(
        `No AI/ML methods paper links a data resource "${slug}". Slugs are the values of ` +
          "data_links.resources[].resource, listed in the schema release's vocab/data-resources.json.",
      );
    }
    return detail;
  }

  private async buildModels(): Promise<ModelsTable> {
    const started = Date.now();
    const generated = new Date().toISOString();
    const maxYear = new Date(generated).getUTCFullYear();
    const options = { maxTimeMS: AGGREGATION_MAX_TIME_MS, allowDiskUse: true };
    // Sequential on purpose: three moderate scans one after another are kinder to the shared
    // database host than three at once, and the build is off the request path anyway.
    const [facet] = await this.model
      .aggregate<RawModelsFacet>(buildModelsFacetPipeline(maxYear))
      .option(options)
      .exec();
    const types = await this.model
      .aggregate<RawModelType>(buildModelTypePipeline(maxYear))
      .option(options)
      .exec();
    const journals = await this.model
      .aggregate<RawJournalFamily>(buildJournalFamilyPipeline())
      .option(options)
      .exec();
    const table = shapeModelsTable(facet, types, journals, generated);
    const o = table.overview;
    this.logger.log(
      `Models table built: ${o.coverage.enriched} enriched papers, ${o.modelTypes.distinct} model types, ` +
        `${table.journals.size} journals in ${Date.now() - started}ms`,
    );
    return table;
  }

  private async buildData(): Promise<DataTable> {
    const started = Date.now();
    const generated = new Date().toISOString();
    const maxYear = new Date(generated).getUTCFullYear();
    const options = { maxTimeMS: AGGREGATION_MAX_TIME_MS, allowDiskUse: true };
    const [facet] = await this.model
      .aggregate<RawDataFacet>(buildDataFacetPipeline(this.vocab, maxYear))
      .option(options)
      .exec();
    const journals = await this.model
      .aggregate<RawResourceJournal>(buildResourceJournalPipeline(this.vocab, maxYear))
      .option(options)
      .exec();
    const table = shapeDataTable(facet, journals, this.vocab, generated);
    const o = table.overview;
    this.logger.log(
      `Data table built: ${o.scope.linking} papers linking ${o.resources.length} data resources ` +
        `in ${Date.now() - started}ms`,
    );
    return table;
  }

  /** Only a failed first build throws; once a table exists it is served, stale or not. */
  private async table<T>(cache: StaleWhileRevalidate<T>, name: string): Promise<T> {
    try {
      return await cache.get();
    } catch (err) {
      this.logger.warn(`${name} insights aggregation failed: ${String(err)}`);
      throw new ServiceUnavailableException(`${name} statistics are temporarily unavailable`);
    }
  }
}
