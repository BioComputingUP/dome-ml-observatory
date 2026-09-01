import { outboundLinks, plannedLinks } from './outbound-links';
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

describe('outboundLinks', () => {
  it('builds the live-verified URL templates', () => {
    const byLabel = Object.fromEntries(outboundLinks(record()).map((l) => [l.label, l.url]));
    expect(byLabel['Europe PMC']).toBe('https://europepmc.org/article/MED/19964568');
    expect(byLabel['PubMed']).toBe('https://pubmed.ncbi.nlm.nih.gov/19964568/');
    // Canonical PMC host -- the www.ncbi.nlm.nih.gov/pmc/articles form 301-redirects here.
    expect(byLabel['PMC full text']).toBe('https://pmc.ncbi.nlm.nih.gov/articles/PMC4013747/');
    expect(byLabel['Publisher (DOI)']).toBe('https://doi.org/10.1109/iembs.2009.5333926');
  });

  it('gives every destination an explainer, never a bare link', () => {
    expect(outboundLinks(record()).every((l) => l.explainer.length > 0)).toBe(true);
  });

  it('omits PMC when the record has no PMCID', () => {
    const labels = outboundLinks(record({ pmcid: null })).map((l) => l.label);
    expect(labels).not.toContain('PMC full text');
    expect(labels).toContain('Europe PMC');
  });

  it('omits the PMID-based destinations when there is no PMID', () => {
    const labels = outboundLinks(record({ pmid: null })).map((l) => l.label);
    expect(labels).not.toContain('Europe PMC');
    expect(labels).not.toContain('PubMed');
    expect(labels).toContain('Publisher (DOI)');
  });

  it('returns an empty list rather than throwing when a record has no identifiers at all', () => {
    expect(outboundLinks(record({ pmid: null, pmcid: null, doi: null }))).toEqual([]);
  });
});

describe('plannedLinks', () => {
  it('marks every reserved destination as planned while the schema fields are null', () => {
    const planned = plannedLinks(record());
    expect(planned.every((l) => l.planned && l.url === undefined)).toBe(true);
    expect(planned.map((l) => l.label)).toContain('DOME Registry');
  });

  it('promotes a destination out of "planned" once its identifier is populated', () => {
    const [registry] = plannedLinks(record({ dome_registry: 'https://registry.dome-ml.org/e/123' }));
    expect(registry.planned).toBe(false);
    expect(registry.url).toBe('https://registry.dome-ml.org/e/123');
  });
});
