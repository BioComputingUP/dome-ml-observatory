import { escapeHtml, markTerms, snippetAround } from './highlight';

describe('markTerms', () => {
  it('marks a word and its inflections, case-insensitively, as whole words', () => {
    expect(markTerms('Cell types and cellular states', ['cell'])).toBe(
      '<mark>Cell</mark> types and <mark>cellular</mark> states',
    );
  });

  it('marks a phrase across a hyphen and prefers the longest term', () => {
    expect(markTerms('a random-forest and a random walk', ['random forest', 'random'])).toBe(
      'a <mark>random-forest</mark> and a <mark>random</mark> walk',
    );
  });

  it('never marks inside a tag or an entity', () => {
    // "em" would match the tag name and "amp" the entity if either were treated as text.
    expect(markTerms('<em>In vitro</em> amp &amp; ampere', ['em', 'amp'])).toBe(
      '<em>In vitro</em> <mark>amp</mark> &amp; <mark>ampere</mark>',
    );
  });

  it('leaves the text alone with no terms', () => {
    expect(markTerms('unchanged', [])).toBe('unchanged');
  });
});

describe('escapeHtml', () => {
  it('escapes what an abstract really contains', () => {
    expect(escapeHtml('P<0.05 & "sig"')).toBe('P&lt;0.05 &amp; &quot;sig&quot;');
  });
});

describe('snippetAround', () => {
  const words = Array.from({ length: 80 }, (_, i) => `word${i}`);
  const text = [...words.slice(0, 60), 'alphafold', ...words.slice(60)].join(' ');

  it('windows around a late first hit, with ellipses on both cut sides', () => {
    const snippet = snippetAround(text, ['alphafold'], 120);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('alphafold');
    expect(snippet.length).toBeLessThanOrEqual(122);
  });

  it('keeps the start when the hit is early or absent', () => {
    expect(snippetAround(text, ['word1'], 120).startsWith('word0 word1')).toBe(true);
    expect(snippetAround(text, ['nothing'], 120).startsWith('word0')).toBe(true);
  });

  it('returns short text untouched', () => {
    expect(snippetAround('short', ['short'], 240)).toBe('short');
  });
});
