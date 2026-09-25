import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { currentReleaseDir } from '../common/schema-version';

/**
 * Other spellings of a search term, so a paper is found however its authors wrote the method.
 *
 * Measured against the live positives (2026-09-25): 12,695 papers say "support vector machine"
 * and never "SVM", 4,849 the reverse; 1,751 say "graph neural network" without "GNN"; 1,719
 * "large language model" without "LLM". Someone typing the acronym was missing a third of the
 * papers on the method.
 *
 * The table comes from the published vocabulary -- schema/releases/<CURRENT>/vocab/
 * model-type-seed.json, canonical term plus aliases, the same file the enrichment pass normalises
 * against -- with a short list of acronyms the seed does not carry. Every pair is bidirectional.
 * What is deliberately left out:
 *  - anything under three characters (RF, AE, GP, ML, DL): too many other meanings;
 *  - acronyms that mean something else in biomedical text (GBM is glioblastoma multiforme far more
 *    often than gradient boosting, MDS myelodysplastic syndrome, LOF loss of function, ...);
 *  - aliases that are a description rather than a name ("mixture model", "topic modeling"), which
 *    would widen a search for a specific method into its whole family;
 *  - aliases with a disambiguating parenthesis ("LDA (topic model)"), which nobody types.
 * Lookups are case-insensitive; the spellings returned keep the vocabulary's case, which is what
 * records.query.ts needs to tell an acronym ("SVM", matched whole and case-sensitively) from a
 * phrase.
 */

const MIN_LENGTH = 3;

const EXCLUDED = new Set(
  [
    'gbm',
    'cart',
    'lca',
    'lpa',
    'mds',
    'crf',
    'lof',
    'glove',
    'mixture model',
    'topic modeling',
    'probabilistic graphical model',
    'density-based clustering',
    'attention-based model',
    'evolutionary algorithm',
    'genetic programming',
    'maximum entropy',
    'flow-based model',
    'nearest neighbor classifier',
  ].map((s) => s.toLowerCase()),
);

/** Acronym-phrase pairs the seed vocabulary lacks. Each must be unambiguous in an AI/ML methods
 *  corpus drawn from the biomedical literature -- so no PPI (proton pump inhibitor), no CT. */
const EXTRA_GROUPS: string[][] = [
  ['NLP', 'natural language processing'],
  ['XAI', 'explainable artificial intelligence', 'explainable AI'],
  ['SHAP', 'Shapley additive explanations'],
  ['AUC', 'area under the curve'],
  ['ROC', 'receiver operating characteristic'],
  ['MRI', 'magnetic resonance imaging'],
  ['EHR', 'electronic health record'],
  ['NER', 'named entity recognition'],
  ['QSAR', 'quantitative structure-activity relationship'],
  ['GWAS', 'genome-wide association study'],
  ['scRNA-seq', 'single-cell RNA sequencing'],
  ['MSA', 'multiple sequence alignment'],
];

interface SeedFile {
  terms?: { canonical?: string; aliases?: string[] }[];
}

const logger = new Logger('SearchSynonyms');

function usable(label: string): boolean {
  const trimmed = label.trim();
  return (
    trimmed.length >= MIN_LENGTH && !trimmed.includes('(') && !EXCLUDED.has(trimmed.toLowerCase())
  );
}

/** Lower-cased spelling -> the other spellings of the same term, in vocabulary order. */
function buildTable(groups: string[][]): Map<string, string[]> {
  const table = new Map<string, string[]>();
  for (const group of groups) {
    const labels = [...new Set(group.map((l) => l.trim()).filter(usable))];
    for (const label of labels) {
      const key = label.toLowerCase();
      const others = labels.filter((other) => other.toLowerCase() !== key);
      if (!others.length) continue;
      const existing = table.get(key) ?? [];
      table.set(key, [...existing, ...others.filter((o) => !existing.includes(o))]);
    }
  }
  return table;
}

function seedGroups(dir: string | undefined): string[][] {
  const path = dir ? join(dir, 'vocab', 'model-type-seed.json') : undefined;
  if (!path || !existsSync(path)) {
    logger.warn(
      `model-type-seed.json not found (looked in ${dir ?? 'nowhere: schema/CURRENT not found'}) -- search synonyms come from the built-in list only.`,
    );
    return [];
  }
  const seed = JSON.parse(readFileSync(path, 'utf8')) as SeedFile;
  return (seed.terms ?? [])
    .map((term) => [term.canonical, ...(term.aliases ?? [])].filter((l): l is string => Boolean(l)))
    .filter((group) => group.length > 1);
}

/** Built once per process, from the release schema/CURRENT names. Exposed for tests. */
export function loadSynonymTable(
  dir: string | undefined = currentReleaseDir(),
): Map<string, string[]> {
  return buildTable([...seedGroups(dir), ...EXTRA_GROUPS]);
}

let table: Map<string, string[]> | undefined;

/**
 * The other spellings of `term`, or [] when it is not a vocabulary term. `term` is a bare word or
 * a whole quoted phrase, exactly as typed ("svm", "Support Vector Machine").
 */
export function synonymsFor(term: string): string[] {
  table ??= loadSynonymTable();
  return table.get(term.trim().toLowerCase()) ?? [];
}
