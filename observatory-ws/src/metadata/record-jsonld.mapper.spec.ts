import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as jsonld from 'jsonld';
import { currentReleaseDir } from '../common/schema-version';
import { RecordDocument } from '../records/schemas/record.schema';
import {
  currentSchema,
  enrichedRecord,
  JsonSchemaNode,
  RATIONALE_MARKER,
  releaseExamples,
} from '../testing/release-examples';
import { JsonNode, JsonValue } from './json-node';
import { CC_BY_4 } from './metadata-urls';
import { oaiDcElements } from './oai-dc';
import { MetadataContext, recordJsonLd } from './record-jsonld.mapper';
import { PROJECTED_PATHS } from './record-view';
import { VocabIndex } from './vocab-index';

const ORIGIN = 'https://obs.test';
const ctx: MetadataContext = {
  origin: ORIGIN,
  schemaVersion: 'v1.6.0',
  vocab: VocabIndex.load(currentReleaseDir()),
};

const SCHEMA_ORG_TERMS = new Set(
  JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'test-fixtures', 'schema-org-terms.json'), 'utf8'),
  ) as string[],
);

function graph(doc: RecordDocument): [JsonNode, JsonNode] {
  const [record, article] = recordJsonLd(doc, ctx)['@graph'] as JsonNode[];
  return [record, article];
}

function asNodes(value: JsonValue | undefined): JsonNode[] {
  return (Array.isArray(value) ? value : []).filter(
    (v): v is JsonNode => typeof v === 'object' && !Array.isArray(v),
  );
}

describe('recordJsonLd', () => {
  it.each(releaseExamples())(
    'projects the $release example into a record node about an article node',
    ({ doc }) => {
      const [record, article] = graph(doc);
      expect(record['@id']).toBe(`${ORIGIN}/record/${doc._id}`);
      expect(record['@type']).toBe('CreativeWork');
      expect(record.about).toEqual({ '@id': article['@id'] });
      expect(record.isPartOf).toEqual({ '@id': `${ORIGIN}/download/bulk#corpus` });
      expect(article['@type']).toBe('ScholarlyArticle');
      expect(article.name).not.toMatch(/<[a-z]/i);
    },
  );

  it('names the article in plain text when its title is stored with encoded emphasis', () => {
    const doc = enrichedRecord();
    doc.publication_metadata = {
      ...doc.publication_metadata,
      title:
        'Enteric viral infections promote systemic accelerated aging in &lt;i&gt;Drosophila&lt;/i&gt;.',
    };
    const [record, article] = graph(doc);
    const plain = 'Enteric viral infections promote systemic accelerated aging in Drosophila.';
    expect(article.name).toBe(plain);
    expect(article.headline).toBe(plain);
    expect(record.name).toBe(`DOME Observatory record: ${plain}`);
    expect(oaiDcElements(doc, ORIGIN)).toContainEqual(['title', plain]);
  });

  it('keeps the licences apart: CC BY 4.0 on the record, the article’s own on the article', () => {
    const [record, article] = graph(enrichedRecord());
    expect(record.license).toBe(CC_BY_4);
    expect(article.license).toBe('https://creativecommons.org/licenses/by-nc/');
    expect(JSON.stringify(article)).not.toContain(CC_BY_4);
  });

  it('publishes no internal processing field', () => {
    const text = JSON.stringify(recordJsonLd(enrichedRecord(), ctx));
    for (const leaked of [RATIONALE_MARKER, 'input_tokens', 'parse_status', '4321']) {
      expect(text).not.toContain(leaked);
    }
  });

  it('turns vocabulary labels into ontology IRIs, and leaves an open-vocabulary term a keyword', () => {
    const keywords = graph(enrichedRecord())[0].keywords as JsonValue[];
    const byName = new Map(asNodes(keywords).map((k) => [k.name, k]));

    expect(byName.get('AI/ML methods paper')).toMatchObject({ termCode: 'positive' });
    expect(byName.get('Biology')).toMatchObject({
      '@id': 'http://edamontology.org/topic_3070',
      termCode: 'topic_3070',
    });
    expect(byName.get('supervised')).toMatchObject({
      '@id': 'http://id.nlm.nih.gov/mesh/D000069553',
    });
    expect(byName.get('supervised')?.sameAs).toContain('https://w3id.org/aio/SupervisedLearning');
    // A project extension with no ontology term: named, placed in its vocabulary, no IRI.
    expect(byName.get('semi-supervised')?.['@id']).toBeUndefined();
    expect(byName.get('semi-supervised')?.inDefinedTermSet).toMatch(
      /vocab\/modelling-branch\.json$/,
    );
    // An alias in the model-type seed list resolves to its canonical term's ontology id.
    expect(byName.get('OLS')?.['@id']).toBe('https://w3id.org/aio/LinearRegression');
    expect(keywords).toContain('bespoke graph thing');
  });

  it('references linked outputs by type, once each, and the DOME Registry entry as a review', () => {
    const [record, article] = graph(enrichedRecord());
    const citations = asNodes(article.citation);
    expect(citations.map((c) => c['@id'])).toEqual([
      'https://doi.org/10.5281/zenodo.1',
      'https://bio.tools/mytool',
    ]);
    expect(citations[0].additionalType).toBe('https://schema.org/Dataset');
    expect(citations[1].additionalType).toBe('https://schema.org/SoftwareApplication');
    expect(asNodes(article.subjectOf)).toEqual([
      expect.objectContaining({
        '@type': 'Review',
        '@id': 'https://registry.dome-ml.org/review/abc123xyz',
        itemReviewed: { '@id': article['@id'] },
      }),
    ]);
    expect(record.description).toContain('listed in part: 4 of 9');
  });

  it('records the provenance of the screening and of the enrichment', () => {
    const activities = asNodes(graph(enrichedRecord())[0]['prov:wasGeneratedBy']);
    expect(activities.map((a) => a.name)).toEqual([
      'AI/ML methods-paper screening',
      'Controlled-vocabulary enrichment',
    ]);
    expect(activities[1]['prov:wasAssociatedWith']).toEqual({
      '@type': 'SoftwareApplication',
      name: 'deepseek-v4-flash',
    });
  });

  it('is valid JSON-LD whose every property and type is a real schema.org, DCMI or PROV term', async () => {
    for (const doc of [enrichedRecord(), ...releaseExamples().map((e) => e.doc)]) {
      const expanded = await jsonld.expand(recordJsonLd(doc, ctx));
      const predicates = new Set<string>();
      const types = new Set<string>();
      collect(expanded, predicates, types);
      expect(predicates.size).toBeGreaterThan(10);
      for (const iri of [...predicates, ...types]) expect(knownTerm(iri)).toBe(true);
    }
  });
});

