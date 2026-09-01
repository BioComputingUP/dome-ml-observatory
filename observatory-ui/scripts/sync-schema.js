#!/usr/bin/env node
/**
 * Copies generated artefacts out of the repo-root `schema/` folder into observatory-ui's assets,
 * so the app can fetch them as static files:
 *
 *   schema/releases/$(CURRENT)/vocab/*.json  ->  src/assets/vocab/
 *   schema/stats/facet-stats.json            ->  src/assets/data/facet-stats.json
 *
 * `schema/` (not this folder) is the source of truth -- never hand-edit the copies this script
 * writes; both destinations are gitignored. Run automatically before every build/serve/test via
 * package.json's `pre*` hooks; run manually with `npm run sync-schema` after the
 * `schema-version` skill cuts a new release, or after regenerating facet stats with
 * `python3 schema/generate_facet_stats.py`.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_DIR = path.join(REPO_ROOT, 'schema');
const VOCAB_DEST_DIR = path.join(__dirname, '..', 'src', 'assets', 'vocab');
const STATS_SRC = path.join(SCHEMA_DIR, 'stats', 'facet-stats.json');
const STATS_DEST = path.join(__dirname, '..', 'src', 'assets', 'data', 'facet-stats.json');

function main() {
  const current = fs.readFileSync(path.join(SCHEMA_DIR, 'CURRENT'), 'utf8').trim();
  const srcVocabDir = path.join(SCHEMA_DIR, 'releases', current, 'vocab');

  if (!fs.existsSync(srcVocabDir)) {
    console.error(`sync-schema: no vocab/ folder at ${srcVocabDir} (CURRENT=${current})`);
    process.exit(1);
  }

  fs.rmSync(VOCAB_DEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(VOCAB_DEST_DIR, { recursive: true });

  const files = fs.readdirSync(srcVocabDir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    fs.copyFileSync(path.join(srcVocabDir, file), path.join(VOCAB_DEST_DIR, file));
  }
  console.log(`sync-schema: copied ${files.length} vocab file(s) from schema/${current} -> src/assets/vocab/`);

  if (fs.existsSync(STATS_SRC)) {
    fs.mkdirSync(path.dirname(STATS_DEST), { recursive: true });
    fs.copyFileSync(STATS_SRC, STATS_DEST);
    console.log('sync-schema: copied facet-stats.json -> src/assets/data/');
  } else {
    // Not fatal: the app degrades to no facet counts. Regenerate with
    // `python3 schema/generate_facet_stats.py`.
    console.warn(`sync-schema: WARNING no facet stats at ${STATS_SRC} -- search facets will show no counts`);
  }
}

main();
