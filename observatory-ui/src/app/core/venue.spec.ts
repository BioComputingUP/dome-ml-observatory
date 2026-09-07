import {
  PREPRINT_SERVERS,
  PREPRINT_SERVER_UNKNOWN,
  isPreprint,
  preprintServer,
  publicationVenue,
} from './venue';
import { AiMlRecord } from './record.model';

interface Overrides {
  doi?: string | null;
  journal?: string | null;
  preprint_server?: string | null;
  pub_types?: string[];
  epmc_source?: string | null;
}

function record({
  doi = null,
  journal = null,
  preprint_server = undefined,
  pub_types = [],
  epmc_source = undefined,
}: Overrides = {}): AiMlRecord {
  return {
    _id: 'pid-1',
    schema_version: '1.3.0',
    identifiers: { pmid: null, pmcid: null, doi, dome_registry: null, bioai_repo: null, huggingface: null, kaggle: null, zenodo: null },
    publication_metadata: { title: 't', abstract: null, authors: null, year: 2025, journal, preprint_server, citation_count: null },
    source: { abstract_source: null, metadata_repair_sources: null, epmc_source, access: { open_access: null, license: null, fulltext_available: null } },
    content_filters: { mesh_headings: [], pub_types, keywords_author: [], domain_tier1: null, domain_tier2: [], domain_tier3: [], learning_paradigm: [], model_family: [], model_type: [] },
    llm_classification: { provider: null, model_tier: null, model_id: null, mode: null, classification: 'positive', rationale: null, prompt_version: null, ruleset_sha256: null, batch_id: null, timestamp: null },
    llm_enrichment: { provider: null, model_tier: null, model_id: null, mode: null, rationale: null, prompt_version: null, ruleset_sha256: null, batch_id: null, timestamp: null, vocab_violations: null, parse_status: null, input_tokens: null, output_tokens: null, cache_hit_tokens: null, parse_fallback_used: null },
  };
}

/** A preprint with this DOI and nothing recorded, i.e. the DOI-table path. */
function preprintWithDoi(doi: string): AiMlRecord {
  return record({ doi, pub_types: ['Preprint'] });
}

