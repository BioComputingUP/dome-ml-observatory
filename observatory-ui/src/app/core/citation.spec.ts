import { splitAuthors, bibtexKey, toBibtex, toRis } from './citation';
import { AiMlRecord } from './record.model';

function record(overrides: Partial<AiMlRecord['publication_metadata']> = {}, ids: Partial<AiMlRecord['identifiers']> = {}): AiMlRecord {
  return {
    _id: 'pid-1',
    schema_version: '1.1.0',
    identifiers: { pmid: '40703513', pmcid: 'PMC12283288', doi: '10.3389/fimmu.2025.1608262', dome_registry: null, bioai_repo: null, huggingface: null, kaggle: null, zenodo: null, ...ids },
    publication_metadata: { title: 'Integrative multi-omics analysis of ferroptosis', abstract: '<h4>Background</h4>Some text.', authors: 'Liang L, Liang H, He M.', year: 2025, journal: 'Frontiers in immunology', citation_count: null, ...overrides },
    source: { abstract_source: 'europepmc', metadata_repair_sources: null, access: { open_access: true, license: 'cc by', fulltext_available: true } },
    content_filters: { mesh_headings: [], pub_types: [], keywords_author: [], domain_tier1: null, domain_tier2: [], domain_tier3: [], learning_paradigm: [], model_family: [], model_type: [] },
    llm_classification: { provider: null, model_tier: null, model_id: null, mode: null, classification: 'positive', rationale: null, prompt_version: null, ruleset_sha256: null, batch_id: null, timestamp: null },
    llm_enrichment: { provider: null, model_tier: null, model_id: null, mode: null, rationale: null, prompt_version: null, ruleset_sha256: null, batch_id: null, timestamp: null, vocab_violations: null, parse_status: null, input_tokens: null, output_tokens: null, cache_hit_tokens: null, parse_fallback_used: null },
  };
}

describe('citation', () => {
  describe('splitAuthors', () => {
    it('splits the corpus comma-separated form and drops the trailing full stop', () => {
      expect(splitAuthors('Liang L, Liang H, He M.')).toEqual(['Liang L', 'Liang H', 'He M']);
    });

    it('handles a single author', () => {
      expect(splitAuthors('Smith J')).toEqual(['Smith J']);
    });

    it('returns an empty list for null/empty authors rather than throwing', () => {
      expect(splitAuthors(null)).toEqual([]);
      expect(splitAuthors('')).toEqual([]);
    });
  });

  describe('bibtexKey', () => {
    it('builds surname+year+first meaningful title word', () => {
      expect(bibtexKey(record())).toBe('liang2025integrative');
    });

    it('degrades gracefully with no authors, year or title', () => {
      expect(bibtexKey(record({ authors: null, year: null, title: null }))).toBe('anonnduntitled');
    });
  });

  describe('toBibtex', () => {
    it('joins authors with " and " as BibTeX requires', () => {
      expect(toBibtex(record())).toContain('author = {Liang L and Liang H and He M}');
    });

    it('omits fields the record does not have', () => {
      const out = toBibtex(record({ journal: null }, { doi: null, pmid: null }));
      expect(out).not.toContain('journal =');
      expect(out).not.toContain('doi =');
      expect(out).not.toContain('pmid =');
    });

    it('leaves no trailing comma on the final field', () => {
      const lines = toBibtex(record()).split('\n');
      const lastField = lines[lines.length - 2];
      expect(lastField.endsWith(',')).toBe(false);
    });

    it('opens and closes the entry', () => {
      const out = toBibtex(record());
      expect(out.startsWith('@article{')).toBe(true);
      expect(out.endsWith('}')).toBe(true);
    });
  });

  describe('toRis', () => {
    it('emits one AU line per author', () => {
      const lines = toRis(record()).split('\n').filter((l) => l.startsWith('AU  - '));
      expect(lines).toEqual(['AU  - Liang L', 'AU  - Liang H', 'AU  - He M']);
    });

    it('strips embedded HTML out of the abstract', () => {
      const out = toRis(record());
      expect(out).toContain('AB  - Background Some text.');
      expect(out).not.toContain('<h4>');
    });

    it('starts with TY and ends with ER', () => {
      const out = toRis(record());
      expect(out.startsWith('TY  - JOUR')).toBe(true);
      expect(out.trimEnd().endsWith('ER  -')).toBe(true);
    });
  });
});
