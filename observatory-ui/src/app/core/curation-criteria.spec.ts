import { CURRENT_CRITERIA_SHA256, PIPELINE_REPOSITORY, criteriaUrl, promptUrl } from './curation-criteria';

describe('curation criteria links', () => {
  it('pins the criteria a record was screened against to a commit holding exactly that file', () => {
    expect(criteriaUrl(CURRENT_CRITERIA_SHA256)).toBe(
      `${PIPELINE_REPOSITORY}/blob/8bd471bada901a6eb2d23ebc033ce3b0462dd062/curation_criteria/CRITERIA.md`,
    );
  });

  it('falls back to the current criteria for an unknown or missing hash, never a dead link', () => {
    const current = `${PIPELINE_REPOSITORY}/blob/main/curation_criteria/CRITERIA.md`;
    expect(criteriaUrl('f'.repeat(64))).toBe(current);
    expect(criteriaUrl(null)).toBe(current);
  });

  it('links each prompt version to its own file', () => {
    expect(promptUrl('classification', 'v1')).toBe(
      `${PIPELINE_REPOSITORY}/blob/8bd471bada901a6eb2d23ebc033ce3b0462dd062/prompts/classification_system_message.v1.txt`,
    );
    expect(promptUrl('enrichment', 'e1')).toBe(
      `${PIPELINE_REPOSITORY}/blob/8bd471bada901a6eb2d23ebc033ce3b0462dd062/prompts/enrichment_system_message.e1.txt`,
    );
    expect(promptUrl('classification', 'v2')).toContain('/blob/main/prompts/classification_system_message.v2.txt');
  });

  it('points at the prompts folder when the version is missing or not a version', () => {
    expect(promptUrl('classification', null)).toBe(`${PIPELINE_REPOSITORY}/tree/main/prompts`);
    expect(promptUrl('classification', '../../etc')).toBe(`${PIPELINE_REPOSITORY}/tree/main/prompts`);
  });
});