describe('preprintServer', () => {
  // One real corpus DOI per registrant, each checked against Europe PMC's own
  // bookOrReportDetails.publisher on 2026-09-07.
  const cases: [string, string][] = [
    ['10.21203/rs.3.rs-6209794/v1', 'Research Square'],
    ['10.20944/preprints202411.1158.v1', 'Preprints.org'],
    ['10.31234/osf.io/tesj8_v2', 'PsyArXiv'],
    ['10.2139/ssrn.3925736', 'SSRN'],
    ['10.22541/au.176463688.83698999/v1', 'Authorea Preprints'],
    ['10.26434/chemrxiv.12709751.v1', 'ChemRxiv'],
    ['10.32388/puo5ck', 'Qeios'],
    ['10.14293/s2199-1006.1.sor-.ppa7be8.v1', 'ScienceOpen Preprints'],
    ['10.7287/peerj.preprints.27428v1', 'PeerJ Preprints'],
    ['10.32942/x2065k', 'EcoEvoRxiv'],
    ['10.1590/scielopreprints.11371', 'SciELO Preprints'],
    ['10.31222/osf.io/bdmte_v1', 'MetaArXiv'],
    ['10.3897/arphapreprints.e129002', 'ARPHA Preprints'],
    ['10.37044/osf.io/n9dkg', 'BioHackrXiv'],
    ['10.31220/agrirxiv.2022.00125', 'agriRxiv'],
    ['10.31730/osf.io/jak43', 'AfricArXiv'],
    ['10.1099/acmi.0.001061.v1', 'Access Microbiology'],
    ['10.3310/nihropenres.13837.1', 'NIHR Open Research'],
    ['10.15694/mep.2021.000131.1', 'MedEdPublish'],
    ['10.3762/bxiv.2024.33.v1', 'Beilstein Archives'],
    ['10.21467/preprints.423', 'AIJR Preprints'],
    ['10.35241/emeraldopenres.14515.1', 'Emerald Open Research'],
    ['10.5281/zenodo.18145874', 'Zenodo'],
    ['10.31233/osf.io/ewkx9', 'PaleorXiv'],
  ];

  it.each(cases)('resolves %s to %s', (doi, expected) => {
    expect(preprintServer(preprintWithDoi(doi))).toBe(expected);
  });

  // The article number, not the registrant, separates the two openRxiv servers: 8 digits is
  // medRxiv, 6 is bioRxiv. Validated on all 20,230 such corpus DOIs with zero unmatched.
  it('separates bioRxiv from medRxiv on the shared 10.1101 registrant', () => {
    expect(preprintServer(preprintWithDoi('10.1101/270413'))).toBe('bioRxiv');
    expect(preprintServer(preprintWithDoi('10.1101/2024.12.02.626299'))).toBe('bioRxiv');
    expect(preprintServer(preprintWithDoi('10.1101/2022.05.07.490938'))).toBe('bioRxiv');
    expect(preprintServer(preprintWithDoi('10.1101/2025.10.14.25337964'))).toBe('medRxiv');
    // The pre-2020 medRxiv form has no date component at all, only the 8-digit number.
    expect(preprintServer(preprintWithDoi('10.1101/19008045'))).toBe('medRxiv');
    expect(preprintServer(preprintWithDoi('10.1101/2019.12.26.19015909'))).toBe('medRxiv');
  });

  it('applies the same rule to openRxiv 10.64898, the newer registrant', () => {
    expect(preprintServer(preprintWithDoi('10.64898/2026.05.04.722036'))).toBe('bioRxiv');
    expect(preprintServer(preprintWithDoi('10.64898/2025.12.19.695531'))).toBe('bioRxiv');
    expect(preprintServer(preprintWithDoi('10.64898/2026.05.11.26352943'))).toBe('medRxiv');
    expect(preprintServer(preprintWithDoi('10.64898/2025.12.25.25342996'))).toBe('medRxiv');
  });

  it('tolerates a trailing version suffix on either server', () => {
    expect(preprintServer(preprintWithDoi('10.1101/2024.12.02.626299v1'))).toBe('bioRxiv');
    expect(preprintServer(preprintWithDoi('10.1101/2025.10.14.25337964v2'))).toBe('medRxiv');
  });

  // 10.12688 is F1000's platform, not one venue -- the partner gateways are separately-named.
  it('splits the F1000 platform by gateway slug', () => {
    expect(preprintServer(preprintWithDoi('10.12688/f1000research.160010.2'))).toBe('F1000Research');
    expect(preprintServer(preprintWithDoi('10.12688/openresafrica.16457.2'))).toBe('Open Research Africa');
    expect(preprintServer(preprintWithDoi('10.12688/wellcomeopenres.1.1'))).toBe('Wellcome Open Research');
    expect(preprintServer(preprintWithDoi('10.12688/gatesopenres.16313.1'))).toBe('Gates Open Research');
    expect(preprintServer(preprintWithDoi('10.12688/openreseurope.1.1'))).toBe('Open Research Europe');
    expect(preprintServer(preprintWithDoi('10.12688/hrbopenres.1.1'))).toBe('HRB Open Research');
    expect(preprintServer(preprintWithDoi('10.12688/verixiv.1.1'))).toBe('VeriXiv');
    expect(preprintServer(preprintWithDoi('10.12688/mep.2021.1.1'))).toBe('MedEdPublish');
  });

  it('falls back to the platform name for an unlisted F1000 gateway', () => {
    expect(preprintServer(preprintWithDoi('10.12688/somefuturegateway.1.1'))).toBe('F1000 Research');
  });

  it('is insensitive to case and surrounding whitespace in the DOI', () => {
    expect(preprintServer(preprintWithDoi('  10.12688/F1000Research.1.1  '))).toBe('F1000Research');
  });

  // The whole point of schema v1.3.0: once the backfill runs, inference stops being the answer.
  it('prefers the recorded preprint_server over the DOI table', () => {
    const rec = record({ doi: '10.1101/2024.12.02.626299', preprint_server: 'bioRxiv', pub_types: ['Preprint'] });
    expect(preprintServer(rec)).toBe('bioRxiv');
  });

  it('lets the recorded field win even when it disagrees with the DOI table', () => {
    const rec = record({ doi: '10.1101/2024.12.02.626299', preprint_server: 'medRxiv', pub_types: ['Preprint'] });
    expect(preprintServer(rec)).toBe('medRxiv');
  });

  it('returns null when nothing resolves a server', () => {
    expect(preprintServer(preprintWithDoi('10.9999/unknown.1'))).toBeNull();
    expect(preprintServer(record({ doi: null, pub_types: ['Preprint'] }))).toBeNull();
    expect(preprintServer(preprintWithDoi('not-a-doi'))).toBeNull();
    expect(preprintServer(preprintWithDoi(''))).toBeNull();
  });

  // Ordering is load-bearing: find() takes the first match, so a suffix-less row placed above a
  // specific one for the same registrant would shadow it silently.
  it('keeps every catch-all row last for its registrant', () => {
    const seenCatchAll = new Set<string>();
    for (const rule of PREPRINT_SERVERS) {
      expect(seenCatchAll.has(rule.prefix)).toBe(false);
      if (!rule.suffix) seenCatchAll.add(rule.prefix);
    }
  });
});

