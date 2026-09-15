import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { TtlCache } from '../common/ttl-cache';
import { AppConfig } from '../config/configuration';
import { oaiBaseUrl, oaiIdentifier, OAI_REPOSITORY_ID } from '../metadata/metadata-urls';
import { oaiDcElements } from '../metadata/oai-dc';
import { DATESTAMP_SORT, datestampFilter, toDatestamp } from '../metadata/record-keyset';
import { RecordDocument } from '../records/schemas/record.schema';
import {
  encodeResumptionToken,
  idDoesNotExist,
  noRecordsMatch,
  OaiListRequest,
  parseOaiArgs,
} from './oai.query';
import {
  errorsXml,
  headerXml,
  identifyXml,
  metadataFormatsXml,
  OaiHead,
  oaiEnvelope,
  recordXml,
  resumptionTokenXml,
} from './oai.xml';

/** ListRecords returns whole records, ListIdentifiers only headers, so their pages differ. */
export const LIST_RECORDS_PAGE = 200;
export const LIST_IDENTIFIERS_PAGE = 1000;

const EARLIEST_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PROJECTION = { _id: 1, record_modified: 1 } as const;
/** Everything oai_dc reads; the long free-text fields it never uses stay on the server. */
const RECORD_PROJECTION = {
  'publication_metadata.abstract': 0,
  'llm_classification.rationale': 0,
  'llm_enrichment.rationale': 0,
} as const;

/** A real record from the published example, for Identify's sampleIdentifier. */
const SAMPLE_PID = '8b720ad0-8cf7-5304-a016-3b15feae2815';

/**
 * An OAI-PMH 2.0 data provider over the positives, in `oai_dc`.
 *
 * Datestamps are `record_modified` (schema v1.6.0), which the write side moves only when a harvested
 * value changes, so `from=` returns what actually changed. Records without one -- a corpus not yet
 * migrated -- are not harvestable. Paging is keyset over `(record_modified, _id)`: see
 * metadata/record-keyset.ts.
 */
@Injectable()
export class OaiService {
  private readonly earliest = new TtlCache<string>(EARLIEST_TTL_MS);

  constructor(
    @InjectModel('Content') private readonly model: Model<RecordDocument>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async respond(raw: Readonly<Record<string, unknown>>, now: Date = new Date()): Promise<string> {
    const parsed = parseOaiArgs(raw);
    const origin = this.config.get('publicOrigin', { infer: true });
    const head: OaiHead = {
      responseDate: toDatestamp(now),
      baseUrl: oaiBaseUrl(origin),
      echo: parsed.echo,
    };
    const request = parsed.request;
    if (!request) return oaiEnvelope(head, errorsXml(parsed.errors));

    switch (request.verb) {
      case 'Identify':
        return oaiEnvelope(
          head,
          identifyXml({
            repositoryName: 'DOME Observatory',
            baseUrl: head.baseUrl,
            adminEmail: 'contact@dome-ml.org',
            earliestDatestamp: await this.earliestDatestamp(now),
            repositoryIdentifier: OAI_REPOSITORY_ID,
            sampleIdentifier: oaiIdentifier(SAMPLE_PID),
          }),
        );
      case 'ListMetadataFormats':
        if (request.pid && !(await this.findHarvestable(request.pid, KEY_PROJECTION))) {
          return oaiEnvelope(head, errorsXml([idDoesNotExist(oaiIdentifier(request.pid))]));
        }
        return oaiEnvelope(head, metadataFormatsXml());
      case 'GetRecord': {
        const doc = await this.findHarvestable(request.pid);
        if (!doc) return oaiEnvelope(head, errorsXml([idDoesNotExist(oaiIdentifier(request.pid))]));
        return oaiEnvelope(head, `<GetRecord>${this.recordEntry(doc, origin)}</GetRecord>`);
      }
      case 'ListIdentifiers':
      case 'ListRecords':
        return this.list(request, head, origin);
    }
  }

  private async list(request: OaiListRequest, head: OaiHead, origin: string): Promise<string> {
    const withMetadata = request.verb === 'ListRecords';
    const pageSize = withMetadata ? LIST_RECORDS_PAGE : LIST_IDENTIFIERS_PAGE;
    // One more than a page: whether it comes back says whether a token is due, with no count query.
    const docs = await this.model
      .find(
        datestampFilter(request, request.after),
        withMetadata ? RECORD_PROJECTION : KEY_PROJECTION,
      )
      .sort(DATESTAMP_SORT)
      .limit(pageSize + 1)
      .lean<RecordDocument[]>()
      .maxTimeMS(this.maxTimeMs())
      .exec();
    if (docs.length === 0) return oaiEnvelope(head, errorsXml([noRecordsMatch()]));

    const page = docs.slice(0, pageSize);
    const last = page[page.length - 1];
    const token =
      docs.length > pageSize
        ? encodeResumptionToken({
            from: request.from,
            until: request.until,
            t: last.record_modified ?? '',
            i: last._id,
          })
        : request.resumed
          ? ''
          : undefined;
    const items = page
      .map((doc) =>
        withMetadata
          ? this.recordEntry(doc, origin)
          : headerXml(doc._id, doc.record_modified ?? ''),
      )
      .join('');
    return oaiEnvelope(
      head,
      `<${request.verb}>${items}${resumptionTokenXml(token)}</${request.verb}>`,
    );
  }

  private recordEntry(doc: RecordDocument, origin: string): string {
    return recordXml(doc._id, doc.record_modified ?? '', oaiDcElements(doc, origin));
  }

  /** A positive with a datestamp, or null: anything else is not in this repository. */
  private findHarvestable(
    pid: string,
    projection?: Readonly<Record<string, 0 | 1>>,
  ): Promise<RecordDocument | null> {
    return this.model
      .findOne({ ...datestampFilter({}), _id: pid } as FilterQuery<RecordDocument>, projection)
      .lean<RecordDocument>()
      .maxTimeMS(this.maxTimeMs())
      .exec();
  }

  private async earliestDatestamp(now: Date): Promise<string> {
    const cached = this.earliest.get('earliest');
    if (cached) return cached;
    const first = await this.model
      .findOne(datestampFilter({}), KEY_PROJECTION)
      .sort(DATESTAMP_SORT)
      .lean<{ record_modified: string }>()
      .maxTimeMS(this.maxTimeMs())
      .exec();
    // Nothing stamped yet: the response time is an honest lower bound, and is not cached.
    if (!first) return toDatestamp(now);
    this.earliest.set('earliest', first.record_modified);
    return first.record_modified;
  }

  private maxTimeMs(): number {
    return this.config.get('mongo.exportMaxTimeMs', { infer: true });
  }
}
