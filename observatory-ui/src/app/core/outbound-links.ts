/**
 * Where a record's article and its associated assets actually live.
 *
 * This is the point of the whole resource: DOME Observatory holds metadata, and its job is to hand
 * a reader off to whoever holds the thing they want.
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

export interface ArticleSource {
  /** Destination name, e.g. "Europe PMC". */
  label: string;
  /** One line on what the reader actually gets there -- a bare link tells them nothing. */
  explainer: string;
  url: string;
  /** The identifier this destination is reached by. Shown on the card and copyable, so the reader
   *  never has to go hunting in a separate list for the number they came for. */
  idLabel: string;
  idValue: string;
  /** Path under assets/img/, where a logo exists. */
  logo?: string;
  /** EBI icon-font name, used when there is no logo. */
  icon: string;
}

/**
 * The destinations that hold this article itself. Only ever populated entries -- a source the
 * record has no identifier for is simply not a source for that record.
 */
export function articleSources(record: AiMlRecord): ArticleSource[] {
  const ids = record.identifiers;
  const sources: ArticleSource[] = [];

  if (ids.pmid) {
    sources.push({
      label: 'Europe PMC',
      explainer: 'Abstract, citations and full text where open access.',
      url: `https://europepmc.org/article/MED/${ids.pmid}`,
      idLabel: 'PMID',
      idValue: ids.pmid,
      icon: 'icon-book',
    });
    sources.push({
      label: 'PubMed',
      explainer: 'The MEDLINE record, MeSH indexing and related articles.',
      url: `https://pubmed.ncbi.nlm.nih.gov/${ids.pmid}/`,
      idLabel: 'PMID',
      idValue: ids.pmid,
      icon: 'icon-search',
    });
  }

  if (ids.pmcid) {
    sources.push({
      label: 'PMC full text',
      explainer: 'The complete open-access article text and figures.',
      url: `https://pmc.ncbi.nlm.nih.gov/articles/${ids.pmcid}/`,
      idLabel: 'PMCID',
      idValue: ids.pmcid,
      logo: 'assets/img/pmc-logo.svg',
      icon: 'icon-documentation',
    });
  }

  if (ids.doi) {
    sources.push({
      label: 'Publisher',
      explainer: 'The version of record, at the original publisher.',
      url: `https://doi.org/${ids.doi}`,
      idLabel: 'DOI',
      idValue: ids.doi,
      logo: 'assets/img/doi-logo.svg',
      icon: 'icon-link',
    });
  }

  return sources;
}

/** Broad kind of thing an asset is, used to group the cards. */
export type AssetGroup = 'Data' | 'Code' | 'Models' | 'Annotation';

export interface CrossLinkedAsset {
  group: AssetGroup;
  label: string;
  explainer: string;
  url: string;
  logo?: string;
  icon: string;
}

/**
 * Passes a value straight through when it is already a URL, otherwise builds the canonical one.
 *
 * These fields are reserved in schema v1.1.0 and populated by a cross-linking pass that has not run
 * yet -- confirmed against the database server 2026-09-02: **0 of all 827,061 records** carry any of them. Whether
 * the pass will write bare accessions or full URLs is therefore not yet observable, so this handles
 * both rather than guessing one and breaking on the other.
 */
function assetUrl(raw: string, template: (id: string) => string): string {
  return /^https?:\/\//i.test(raw) ? raw : template(encodeURIComponent(raw));
}

/**
 * Data, code, models and structured annotations linked to this paper.
 *
 * Returns an empty array when nothing is linked, and the record page renders no section at all in
 * that case. That is the whole design: the previous version showed five permanently-greyed
 * "Not yet linked" boxes on every record, at the same visual weight as the real links above them,
 * which is what a placeholder wall looks like rather than a roadmap. The section appears by itself
 * the moment the cross-linking pass populates anything.
 */
export function crossLinkedAssets(record: AiMlRecord): CrossLinkedAsset[] {
  const ids = record.identifiers;
  const assets: CrossLinkedAsset[] = [];

  if (ids.dome_registry) {
    assets.push({
      group: 'Annotation',
      label: 'DOME Registry',
      explainer: 'The structured DOME annotation of this method.',
      url: assetUrl(ids.dome_registry, (id) => `https://registry.dome-ml.org/search?q=${id}`),
      logo: 'assets/img/DOME_Registry_Rounded.svg',
      icon: 'icon-classification',
    });
  }

  if (ids.huggingface) {
    assets.push({
      group: 'Models',
      label: 'Hugging Face',
      explainer: 'The released model or dataset.',
      url: assetUrl(ids.huggingface, (id) => `https://huggingface.co/${id}`),
      logo: 'assets/img/hf-logo.svg',
      icon: 'icon-microchip',
    });
  }

  if (ids.bioai_repo) {
    assets.push({
      group: 'Code',
      label: 'Source repository',
      explainer: "The method's own code.",
      url: assetUrl(ids.bioai_repo, (id) => `https://github.com/${id}`),
      logo: 'assets/img/GitHub-Mark-64px.png',
      icon: 'icon-code-branch',
    });
  }

  if (ids.zenodo) {
    assets.push({
      group: 'Data',
      label: 'Zenodo',
      explainer: 'Archived code or data deposit, with a citable DOI.',
      url: assetUrl(ids.zenodo, (id) => `https://zenodo.org/records/${id}`),
      logo: 'assets/img/zenodo-logo.svg',
      icon: 'icon-database',
    });
  }

  if (ids.kaggle) {
    assets.push({
      group: 'Data',
      label: 'Kaggle',
      explainer: 'The associated dataset or notebook.',
      url: assetUrl(ids.kaggle, (id) => `https://www.kaggle.com/${id}`),
      logo: 'assets/img/Kaggle_logo.png',
      icon: 'icon-database',
    });
  }

  return assets;
}
