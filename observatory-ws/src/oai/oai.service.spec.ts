import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { RecordDocument } from '../records/schemas/record.schema';
import { fakeContentModel } from '../testing/content-model-fake';
import { currentExample } from '../testing/release-examples';
import { xsdErrors } from '../testing/xml-schema';
import { LIST_IDENTIFIERS_PAGE, LIST_RECORDS_PAGE, OaiService } from './oai.service';

jest.setTimeout(60_000);

const config = {
  get: jest.fn((key: string) => (key === 'publicOrigin' ? 'https://obs.test' : 30_000)),
} as unknown as ConfigService<AppConfig, true>;

const NOW = new Date('2026-09-20T12:00:00Z');
const MIGRATION = '2026-09-15T18:30:00Z';
const uuid = (n: number) => `00000000-0000-5000-8000-${n.toString(16).padStart(12, '0')}`;
const oaiId = (n: number) => `oai:observatory.dome-ml.org:${uuid(n)}`;

function doc(
  n: number,
  recordModified: string | undefined,
  classification = 'positive',
): RecordDocument {
  const base = currentExample();
  const { record_modified: _dropped, ...rest } = base;
  void _dropped;
  return {
    ...rest,
    _id: uuid(n),
    ...(recordModified ? { record_modified: recordModified } : {}),
    llm_classification: { ...base.llm_classification, classification },
  };
}

// 250 positives share the migration's stamp -- more than a ListRecords page, so a page boundary
// falls inside the tie -- then 200 changed later, one a second. Plus records that must never be
// harvested: a negative and a positive without a datestamp.
const LATER = (i: number) =>
  new Date(Date.parse('2026-09-16T00:00:00Z') + i * 1000).toISOString().slice(0, 19) + 'Z';
const DOCS = [
  ...Array.from({ length: 250 }, (_, i) => doc(i + 1, MIGRATION)),
  ...Array.from({ length: 200 }, (_, i) => doc(251 + i, LATER(i))),
  doc(451, MIGRATION, 'negative'),
  doc(452, undefined),
];
const HARVESTABLE = 450;

const service = () => new OaiService(fakeContentModel(DOCS).model, config);

const identifiers = (xml: string) =>
  [...xml.matchAll(/<header><identifier>([^<]+)<\/identifier>/g)].map((m) => m[1]);
const tokenOf = (xml: string) => /<resumptionToken>([^<]+)<\/resumptionToken>/.exec(xml)?.[1];
const errorCode = (xml: string) => /<error code="([^"]+)"/.exec(xml)?.[1];

async function harvest(first: Record<string, string>): Promise<string[]> {
  const oai = service();
  const pages: string[] = [];
  let args: Record<string, string> = first;
  for (let i = 0; i < 50; i++) {
    const xml = await oai.respond(args, NOW);
    pages.push(xml);
    const token = tokenOf(xml);
    if (!token) break;
    args = { verb: first.verb, resumptionToken: token };
  }
  return pages;
}

