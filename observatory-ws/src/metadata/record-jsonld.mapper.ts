import { RecordDocument } from '../records/schemas/record.schema';
import { compact, JsonNode, JsonValue } from './json-node';
import { articleLicence } from './licence';
import {
  BIOSCHEMAS_SCHOLARLY_ARTICLE,
  CC_BY_4,
  corpusSeriesId,
  CURATION_CRITERIA_URL,
  curationCriteriaUrl,
  DOME_REGISTRY_URL,
  domeRegistryReviewUrl,
  recordUrl,
  schemaReleaseUrl,
  vocabFileUrl,
} from './metadata-urls';
import { plainText } from './plain-text';
import {
  articleUrls,
  CLASSIFICATION_LABEL,
  DataLinkResourceView,
  domeRegistryIds,
  nonEmpty,
  RecordView,
  splitAuthors,
  SubjectField,
  subjects,
  unique,
  viewOf,
} from './record-view';
import { VocabIndex } from './vocab-index';

export interface MetadataContext {
  /** The public origin record URLs are built on, e.g. https://observatory.dome-ml.org. */
  origin: string;
  /** The published schema release the record is described against. */
  schemaVersion: string;
  vocab: VocabIndex;
}

/**
 * schema.org as the default vocabulary, so every plain term is a schema.org term, plus the two
 * prefixes the projection needs beyond it. An inline context rather than the remote
 * "https://schema.org" one: a consumer expands it without fetching anything.
 */
export const JSONLD_CONTEXT: JsonNode = {
  '@vocab': 'https://schema.org/',
  dct: 'http://purl.org/dc/terms/',
  prov: 'http://www.w3.org/ns/prov#',
};

const VOCAB_FILE: Record<SubjectField, string> = {
  domain_tier1: 'domain.json',
  domain_tier2: 'domain.json',
  domain_tier3: 'domain.json',
  learning_paradigm: 'modelling-branch.json',
  model_family: 'modelling-branch.json',
  model_type: 'model-type-seed.json',
};

const PROVENANCE: Readonly<Record<string, string>> = {
  llm: 'Classified by a language model against the published curation criteria.',
  human_curated: 'Classified by human curators against the published curation criteria.',
  registry_confirmed: 'Confirmed as an AI/ML methods paper by its DOME Registry entry.',
};

/**
 * A stored record as schema.org JSON-LD: one `@graph` holding two nodes that are kept apart on
 * purpose, because their licences differ.
 *
 * - **The Observatory record** (`CreativeWork`, `@id` = its page) is this project's contribution --
 *   the screening verdict, the vocabulary terms as ontology IRIs, the provenance -- under CC BY 4.0.
 * - **The article** (`ScholarlyArticle`, `@id` = its DOI) is described from Europe PMC's metadata
 *   and carries the article's own licence, if Europe PMC reports one. Merging the two would put
 *   CC BY 4.0 on an abstract the project does not own.
 *
 * Internal processing fields (token counts, parse status, the model's rationale) are never emitted.
 */
export function recordJsonLd(doc: RecordDocument, ctx: MetadataContext): JsonNode {
  const r = viewOf(doc);
  const page = recordUrl(ctx.origin, r._id);
  const article = articleNode(r, page);

  const record = compact({
    '@id': page,
    '@type': 'CreativeWork',
    name: article.title
      ? `DOME Observatory record: ${article.title}`
      : `DOME Observatory record ${r._id}`,
    description: recordDescription(r),
    url: page,
    identifier: r._id,
    about: { '@id': article.id },
    keywords: keywords(r, ctx),
    license: CC_BY_4,
    isPartOf: { '@id': corpusSeriesId(ctx.origin) },
    'dct:conformsTo': { '@id': schemaReleaseUrl(ctx.schemaVersion) },
    dateModified: nonEmpty(r.record_modified),
    'prov:wasGeneratedBy': activities(r, ctx),
  });

  return { '@context': JSONLD_CONTEXT, '@graph': [record, article.node] };
}

