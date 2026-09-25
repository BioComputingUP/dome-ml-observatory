import { loadSynonymTable, synonymsFor } from './search-synonyms';

describe('search synonyms', () => {
  it('loads the published vocabulary', () => {
    expect(loadSynonymTable().size).toBeGreaterThan(50);
  });

  it('maps an acronym to its spelled-out name and back, case-insensitively', () => {
    expect(synonymsFor('svm')).toContain('support vector machine');
    expect(synonymsFor('SVM')).toContain('support vector machine');
    expect(synonymsFor('Support Vector Machine')).toContain('SVM');
    expect(synonymsFor('gnn')).toContain('graph neural network');
    expect(synonymsFor('large language model')).toContain('LLM');
  });

  it('knows the acronyms the seed lacks', () => {
    expect(synonymsFor('gwas')).toContain('genome-wide association study');
    expect(synonymsFor('nlp')).toContain('natural language processing');
  });

  it('leaves ambiguous and generic spellings out', () => {
    // GBM is glioblastoma multiforme far more often than gradient boosting in this corpus; MDS is
    // a syndrome, LOF loss of function, RF two letters, LDA two different methods.
    for (const term of ['gbm', 'mds', 'lof', 'crf', 'rf', 'ae', 'lda', 'cart', 'glove']) {
      expect(synonymsFor(term)).toEqual([]);
    }
    expect(synonymsFor('gradient boosting')).not.toContain('GBM');
    expect(synonymsFor('transformer')).not.toContain('attention-based model');
    expect(synonymsFor('word embedding')).not.toContain('GloVe');
  });

  it('returns nothing for an ordinary word', () => {
    expect(synonymsFor('dome')).toEqual([]);
    expect(synonymsFor('random')).toEqual([]);
  });
});
