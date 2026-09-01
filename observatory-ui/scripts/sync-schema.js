#!/usr/bin/env node
/**
 * Copies generated artefacts out of the repo-root `schema/` folder into observatory-ui's assets,
 * so the app can fetch them as static files:
 *
 *   schema/releases/$(CURRENT)/vocab/*.json  ->  src/assets/vocab/
 *
 * `schema/` (not this folder) is the source of truth -- never hand-edit the copy this script
 * writes; the destination is gitignored. Run automatically before every build/serve/test via
 * package.json's `pre*` hooks; run manually with `npm run sync-schema` after the
 * `schema-version` skill cuts a new release.
 *
 * Facet/corpus stats are NOT synced here (Phase 7 onward): observatory-ui reads them live from
 * GET /api/stats instead of a static file -- see RecordsService.getFacetStats() and
 * internal/ROADMAP.md's Phase 7 entry. schema/stats/facet-stats.json still exists and is still
 * written by schema/generate_facet_stats.py (its non-API default mode, for anyone regenerating it
 * offline against the dev fixture), it's just no longer a UI input.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_DIR = path.join(REPO_ROOT, 'schema');
const VOCAB_DEST_DIR = path.join(__dirname, '..', 'src', 'assets', 'vocab');

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
}

main();
