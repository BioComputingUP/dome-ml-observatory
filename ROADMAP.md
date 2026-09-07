# Roadmap — DOME Observatory

What is still to build. The record of what has shipped and why lives in [AGENTS.md](AGENTS.md)
and in the code; this file is only the work ahead.

Last updated **2026-09-03**.

**Where things stand**: both apps are built, containerised and running against the MongoDB server
(`dome_observatory.Content`, MongoDB 4.2.25, **846,716 documents at `schema_version` 1.2.0**).
All three indexes are live — `_id_`, `class_year_id`, `positives_text`. **3,332 records are now
enriched** (see §1a). There is no Zenodo deposit and no CI; analytics are built but not yet
switched on (see §3).

The corpus changed materially on 2026-09-03 and this repository has not caught up with it yet —
see §1. In short: 6,179 human-curated and registry-confirmed records were merged in (they had been
the only records missing), every document gained a `source.decision_provenance`, and 98.11% of the
corpus now carries a real Europe PMC citation count. **Two pages still assert that every
classification is LLM-generated, and that is now false.**

---

## 1. Data refresh — reloading the corpus, and new classification / enrichment runs

The corpus turns over **6–12 times a year** and every cache in `observatory-ws` is sized around
that. **There is now a runbook**: the corpus pipeline's README in `dome-triage`, which replaced the
one-off manual Compass import on 2026-09-03. Every write there is dry-run by default, restricted to
an explicit allowlist of leaf field paths (so a refresh cannot blank a group it was not meant to
touch), and reversible from a rollback snapshot taken before the first batch. `verify_corpus.py`
asserts the corpus invariants against the live collection and prints the manual post-load
checklist below.

⚠️ **`mongoimport` does not work against this server**, despite being specified below and in
dome-triage's roadmap. Measured three times on 2026-09-03: it stalls at ~17% of a 21.4MB file,
reports `use of closed network connection`, exits non-zero, and prints `0 document(s) imported
successfully` — while the collection count had already risen by exactly 1,000. The loader uses
pymongo `ReplaceOne(upsert=True)` instead, which has identical upsert semantics, and treats the
collection count as the only honest authority. The same host took 811,036 pymongo bulk writes with
zero errors in the citation load.

