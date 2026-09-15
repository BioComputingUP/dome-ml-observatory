import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentReleaseDir } from '../common/schema-version';
import { findMetadataCurrent, readCatalog } from './catalog.service';
import { compact } from './json-node';
import { articleLicence } from './licence';
import { doiUrl, europePmcArticleUrl } from './metadata-urls';
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