describe('isPreprint', () => {
  it('trusts epmc_source when it is populated', () => {
    expect(isPreprint(record({ epmc_source: 'PPR' }))).toBe(true);
    expect(isPreprint(record({ epmc_source: 'MED', pub_types: ['Preprint'] }))).toBe(false);
  });

  it('falls back to the pub_types proxy, case-insensitively', () => {
    expect(isPreprint(record({ pub_types: ['Preprint'] }))).toBe(true);
    expect(isPreprint(record({ pub_types: ['preprint'] }))).toBe(true);
    expect(isPreprint(record({ pub_types: ['Journal Article'] }))).toBe(false);
    expect(isPreprint(record())).toBe(false);
  });
});

describe('publicationVenue', () => {
  it('renders a journal record exactly as before, verbatim', () => {
    const journal = 'Bioinformatics (Oxford, England)';
    expect(publicationVenue(record({ journal }))).toEqual({
      label: 'Journal',
      value: journal,
      icon: 'icon-book',
    });
  });

  // 10.1101 is Cold Spring Harbor Laboratory Press's journal registrant as well as bioRxiv's.
  // 588 corpus records are journal articles on that prefix; checking journal first is what keeps
  // them right.
  it('lets a journal win over a preprint-registrant DOI', () => {
    const rec = record({ journal: 'Genome research', doi: '10.1101/gr.279479.124', pub_types: ['Journal Article'] });
    expect(publicationVenue(rec)?.label).toBe('Journal');
    expect(publicationVenue(rec)?.value).toBe('Genome research');
  });

  // 8 corpus records carry this as their literal journal string, and 3 carry both a journal and a
  // Preprint pub type.
  it('lets a journal win over a Preprint publication type', () => {
    const journal = 'bioRxiv : the preprint server for biology';
    const rec = record({ journal, doi: '10.1101/270413', pub_types: ['Preprint'] });
    expect(publicationVenue(rec)).toEqual({ label: 'Journal', value: journal, icon: 'icon-book' });
  });

  it('names the server on a preprint', () => {
    expect(publicationVenue(preprintWithDoi('10.1101/270413'))).toEqual({
      label: 'Preprint',
      value: 'bioRxiv',
      icon: 'icon-publication',
    });
    expect(publicationVenue(preprintWithDoi('10.1101/2025.10.14.25337964'))?.value).toBe('medRxiv');
    expect(publicationVenue(preprintWithDoi('10.21203/rs.3.rs-6209794/v1'))?.value).toBe('Research Square');
  });

  it('recognises the lowercase pub_types spelling two corpus records use', () => {
    const rec = record({ doi: '10.1101/270413', pub_types: ['preprint'] });
    expect(publicationVenue(rec)?.value).toBe('bioRxiv');
  });

  it('says when a preprint was withdrawn or removed', () => {
    const withdrawn = record({ doi: '10.1101/270413', pub_types: ['Preprint', 'Preprint-withdrawal'] });
    expect(publicationVenue(withdrawn)?.value).toBe('bioRxiv (withdrawn)');
    const removed = record({ doi: '10.1101/270413', pub_types: ['Preprint', 'Preprint-removal'] });
    expect(publicationVenue(removed)?.value).toBe('bioRxiv (removed)');
  });

  it('still names a venue when the server cannot be resolved', () => {
    expect(publicationVenue(preprintWithDoi('10.9999/unknown.1'))).toEqual({
      label: 'Preprint',
      value: PREPRINT_SERVER_UNKNOWN,
      icon: 'icon-publication',
    });
    expect(publicationVenue(record({ doi: null, pub_types: ['Preprint'] }))?.value).toBe(
      PREPRINT_SERVER_UNKNOWN,
    );
  });

  // 349 corpus records have neither: 216 reviews, 93 dissertations, 18 study guides, 22 untyped.
  it('returns null when there is no venue to name', () => {
    expect(publicationVenue(record({ pub_types: ['Dissertation'] }))).toBeNull();
    expect(publicationVenue(record({ pub_types: ['Review'] }))).toBeNull();
    expect(publicationVenue(record())).toBeNull();
    expect(publicationVenue(record({ journal: '   ' }))).toBeNull();
  });
});