describe('OaiService', () => {
  it('harvests every stamped positive exactly once across ListRecords pages, ties included', async () => {
    const pages = await harvest({ verb: 'ListRecords', metadataPrefix: 'oai_dc' });
    expect(pages.map((p) => identifiers(p).length)).toEqual([
      LIST_RECORDS_PAGE,
      LIST_RECORDS_PAGE,
      50,
    ]);
    const ids = pages.flatMap(identifiers);
    expect(new Set(ids).size).toBe(HARVESTABLE);
    expect(ids).not.toContain(oaiId(451));
    expect(ids).not.toContain(oaiId(452));
    // The last page of a continued list carries an empty token; a complete single list none.
    expect(pages[2]).toContain('<resumptionToken/>');
    expect(pages[0]).toContain('<dc:title>');
  });

  it('lists identifiers in one page when they fit, with no token at all', async () => {
    expect(HARVESTABLE).toBeLessThan(LIST_IDENTIFIERS_PAGE);
    const [page] = await harvest({ verb: 'ListIdentifiers', metadataPrefix: 'oai_dc' });
    expect(identifiers(page)).toHaveLength(HARVESTABLE);
    expect(page).not.toContain('resumptionToken');
  });

  it('harvests incrementally with from/until and says when nothing matches', async () => {
    const [changed] = await harvest({
      verb: 'ListIdentifiers',
      metadataPrefix: 'oai_dc',
      from: '2026-09-16',
    });
    expect(identifiers(changed)).toHaveLength(200);
    const [window] = await harvest({
      verb: 'ListIdentifiers',
      metadataPrefix: 'oai_dc',
      from: '2026-09-16T00:00:10Z',
      until: '2026-09-16T00:00:19Z',
    });
    expect(identifiers(window)).toHaveLength(10);
    const [none] = await harvest({
      verb: 'ListIdentifiers',
      metadataPrefix: 'oai_dc',
      until: '2026-09-14',
    });
    expect(errorCode(none)).toBe('noRecordsMatch');
  });

  it('serves GetRecord only for harvestable records', async () => {
    const oai = service();
    const ok = await oai.respond(
      { verb: 'GetRecord', metadataPrefix: 'oai_dc', identifier: oaiId(3) },
      NOW,
    );
    expect(identifiers(ok)).toEqual([oaiId(3)]);
    expect(ok).toContain(`<datestamp>${MIGRATION}</datestamp>`);
    for (const n of [451, 452]) {
      const xml = await oai.respond(
        { verb: 'GetRecord', metadataPrefix: 'oai_dc', identifier: oaiId(n) },
        NOW,
      );
      expect(errorCode(xml)).toBe('idDoesNotExist');
    }
    const formats = await oai.respond({ verb: 'ListMetadataFormats', identifier: oaiId(451) }, NOW);
    expect(errorCode(formats)).toBe('idDoesNotExist');
  });

  it('identifies itself with the earliest datestamp in the repository', async () => {
    const xml = await service().respond({ verb: 'Identify' }, NOW);
    expect(xml).toContain(`<earliestDatestamp>${MIGRATION}</earliestDatestamp>`);
    expect(xml).toContain('<baseURL>https://obs.test/api/oai</baseURL>');
    expect(xml).toContain('<responseDate>2026-09-20T12:00:00Z</responseDate>');
  });

  it('answers a bad verb with a bare request element', async () => {
    const xml = await service().respond({ verb: 'Harvest' }, NOW);
    expect(errorCode(xml)).toBe('badVerb');
    expect(xml).toContain('<request>https://obs.test/api/oai</request>');
  });

  it('writes responses the OAI-PMH, oai_dc and oai-identifier schemas accept', async () => {
    const oai = service();
    const [first, , last] = await harvest({ verb: 'ListRecords', metadataPrefix: 'oai_dc' });
    const responses = [
      first,
      last,
      await oai.respond({ verb: 'Identify' }, NOW),
      await oai.respond({ verb: 'ListMetadataFormats' }, NOW),
      await oai.respond(
        { verb: 'GetRecord', metadataPrefix: 'oai_dc', identifier: oaiId(260) },
        NOW,
      ),
      await oai.respond(
        { verb: 'ListIdentifiers', metadataPrefix: 'oai_dc', from: '2026-09-16' },
        NOW,
      ),
      await oai.respond({ verb: 'Harvest' }, NOW),
      await oai.respond({ verb: 'ListRecords', metadataPrefix: 'marc21' }, NOW),
      await oai.respond({ verb: 'ListSets' }, NOW),
      await oai.respond(
        { verb: 'ListIdentifiers', metadataPrefix: 'oai_dc', until: '2026-09-14' },
        NOW,
      ),
    ];
    for (const xml of responses) expect(await xsdErrors(xml, 'oai-pmh-all.xsd')).toEqual([]);
  });
});
