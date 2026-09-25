import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentReleaseDir } from '../common/schema-version';
import { findMetadataCurrent, readCatalog } from './catalog.service';
import { compact } from './json-node';
import { articleLicence } from './licence';
import { curationCriteriaUrl, doiUrl, europePmcArticleUrl } from './metadata-urls';
import { plainText } from './plain-text';
import { splitAuthors } from './record-view';
import { VocabIndex } from './vocab-index';
import { escapeXml } from './xml';

describe('articleLicence', () => {
  it('maps Europe PMC’s licence families to their Creative Commons URL, asserting no version', () => {
    expect(articleLicence('cc by')).toEqual({
      name: 'CC BY',
      url: 'https://creativecommons.org/licenses/by/',
    });
    expect(articleLicence('cc by-nc-nd')).toEqual({
      name: 'CC BY-NC-ND',
      url: 'https://creativecommons.org/licenses/by-nc-nd/',
    });
    expect(articleLicence('CC0')?.url).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
  });

  it('keeps an unrecognised licence by name and treats "" and null as no statement', () => {
    expect(articleLicence('Publisher licence')).toEqual({ name: 'Publisher licence' });
    expect(articleLicence('')).toBeUndefined();
    expect(articleLicence(null)).toBeUndefined();
  });
});

describe('small helpers', () => {
  it('compact drops empty values but keeps false and zero', () => {
    expect(compact({ a: undefined, b: null, c: '', d: [], e: false, f: 0, g: 'x' })).toEqual({
      e: false,
      f: 0,
      g: 'x',
    });
  });

  it('escapeXml escapes markup and drops the control characters XML 1.0 forbids', () => {
    expect(escapeXml(`a<b>&"c'\u0001\u0008d\te`)).toBe('a&lt;b&gt;&amp;&quot;c&apos;d\te');
  });

  it('plainText strips tags and collapses whitespace', () => {
    expect(plainText('<h4>Background</h4>Deep <i>learning</i>\n works')).toBe(
      'Background Deep learning works',
    );
  });

  it('plainText lets inline emphasis vanish without splitting the word it sits in', () => {
    expect(plainText('efficient CO<sub>2</sub> reduction, non-<i>ab initio</i> features')).toBe(
      'efficient CO2 reduction, non-ab initio features',
    );
  });

  it('plainText strips the entity-encoded tags 14,450 PubMed titles carry', () => {
    expect(
      plainText(
        'The &lt;i&gt;Drosophila&lt;/i&gt; Connectome as a Computational Reservoir for Time-Series Prediction.',
      ),
    ).toBe('The Drosophila Connectome as a Computational Reservoir for Time-Series Prediction.');
    expect(plainText('&lt;p&gt;Converting cold to hot (Review)&lt;/p&gt;.')).toBe(
      'Converting cold to hot (Review) .',
    );
  });

  it('plainText decodes entities, and reads an encoded comparison as text, not a tag', () => {
    expect(plainText('H&amp;E-based MSI/MMR testing')).toBe('H&E-based MSI/MMR testing');
    expect(plainText('Heat Meters&rsquo;&nbsp;Failures')).toBe('Heat Meters\u2019 Failures');
    expect(plainText('survival at P&lt;0.05 and &#8805;74 years')).toBe(
      'survival at P<0.05 and \u226574 years',
    );
    expect(plainText('&lt;script&gt;x&lt;/script&gt; and a &madeup; entity')).toBe(
      '<script>x</script> and a &madeup; entity',
    );
  });

  it('plainText keeps the text between two comparison signs', () => {
    expect(plainText('moderate (0.5 < ICC ≤ 0.75) for first-order features, and ICC >0.9')).toBe(
      'moderate (0.5 < ICC ≤ 0.75) for first-order features, and ICC >0.9',
    );
  });

  it('splitAuthors handles the corpus string with its trailing full stop', () => {
    expect(splitAuthors('Liang L, Liang H, He M.')).toEqual(['Liang L', 'Liang H', 'He M']);
  });

  it('builds article URLs the way the UI does', () => {
    expect(doiUrl('10.1000/a#b?c')).toBe('https://doi.org/10.1000/a%23b%3Fc');
    expect(europePmcArticleUrl('123', 'PPR456', 'PPR')).toBe(
      'https://europepmc.org/article/PPR/PPR456',
    );
    expect(europePmcArticleUrl('123', null, null)).toBe('https://europepmc.org/article/MED/123');
  });
});

describe('VocabIndex', () => {
  const index = VocabIndex.load(currentReleaseDir());

  it('resolves domain labels to EDAM topics and modelling terms to MeSH plus exact matches', () => {
    expect(index.lookup('domain_tier1', 'Biology')).toEqual({
      iri: 'http://edamontology.org/topic_3070',
      code: 'topic_3070',
      exactMatches: [],
    });
    const supervised = index.lookup('learning_paradigm', 'Supervised');
    expect(supervised?.iri).toBe('http://id.nlm.nih.gov/mesh/D000069553');
    expect(supervised?.exactMatches).toContain('https://w3id.org/aio/SupervisedLearning');
    expect(supervised?.exactMatches).not.toContain(supervised?.iri);
  });

  it('leaves an extension term without an IRI, and an unknown label unresolved', () => {
    expect(index.lookup('model_family', 'classical machine learning')).toEqual({
      iri: undefined,
      code: undefined,
      exactMatches: [],
    });
    expect(index.lookup('domain_tier1', 'Alchemy')).toBeUndefined();
  });

  it('is empty, not fatal, when no release can be found', () => {
    expect(VocabIndex.load(join(tmpdir(), 'no-such-release')).size).toBe(0);
  });
});

describe('readCatalog', () => {
  function release(content: string): string {
    const root = mkdtempSync(join(tmpdir(), 'catalog-'));
    mkdirSync(join(root, 'metadata', 'releases', '2026-09'), { recursive: true });
    mkdirSync(join(root, 'observatory-ws'));
    writeFileSync(join(root, 'metadata', 'CURRENT'), '2026-09\n');
    writeFileSync(join(root, 'metadata', 'releases', '2026-09', 'dataset.jsonld'), content);
    return root;
  }

  it('finds metadata/CURRENT beside the app and returns the release it names, verbatim', () => {
    const root = release('{"@graph": []}');
    const current = findMetadataCurrent(join(root, 'observatory-ws'));
    expect(current).toBe(join(root, 'metadata', 'CURRENT'));
    expect(readCatalog(current)).toBe('{"@graph": []}');
  });

  it('is undefined when nothing is published, and throws on a broken file', () => {
    expect(readCatalog(undefined)).toBeUndefined();
    expect(() => readCatalog(join(release('{not json'), 'metadata', 'CURRENT'))).toThrow();
  });
});

describe('curationCriteriaUrl', () => {
  const triage = 'https://github.com/BioComputingUP/dome-ml-observatory-triage';

  it('pins a known criteria hash to a commit holding exactly that CRITERIA.md', () => {
    expect(
      curationCriteriaUrl('bd9d66dd892e6c0a231ac59ba102543ea6caa89db67fc1b914795501f4f60449'),
    ).toBe(`${triage}/blob/8bd471bada901a6eb2d23ebc033ce3b0462dd062/curation_criteria/CRITERIA.md`);
  });

  it('falls back to the current criteria for an unknown or missing hash', () => {
    const current = `${triage}/blob/main/curation_criteria/CRITERIA.md`;
    expect(curationCriteriaUrl('f'.repeat(64))).toBe(current);
    expect(curationCriteriaUrl(undefined)).toBe(current);
  });
});