function recordDescription(r: RecordView): string {
  const parts = [
    'The DOME Observatory annotation of this article: its AI/ML screening verdict, ' +
      'controlled-vocabulary enrichment and linked research outputs.',
  ];
  const dl = r.data_links;
  if (dl?.truncated && typeof dl.link_count === 'number') {
    parts.push(
      `Linked outputs are listed in part: ${(dl.links ?? []).length} of ${dl.link_count}.`,
    );
  }
  return parts.join(' ');
}

function keywords(r: RecordView, ctx: MetadataContext): JsonValue[] {
  const out: JsonValue[] = [];
  const classification = nonEmpty(r.llm_classification?.classification);
  if (classification) {
    out.push(
      compact({
        '@type': 'DefinedTerm',
        name: CLASSIFICATION_LABEL[classification] ?? classification,
        termCode: classification,
        inDefinedTermSet: CURATION_CRITERIA_URL,
      }),
    );
  }
  for (const subject of subjects(r)) {
    const term = ctx.vocab.lookup(subject.field, subject.label);
    // model_type is an open vocabulary: a label outside the seed list is a plain keyword.
    if (!term && subject.field === 'model_type') {
      out.push(subject.label);
      continue;
    }
    out.push(
      compact({
        '@type': 'DefinedTerm',
        '@id': term?.iri,
        name: subject.label,
        termCode: term?.code,
        sameAs: term?.exactMatches,
        inDefinedTermSet: vocabFileUrl(ctx.schemaVersion, VOCAB_FILE[subject.field]),
      }),
    );
  }
  return out;
}

function agent(modelId: string | null | undefined): JsonNode | undefined {
  const name = nonEmpty(modelId);
  return name ? { '@type': 'SoftwareApplication', name } : undefined;
}

function activities(r: RecordView, ctx: MetadataContext): JsonValue[] {
  const out: JsonValue[] = [];
  const c = r.llm_classification;
  if (nonEmpty(c?.classification)) {
    const provenance = nonEmpty(r.source?.decision_provenance);
    const ruleset = nonEmpty(c?.ruleset_sha256);
    out.push(
      compact({
        '@type': 'prov:Activity',
        name: 'AI/ML methods-paper screening',
        description: provenance ? PROVENANCE[provenance] : undefined,
        identifier: nonEmpty(c?.batch_id),
        'prov:endedAtTime': nonEmpty(c?.timestamp),
        'prov:wasAssociatedWith': agent(c?.model_id),
        'prov:used': compact({
          '@type': 'CreativeWork',
          name: 'DOME Observatory curation criteria',
          url: curationCriteriaUrl(ruleset),
          version: nonEmpty(c?.prompt_version),
          identifier: ruleset ? `sha256:${ruleset}` : undefined,
        }),
      }),
    );
  }
  const e = r.llm_enrichment;
  if (nonEmpty(e?.provider)) {
    out.push(
      compact({
        '@type': 'prov:Activity',
        name: 'Controlled-vocabulary enrichment',
        'prov:endedAtTime': nonEmpty(e?.timestamp),
        'prov:wasAssociatedWith': agent(e?.model_id),
        'prov:used': compact({
          '@type': 'CreativeWork',
          name: 'DOME Observatory controlled vocabularies',
          url: schemaReleaseUrl(ctx.schemaVersion),
          version: nonEmpty(e?.prompt_version),
        }),
      }),
    );
  }
  return out;
}

