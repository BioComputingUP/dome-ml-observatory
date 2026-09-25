/**
 * Every public URL and fixed IRI the metadata projections emit, in one place.
 *
 * The corpus identifiers are shared with the write side: dome-ml-observatory-triage's
 * `build_release_metadata.py` writes the same `corpusSeriesId` into
 * `metadata/releases/<YYYY-MM>/dataset.jsonld`, which `/api/catalog` serves. A record's `isPartOf`
 * has to name the node the catalogue describes, so change the two together or not at all.
 */

export const REPOSITORY = 'https://github.com/BioComputingUP/dome-ml-observatory';
export const TRIAGE_REPOSITORY = 'https://github.com/BioComputingUP/dome-ml-observatory-triage';

export const CC_BY_4 = 'https://creativecommons.org/licenses/by/4.0/';

/**
 * criteria_sha256 -> a triage commit where curation_criteria/CRITERIA.md has exactly that hash, so
 * a record's provenance names the criteria it was judged by, not whatever main holds today. The
 * UI keeps the same pins (observatory-ui/src/app/core/curation-criteria.ts); change the two
 * together, whenever the pipeline's prompts/PROMPT_HASHES.json gains a new criteria_sha256.
 */
const CRITERIA_PINS: Record<string, string> = {
  bd9d66dd892e6c0a231ac59ba102543ea6caa89db67fc1b914795501f4f60449:
    '8bd471bada901a6eb2d23ebc033ce3b0462dd062',
};

/** The criteria a record was screened against: pinned when its hash is known, else current. */
export function curationCriteriaUrl(sha256?: string | null): string {
  const ref = (sha256 && CRITERIA_PINS[sha256]) || 'main';
  return `${TRIAGE_REPOSITORY}/blob/${ref}/curation_criteria/CRITERIA.md`;
}

/** The criteria document as a term set -- one stable IRI for the classification labels. */
export const CURATION_CRITERIA_URL = `${TRIAGE_REPOSITORY}/blob/main/curation_criteria/CRITERIA.md`;
export const EUROPE_PMC_TERMS_URL = 'https://europepmc.org/Copyright';
export const DOME_REGISTRY_URL = 'https://registry.dome-ml.org';
export const BIOSCHEMAS_SCHOLARLY_ARTICLE =
  'https://bioschemas.org/profiles/ScholarlyArticle/0.3-DRAFT';

/** The OAI-PMH repository identifier: the site's own domain, as the oai-identifier scheme asks. */
export const OAI_REPOSITORY_ID = 'observatory.dome-ml.org';

type Text = string | null | undefined;

export function bareVersion(version: string): string {
  return version.replace(/^v/, '');
}

export function recordUrl(origin: string, pid: string): string {
  return `${origin}/record/${pid}`;
}

export function recordJsonLdUrl(origin: string, pid: string): string {
  return `${origin}/api/records/${pid}/jsonld`;
}

export function oaiBaseUrl(origin: string): string {
  return `${origin}/api/oai`;
}

export function oaiIdentifier(pid: string): string {
  return `oai:${OAI_REPOSITORY_ID}:${pid}`;
}

/** The page that describes the corpus as a whole. */
export function corpusUrl(origin: string): string {
  return `${origin}/download/bulk`;
}

/** The dataset series every record is part of; each release is one dataset in it. */
export function corpusSeriesId(origin: string): string {
  return `${corpusUrl(origin)}#corpus`;
}

export function schemaReleaseUrl(version: string): string {
  return `${REPOSITORY}/tree/main/schema/releases/v${bareVersion(version)}`;
}

export function vocabFileUrl(version: string, file: string): string {
  return `${REPOSITORY}/blob/main/schema/releases/v${bareVersion(version)}/vocab/${file}`;
}

export function domeRegistryReviewUrl(id: string): string {
  return `${DOME_REGISTRY_URL}/review/${encodeURIComponent(id)}`;
}

/** doi.org takes the DOI as its path; only the characters that would end or break a path are
 *  escaped, so the URL still reads as the DOI. */
export function doiUrl(doi: string): string {
  return `https://doi.org/${doi.replace(/[%#? ]/g, (c) => encodeURIComponent(c))}`;
}

export function pubmedUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

export function pmcUrl(pmcid: string): string {
  return `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`;
}

/** Mirrors observatory-ui's `europePmcArticleUrl` (core/outbound-links.ts): the stored Europe PMC
 *  identity when there is one -- a preprint is only reachable that way -- otherwise the MED form. */
export function europePmcArticleUrl(
  pmid: Text,
  epmcId: Text,
  epmcSource: Text,
): string | undefined {
  if (epmcSource && epmcId) return `https://europepmc.org/article/${epmcSource}/${epmcId}`;
  if (pmid) return `https://europepmc.org/article/MED/${pmid}`;
  return undefined;
}
