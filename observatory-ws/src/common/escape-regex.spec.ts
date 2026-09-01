import { escapeRegex } from './escape-regex';

describe('escapeRegex', () => {
  it('escapes every regex metacharacter', () => {
    // One of each character the source pattern targets: . * + ? ^ $ { } ( ) | [ ] \
    expect(escapeRegex('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('leaves plain text untouched', () => {
    expect(escapeRegex('transformer models')).toBe('transformer models');
  });

  it('neutralises a ReDoS-shaped input instead of leaving it live', () => {
    const evil = '(a+)+$';
    const escaped = escapeRegex(evil);
    // A literal match against the escaped pattern must not catastrophically backtrack -- if this
    // hangs, the escaping failed to do its job.
    expect(new RegExp(escaped).test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!')).toBe(
      false,
    );
  });

  it('produces a pattern that matches only the literal original string', () => {
    const input = 'C++ vs C#: 100% faster?';
    const re = new RegExp(escapeRegex(input));
    expect(re.test(input)).toBe(true);
    expect(re.test('C vs C: 100 faster')).toBe(false);
  });

  it('handles the empty string', () => {
    expect(escapeRegex('')).toBe('');
  });
});
