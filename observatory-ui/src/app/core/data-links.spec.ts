import { dataLinkAssets, dataLinksNote, obtainedByLabel, resourceLabel } from './data-links';
import { AiMlRecord, DataLinks } from './record.model';

function record(dataLinks?: DataLinks, source?: Partial<AiMlRecord['source']>, ids: Partial<AiMlRecord['identifiers']> = {}): AiMlRecord {
  return {
    _id: 'pid-1',
    schema_version: '1.4.0',
    identifiers: { pmid: '34265844', pmcid: 'PMC8371605', doi: '10.1038/s41586-021-03819-2', epmc_id: '34265844', dome_registry: null, bioai_repo: null, huggingface: null, kaggle: null, zenodo: null, ...ids },
    publication_metadata: { title: 't', abstract: null, authors: null, year: 2021, journal: 'Nature', citation_count: null },
    source: { abstract_source: null, metadata_repair_sources: null, epmc_source: 'MED', access: { open_access: true, license: null, fulltext_available: true }, ...source },
    content_filters: { mesh_headings: [], pub_types: [], keywords_author: [], domain_tier1: null, domain_tier2: [], domain_tier3: [], learning_paradigm: [], model_family: [], model_type: [] },
    data_links: dataLinks,
    llm_classification: { provider: null, model_tier: null, model_id: null, mode: null, classification: 'positive', rationale: null, prompt_version: null, ruleset_sha256: null, batch_id: null, timestamp: null },
    llm_enrichment: { provider: null, model_tier: null, model_id: null, mode: null, rationale: null, prompt_version: null, ruleset_sha256: null, batch_id: null, timestamp: null, vocab_violations: null, parse_status: null, input_tokens: null, output_tokens: null, cache_hit_tokens: null, parse_fallback_used: null },
  };
}

const LINKS: DataLinks = {
  has_data: true,
  tags: ['supporting_data'],
  accession_types: ['pdb', 'doi'],
  db_cross_references: ['PDB'],
  fetched_at: '2026-09-14T10:00:00+00:00',
  sources: ['epmc_annotations', 'derived'],
  link_count: 4,
  truncated: false,
  resources: [
    { resource: 'pdb', label: 'Protein Data Bank in Europe', category: 'Protein Structures', id_scheme: 'PDBe', publisher: 'Europe PMC', obtained_by: 'tm_accession', count: 2 },
    { resource: 'zenodo', label: 'Zenodo', category: 'Data Citations', id_scheme: 'DOI', publisher: 'Zenodo', obtained_by: 'ext_links', count: 1 },
    { resource: 'biostudies', label: 'BioStudies', category: 'Supplementary Material', id_scheme: 'BioStudies', publisher: 'BioStudies', obtained_by: 'derived', count: 1 },
  ],
  links: [
    { resource: 'pdb', id: '6VW1', url: 'http://identifiers.org/pdbe/pdb:6VW1', title: null, obtained_by: 'tm_accession', relationship: 'References', section: 'Article', frequency: 3 },
    { resource: 'pdb', id: '6W6W', url: 'http://identifiers.org/pdbe/pdb:6W6W', title: null, obtained_by: 'tm_accession', relationship: 'References', section: 'Article', frequency: 1 },
    { resource: 'zenodo', id: '10.5281/zenodo.1', url: 'https://doi.org/10.5281/zenodo.1', title: 'Source data', obtained_by: 'ext_links', relationship: 'IsSupplementedBy', section: null, frequency: null },
    { resource: 'biostudies', id: 'S-EPMC8371605', url: 'https://www.ebi.ac.uk/biostudies/studies/S-EPMC8371605', title: 'Supplementary material', obtained_by: 'derived', relationship: 'IsSupplementedBy', section: null, frequency: null },
  ],
};

