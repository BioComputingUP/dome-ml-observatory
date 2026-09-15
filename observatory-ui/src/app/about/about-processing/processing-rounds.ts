/**
 * The processing rounds behind the corpus, oldest first. A round's entry is appended by hand when
 * it completes -- the sister repository's `processing-log` skill does it -- and every figure in it
 * comes from that repository's `moros_pipeline/scripts/round_summary.py`, read off the database
 * itself. A card therefore states what its own round did; what the corpus holds now stays live, in
 * the page's stat pills and the enrichment coverage bar.
 */

export interface RoundOutcome {
  positive: number;
  negative: number;
  undeterminable: number;
}

export interface ClassificationRound {
  /** The badge number: rounds are numbered in the order they ran. */
  number: number;
  title: string;
  /** First and last classification timestamp in the round, as ISO dates (UTC). */
  started: string;
  finished: string;
  /** The Europe PMC query, in words. */
  searchSpace: string;
  /** Which publications the round fetched, in words. */
  window: string;
  /** What was screened, in one sentence. */
  processed: string;
  model: string;
  promptVersion: string;
  outcome: RoundOutcome;
}

export interface EnrichmentRound {
  number: number;
  title: string;
  started: string;
  finished: string;
  /** Which positive records were tagged, in words. */
  cohort: string;
  model: string;
  promptVersion: string;
  records: number;
}

const CORE_SEARCH_SPACE =
  '"Artificial intelligence" and "machine learning" as search terms, deduplicated across Europe ' +
  "PMC's full index of roughly 50 million articles.";

export const CLASSIFICATION_ROUNDS: readonly ClassificationRound[] = [
  {
    number: 1,
    title: 'Initial classification batch',
    started: '2026-08-27',
    finished: '2026-08-28',
    searchSpace: CORE_SEARCH_SPACE,
    window: 'Every publication year from 1950 to 2026, as indexed by Europe PMC on 27 August 2026.',
    processed:
      '827,061 publications screened by the model, together with the 6,179 publications of the ' +
      'hand-annotated expert benchmark, added on 3 September 2026 with their benchmark labels.',
    model: 'DeepSeek V4 Flash',
    promptVersion: 'v1',
    outcome: { positive: 358_865, negative: 467_445, undeterminable: 6_930 },
  },
];

export const ENRICHMENT_ROUNDS: readonly EnrichmentRound[] = [];

export function roundTotal(outcome: RoundOutcome): number {
  return outcome.positive + outcome.negative + outcome.undeterminable;
}