describe('the fields the projections read', () => {
  it('all exist in the JSON Schema of the release schema/CURRENT names', () => {
    const published = schemaPaths(currentSchema());
    expect(PROJECTED_PATHS.filter((p) => !published.has(p))).toEqual([]);
  });

  it('are the only fields they read', () => {
    const doc = enrichedRecord();
    const trimmed = pick(doc, PROJECTED_PATHS) as RecordDocument;
    expect(recordJsonLd(trimmed, ctx)).toEqual(recordJsonLd(doc, ctx));
    expect(oaiDcElements(trimmed, ORIGIN)).toEqual(oaiDcElements(doc, ORIGIN));
  });
});

const NAMESPACES: Record<string, (local: string) => boolean> = {
  'https://schema.org/': (local) => SCHEMA_ORG_TERMS.has(local),
  'http://purl.org/dc/terms/': (local) => local === 'conformsTo',
  'http://www.w3.org/ns/prov#': (local) =>
    ['Activity', 'wasGeneratedBy', 'wasAssociatedWith', 'used', 'endedAtTime'].includes(local),
};

function knownTerm(iri: string): boolean {
  const ns = Object.keys(NAMESPACES).find((n) => iri.startsWith(n));
  return ns !== undefined && NAMESPACES[ns](iri.slice(ns.length));
}

function collect(node: unknown, predicates: Set<string>, types: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, predicates, types);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '@type') {
      for (const t of [value].flat()) if (typeof t === 'string') types.add(t);
    } else if (!key.startsWith('@')) {
      predicates.add(key);
      collect(value, predicates, types);
    }
  }
}

/** Every property path a JSON Schema declares, `[]` marking an array element. */
function schemaPaths(schema: JsonSchemaNode, prefix = ''): Set<string> {
  const out = new Set<string>();
  for (const [key, sub] of Object.entries(schema.properties ?? {})) {
    out.add(prefix + key);
    for (const p of schemaPaths(sub, `${prefix}${key}.`)) out.add(p);
    if (sub.items) for (const p of schemaPaths(sub.items, `${prefix}${key}[].`)) out.add(p);
  }
  return out;
}

/** A copy of `source` holding only the given paths. */
function pick(source: unknown, paths: readonly string[]): unknown {
  if (typeof source !== 'object' || source === null) return source;
  const record = source as Record<string, unknown>;
  const byHead = new Map<string, string[]>();
  for (const path of paths) {
    const dot = path.indexOf('.');
    const head = dot === -1 ? path : path.slice(0, dot);
    const rest = byHead.get(head) ?? [];
    if (dot !== -1) rest.push(path.slice(dot + 1));
    byHead.set(head, rest);
  }
  const out: Record<string, unknown> = {};
  for (const [head, rest] of byHead) {
    const isArray = head.endsWith('[]');
    const key = isArray ? head.slice(0, -2) : head;
    if (!(key in record)) continue;
    const value = record[key];
    if (isArray) out[key] = Array.isArray(value) ? value.map((el) => pick(el, rest)) : value;
    else out[key] = rest.length ? pick(value, rest) : value;
  }
  return out;
}
