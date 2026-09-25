import { TestBed } from '@angular/core/testing';
import { StatusBadge } from './status-badge';
import { AiMlRecord } from '../../core/record.model';

function record(access: AiMlRecord['source']['access']): AiMlRecord {
  return {
    _id: 'pid-1',
    schema_version: '1.6.0',
    identifiers: { pmid: '34265844', pmcid: 'PMC8371605', doi: '10.1038/s41586-021-03819-2', epmc_id: '34265844', dome_registry: null, bioai_repo: null, huggingface: null, kaggle: null, zenodo: null },
    publication_metadata: { title: 't', abstract: null, authors: null, year: 2021, journal: 'Nature', citation_count: null },
    source: { abstract_source: null, metadata_repair_sources: null, epmc_source: 'MED', access },
    content_filters: { mesh_headings: [], pub_types: [], keywords_author: [], domain_tier1: null, domain_tier2: [], domain_tier3: [], learning_paradigm: [], model_family: [], model_type: [] },
    llm_classification: { provider: null, model_tier: null, model_id: null, mode: null, classification: 'positive', rationale: null, prompt_version: null, ruleset_sha256: null, batch_id: null, timestamp: null },
    llm_enrichment: { provider: null, model_tier: null, model_id: null, mode: null, rationale: null, prompt_version: null, ruleset_sha256: null, batch_id: null, timestamp: null, vocab_violations: null, parse_status: null, input_tokens: null, output_tokens: null, cache_hit_tokens: null, parse_fallback_used: null },
  };
}

function chips(rec: AiMlRecord, context: 'card' | 'record'): string[] {
  const fixture = TestBed.createComponent(StatusBadge);
  fixture.componentRef.setInput('record', rec);
  fixture.componentRef.setInput('context', context);
  fixture.detectChanges();
  const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.badge-chip');
  return Array.from(items, (li) => li.textContent?.trim() ?? '');
}

describe('StatusBadge', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StatusBadge] }).compileComponents();
  });

  describe('card context', () => {
    it('shows "Full text" when the flag is set', () => {
      expect(chips(record({ open_access: true, license: 'cc by', fulltext_available: true }), 'card')).toContain('Full text');
    });

    it('never tells an open-access paper it has no full text', () => {
      // AlphaFold 2's shape on 2026-09-25: open access, cc by, a PMCID, and the flag false.
      const shown = chips(record({ open_access: true, license: 'cc by', fulltext_available: false }), 'card');
      expect(shown).toContain('Open access');
      expect(shown).not.toContain('No full text');
    });

    it('says "No full text" only when the paper is neither full text nor open access', () => {
      expect(chips(record({ open_access: false, license: null, fulltext_available: false }), 'card')).toContain('No full text');
    });
  });

  it('record context keeps open access and full text as separate chips', () => {
    const shown = chips(record({ open_access: true, license: 'cc by', fulltext_available: true }), 'record');
    expect(shown).toContain('Open access');
    expect(shown).toContain('Full text');
  });
});
