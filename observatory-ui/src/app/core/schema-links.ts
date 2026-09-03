/**
 * Where the published record schema actually lives.
 *
 * The schema is what makes the corpus reusable by anyone who did not build it, so every page that
 * names a schema version should be able to hand the reader the field definitions rather than ask
 * them to take the version number on trust.
 *
 * `schema/releases/vX.Y.Z/` is immutable once published (see `schema/README.md`), which is what
 * makes these URLs safe to link: a release folder never changes shape or disappears.
 *
 * **Version handling.** The release folder carries a `v` (`v1.1.0`), and so does the version
 * `/api/stats` reports, because the API reads it straight out of `schema/CURRENT`. An earlier
 * comment here claimed the API stripped it; it does not, and every helper adding a `v` on top of
 * one that was already there produced `schema/releases/vv1.1.0` on every page that used the live
 * version -- a 404 in each case. So `versionNumber` below normalises first and the helpers append
 * exactly one `v`, which makes them correct for either spelling. Building the URL from the live
 * version rather than hardcoding one is what lets these links survive a schema bump untouched --
 * the `schema-version` skill cuts the new release folder before it moves `CURRENT`, so the folder
 * always exists by the time the API starts naming it.
 *
 * Note the repository is private at time of writing, so these links 404 for anyone outside the
 * organisation. That is a GitHub-side setting, not something to paper over here with placeholder
 * text -- the links are correct and start working the moment the repository is made public.
 */

/** GitHub tree root for the repository. Files hang off `blob/main`, folders off `tree/main`. */
const REPO = 'https://github.com/BioComputingUP/dome-ml-observatory';

/**
 * Schema version to fall back on when `/api/stats` has not answered yet (or at all).
 *
 * Mirrors `FALLBACK_SCHEMA_VERSION` in `observatory-ws/src/common/schema-version.ts`, which reads
 * `schema/CURRENT` at boot. Kept in sync by hand -- the `schema-version` skill names both files.
 *
 * Stored bare, without the `v`, so it is the same shape `versionNumber` hands back. Anything that
 * displays a version decides for itself whether to prefix it.
 */
export const FALLBACK_SCHEMA_VERSION = '1.1.0';

/**
 * A version as a bare number, whichever way it arrived -- `v1.1.0` and `1.1.0` both give `1.1.0`.
 *
 * The single place that knows the `v` is optional. Use it before displaying a version as well as
 * before building a URL from one, so a page never renders `vv1.1.0`.
 */
export function versionNumber(version: string = FALLBACK_SCHEMA_VERSION): string {
  return version.replace(/^v/, '');
}

/** The release folder: schema, example record, changelog-adjacent vocabularies, all in one place. */
export function schemaReleaseUrl(version: string = FALLBACK_SCHEMA_VERSION): string {
  return `${REPO}/tree/main/schema/releases/v${versionNumber(version)}`;
}

/** The JSON Schema itself -- draft-07, every field carrying its own description. */
export function schemaFileUrl(version: string = FALLBACK_SCHEMA_VERSION): string {
  return `${REPO}/blob/main/schema/releases/v${versionNumber(version)}/ai-ml-landscape.schema.json`;
}

/** One real record from the corpus, not a fabricated sample. */
export function schemaExampleUrl(version: string = FALLBACK_SCHEMA_VERSION): string {
  return `${REPO}/blob/main/schema/releases/v${versionNumber(version)}/ai-ml-landscape.example.json`;
}

/** The three controlled vocabularies the enrichment fields draw their terms from. */
export function schemaVocabUrl(version: string = FALLBACK_SCHEMA_VERSION): string {
  return `${REPO}/tree/main/schema/releases/v${versionNumber(version)}/vocab`;
}

/** Every field and vocabulary change across versions, each with its migration note. */
export const SCHEMA_CHANGELOG_URL = `${REPO}/blob/main/schema/CHANGELOG.md`;
