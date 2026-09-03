import {
  FALLBACK_SCHEMA_VERSION,
  SCHEMA_CHANGELOG_URL,
  schemaExampleUrl,
  schemaFileUrl,
  schemaReleaseUrl,
  schemaVocabUrl,
} from './schema-links';

describe('schema links', () => {
  it('adds the v prefix the release folders use and the API does not report', () => {
    // /api/stats says "1.1.0"; the folder on disk is "v1.1.0". Getting this wrong 404s every link
    // on the download pages, which is exactly the trust problem these links exist to fix.
    expect(schemaReleaseUrl('1.1.0')).toBe(
      'https://github.com/BioComputingUP/dome-ml-observatory/tree/main/schema/releases/v1.1.0',
    );
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
