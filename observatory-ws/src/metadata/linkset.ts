import { RecordDocument } from '../records/schemas/record.schema';
import { JsonNode } from './json-node';
import {
  CC_BY_4,
  corpusUrl,
  oaiBaseUrl,
  oaiIdentifier,
  recordJsonLdUrl,
  recordUrl,
} from './metadata-urls';
import { nonEmpty, viewOf } from './record-view';

/**
 * FAIR Signposting for a record page, as an RFC 9264 linkset (`application/linkset+json`). The same
 * relations travel as `Link` headers on `/record/<pid>` (observatory-ui/nginx.conf); this is the
 * form a client fetches when it wants them all at once.
 *
 * `cite-as` is the record page: the persistent address of the Observatory's record. The article's
 * DOI is not the record's identifier, and is in the JSON-LD the `describedby` link points to.
 */
export function recordLinkset(doc: RecordDocument, origin: string): JsonNode {
  const r = viewOf(doc);
  const page = recordUrl(origin, r._id);
  const jsonld = recordJsonLdUrl(origin, r._id);

  const describedby: JsonNode[] = [{ href: jsonld, type: 'application/ld+json' }];
  // Only positives are harvestable, and only once stamped with a datestamp.
  if (r.llm_classification?.classification === 'positive' && nonEmpty(r.record_modified)) {
    const identifier = encodeURIComponent(oaiIdentifier(r._id));
    describedby.push({
      href: `${oaiBaseUrl(origin)}?verb=GetRecord&metadataPrefix=oai_dc&identifier=${identifier}`,
      type: 'text/xml',
    });
  }

  return {
    linkset: [
      {
        anchor: page,
        'cite-as': [{ href: page }],
        describedby,
        type: [
          { href: 'https://schema.org/AboutPage' },
          { href: 'https://schema.org/CreativeWork' },
        ],
        license: [{ href: CC_BY_4 }],
        collection: [{ href: corpusUrl(origin), type: 'text/html' }],
      },
      { anchor: jsonld, describes: [{ href: page }] },
    ],
  };
}