function articleNode(
  r: RecordView,
  page: string,
): { node: JsonNode; id: string; title: string | undefined } {
  const pm = r.publication_metadata ?? {};
  const ids = r.identifiers ?? {};
  const urls = articleUrls(r);
  const id = urls.doi ?? urls.europePmc ?? `${page}#article`;
  const title = plainText(pm.title) || undefined;
  const journal = nonEmpty(pm.journal);
  const server = nonEmpty(pm.preprint_server);
  const licence = articleLicence(r.source?.access?.license);
  const openAccess = r.source?.access?.open_access;

  const identifier: JsonNode[] = [];
  for (const [propertyID, value] of [
    ['doi', ids.doi],
    ['pmid', ids.pmid],
    ['pmcid', ids.pmcid],
  ] as const) {
    const v = nonEmpty(value);
    if (v) identifier.push({ '@type': 'PropertyValue', propertyID, value: v });
  }

  const node = compact({
    '@id': id,
    '@type': 'ScholarlyArticle',
    'dct:conformsTo': { '@id': BIOSCHEMAS_SCHOLARLY_ARTICLE },
    name: title,
    // Search engines truncate a headline past 110 characters; a shortened one would misquote it.
    headline: title && title.length <= 110 ? title : undefined,
    abstract: plainText(pm.abstract) || undefined,
    author: splitAuthors(pm.authors).map((name) => ({ '@type': 'Person', name })),
    datePublished: typeof pm.year === 'number' ? String(pm.year) : undefined,
    isPartOf: journal ? { '@type': 'Periodical', name: journal } : undefined,
    publisher: !journal && server ? { '@type': 'Organization', name: server } : undefined,
    identifier,
    url: urls.doi ?? urls.europePmc,
    sameAs: unique([urls.europePmc, urls.pubmed, urls.pmc]).filter((u) => u !== id),
    keywords: unique([
      ...(r.content_filters?.mesh_headings ?? []),
      ...(r.content_filters?.keywords_author ?? []),
    ]),
    isAccessibleForFree: typeof openAccess === 'boolean' ? openAccess : undefined,
    license: licence ? (licence.url ?? { '@type': 'CreativeWork', name: licence.name }) : undefined,
    citation: linkedOutputs(r),
    subjectOf: domeRegistryIds(r).map((entry) => {
      const url = domeRegistryReviewUrl(entry);
      return {
        '@id': url,
        '@type': 'Review',
        name: 'DOME Registry entry',
        identifier: entry,
        url,
        itemReviewed: { '@id': id },
        publisher: { '@type': 'Organization', name: 'DOME Registry', url: DOME_REGISTRY_URL },
      };
    }),
  });
  return { node, id, title };
}

/**
 * The paper's data links as typed references. Each target is a `CreativeWork` with the kind of
 * output as `additionalType`, not a top-level `Dataset`: a record page is not the landing page of
 * the datasets it links to, and typing hundreds of thousands of pages' links as datasets would
 * present them to dataset search engines as if it were. The DOME Registry entries are `subjectOf`
 * reviews instead (articleNode).
 */
function linkedOutputs(r: RecordView): JsonNode[] {
  const resources = new Map<string, DataLinkResourceView>();
  for (const resource of r.data_links?.resources ?? []) {
    const key = nonEmpty(resource.resource);
    if (key) resources.set(key, resource);
  }
  const seen = new Set<string>();
  const out: JsonNode[] = [];
  for (const link of r.data_links?.links ?? []) {
    const resource = nonEmpty(link.resource);
    const identifier = nonEmpty(link.id);
    const url = nonEmpty(link.url);
    if (resource === 'dome_registry' || (!identifier && !url)) continue;
    const key = url ?? `${resource}:${identifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const described = resource ? resources.get(resource) : undefined;
    const provider = nonEmpty(described?.label);
    out.push(
      compact({
        '@id': url,
        '@type': 'CreativeWork',
        additionalType:
          described?.category === 'Software Registries'
            ? 'https://schema.org/SoftwareApplication'
            : 'https://schema.org/Dataset',
        name: nonEmpty(link.title) ?? identifier,
        identifier,
        url,
        provider: provider ? { '@type': 'Organization', name: provider } : undefined,
      }),
    );
  }
  return out;
}