describe('dataLinkAssets', () => {
  it('returns nothing for a record without the block, or with no resources', () => {
    expect(dataLinkAssets(record())).toEqual([]);
    expect(dataLinkAssets(record({ ...LINKS, resources: [], links: [] }))).toEqual([]);
  });

  it('makes one card per resource, opening the first stored link', () => {
    const assets = dataLinkAssets(record(LINKS));
    expect(assets.map((a) => a.resource)).toEqual(['pdb', 'zenodo', 'biostudies']);
    expect(assets[0].url).toBe('http://identifiers.org/pdbe/pdb:6VW1');
    expect(assets[0].label).toBe('Protein Data Bank in Europe');
    expect(assets[0].count).toBe(2);
    expect(assets[0].explainer).toContain('2 links');
    expect(assets[0].explainer).toContain('Protein Structures');
    expect(assets[0].explainer).toContain('text-mined from the article');
  });

  it('groups by kind: data, supplementary, and the reserved code/model groups', () => {
    const groups = Object.fromEntries(dataLinkAssets(record(LINKS)).map((a) => [a.resource, a.group]));
    expect(groups['pdb']).toBe('Data');
    expect(groups['zenodo']).toBe('Data');
    expect(groups['biostudies']).toBe('Supplementary');
  });

  it('uses a self-hosted logo where one exists and an icon-font glyph otherwise', () => {
    const byResource = Object.fromEntries(dataLinkAssets(record(LINKS)).map((a) => [a.resource, a]));
    expect(byResource['zenodo'].logo).toBe('assets/img/zenodo-logo.svg');
    expect(byResource['pdb'].logo).toBeUndefined();
    expect(byResource['pdb'].icon).toBe('icon-crosslink');
    expect(byResource['biostudies'].icon).toBe('icon-archive');
  });

  it('falls back to the Europe PMC article page when the stored detail holds no link for a resource', () => {
    const capped: DataLinks = { ...LINKS, truncated: true, links: LINKS.links.filter((l) => l.resource !== 'zenodo') };
    const zenodo = dataLinkAssets(record(capped)).find((a) => a.resource === 'zenodo');
    expect(zenodo?.url).toBe('https://europepmc.org/article/MED/34265844');
  });

  it('renders an unknown resource truthfully with the generic style', () => {
    const odd: DataLinks = {
      ...LINKS,
      resources: [{ resource: 'newrepo', label: 'NewRepo', category: 'Data Citations', id_scheme: 'DOI', publisher: 'NewRepo', obtained_by: 'ext_links', count: 1 }],
      links: [{ resource: 'newrepo', id: '10.9999/x', url: 'https://doi.org/10.9999/x', title: null, obtained_by: 'ext_links', relationship: null, section: null, frequency: null }],
    };
    const [asset] = dataLinkAssets(record(odd));
    expect(asset.label).toBe('NewRepo');
    expect(asset.group).toBe('Data');
    expect(asset.icon).toBe('icon-database');
  });
});

describe('dataLinksNote', () => {
  it('is null until a fetch has run', () => {
    expect(dataLinksNote(record())).toBeNull();
    expect(dataLinksNote(record({ ...LINKS, fetched_at: null }))).toBeNull();
  });

  it('says how many links, from where, and when', () => {
    expect(dataLinksNote(record(LINKS))).toBe('4 links across 3 resources, from Europe PMC on 2026-09-14.');
  });

  it('says so plainly when Europe PMC had nothing', () => {
    const none: DataLinks = { ...LINKS, link_count: 0, resources: [], links: [] };
    expect(dataLinksNote(record(none))).toContain('recorded no data links');
  });

  it('flags capped detail', () => {
    expect(dataLinksNote(record({ ...LINKS, truncated: true }))).toContain('Only the first links');
  });
});

describe('labels', () => {
  it('names known resources and passes unknown slugs through', () => {
    expect(resourceLabel('pdb')).toBe('Protein Data Bank in Europe');
    expect(resourceLabel('somethingelse')).toBe('somethingelse');
    expect(obtainedByLabel('derived')).toContain('BioStudies');
    expect(obtainedByLabel(null)).toContain('Europe PMC');
  });
});
