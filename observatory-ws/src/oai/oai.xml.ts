import { DcElement } from '../metadata/oai-dc';
import { oaiIdentifier } from '../metadata/metadata-urls';
import { escapeXml } from '../metadata/xml';
import { METADATA_PREFIX, OaiError } from './oai.query';

/** OAI-PMH 2.0 response serialisation. String building over escaped values: the documents are small
 *  and fixed in shape, and the Jest specs validate every one against the protocol's XSDs. */

const OAI_NS = 'http://www.openarchives.org/OAI/2.0/';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
const OAI_DC_NS = 'http://www.openarchives.org/OAI/2.0/oai_dc/';
const OAI_DC_SCHEMA = 'http://www.openarchives.org/OAI/2.0/oai_dc.xsd';
const DC_NS = 'http://purl.org/dc/elements/1.1/';
const OAI_ID_NS = 'http://www.openarchives.org/OAI/2.0/oai-identifier';

export interface OaiHead {
  responseDate: string;
  baseUrl: string;
  echo?: Readonly<Record<string, string>>;
}

export interface IdentifyFacts {
  repositoryName: string;
  baseUrl: string;
  adminEmail: string;
  earliestDatestamp: string;
  repositoryIdentifier: string;
  sampleIdentifier: string;
}

export function oaiEnvelope(head: OaiHead, body: string): string {
  const attributes = Object.entries(head.echo ?? {})
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<OAI-PMH xmlns="${OAI_NS}" xmlns:xsi="${XSI_NS}" xsi:schemaLocation="${OAI_NS} ${OAI_NS}OAI-PMH.xsd">` +
    `<responseDate>${head.responseDate}</responseDate>` +
    `<request${attributes}>${escapeXml(head.baseUrl)}</request>` +
    `${body}</OAI-PMH>\n`
  );
}

export function errorsXml(errors: readonly OaiError[]): string {
  return errors.map((e) => `<error code="${e.code}">${escapeXml(e.message)}</error>`).join('');
}

export function identifyXml(facts: IdentifyFacts): string {
  return (
    '<Identify>' +
    `<repositoryName>${escapeXml(facts.repositoryName)}</repositoryName>` +
    `<baseURL>${escapeXml(facts.baseUrl)}</baseURL>` +
    '<protocolVersion>2.0</protocolVersion>' +
    `<adminEmail>${escapeXml(facts.adminEmail)}</adminEmail>` +
    `<earliestDatestamp>${facts.earliestDatestamp}</earliestDatestamp>` +
    // A record reclassified out of the positives leaves the repository without a tombstone.
    '<deletedRecord>transient</deletedRecord>' +
    '<granularity>YYYY-MM-DDThh:mm:ssZ</granularity>' +
    '<description>' +
    `<oai-identifier xmlns="${OAI_ID_NS}" xsi:schemaLocation="${OAI_ID_NS} ${OAI_ID_NS}.xsd">` +
    '<scheme>oai</scheme>' +
    `<repositoryIdentifier>${escapeXml(facts.repositoryIdentifier)}</repositoryIdentifier>` +
    '<delimiter>:</delimiter>' +
    `<sampleIdentifier>${escapeXml(facts.sampleIdentifier)}</sampleIdentifier>` +
    '</oai-identifier>' +
    '</description>' +
    '</Identify>'
  );
}

export function metadataFormatsXml(): string {
  return (
    '<ListMetadataFormats><metadataFormat>' +
    `<metadataPrefix>${METADATA_PREFIX}</metadataPrefix>` +
    `<schema>${OAI_DC_SCHEMA}</schema>` +
    `<metadataNamespace>${OAI_DC_NS}</metadataNamespace>` +
    '</metadataFormat></ListMetadataFormats>'
  );
}

export function headerXml(pid: string, datestamp: string): string {
  return (
    '<header>' +
    `<identifier>${escapeXml(oaiIdentifier(pid))}</identifier>` +
    `<datestamp>${escapeXml(datestamp)}</datestamp>` +
    '</header>'
  );
}

export function recordXml(
  pid: string,
  datestamp: string,
  elements: ReadonlyArray<readonly [DcElement, string]>,
): string {
  const dc = elements
    .map(([name, value]) => `<dc:${name}>${escapeXml(value)}</dc:${name}>`)
    .join('');
  return (
    `<record>${headerXml(pid, datestamp)}<metadata>` +
    `<oai_dc:dc xmlns:oai_dc="${OAI_DC_NS}" xmlns:dc="${DC_NS}" xmlns:xsi="${XSI_NS}" ` +
    `xsi:schemaLocation="${OAI_DC_NS} ${OAI_DC_SCHEMA}">${dc}</oai_dc:dc>` +
    '</metadata></record>'
  );
}

/** Nothing when the list is complete in one response; an empty element on the last page of a
 *  list that was continued, as the protocol requires; otherwise the token. */
export function resumptionTokenXml(token: string | undefined): string {
  if (token === undefined) return '';
  return token ? `<resumptionToken>${escapeXml(token)}</resumptionToken>` : '<resumptionToken/>';
}
