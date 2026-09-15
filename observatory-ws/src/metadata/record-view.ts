import { RecordDocument } from '../records/schemas/record.schema';
import {
  doiUrl,
  domeRegistryReviewUrl,
  europePmcArticleUrl,
  pmcUrl,
  pubmedUrl,
} from './metadata-urls';

type Text = string | null | undefined;
type Texts = readonly string[] | null | undefined;

export interface DataLinkResourceView {
  resource?: Text;
  label?: Text;
  category?: Text;
}

export interface DataLinkView {
  resource?: Text;
  id?: Text;
  url?: Text;
  title?: Text;
}

/**
 * The part of a stored record the metadata projections read, typed. `RecordDocument` is
 * deliberately loose (records.schema.ts), and every field here may be absent on an older document,
 * so every one is optional.
 */
export interface RecordView {
  _id: string;
  record_modified?: Text;
  identifiers?: {
    pmid?: Text;
    pmcid?: Text;
    doi?: Text;
    epmc_id?: Text;
    dome_registry?: Text;
  } | null;
  publication_metadata?: {
    title?: Text;
    abstract?: Text;
    authors?: Text;
    year?: number | null;
    journal?: Text;
    preprint_server?: Text;
  } | null;
  source?: {
    epmc_source?: Text;
    decision_provenance?: Text;
    access?: { open_access?: boolean | null; license?: Text } | null;
  } | null;
  content_filters?: {
    mesh_headings?: Texts;
    keywords_author?: Texts;
    domain_tier1?: Text;
    domain_tier2?: Texts;
    domain_tier3?: Texts;
    learning_paradigm?: Texts;
    model_family?: Texts;
    model_type?: Texts;
  } | null;
  data_links?: {
    truncated?: boolean | null;
    link_count?: number | null;
    resources?: readonly DataLinkResourceView[] | null;
    links?: readonly DataLinkView[] | null;
  } | null;
  llm_classification?: {
    classification?: Text;
    model_id?: Text;
    prompt_version?: Text;
    ruleset_sha256?: Text;
    batch_id?: Text;
    timestamp?: Text;
  } | null;
  llm_enrichment?: {
    provider?: Text;
    model_id?: Text;
    prompt_version?: Text;
    timestamp?: Text;
  } | null;
}

/**
 * Every document path the projections read, `[]` marking an array element. record-view.spec.ts
 * checks each one exists in the JSON Schema of the release schema/CURRENT names, so a field renamed
 * upstream fails a test instead of silently dropping out of the published metadata. Add a path
 * here whenever a projection starts reading one.
 */
export const PROJECTED_PATHS: readonly string[] = [
  '_id',
  'record_modified',
  'identifiers.pmid',
  'identifiers.pmcid',
  'identifiers.doi',
  'identifiers.epmc_id',
  'identifiers.dome_registry',
  'publication_metadata.title',
  'publication_metadata.abstract',
  'publication_metadata.authors',
  'publication_metadata.year',
  'publication_metadata.journal',
  'publication_metadata.preprint_server',
  'source.epmc_source',
  'source.decision_provenance',
  'source.access.open_access',
  'source.access.license',
  'content_filters.mesh_headings',
  'content_filters.keywords_author',
  'content_filters.domain_tier1',
  'content_filters.domain_tier2',
  'content_filters.domain_tier3',
  'content_filters.learning_paradigm',
  'content_filters.model_family',
  'content_filters.model_type',
  'data_links.truncated',
  'data_links.link_count',
  'data_links.resources[].resource',
  'data_links.resources[].label',
  'data_links.resources[].category',
  'data_links.links[].resource',
  'data_links.links[].id',
  'data_links.links[].url',
  'data_links.links[].title',
  'llm_classification.classification',
  'llm_classification.model_id',
  'llm_classification.prompt_version',
  'llm_classification.ruleset_sha256',
  'llm_classification.batch_id',
  'llm_classification.timestamp',
  'llm_enrichment.provider',
  'llm_enrichment.model_id',
  'llm_enrichment.prompt_version',
  'llm_enrichment.timestamp',
];

export function viewOf(doc: RecordDocument): RecordView {
  return doc;
}

/** The value trimmed, or undefined when there is nothing left. */
export function nonEmpty(value: Text): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Trimmed, non-empty and first-occurrence order. */
export function unique(values: readonly Text[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const v = nonEmpty(value);
    if (v) out.add(v);
  }
  return [...out];
}

/** Mirrors observatory-ui's `splitAuthors` (core/citation.ts): one comma-separated string,
 *  surname and initials, often with a trailing full stop. */
export function splitAuthors(authors: Text): string[] {
  if (!authors) return [];
  return unique(authors.replace(/\.\s*$/, '').split(','));
}

export type SubjectField =
  | 'domain_tier1'
  | 'domain_tier2'
  | 'domain_tier3'
  | 'learning_paradigm'
  | 'model_family'
  | 'model_type';

export interface Subject {
  field: SubjectField;
  label: string;
}

/** The enrichment's controlled-vocabulary labels, each with the field it came from. */
export function subjects(r: RecordView): Subject[] {
  const cf = r.content_filters ?? {};
  const out: Subject[] = [];
  const add = (field: SubjectField, values: readonly Text[]) => {
    for (const label of unique(values)) out.push({ field, label });
  };
  add('domain_tier1', [cf.domain_tier1]);
  add('domain_tier2', cf.domain_tier2 ?? []);
  add('domain_tier3', cf.domain_tier3 ?? []);
  add('learning_paradigm', cf.learning_paradigm ?? []);
  add('model_family', cf.model_family ?? []);
  add('model_type', cf.model_type ?? []);
  return out;
}

export const CLASSIFICATION_LABEL: Readonly<Record<string, string>> = {
  positive: 'AI/ML methods paper',
  negative: 'Not an AI/ML methods paper',
  undeterminable: 'Undeterminable from the available metadata',
};

/** The web addresses of the article itself, by where they lead. */
export interface ArticleUrls {
  doi?: string;
  pubmed?: string;
  pmc?: string;
  europePmc?: string;
}

export function articleUrls(r: RecordView): ArticleUrls {
  const ids = r.identifiers ?? {};
  const doi = nonEmpty(ids.doi);
  const pmid = nonEmpty(ids.pmid);
  const pmcid = nonEmpty(ids.pmcid);
  return {
    doi: doi ? doiUrl(doi) : undefined,
    pubmed: pmid ? pubmedUrl(pmid) : undefined,
    pmc: pmcid ? pmcUrl(pmcid) : undefined,
    europePmc: europePmcArticleUrl(pmid, nonEmpty(ids.epmc_id), nonEmpty(r.source?.epmc_source)),
  };
}

/** DOME Registry entry ids naming the paper: every `dome_registry` data link, plus
 *  `identifiers.dome_registry`, which holds the first of them. */
export function domeRegistryIds(r: RecordView): string[] {
  return unique([
    ...(r.data_links?.links ?? []).map((l) => (l.resource === 'dome_registry' ? l.id : undefined)),
    r.identifiers?.dome_registry,
  ]);
}

/** Every linked research output's URL, the DOME Registry entries excluded, then those entries'
 *  review pages. */
export function relatedUrls(r: RecordView): string[] {
  return unique([
    ...(r.data_links?.links ?? []).map((l) => (l.resource === 'dome_registry' ? undefined : l.url)),
    ...domeRegistryIds(r).map(domeRegistryReviewUrl),
  ]);
}
