import {
  FALLBACK_SCHEMA_VERSION,
  SCHEMA_CHANGELOG_URL,
  schemaExampleUrl,
  schemaFileUrl,
  schemaReleaseUrl,
  schemaVocabUrl,
  versionNumber,
} from './schema-links';

describe('schema links', () => {
  it('adds exactly one v prefix, whichever spelling it is given', () => {
    // The folder on disk is "v1.1.0". /api/stats reports "v1.1.0" too -- it reads schema/CURRENT
    // verbatim -- while FALLBACK_SCHEMA_VERSION is bare. Both have to land on the same URL: an
    // earlier version of this file assumed the API stripped the v, so every page using the live
    // version linked schema/releases/vv1.1.0 and 404'd, which is exactly the trust problem these
    // links exist to fix.
    const expected =
      'https://github.com/BioComputingUP/dome-ml-observatory/tree/main/schema/releases/v1.1.0';
    expect(schemaReleaseUrl('1.1.0')).toBe(expected);
    expect(schemaReleaseUrl('v1.1.0')).toBe(expected);
  });

  it('normalises a version for display so a template can prefix it safely', () => {
    expect(versionNumber('v1.1.0')).toBe('1.1.0');
    expect(versionNumber('1.1.0')).toBe('1.1.0');
    expect(versionNumber()).toBe(FALLBACK_SCHEMA_VERSION);
  });

  it('never doubles the v on any of the file helpers either', () => {
    for (const url of [
      schemaFileUrl('v1.1.0'),
      schemaExampleUrl('v1.1.0'),
      schemaVocabUrl('v1.1.0'),
    ]) {
      expect(url).toContain('/releases/v1.1.0');
      expect(url).not.toContain('vv');
    }
  });

  it('points folders at tree/main and files at blob/main', () => {
    expect(schemaReleaseUrl('1.1.0')).toContain('/tree/main/');
    expect(schemaVocabUrl('1.1.0')).toContain('/tree/main/');
    expect(schemaFileUrl('1.1.0')).toContain('/blob/main/');
    expect(schemaExampleUrl('1.1.0')).toContain('/blob/main/');
    expect(SCHEMA_CHANGELOG_URL).toContain('/blob/main/');
  });

  it('names the files a release actually contains', () => {
    expect(schemaFileUrl('1.1.0')).toMatch(/\/v1\.1\.0\/ai-ml-landscape\.schema\.json$/);
    expect(schemaExampleUrl('1.1.0')).toMatch(/\/v1\.1\.0\/ai-ml-landscape\.example\.json$/);
    expect(schemaVocabUrl('1.1.0')).toMatch(/\/v1\.1\.0\/vocab$/);
    expect(SCHEMA_CHANGELOG_URL).toMatch(/\/schema\/CHANGELOG\.md$/);
  });

  it('tracks a later version without any change here', () => {
    // The whole point of building the URL from the live version: a schema bump moves these links
    // on its own, so there is nothing to forget.
    expect(schemaReleaseUrl('2.0.0')).toContain('/schema/releases/v2.0.0');
  });

  it('falls back to the current release when the API has not answered', () => {
    expect(schemaReleaseUrl()).toBe(schemaReleaseUrl(FALLBACK_SCHEMA_VERSION));
  });
});
