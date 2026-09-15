import {
  chipsFor,
  dataLinkAssets,
  dataLinksNote,
  INLINE_CHIPS,
  obtainedByLabel,
  provenanceLabel,
  recordAssets,
  resourceLabel,
} from './data-links';
import { AiMlRecord, DataLink, DataLinkResource, DataLinks } from './record.model';

function record(dataLinks?: DataLinks, source?: Partial<AiMlRecord['source']>, ids: Partial<AiMlRecord['identifiers']> = {}): AiMlRecord {
  return {
    _id: 'pid-1',
    schema_version: '1.5.0',
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

function geoLinks(n: number): DataLink[] {
  return Array.from({ length: n }, (_, i) => ({
    resource: 'geo', id: `GSE${1000 + i}`, url: `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE${1000 + i}`,
    title: null, obtained_by: 'tm_accession', relationship: 'References', section: 'Article', frequency: null,
  }));
}

function geoResource(count: number, over: Partial<DataLinkResource> = {}): DataLinkResource {
  return { resource: 'geo', label: 'Gene Expression Omnibus', category: 'Gene Expression', id_scheme: 'GEO', publisher: 'Europe PMC', obtained_by: 'tm_accession', count, ...over };
}

const DOME: DataLinks = {
  ...LINKS,
  sources: ['epmc_search', 'ebisearch'],
  link_count: 2,
  resources: [
    { resource: 'biotools', label: 'bio.tools', category: 'Software Registries', id_scheme: 'biotoolsID', publisher: 'bio.tools', obtained_by: 'ebisearch_domain', count: 1, routes: ['ebisearch_domain'], browse_url: null },
    { resource: 'dome_registry', label: 'DOME Registry', category: 'Transparency Reports', id_scheme: 'DOME Registry ID', publisher: 'DOME Registry', obtained_by: 'ebisearch_domain', count: 1, routes: ['ebisearch_domain'], browse_url: null },
  ],
  links: [
    { resource: 'biotools', id: 'suba3', url: 'https://bio.tools/suba3', title: 'SUBA3', obtained_by: 'ebisearch_domain', relationship: 'IsDescribedBy', section: null, frequency: null, matched_by: 'pmid', source_domain: 'biotools' },
    { resource: 'dome_registry', id: '3mm086r5pw', url: 'https://registry.dome-ml.org/review/3mm086r5pw', title: 'A method', obtained_by: 'ebisearch_domain', relationship: 'IsReviewedBy', section: null, frequency: null, matched_by: 'pmid', source_domain: 'dome-registry' },
  ],
};

describe('dataLinkAssets', () => {
  it('returns nothing for a record without the block, or with no resources', () => {
    expect(dataLinkAssets(record())).toEqual([]);
    expect(dataLinkAssets(record({ ...LINKS, resources: [], links: [] }))).toEqual([]);
  });

  it('makes one card per resource; a single link makes the whole card that link', () => {
    const assets = dataLinkAssets(record(LINKS));
    expect(assets.map((a) => a.resource)).toEqual(['pdb', 'zenodo', 'biostudies']);
    expect(assets.map((a) => a.key)).toEqual(['pdb', 'zenodo', 'biostudies']);
    const [pdb, zenodo] = assets;
    expect(zenodo.url).toBe('https://doi.org/10.5281/zenodo.1');
    expect(zenodo.links).toEqual([]);
    expect(pdb.url).toBeNull();
    expect(pdb.links).toEqual([
      { id: '6VW1', title: null, url: 'http://identifiers.org/pdbe/pdb:6VW1' },
      { id: '6W6W', title: null, url: 'http://identifiers.org/pdbe/pdb:6W6W' },
    ]);
    expect(pdb.seeAll).toBeNull();
    expect(pdb.label).toBe('Protein Data Bank in Europe');
    expect(pdb.count).toBe(2);
    expect(pdb.explainer).toContain('2 links');
    expect(pdb.explainer).toContain('Protein Structures');
    expect(pdb.explainer).toContain('text-mined from the article');
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

  it('points to the Europe PMC article page when the stored detail holds nothing for a resource', () => {
    const capped: DataLinks = { ...LINKS, truncated: true, links: LINKS.links.filter((l) => l.resource !== 'zenodo') };
    const zenodo = dataLinkAssets(record(capped)).find((a) => a.resource === 'zenodo');
    expect(zenodo?.url).toBeNull();
    expect(zenodo?.links).toEqual([]);
    expect(zenodo?.seeAll).toEqual({ label: 'See all 1 at Europe PMC', url: 'https://europepmc.org/article/MED/34265844' });
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

  it('keeps a stored entry without a URL as a plain chip rather than dropping the resource', () => {
    const noUrl: DataLinks = {
      ...LINKS,
      resources: [{ resource: 'dgva', label: 'DGVa', category: 'Genomic Variation', id_scheme: 'DGVa', publisher: 'DGVa', obtained_by: 'ebisearch_xref', count: 1, routes: ['ebisearch_xref'], browse_url: null }],
      links: [{ resource: 'dgva', id: 'essv1', url: null, title: null, obtained_by: 'ebisearch_xref', relationship: 'IsSupplementedBy', section: null, frequency: null, matched_by: 'pmid', source_domain: 'dgva' }],
    };
    const [asset] = dataLinkAssets(record(noUrl));
    expect(asset.url).toBeNull();
    expect(asset.links).toEqual([{ id: 'essv1', title: null, url: null }]);
    expect(asset.seeAll).toBeNull();
  });
});

describe('a resource with many links', () => {
  it('shows the first entries as chips, the rest behind the expander, and one link to the source', () => {
    const many: DataLinks = {
      ...LINKS,
      link_count: 12,
      resources: [geoResource(12, { routes: ['ebisearch_xref', 'tm_accession'], browse_url: 'https://www.ncbi.nlm.nih.gov/gds?LinkName=pubmed_gds&from_uid=34265844' })],
      links: geoLinks(12),
    };
    const [geo] = dataLinkAssets(record(many));
    expect(geo.url).toBeNull();
    expect(geo.links.length).toBe(12);
    expect(chipsFor(geo, false).shown.map((c) => c.id)).toEqual(['GSE1000', 'GSE1001', 'GSE1002', 'GSE1003', 'GSE1004']);
    expect(chipsFor(geo, false).shown.length).toBe(INLINE_CHIPS);
    expect(chipsFor(geo, false).more).toBe(7);
    expect(chipsFor(geo, true).shown.length).toBe(12);
    expect(chipsFor(geo, true).more).toBe(0);
    expect(geo.seeAll).toEqual({ label: 'See all 12 at Gene Expression Omnibus', url: 'https://www.ncbi.nlm.nih.gov/gds?LinkName=pubmed_gds&from_uid=34265844' });
    expect(geo.explainer).toContain('text-mined from the article by Europe PMC, and recorded by the repository');
  });

  it('sends a capped resource to Europe PMC only when a Europe PMC route found it', () => {
    const capped: DataLinks = { ...LINKS, truncated: true, resources: [geoResource(80)], links: geoLinks(50) };
    expect(dataLinkAssets(record(capped))[0].seeAll?.url).toBe('https://europepmc.org/article/MED/34265844');

    const ebiOnly: DataLinks = { ...capped, resources: [geoResource(80, { obtained_by: 'ebisearch_xref', routes: ['ebisearch_xref'] })] };
    expect(dataLinkAssets(record(ebiOnly))[0].seeAll).toBeNull();
  });

  it('offers no see-all link when every entry is already on the card', () => {
    const few: DataLinks = { ...LINKS, resources: [geoResource(3)], links: geoLinks(3) };
    const [geo] = dataLinkAssets(record(few));
    expect(chipsFor(geo, false).more).toBe(0);
    expect(geo.seeAll).toBeNull();
  });
});

describe('EBI Search resources (schema v1.5.0)', () => {
  it('files bio.tools under Code and the DOME Registry under Annotation, with the registry logo', () => {
    const byResource = Object.fromEntries(dataLinkAssets(record(DOME)).map((a) => [a.resource, a]));
    expect(byResource['biotools'].group).toBe('Code');
    expect(byResource['biotools'].url).toBe('https://bio.tools/suba3');
    expect(byResource['dome_registry'].group).toBe('Annotation');
    expect(byResource['dome_registry'].logo).toBe('assets/img/DOME_Registry_Rounded-cropped.svg');
    expect(byResource['dome_registry'].explainer).toContain('recorded by the repository, found through EBI Search');
  });

  it('says who vouches for the links, route by route', () => {
    expect(provenanceLabel(DOME.resources[0])).toBe('recorded by the repository, found through EBI Search');
    expect(provenanceLabel(geoResource(2, { routes: ['derived', 'ebisearch_xref'] }))).toBe(
      'the supplementary files as archived in BioStudies, and recorded by the repository');
    expect(provenanceLabel(geoResource(2))).toBe('text-mined from the article by Europe PMC');
  });
});

describe('recordAssets', () => {
  it('shows a DOME Registry entry once when both the identifier and the data links carry it', () => {
    const both = recordAssets(record(DOME, undefined, { dome_registry: '3mm086r5pw' }));
    expect(both.filter((a) => a.label === 'DOME Registry').length).toBe(1);
    expect(both.find((a) => a.label === 'DOME Registry')?.key).toBe('dome_registry');

    const onlyIdentifier = recordAssets(record(undefined, undefined, { dome_registry: '3mm086r5pw' }));
    expect(onlyIdentifier.map((a) => [a.key, a.url])).toEqual([['xref:DOME Registry', 'https://registry.dome-ml.org/review/3mm086r5pw']]);
  });

  it('gives every card a unique key, even when a cross-link and a resource share a repository', () => {
    const assets = recordAssets(record(LINKS, undefined, { zenodo: '10.5281/zenodo.1', huggingface: 'org/model' }));
    const keys = assets.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('xref:Zenodo');
    expect(keys).toContain('zenodo');
  });
});

describe('dataLinksNote', () => {
  it('is null until a fetch has run', () => {
    expect(dataLinksNote(record())).toBeNull();
    expect(dataLinksNote(record({ ...LINKS, fetched_at: null }))).toBeNull();
  });

  it('says how many links, from where, and when', () => {
    expect(dataLinksNote(record(LINKS))).toBe('4 links across 3 resources, from Europe PMC on 2026-09-14.');
    expect(dataLinksNote(record(DOME))).toBe('2 links across 2 resources, from Europe PMC and EBI Search on 2026-09-14.');
  });

  it('says so plainly when nothing was found', () => {
    const none: DataLinks = { ...LINKS, link_count: 0, resources: [], links: [] };
    expect(dataLinksNote(record(none))).toContain('recorded no data links');
    expect(dataLinksNote(record({ ...none, sources: ['epmc_search', 'ebisearch'] }))).toContain('Europe PMC and EBI Search recorded no data links');
  });

  it('flags capped detail', () => {
    expect(dataLinksNote(record({ ...LINKS, truncated: true }))).toContain('Only the first links');
  });
});

describe('labels', () => {
  it('names known resources and passes unknown slugs through', () => {
    expect(resourceLabel('pdb')).toBe('Protein Data Bank in Europe');
    expect(resourceLabel('biotools')).toBe('bio.tools');
    expect(resourceLabel('dome_registry')).toBe('DOME Registry');
    expect(resourceLabel('somethingelse')).toBe('somethingelse');
    expect(obtainedByLabel('derived')).toContain('BioStudies');
    expect(obtainedByLabel('ebisearch_domain')).toContain('EBI Search');
    expect(obtainedByLabel(null)).toContain('Europe PMC');
  });
});
