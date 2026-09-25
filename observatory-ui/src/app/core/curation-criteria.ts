/**
 * Links from a screening or enrichment verdict to the exact criteria and prompt that produced it.
 * Both live in the pipeline repository, dome-ml-observatory-triage: `curation_criteria/CRITERIA.md`
 * is the ruleset, `prompts/<name>.<version>.txt` the prompt built around it.
 *
 * A record carries the sha256 of the criteria it was classified against
 * (`llm_classification.ruleset_sha256`) and the prompt version (`prompt_version`). The pins below
 * map each to a commit holding exactly that file, so a record links to the criteria it was actually
 * judged by rather than whatever the repository's main branch holds today. A hash or version with
 * no pin -- the criteria re-versioned and the pin not yet added -- falls back to main, so a link
 * never breaks, it only stops being exact.
 *
 * Add a pin whenever the pipeline's `prompts/PROMPT_HASHES.json` gains a new `criteria_sha256` or
 * prompt version: its refresh-cycle skill's post-load checklist says so. The backend's JSON-LD
 * keeps the same pins (observatory-ws/src/metadata/metadata-urls.ts); change the two together.
 */

export const PIPELINE_REPOSITORY = 'https://github.com/BioComputingUP/dome-ml-observatory-triage';

/** The criteria the corpus is classified against today, by `criteria_sha256`. */
export const CURRENT_CRITERIA_SHA256 = 'bd9d66dd892e6c0a231ac59ba102543ea6caa89db67fc1b914795501f4f60449';

// CRITERIA.md and both v1/e1 prompts are unchanged since the pipeline repository's first commit.
const FIRST_COMMIT = '8bd471bada901a6eb2d23ebc033ce3b0462dd062';

/** criteria_sha256 -> a commit where curation_criteria/CRITERIA.md has exactly that hash. */
const CRITERIA_PINS: Record<string, string> = {
  [CURRENT_CRITERIA_SHA256]: FIRST_COMMIT,
};

/** prompt_version -> a commit holding that prompt file as it was run. */
const PROMPT_PINS: Record<string, string> = {
  v1: FIRST_COMMIT,
  e1: FIRST_COMMIT,
};

const PROMPT_FILES: Record<'classification' | 'enrichment', string> = {
  classification: 'classification_system_message',
  enrichment: 'enrichment_system_message',
};

/** The criteria a record was screened against: pinned when its hash is known, else current. */
export function criteriaUrl(sha256?: string | null): string {
  const ref = (sha256 && CRITERIA_PINS[sha256]) || 'main';
  return `${PIPELINE_REPOSITORY}/blob/${ref}/curation_criteria/CRITERIA.md`;
}

/** The prompt file for a pass and version, or the prompts folder when the version is unknown. */
export function promptUrl(pass: 'classification' | 'enrichment', version?: string | null): string {
  if (!version || !/^[a-z]?\d+$/i.test(version)) return `${PIPELINE_REPOSITORY}/tree/main/prompts`;
  const ref = PROMPT_PINS[version] ?? 'main';
  return `${PIPELINE_REPOSITORY}/blob/${ref}/prompts/${PROMPT_FILES[pass]}.${version}.txt`;
}
