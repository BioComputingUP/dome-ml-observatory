/**
 * Builds the "find this elsewhere" destinations for a record.
 *
 * This is the point of the whole resource: DOME Observatory is a discovery hub, and its job is to
 * hand a user off to whoever actually holds the thing they want. A record with no way out is a
 * dead end, which is why unavailable destinations are rendered as explicit "not yet linked" rows
 * rather than hidden -- the roadmap should be visible.
 *
 * Every URL template below was live-checked on 2026-08-31 against a real record
 * (pmid 19964568 / PMC4013747):
 *   - europepmc.org/article/MED/{pmid}        -> 200 (also the form used in dome-registry-ui + dome-triage)
 *   - pubmed.ncbi.nlm.nih.gov/{pmid}/         -> 2xx
 *   - pmc.ncbi.nlm.nih.gov/articles/{pmcid}/  -> 200 (canonical; the older
 *       www.ncbi.nlm.nih.gov/pmc/articles/... form 301-redirects here, so we link the target
 *       directly rather than depending on a redirect that could later be retired)
 *   - doi.org/{doi}                           -> 302 to the publisher, as expected
 */

import { AiMlRecord } from './record.model';

export interface OutboundLink {
  /** Destination name, e.g. "Europe PMC". */
  label: string;
  /** One line on what the user actually gets there -- a bare link tells them nothing. */
  explainer: string;
  /** Absent when this record has no identifier for the destination. */
  url?: string;
  /** True for destinations reserved in the schema but not yet populated for any record. */
  planned?: boolean;
}

export function outboundLinks(record: AiMlRecord): OutboundLink[] {
  const ids = record.identifiers;
  const links: OutboundLink[] = [];

  if (ids.pmid) {
    links.push({
      label: 'Europe PMC',
      explainer: 'Abstract, citations and full text where open access.',
      url: `https://europepmc.org/article/MED/${ids.pmid}`,
    });
    links.push({
      label: 'PubMed',
      explainer: 'The MEDLINE record, MeSH indexing and related articles.',
      url: `https://pubmed.ncbi.nlm.nih.gov/${ids.pmid}/`,
    });
  }

  if (ids.pmcid) {
    links.push({
      label: 'PMC full text',
      explainer: 'The complete open-access article text and figures.',
      url: `https://pmc.ncbi.nlm.nih.gov/articles/${ids.pmcid}/`,
    });
  }

  if (ids.doi) {
    links.push({
      label: 'Publisher (DOI)',
      explainer: 'The version of record at the publisher.',
      url: `https://doi.org/${ids.doi}`,
    });
  }

  return links;
}

/**
 * Destinations reserved in schema v1.1.0 but null for every record until the cross-linking pass
 * runs. Shown as pending rather than hidden.
 */
export function plannedLinks(record: AiMlRecord): OutboundLink[] {
  const ids = record.identifiers;
  const planned: { key: keyof typeof ids; label: string; explainer: string }[] = [
    { key: 'dome_registry', label: 'DOME Registry', explainer: 'The structured DOME annotation for this method, once linked.' },
    { key: 'huggingface', label: 'Hugging Face', explainer: 'Released models or datasets, once linked.' },
    { key: 'kaggle', label: 'Kaggle', explainer: 'Associated datasets or notebooks, once linked.' },
    { key: 'zenodo', label: 'Zenodo', explainer: 'Archived code or data deposits, once linked.' },
    { key: 'bioai_repo', label: 'Code repository', explainer: 'The method’s source repository, once linked.' },
  ];

  return planned.map((p) => ({
    label: p.label,
    explainer: p.explainer,
    url: (ids[p.key] as string | null) ?? undefined,
    planned: !ids[p.key],
  }));
}
