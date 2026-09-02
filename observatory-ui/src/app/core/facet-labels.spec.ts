import { modelTypeLabel, pubTypeLabel, sentenceCase } from './facet-labels';

describe('facet-labels', () => {
  describe('modelTypeLabel', () => {
    it('capitalises a plain lowercase term', () => {
      expect(modelTypeLabel('random forest')).toBe('Random forest');
      expect(modelTypeLabel('support vector machine')).toBe('Support vector machine');
      expect(modelTypeLabel('convolutional neural network')).toBe('Convolutional neural network');
    });

    it('leaves a leading single-letter-hyphen method name unchanged', () => {
      expect(modelTypeLabel('k-means')).toBe('k-means');
      expect(modelTypeLabel('k-nearest neighbors')).toBe('k-nearest neighbors');
      expect(modelTypeLabel('t-SNE')).toBe('t-SNE');
    });

    it('title-cases a multi-letter first word even before a hyphen', () => {
      expect(modelTypeLabel('one-class SVM')).toBe('One-class SVM');
    });

    it('leaves already-capitalised brand names, acronyms and eponyms unchanged', () => {
      expect(modelTypeLabel('XGBoost')).toBe('XGBoost');
      expect(modelTypeLabel('LightGBM')).toBe('LightGBM');
      expect(modelTypeLabel('CatBoost')).toBe('CatBoost');
      expect(modelTypeLabel('AdaBoost')).toBe('AdaBoost');
      expect(modelTypeLabel('DBSCAN')).toBe('DBSCAN');
      expect(modelTypeLabel('HDBSCAN')).toBe('HDBSCAN');
      expect(modelTypeLabel('UMAP')).toBe('UMAP');
      expect(modelTypeLabel('BERT')).toBe('BERT');
      expect(modelTypeLabel('GPT')).toBe('GPT');
      expect(modelTypeLabel('U-Net')).toBe('U-Net');
      expect(modelTypeLabel('ResNet')).toBe('ResNet');
      expect(modelTypeLabel('Q-learning')).toBe('Q-learning');
      expect(modelTypeLabel('Gaussian process')).toBe('Gaussian process');
      expect(modelTypeLabel('Bayesian network')).toBe('Bayesian network');
    });

    it('capitalises the first word of a mid-string eponym', () => {
      expect(modelTypeLabel('naive Bayes')).toBe('Naive Bayes');
      expect(modelTypeLabel('hidden Markov model')).toBe('Hidden Markov model');
      expect(modelTypeLabel('latent Dirichlet allocation')).toBe('Latent Dirichlet allocation');
    });

    it('handles a free-text value not in the 76-term seed list', () => {
      expect(modelTypeLabel('custom ensemble stacker')).toBe('Custom ensemble stacker');
    });

    it('returns falsy input unchanged', () => {
      expect(modelTypeLabel('')).toBe('');
    });
  });

  describe('sentenceCase', () => {
    it('capitalises the first character only', () => {
      expect(sentenceCase('supervised')).toBe('Supervised');
      expect(sentenceCase('ensemble learning')).toBe('Ensemble learning');
    });

    it('leaves a term whose first letter is already capitalised unchanged', () => {
      expect(sentenceCase('AI agent')).toBe('AI agent');
    });
  });

  describe('pubTypeLabel', () => {
    it('maps a curated allowlist entry', () => {
      expect(pubTypeLabel('Journal Article')).toBe('Journal article');
      expect(pubTypeLabel('Systematic Review')).toBe('Systematic review');
    });

    it('falls back to the raw value for anything not in the allowlist', () => {
      expect(pubTypeLabel('research-article')).toBe('research-article');
    });
  });
});
