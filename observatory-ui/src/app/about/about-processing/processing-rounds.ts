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
  {
    number: 2,
    title: 'Incremental update',
    started: '2026-09-03',
    finished: '2026-09-03',
    searchSpace: CORE_SEARCH_SPACE,
    window: 'First published from 1 January to 3 September 2026 and not yet in the corpus.',
    processed: '13,476 publications new to the corpus, fetched from Europe PMC on 3 September 2026.',
    model: 'DeepSeek V4 Flash',
    promptVersion: 'v1',
    outcome: { positive: 7_369, negative: 6_058, undeterminable: 49 },
  },
  {
    number: 3,
    title: 'Incremental update',
    started: '2026-09-15',
    finished: '2026-09-15',
    searchSpace: CORE_SEARCH_SPACE,
    window:
      'First indexed by Europe PMC from 3 to 10 September 2026, and papers dated after 3 September, ' +
      'not yet in the corpus.',
    processed:
      '7,342 publications new to the corpus, fetched from Europe PMC on 15 September 2026; the ' +
      '6,215 with an abstract were classified and added.',
    model: 'DeepSeek V4.1 Flash',
    promptVersion: 'v1',
    outcome: { positive: 1_791, negative: 4_416, undeterminable: 8 },
  },
];

export const ENRICHMENT_ROUNDS: readonly EnrichmentRound[] = [
  {
    number: 1,
    title: 'Four journals',
    started: '2026-09-03',
    finished: '2026-09-03',
    cohort: 'Positive records in Bioinformatics, Nature, Science and Cell.',
    model: 'DeepSeek V4 Flash',
    promptVersion: 'e1',
    records: 3_332,
  },
  {
    number: 2,
    title: 'Positives from classification round 3',
    started: '2026-09-15',
    finished: '2026-09-15',
    cohort: '200 of the positive records added in classification round 3.',
    model: 'DeepSeek V4.1 Flash',
    promptVersion: 'e1',
    records: 200,
  },
];

/** Documents removed from the corpus after a round: the rounds above say what each round
 *  processed, and what the corpus holds now is those totals less these. */
export interface Correction {
  number: number;
  title: string;
  date: string;
  /** Documents removed. */
  documents: number;
  why: string;
}

export const CORRECTIONS: readonly Correction[] = [];

export function roundTotal(outcome: RoundOutcome): number {
  return outcome.positive + outcome.negative + outcome.undeterminable;
}
