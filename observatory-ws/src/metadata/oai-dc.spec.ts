import { enrichedRecord, releaseExamples } from '../testing/release-examples';
import { oaiDcElements } from './oai-dc';
import { viewOf } from './record-view';

const ORIGIN = 'https://obs.test';

describe('oaiDcElements', () => {
  it.each(releaseExamples())('describes the $release example in simple Dublin Core', ({ doc }) => {
    const elements = oaiDcElements(doc, ORIGIN);
    const names = new Set(elements.map(([name]) => name));
    for (const required of ['title', 'identifier', 'type', 'rights'])
      expect(names).toContain(required);
    expect(elements).toContainEqual(['identifier', `${ORIGIN}/record/${doc._id}`]);
    for (const [, value] of elements) expect(value).toBe(value.trim());
  });

  it('states the licence split in rights and leaves the Europe PMC abstract out', () => {
    const doc = enrichedRecord();
    const elements = oaiDcElements(doc, ORIGIN);
    const rights = elements.filter(([name]) => name === 'rights').map(([, v]) => v);
    expect(rights).toEqual([
      expect.stringContaining('CC BY 4.0'),
      expect.stringContaining('Europe PMC terms of use'),
    ]);
    const abstractStart = (viewOf(doc).publication_metadata?.abstract ?? '').slice(20, 80);
    expect(JSON.stringify(elements)).not.toContain(abstractStart);
  });

  it('carries the verdict, the vocabulary labels and each linked output once', () => {
    const elements = oaiDcElements(enrichedRecord(), ORIGIN);
    const values = (name: string) => elements.filter(([n]) => n === name).map(([, v]) => v);
    expect(values('description')).toEqual([
      'DOME Observatory screening verdict: AI/ML methods paper.',
    ]);
    expect(values('subject')).toEqual(expect.arrayContaining(['Biology', 'supervised', 'OLS']));
    expect(values('relation')).toEqual([
      'https://doi.org/10.5281/zenodo.1',
      'https://bio.tools/mytool',
      'https://registry.dome-ml.org/review/abc123xyz',
    ]);
  });
});