**Upstream** is [`dome-triage`](https://github.com/BioComputingUP/dome-triage), not here. Two
different jobs:

- **Classification** (Step 23a) — adds new documents, may revise `llm_classification` on existing
  ones.
- **Enrichment** (Step 23b) — fills `content_filters`' six reserved fields and the whole
  `llm_enrichment` group on documents that *already exist*. Update in place by `_id`, never a
  re-import. **3,332 records are enriched as of 2026-09-03** — see §1a below; the search page's
  coverage banner reads this live and now reports a real number.

The staging chain that turns a classified CSV into loadable JSONL already exists and is tested in
`dome-triage/mongo_landscape_export/scripts/` (`filter_missing_rationale` → `add_pid_column` →
`drop_dead_columns` → `join_license` → `convert_to_jsonl`). `pid.py` mints a **deterministic
UUID5** from `pmcid > doi > pmid`, so the same paper always gets the same `_id` — that property is
what makes everything below possible.

**To build:**

- **An upsert loader, not drop-and-reimport.** Dropping `Content` destroys both indexes, and
  `positives_text` takes ~3 minutes of tokenising plus a 1.5GB collection read to rebuild — during
  which search silently degrades to the regex path.

  ```bash
  mongoimport --uri "$MONGODB_URI" --db dome_observatory --collection Content \
    --file output/ai_ml_landscape.jsonl --mode upsert --upsertFields _id
  ```

  Decide the field-level merge policy explicitly: a classification refresh must not blank an
  `llm_enrichment` group a later enrichment run has populated. `$set` of a whole document will
  decide that by accident if nobody decides it on purpose.

- **Fetch citation counts from Europe PMC before each load.** `publication_metadata.citation_count`
  is a required field in the schema and is null on every record — reserved but never populated.
  Europe PMC exposes counts per article, so the pull belongs in the staging chain alongside the
  existing licence join, before the JSONL is written. Cheapest point to fix it is a refresh that
  is happening anyway.

  **Done, 2026-09-03** — in `dome-triage`'s corpus pipeline. Verified live that
  `citedByCount` comes back in the cheap `resultType=lite` — the licence fetch needs `core`, this
  does not — and that `DOI:"…"` queries resolve records with no PMID, which is 67,985 of the
  corpus. So the fetch keys `pmid → doi → pmcid` and reaches effectively all of it. Counts land
  through a field-level `$set` on `publication_metadata.citation_count` rather than a reload, so
  the 2.98GB JSONL is not re-imported to populate one integer.

  Result: **830,689 of 846,716 documents (98.11%)** carry a real count. Yield by key was pmid
  99.6%, pmcid 100%, doi 80.7%; the doi shortfall is genuine Europe PMC coverage (Cochrane reviews,
  some preprints), not a query bug, and those records keep `citation_count: null`, which already
  means "not available". Sanity check on the top of the distribution: DESeq2 81,547, PRISMA 2020
  58,715, AlphaFold 2 34,984, LeCun/Bengio/Hinton 18,576.

  Two fields came with it, because a bare number that cannot be dated is not much better than a
  null: `citation_count_updated` (ISO-8601, when the count was fetched) and `citation_source`.
  A refresh then only re-fetches entries older than a chosen age, which is what keeps the monthly
  run cheap. `citations_desc` / `citations_asc` and the UI's "Most cited" option start doing real
  work the moment this lands, with no change on this side — but `citation_count` is not indexed,
  so a deep citation sort will be slow until it is. Measure before adding the index.

- **Schema v1.2.0 is live in the database and still needs cutting HERE.** ⚠️ The collection is
  already at `schema_version: "1.2.0"`, but `schema/releases/` still stops at v1.1.0 and
  `schema/CURRENT` still reads `v1.1.0`. Cut the release with the `schema-version` skill; the
  upstream reference copy of the exact shape is
  `dome-triage/mongo_landscape_export/schema/ai_ml_landscape.schema.json`.
  It is additive. Three new fields, no existing
  field changed or removed: `source.decision_provenance`, plus the two citation fields above.
  `llm_classification.classification` is deliberately left as the single queryable classification
  field, so the `positives_text` partial filter and `canUseTextIndex` in `records.query.ts` are
  untouched — that was the deciding argument against the alternative of a parallel `curation`
  group with its own classification field.

  `decision_provenance` takes exactly three values — `"llm"`, `"human_curated"`,
  `"registry_confirmed"` — and is never null. Live distribution: **llm 827,061 · human_curated
  5,960 · registry_confirmed 219**. The 827,061 pre-existing documents were set to `"llm"` by an
  in-place migration (37 seconds) rather than a reload.

  Two descriptions need rewriting rather than carrying forward. `llm_classification.rationale`
  currently reads *"Always LLM-generated — surface this fact to users, don't present it as a human
  judgement"*, which stops being true for 6,179 documents; it should say the rationale's origin
  is given by `source.decision_provenance`. And `classification`'s description quotes corpus
  counts of 355,569 / 464,603 / 6,923 — the pre-`filter_missing_rationale` figures, 34 records
  ahead of the live collection. Regenerate them, do not copy them.

- **⚠️ The curated set has ARRIVED, and two pages now assert something false.**
  Upstream had excluded every human-curated and registry-confirmed record from the corpus — 3,471
  human-confirmed positives, 378 of them DOME Registry entries, AlphaFold 2 among them. They were
  left out of LLM classification on purpose and then never merged back. The merge landed
  on 2026-09-03: **6,179 documents, total 833,240**, positives 355,558 → **358,865**.
  Searching the live corpus for AlphaFold now returns Jumper et al. 2021 as a registry-confirmed
  positive. Three consequences here, none of them optional, and all of them outstanding:

  - `observatory-ui/src/app/about/about-overview/about-overview.html:151` and
    `about-support/about-support.html:208` both state that every classification in the corpus is
    LLM-generated. **That is false as of 2026-09-03 for 6,179 records.** Highest priority here.
  - `AGENTS.md`'s guidance that records are *"not curator-reviewed; don't describe them as
    such"* has to change with them, or the next agent will faithfully reintroduce the false
    statement while fixing something else.
  - `shared/status-badge/` and `record/record.html` should show provenance. A registry-confirmed
    positive and a model's guess currently render identically, and making that visible is the
    single biggest user-facing gain available from any of this work.

- **Two things to do here now, before anything else in this section.** The load has already
  landed, so these are not preparation — they are catching up:
  1. Restart `observatory-ws`. `FacetsService` is boot-loaded with **no TTL**, so the ~6k new
     records' journals, MeSH terms and licences are not in the typeaheads yet. The other three
     caches are 24h TTL and will have aged out on their own.
  2. Re-run `python3 schema/generate_facet_stats.py --from-api <url>` and check `/api/stats`
     reconciles against 833,240.

  Then the schema release and the three UI items above.

- **Neither `positives_text` nor `canUseTextIndex` needed any change**, which was the deciding
  argument for the v1.2.0 design. A curated positive is `llm_classification.classification:
  "positive"` like any other, so it entered the partial text index on load and is searchable with
  no code change here at all. `citations_desc` / `citations_asc` likewise started returning real
  orderings the moment the counts landed. `publication_metadata.citation_count` is still
  **unindexed**, so a deep citation sort is a candidate for `class_citations_id` —
  the pipeline's `scripts/ensure_indexes.py --measure-citation-sort` times it against the real
  10,000-result window so that decision can be made on numbers. (Note the window is a
  `/api/records` browsing limit only — `/api/export` is unbounded and unaffected.)

- **The first enrichment merge is its own milestone**, not part of a routine refresh. It writes
  fields nothing has ever written, so run it against a copy first, verify a sample against the
  [vocabularies in the current schema release](schema/releases/v1.1.0/vocab/), then merge. The search page's enrichment-coverage
  banner reads its number live and starts reporting on its own once records land — no
  regeneration step, no code change.

- **An enrichment writer**, in `dome-triage`. **Not here** — `observatory-ws` is read-only by
  design and must never gain write credentials.

- **A post-refresh checklist.** New data is not visible until the service restarts:

  | | |
  |---|---|
  | `FacetsService` (journal / mesh / pub-type / licence typeaheads) | **boot-loaded, no TTL — a restart is required** |
  | `StatsService`, `CountService`, `JournalsService` | 24h TTL |

  Then re-run [`schema/generate_facet_stats.py`](schema/generate_facet_stats.py) `--from-api <url>`,
  check `/api/stats`, and cut a schema release with the `schema-version` skill if the shape
  changed — a new [`schema/releases/vX.Y.Z/`](schema/releases/) folder plus a
  [`CHANGELOG.md`](schema/CHANGELOG.md) entry, never an edit to a published one.

- **If the collection is ever dropped**, both indexes go with it. Recreate them:

  ```js
  db.Content.createIndex(
    { "publication_metadata.title": "text", "publication_metadata.abstract": "text",
      "publication_metadata.authors": "text" },
    { partialFilterExpression: { "llm_classification.classification": "positive" },
      weights: { "publication_metadata.title": 10, "publication_metadata.authors": 5,
                 "publication_metadata.abstract": 1 },
      name: "positives_text", background: true });

  db.Content.createIndex(
    { "llm_classification.classification": 1, "publication_metadata.year": -1, _id: 1 },
    { name: "class_year_id", background: true });
  ```

  The backend detects their absence at boot and falls back to the regex path, so nothing breaks —
  search just gets slow again.

- **Fix the double-encoded titles at ingestion.** Some `publication_metadata.title` values are
  stored as double-HTML-encoded markup (`&lt;i&gt;Halomonas elongata&lt;/i&gt;`) and render as
  literal text. The repair belongs in the dome-triage conversion step; a UI-side entity decode
  would mis-render titles that legitimately contain `<` or `>`.

## 1c. The licence facet was under-populated by 74,472 documents — fixed 2026-09-03

`source.access.license` is now populated on **100%** of the corpus: 589,798 carry a real licence
string and 256,918 were looked up and disclosed none. **Zero remain `null`**, which in this schema
means "never looked up" and is distinct from `""`.

It had been `null` on **74,472 documents**, and the cause was upstream key choice rather than
Europe PMC coverage: the original licence fetch was **pmid-keyed only**, so the 68,103 corpus
records with no pmid were unfetchable from the day it ran. They are now fetched by
`pmid -> doi -> pmcid`, the same three passes the citation fetch uses.

**What this means for the UI:** the licence facet has been understating coverage by ~9% of the
corpus, and the newest documents were the worst affected. The values are correct now, but
`FacetsService` is boot-loaded with no TTL — **the facet will keep serving the old distribution
until `observatory-ws` restarts.**

`open_access` moved on 104 documents (0.18% of those checked), applying the existing rule that
EPMC's freshly-fetched flag wins wherever a real lookup happened.

## 1b. The corpus is now refreshed incrementally, and grew on 2026-09-03

`dome-triage`'s corpus pipeline runs the refresh end to end and was exercised whole for the first
time on 2026-09-03: **833,240 → 846,716 documents**, +13,476 genuinely-new 2026 papers, with
positives 358,865 → **366,234**. The loop fetches only the Europe PMC windows a coverage ledger has
never covered, drops every record already carrying a corpus `_id`, classifies the remainder, and
upserts. Re-running it afterwards offers nothing already loaded.

**This changes the refresh assumption in §1.** There is now a runbook, it is idempotent, and it can
run monthly rather than 6–12 times a year. The post-refresh checklist below still applies in full —
in particular `FacetsService` is boot-loaded with no TTL, so **13,476 new documents' journals, MeSH
terms and licences are invisible until `observatory-ws` restarts**.

## 1a. Enrichment has landed — four journals, 3,332 records

**This is the first enrichment ever merged into the corpus.** Until 2026-09-03 the
`llm_enrichment` group and `content_filters`' six vocabulary fields were reserved-but-null on every
document, and the search page's enrichment-coverage banner reported zero.

| | |
|---|---|
| Enriched documents | **3,332** (of 846,716) |
| Journals | Bioinformatics (Oxford, England), Nature, Science (New York, N.Y.), Cell — positives only |
| `content_filters.domain_tier2` populated | 3,321 |
| Vocabulary violations | 4.1% of records, against a 6.81% trial baseline |
| Provider / prompt | `deepseek` flash, prompt `e1`, vocab `41db952f1511` |

**⚠️ A restart is required before any of this is visible in the UI.** `FacetsService` is
boot-loaded with no TTL, so the new `domain_tier1/2/3`, `learning_paradigm`, `model_family` and
`model_type` values do not appear in any typeahead until `observatory-ws` restarts.
`StatsService`, `CountService` and `JournalsService` are 24h TTL. The coverage banner itself reads
`/api/stats` live and needs no regeneration.

**What is worth building on top, now that the data exists.** The six `content_filters` fields have
values for the first time, so they can become real facets. Two cautions from how the data was
produced:

- **`model_type` is an open vocabulary by design.** Unlisted methods are tagged verbatim, which
  works (`graph attention network`, `node2vec`, `NOTEARS`, `protein language model` are real
  methods the seed list lacks) but also captures **tool names** — `Popcorn`, `HyDRA`, `MICER`,
  `mebipred`. A facet over it will show both. The other five fields are closed vocabularies and
  are safe to facet directly.
- **Coverage is deliberately partial**, so a filter on any enrichment field silently restricts to
  the enriched 0.4% of the corpus. Whatever surfaces these fields should say so, or the result
  count will read as a classification result rather than a coverage artefact.

**Cost, for planning the rest.** Enrichment runs at a measured **$4.07 per 1,000 records** and that
is not reducible: a four-arm paired ablation (`dome-triage/thinking_ablation/`, Round 3) found
`reasoning_effort: low` costs *more* than the default with six times the violations, a hierarchical
vocabulary rendering saves nothing, and disabling thinking is 88% cheaper but agrees with the
production configuration on all six fields for **0%** of records. Enriching all 366,234 positives
would be roughly **$1,490**.

## 2. Automated monthly Zenodo archive

**First: the DOI on the site is dead.** `download-bulk.ts` hardcodes
`ZENODO_DOI = '10.5281/zenodo.22259905'` and `/download/bulk` presents it as the permanent release
identifier, with a copy button and a citation block. It is not registered — `doi.org` 404s and
Zenodo's API reports "the persistent identifier is not registered" (checked 2026-09-03). Mint the
real deposition and replace the literal, or revert the page to describing the mechanism without
asserting a DOI.

**Then**: a reusable Python script driven by `.github/workflows/zenodo-archive.yml` (monthly
`schedule:` plus `workflow_dispatch`).

**Reuse the working lifecycle in `DOME_zenodo_archive/download_dome_registry.py`**, which already
archives the Registry to `10.5281/zenodo.18301461`. It gets the fiddly parts right — the 400
"draft already exists" path, deleting inherited files before upload, a bare `Authorization` header
on the bucket PUT (not `Content-Type: application/json`, which breaks it), stripping `doi` and
`prereserve_doi` before `PUT`ting metadata back. Three things must change rather than be copied:

- **The token is a literal in that script's source.** Here it is a `ZENODO_TOKEN` **GitHub
  repository Actions secret**, referenced by name from the workflow and read from the environment
  by the script, which refuses to start if unset rather than failing mid-publish. Nothing about it
  is written to a file in this repository. Managing repository secrets needs admin — see §7.
- **Parameterise it** — source URL, deposition ID, filenames — so one script serves both archives
  instead of being forked.
- **Cite the concept DOI**, not the version DOI, on a page that outlives any single release.

✅ **The export blocker is resolved.** GitHub runners cannot reach the MongoDB server, so the dump
has to come through the public API — and `MAX_RESULT_WINDOW` used to reject
`page * pageSize > 10,000`, capping a paginated dump at 10,000 of the corpus. That cap is still
not tunable (MongoDB 4.2's `find()` sort has no `allowDiskUse` and a deep skip blows the 32MB sort
buffer), so it was routed around rather than raised.

`GET /api/export` now exists: keyset-paginated NDJSON paging on `_id` (`{_id: {$gt: cursor}}`,
sorted by `_id`, hinted onto the `_id_` index). No result window, no sort buffer, bounded memory
on both ends. It takes every `/api/records` filter, so the workflow can deposit the whole corpus
or any slice of it, and it gives `/download/bulk` something real to point at between releases.

The workflow itself is still to build — what it needs is a cursor loop over `/api/export`
(`X-Next-Cursor` until absent), gzip, and the Zenodo deposit steps below.

Each deposit should carry the corpus as gzipped NDJSON, a metadata sidecar (count, size, sha256,
source, `schema_version`), and the [schema release](schema/releases/v1.1.0/) itself so the deposit
is self-describing.

## 3. Analytics — Matomo, built and waiting on a site ID

**Decided: Matomo alone, no Google Analytics, no cookie banner.** GA was dropped rather than
gated. It sets non-essential cookies and transfers data outside the EU/EEA, so adding it would
have meant building a consent banner, persisting and versioning consent state, offering a
withdrawal path, honouring DNT/GPC, and disclosing a US transfer on the privacy page — a large
amount of work, all of it avoided by not using it. Matomo is self-hosted by the university,
cookieless (`disableCookies`) and IP-anonymised, so it needs no consent under ePrivacy.

**The code is written and shipped, switched off.** Both halves are inert behind one switch each,
and neither contacts anything while off:

| Side | File | Switch |
|---|---|---|
| Browser page views | `observatory-ui/src/app/core/matomo.ts` | `MATOMO_SITE_ID` in `core/analytics.config.ts`, currently `null` |
| API usage | `observatory-ws/src/analytics/matomo.interceptor.ts` | `MATOMO_TOKEN`, currently unset |

API tracking is there because `/api/export` now makes the whole corpus retrievable, and
browser-side analytics would see none of that traffic — the heaviest use of the service would be
the one thing missing from the numbers. It reports through the same `matomo-tracker` library the
sibling MobiDB service uses, to the same instance.

The CSP relaxation is **already done** — `observatory-ui/nginx.conf` permits
`matomo.biocomputingup.it` in `script-src`, `connect-src` and `img-src`, and nothing else moved
off `'self'`. A permitted host is not a contacted one, so this changes nothing while the switches
are off, and it means activation needs no container rebuild.

The privacy page reads `MATOMO_ENABLED` directly, so its wording and the "Not yet active" badge
are generated from the same constant that turns tracking on. It cannot drift out of date, and
there is no "remember to update the privacy page" step to forget.

**Blocked on** a site ID from the lab's Matomo administrator, and an auth token. The activation
runbook is `docs/matomo-activation.local.md` (gitignored — it covers where the token goes).

## 4. Continuous integration

[`.github/`](.github/) holds issue templates and nothing else — there is no workflow in it.
Nothing verified so far is verified automatically.

`ci.yml`, on pull request and push to `main`:

- Node from `.nvmrc`, `npm ci` — **never `npm install`**, which has already broken the MongoDB server
  connection once by floating Mongoose past `8.x`.
- Both apps: lint, test, build. Currently 136 tests in `observatory-ui`, 132 in `observatory-ws`.
- [`python3 schema/validate.py`](schema/validate.py) against the current release.
- `docker build` both images from the repo root context, build only, never push — this catches the
  cross-directory `COPY schema/` breaking, which a plain `npm run build` will not.
- **A guard on the deploy output path**: assert `build-prod` produces a flat `dist/` with
  `index.html` at its root. This is the single most likely silent break to `deploy-prod-quick`.

Explicitly not in scope: any workflow that deploys. Deployment is the hosting lab's.

---

## 5. Repository access and visibility

The repository is private and the account doing the development does not hold admin on it. That
combination is the wrong way round for a project meant to be citable and externally reusable, and
it blocks several items above: publishing releases, adding repository secrets for the scheduled
archive, and enabling branch protection or required status checks alongside CI.

- Make the repository public, once the sanitisation pass above is confirmed — no internal
  hostnames, addresses or credentials in tracked files. Until then the schema links on
  `/download/bulk` and the About pages, and the issue templates the support page points at, 404 for
  anyone outside the organisation. Nothing to change here when it flips; they simply start working.
- Grant admin to the maintainer doing the work, so releases, secrets and branch protection can be
  configured without a round trip.

## Deferred, tracked

- **Mongoose is pinned to `8.x`.** Driver `7.x` cannot connect to the current database server at
  all (max wire version 8 vs. the driver's required 9). Do not bump without re-verifying against
  the real server. Moving the corpus to a MongoDB v8 host would remove this and several other
  constraints (`allowDiskUse` on `find()`, better text search), and is worth revisiting if the
  sort and export workarounds start to bite.
- **Relevance ranking.** `sort=relevance` sorts by `_id`, and the dropdown honestly calls it
  "Default order". `positives_text` has field weights, so a real `{ $meta: 'textScore' }` ranking
  is available — but only for queries that take the index path, so the sort would be inconsistent
  with the two cases that deliberately do not. Worth doing only with an answer to that.
- **Contextual (within-filter) facet counts.** Deliberately not built: they cannot be precomputed,
  so they reintroduce the per-query aggregation over 827k documents that precomputed stats exist
  to avoid.
- Ecosystem-wide dependency upgrades across the other DOME apps are out of scope here.

## Out of scope for this repository

Production deployment and its Compose files, published port allocation, TLS termination, DNS, and
the database server itself are operated by whoever hosts the service. This repository ships the
images, the local Compose file and the deployment documentation in `README.md`; it does not
contain production configuration or credentials.
