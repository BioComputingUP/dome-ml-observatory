import { searchHighlightTerms } from './search-terms';

describe('searchHighlightTerms', () => {
  it('splits words, keeps a quoted phrase whole, and drops the star and single characters', () => {
    expect(searchHighlightTerms('"random forest" neuro* T cell.')).toEqual(['random forest', 'neuro', 'cell']);
  });

  it('adds what the API also searched, without repeating a spelling', () => {
    expect(
      searchHighlightTerms('svm SVM', [{ term: 'svm', alternatives: ['support vector machine', 'SVC'] }]),
    ).toEqual(['svm', 'support vector machine', 'SVC']);
  });

  it('is empty for no query', () => {
    expect(searchHighlightTerms(undefined)).toEqual([]);
    expect(searchHighlightTerms('')).toEqual([]);
  });
});
