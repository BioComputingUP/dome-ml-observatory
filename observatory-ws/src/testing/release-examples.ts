import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RecordView } from '../metadata/record-view';
import { RecordDocument } from '../records/schemas/record.schema';

/**
 * Fixtures read from the published schema releases in this repository, so the specs run against
 * real records of every shape the corpus has held rather than hand-written approximations.
 */

export const SCHEMA_DIR = resolve(__dirname, '..', '..', '..', 'schema');

export interface JsonSchemaNode {
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
}

const readJson = <T>(...parts: string[]): T =>
  JSON.parse(readFileSync(join(SCHEMA_DIR, ...parts), 'utf8')) as T;

export function currentRelease(): string {
  return readFileSync(join(SCHEMA_DIR, 'CURRENT'), 'utf8').trim();
}

/** One real record per published release, oldest first. */
export function releaseExamples(): Array<{ release: string; doc: RecordDocument }> {
  return readdirSync(join(SCHEMA_DIR, 'releases'))
    .sort()
    .map((release) => ({
      release,
      doc: readJson<RecordDocument>('releases', release, 'ai-ml-landscape.example.json'),
    }));
}

export function currentExample(): RecordDocument {
  return readJson<RecordDocument>('releases', currentRelease(), 'ai-ml-landscape.example.json');
}

export function currentSchema(): JsonSchemaNode {
  return readJson<JsonSchemaNode>('releases', currentRelease(), 'ai-ml-landscape.schema.json');
}

export const RATIONALE_MARKER = 'INTERNAL-RATIONALE-MUST-NOT-BE-PUBLISHED';

/**
 * The current example with every projected feature populated: enrichment with real vocabulary
 * labels (and one open-vocabulary model type), a licence, data links with a duplicate, a bio.tools
 * entry and a DOME Registry entry, a truncated list, and internal fields that must never leak.
 */
export function enrichedRecord(): RecordDocument {
  const base = currentExample();
  const view = base as unknown as RecordView;
  return {
    ...base,
    record_modified: '2026-09-15T18:30:00Z',
    source: {
      ...view.source,
      decision_provenance: 'llm',
      access: { ...view.source?.access, open_access: true, license: 'cc by-nc' },
    },
    content_filters: {
      ...view.content_filters,
      domain_tier1: 'Biology',
      domain_tier2: ['Agricultural science'],
      learning_paradigm: ['supervised', 'semi-supervised'],
      model_family: ['classical machine learning'],
      model_type: ['OLS', 'bespoke graph thing'],
    },
    llm_classification: {
      ...base.llm_classification,
      classification: 'positive',
      rationale: RATIONALE_MARKER,
    },
    llm_enrichment: {
      ...base.llm_enrichment,
      provider: 'deepseek',
      model_id: 'deepseek-v4-flash',
      prompt_version: 'e1',
      timestamp: '2026-09-10T10:00:00+00:00',
      rationale: RATIONALE_MARKER,
      input_tokens: 4321,
      parse_status: 'ok',
    },
    data_links: {
      ...view.data_links,
      truncated: true,
      link_count: 9,
      resources: [
        { resource: 'zenodo', label: 'Zenodo', category: 'Code & Data Repositories' },
        { resource: 'biotools', label: 'bio.tools', category: 'Software Registries' },
        { resource: 'dome_registry', label: 'DOME Registry', category: 'Transparency Reports' },
      ],
      links: [
        {
          resource: 'dome_registry',
          id: 'abc123xyz',
          url: 'https://registry.dome-ml.org/review/abc123xyz',
          title: null,
        },
        {
          resource: 'zenodo',
          id: '10.5281/zenodo.1',
          url: 'https://doi.org/10.5281/zenodo.1',
          title: 'Model code',
        },
        {
          resource: 'zenodo',
          id: '10.5281/zenodo.1',
          url: 'https://doi.org/10.5281/zenodo.1',
          title: 'Model code',
        },
        { resource: 'biotools', id: 'mytool', url: 'https://bio.tools/mytool', title: null },
      ],
    },
  } as RecordDocument;
}
