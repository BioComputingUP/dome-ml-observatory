import { articleSources, crossLinkedAssets } from './outbound-links';
import { AiMlRecord } from './record.model';

function record(ids: Partial<AiMlRecord['identifiers']> = {}): AiMlRecord {
  return {
    _id: 'pid-1',
    schema_version: '1.1.0',
    identifiers: { pmid: '19964568', pmcid: 'PMC4013747', doi: '10.1109/iembs.2009.5333926', dome_registry: null, bioai_repo: null, huggingface: null, kaggle: null, zenodo: null, ...ids },
    publication_metadata: { title: 't', abstract: null, authors: null, year: 2009, journal: null, citation_count: null },
    source: { abstract_source: null, metadata_repair_sources: null, access: { open_access: true, license: null, fulltext_available: true } },
    content_filters: { mesh_headings: [], pub_types: [], keywords_author: [], domain_tier1: null, domain_tier2: [], domain_tier3: [], learning_paradigm: [], model_family: [], model_type: [] },
    llm_classification: { provider: null, model_tier: null, model_id: null, mode: null, classification: 'positive', rationale: null, prompt_version: null, ruleset_sha256: null, batch_id: null, timestamp: null },
    llm_enrichment: { provider: null, model_tier: null, model_id: null, mode: null, rationale: null, prompt_version: null, ruleset_sha256: null, batch_id: null, timestamp: null, vocab_violations: null, parse_status: null, input_tokens: null, output_tokens: null, cache_hit_tokens: null, parse_fallback_used: null },
  };
}

describe('articleSources', () => {
  it('builds the live-verified URL templates', () => {
    const byLabel = Object.fromEntries(articleSources(record()).map((s) => [s.label, s.url]));
    expect(byLabel['Europe PMC']).toBe('https://europepmc.org/article/MED/19964568');
    expect(byLabel['PubMed']).toBe('https://pubmed.ncbi.nlm.nih.gov/19964568/');
    // Canonical PMC host -- the www.ncbi.nlm.nih.gov/pmc/articles form 301-redirects here.
    expect(byLabel['PMC full text']).toBe('https://pmc.ncbi.nlm.nih.gov/articles/PMC4013747/');
    expect(byLabel['Publisher']).toBe('https://doi.org/10.1109/iembs.2009.5333926');
  });

  it('gives every destination an explainer, never a bare link', () => {
    expect(articleSources(record()).every((s) => s.explainer.length > 0)).toBe(true);
  });

  it('carries the identifier each destination is reached by, so it can be copied from the card', () => {
    const byLabel = Object.fromEntries(
      articleSources(record()).map((s) => [s.label, [s.idLabel, s.idValue]]),
    );
    expect(byLabel['Europe PMC']).toEqual(['PMID', '19964568']);
    expect(byLabel['PMC full text']).toEqual(['PMCID', 'PMC4013747']);
    expect(byLabel['Publisher']).toEqual(['DOI', '10.1109/iembs.2009.5333926']);
  });

  it('omits PMC when the record has no PMCID', () => {
    const labels = articleSources(record({ pmcid: null })).map((s) => s.label);
    expect(labels).not.toContain('PMC full text');
    expect(labels).toContain('Europe PMC');
  });

  it('omits the PMID-based destinations when there is no PMID', () => {
    const labels = articleSources(record({ pmid: null })).map((s) => s.label);
    expect(labels).not.toContain('Europe PMC');
    expect(labels).not.toContain('PubMed');
    expect(labels).toContain('Publisher');
  });

  it('returns an empty list rather than throwing when a record has no identifiers at all', () => {
    expect(articleSources(record({ pmid: null, pmcid: null, doi: null }))).toEqual([]);
  });
});

describe('crossLinkedAssets', () => {
  it('returns nothing when no asset is linked -- the section must not render at all', () => {
    // This is every record in the corpus today: 0 of 827,061 carry any of these fields.
    expect(crossLinkedAssets(record())).toEqual([]);
  });

  it('appears as soon as one field is populated', () => {
    const assets = crossLinkedAssets(record({ huggingface: 'org/model' }));
    expect(assets).toHaveLength(1);
    expect(assets[0].group).toBe('Models');
    expect(assets[0].url).toBe('https://huggingface.co/org%2Fmodel');
  });

  it('passes a value through unchanged when it is already a URL', () => {
    // The cross-linking pass has never run, so whether it writes bare accessions or full URLs is
    // not yet observable -- both are handled rather than one being guessed at.
    const [asset] = crossLinkedAssets(record({ zenodo: 'https://zenodo.org/records/12345' }));
    expect(asset.url).toBe('https://zenodo.org/records/12345');
  });

  it('builds the canonical URL from a bare identifier', () => {
    const [asset] = crossLinkedAssets(record({ zenodo: '12345' }));
    expect(asset.url).toBe('https://zenodo.org/records/12345');
  });

  it('groups assets by the kind of thing they are', () => {
    const assets = crossLinkedAssets(
      record({ zenodo: '1', kaggle: 'u/d', bioai_repo: 'o/r', huggingface: 'o/m', dome_registry: 'x' }),
    );
    const groups = Object.fromEntries(assets.map((a) => [a.label, a.group]));
    expect(groups['Zenodo']).toBe('Data');
    expect(groups['Kaggle']).toBe('Data');
    expect(groups['Source repository']).toBe('Code');
    expect(groups['Hugging Face']).toBe('Models');
    expect(groups['DOME Registry']).toBe('Annotation');
  });
});
