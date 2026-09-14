/**
 * Where a record's article and its associated assets actually live.
 *
 * This is the point of the whole resource: DOME Observatory holds metadata, and its job is to hand
 * a reader off to whoever holds the thing they want.
 *
 * Every URL template below was live-checked on 2026-08-31 against a real record
 * (pmid 19964568 / PMC4013747):
 *   - europepmc.org/article/MED/{pmid}        -> 200 (also the form used in dome-registry-ui + dome-triage);
 *       superseded by /article/{epmc_source}/{epmc_id} where the record stores its Europe PMC
 *       identity -- a preprint lives at /article/PPR/{PPR-id}, and the MED form 404s for it
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
 * Europe PMC's article URL is `/article/{source}/{id}` -- MED/{pmid} for a MEDLINE record, but
 * PPR/{PPR-id} for a preprint, which is why the pmid form was wrong for the 3,157 preprints that
 * carry a PMID. Prefers the record's stored Europe PMC identity (schema v1.3.0,
 * `source.epmc_source` + `identifiers.epmc_id`) and falls back to the pmid form for a record the
 * capture pass has not reached. Null when neither exists.
 */
export function europePmcArticleUrl(record: AiMlRecord): string | null {
  const ids = record.identifiers;
  const source = record.source?.epmc_source;
  if (source && ids.epmc_id) return `https://europepmc.org/article/${source}/${ids.epmc_id}`;
  if (ids.pmid) return `https://europepmc.org/article/MED/${ids.pmid}`;
  return null;
}

/**
 * The destinations that hold this article itself. Only ever populated entries -- a source the
 * record has no identifier for is simply not a source for that record.
 */
export function articleSources(record: AiMlRecord): ArticleSource[] {
  const ids = record.identifiers;
  const sources: ArticleSource[] = [];

  const epmcUrl = europePmcArticleUrl(record);
  if (epmcUrl) {
    const epmcSource = record.source?.epmc_source;
    // A stored non-MED identity (PPR, PMC, AGR, ETH, ...) is reached by Europe PMC's own id; only
    // PPR is a preprint.
    const byEpmcId = !!(epmcSource && ids.epmc_id) && epmcSource !== 'MED';
    const isPreprint = byEpmcId && epmcSource === 'PPR';
    sources.push({
      label: 'Europe PMC',
      explainer: isPreprint
        ? 'The preprint record: abstract, versions and full text where available.'
        : 'Abstract, citations and full text where open access.',
      url: epmcUrl,
      idLabel: byEpmcId ? 'Europe PMC ID' : 'PMID',
      idValue: (byEpmcId ? ids.epmc_id : ids.pmid ?? ids.epmc_id) as string,
      logo: 'assets/img/europe-pmc-logo.png',
      icon: 'icon-book',
    });
  }

  if (ids.pmid) {
    sources.push({
      label: 'PubMed',
      explainer: 'The MEDLINE record, MeSH indexing and related articles.',
      url: `https://pubmed.ncbi.nlm.nih.gov/${ids.pmid}/`,
      idLabel: 'PMID',
      idValue: ids.pmid,
      logo: 'assets/img/pubmed-logo.svg',
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
 * yet -- confirmed against the MongoDB server 2026-09-02: **0 of all 827,061 records** carry any of them. Whether
 * the pass will write bare accessions or full URLs is therefore not yet observable, so this handles
 * both rather than guessing one and breaking on the other.
 */
function assetUrl(raw: string, template: (id: string) => string): string {
  return /^https?:\/\//i.test(raw) ? raw : template(encodeURIComponent(raw));
}

/**
 * Data, code, models and structured annotations linked to this paper.
 *
 * Returns an empty array when nothing is linked. The record page still renders the section in that
 * case, but as a single quiet "not yet cross-linked" note rather than content -- deliberately NOT
 * the five permanently-greyed "Not yet linked" boxes an earlier version showed at the same visual
 * weight as the real links above them, which is what a placeholder wall looks like rather than a
 * roadmap. Hiding the section outright was the previous fix and overcorrected: with 0 of 827,061
 * records carrying a cross-link, "absent" was every reader's experience of it, and two tinted bands
 * then abutted and read as one section. The real cards replace the note the moment the
 * cross-linking pass populates anything.
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
      logo: 'assets/img/DOME_Registry_Rounded-cropped.svg',
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
