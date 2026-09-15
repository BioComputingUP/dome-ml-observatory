import { RecordDocument } from '../records/schemas/record.schema';
import { CC_BY_4, EUROPE_PMC_TERMS_URL, recordUrl } from './metadata-urls';
import { plainText } from './plain-text';
import {
  articleUrls,
  CLASSIFICATION_LABEL,
  nonEmpty,
  relatedUrls,
  splitAuthors,
  subjects,
  unique,
  viewOf,
} from './record-view';

/** The simple Dublin Core elements the projection uses. */
export type DcElement =
  | 'title'
  | 'creator'
  | 'subject'
  | 'description'
  | 'date'
  | 'type'
  | 'identifier'
  | 'source'
  | 'relation'
  | 'rights';

/**
 * A stored record as simple Dublin Core, the `oai_dc` format OAI-PMH requires.
 *
 * Fifteen flat elements cannot keep the record and the article apart the way the JSON-LD does, so
 * `rights` states the split in words, and the abstract is left out: it is Europe PMC's, and a
 * harvester can take it from there. What the Observatory adds -- the verdict, the vocabulary terms,
 * the linked outputs -- goes into `description`, `subject` and `relation`.
 */
export function oaiDcElements(doc: RecordDocument, origin: string): Array<[DcElement, string]> {
  const r = viewOf(doc);
  const out: Array<[DcElement, string]> = [];
  const add = (element: DcElement, value: string | undefined): void => {
    const v = value?.trim();
    if (v) out.push([element, v]);
  };
  const pm = r.publication_metadata ?? {};

  add('title', plainText(pm.title));
  for (const author of splitAuthors(pm.authors)) add('creator', author);
  for (const subject of unique([
    ...(r.content_filters?.mesh_headings ?? []),
    ...subjects(r).map((s) => s.label),
  ])) {
    add('subject', subject);
  }
  const classification = nonEmpty(r.llm_classification?.classification);
  if (classification) {
    add(
      'description',
      `DOME Observatory screening verdict: ${CLASSIFICATION_LABEL[classification] ?? classification}.`,
    );
  }
  if (typeof pm.year === 'number') add('date', String(pm.year));
  add('type', 'Text');

  const urls = articleUrls(r);
  for (const identifier of unique([
    recordUrl(origin, r._id),
    urls.doi,
    urls.pubmed,
    urls.pmc,
    urls.europePmc,
  ])) {
    add('identifier', identifier);
  }
  add('source', nonEmpty(pm.journal) ?? nonEmpty(pm.preprint_server));
  for (const url of relatedUrls(r)) add('relation', url);

  add(
    'rights',
    `DOME Observatory annotation (screening verdict, vocabulary terms, linked outputs): CC BY 4.0, ${CC_BY_4}`,
  );
  add('rights', `Bibliographic metadata: Europe PMC terms of use, ${EUROPE_PMC_TERMS_URL}`);
  return out;
}
