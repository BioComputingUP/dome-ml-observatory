import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { RecordDocument } from '../records/schemas/record.schema';
import { fakeContentModel } from '../testing/content-model-fake';
import { xsdErrors } from '../testing/xml-schema';
import { SitemapService } from './sitemap.service';
import { sitemapIndexXml, STATIC_PAGES, urlsetXml } from './sitemap';

jest.mock('./sitemap', () => ({
  ...jest.requireActual<typeof import('./sitemap')>('./sitemap'),
  SITEMAP_CHUNK: 3,
}));

jest.setTimeout(30_000);

const config = {
  get: jest.fn((key: string) => (key === 'publicOrigin' ? 'https://obs.test' : 30_000)),
} as unknown as ConfigService<AppConfig, true>;

const uuid = (n: number) => `00000000-0000-5000-8000-${n.toString(16).padStart(12, '0')}`;

function doc(
  n: number,
  recordModified: string | undefined,
  classification = 'positive',
): RecordDocument {
  return {
    _id: uuid(n),
    ...(recordModified ? { record_modified: recordModified } : {}),
    llm_classification: { classification },
  };
}

// Four records share the migration's stamp -- the tie a keyset has to break on _id -- then three
// later ones; a negative and an unstamped positive must never appear.
const DOCS = [
  ...[1, 2, 3, 4].map((n) => doc(n, '2026-09-15T18:00:00Z')),
  ...[5, 6, 7].map((n) => doc(n, `2026-09-16T00:00:0${n}Z`)),
  doc(8, '2026-09-15T18:00:00Z', 'negative'),
  doc(9, undefined),
];

describe('SitemapService', () => {
  it('splits the stamped positives into chunks that together list each exactly once', async () => {
    const service = new SitemapService(fakeContentModel(DOCS).model, config);
    const chunks = await service.chunks();
    expect(chunks.map((c) => c.lastmod)).toEqual([
      '2026-09-15T18:00:00Z',
      '2026-09-16T00:00:06Z',
      '2026-09-16T00:00:07Z',
    ]);

    const urls = [];
    for (let n = 1; n <= chunks.length; n++) urls.push(...((await service.records(n)) ?? []));
    expect(urls.map((u) => u.loc)).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((n) => `https://obs.test/record/${uuid(n)}`),
    );
    expect(await service.records(4)).toBeUndefined();
  });

  it('walks the index once and serves later requests from the cache', async () => {
    const fake = fakeContentModel(DOCS);
    const service = new SitemapService(fake.model, config);
    await Promise.all([service.chunks(), service.chunks()]);
    await service.chunks();
    expect(fake.filters).toHaveLength(1);
  });

  it('writes sitemaps the sitemaps.org schemas accept', async () => {
    const service = new SitemapService(fakeContentModel(DOCS).model, config);
    expect(await xsdErrors(urlsetXml((await service.records(1)) ?? []), 'sitemap.xsd')).toEqual([]);
    expect(
      await xsdErrors(
        urlsetXml(STATIC_PAGES.map((p) => ({ loc: `https://obs.test${p}` }))),
        'sitemap.xsd',
      ),
    ).toEqual([]);
    expect(
      await xsdErrors(
        sitemapIndexXml([
          { loc: 'https://obs.test/sitemaps/pages.xml' },
          { loc: 'https://obs.test/sitemaps/records-1.xml', lastmod: '2026-09-15T18:00:00Z' },
        ]),
        'siteindex.xsd',
      ),
    ).toEqual([]);
  });
});
