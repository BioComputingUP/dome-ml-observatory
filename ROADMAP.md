# Roadmap — DOME Observatory

What is still to build. The record of what has shipped and why lives in [AGENTS.md](AGENTS.md)
and in the code; this file is only the work ahead.

Last updated **2026-09-03**.

**Where things stand**: both apps are built, containerised and running against the MongoDB server
(`dome_observatory.Content`, MongoDB 4.2.25, 827,061 documents at `schema_version` 1.1.0).
All three indexes are live — `_id_`, `class_year_id`, `positives_text`. **No record is enriched
yet.** There is no Zenodo deposit, no analytics, and no CI.

---

## 1. Data refresh — reloading the corpus, and new classification / enrichment runs

The corpus turns over **6–12 times a year** and every cache in `observatory-ws` is sized around
that. There is no runbook for it — the initial load was a one-off manual Compass import.

**Upstream** is [`dome-triage`](https://github.com/BioComputingUP/dome-triage), not here. Two
different jobs:

- **Classification** (Step 23a) — adds new documents, may revise `llm_classification` on existing
  ones.
- **Enrichment** (Step 23b) — fills `content_filters`' six reserved fields and the whole
  `llm_enrichment` group on documents that *already exist*. Update in place by `_id`, never a
  re-import. Zero records are enriched today, which is why the search page's coverage banner is
  still showing.

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

⚠️ **The export blocker.** GitHub runners cannot reach the MongoDB server, so the dump has to come through the
public API — but `MAX_RESULT_WINDOW` rejects `page * pageSize > 10,000`, so a paginated dump tops
out at 10,000 of 827,061. That cap is not tunable: MongoDB 4.2's `find()` sort has no
`allowDiskUse` and a deep skip blows the 32MB sort buffer.

- **Recommended: add `GET /api/export`** — keyset-paginated NDJSON, paging on `_id`
  (`{_id: {$gt: lastId}}`, sorted by `_id`, which is indexed). No result window, no sort buffer,
  bounded memory on both ends, and it gives `/download/bulk` something real to point at between
  releases.
- **Alternative:** dump lab-side and let Actions do only the upload. Fewer moving parts here, but
  the schedule moves somewhere this repo cannot see or test.

Each deposit should carry the corpus as gzipped NDJSON, a metadata sidecar (count, size, sha256,
source, `schema_version`), and the [schema release](schema/releases/v1.1.0/) itself so the deposit
is self-describing.

## 3. Analytics and cookie consent

`/about/privacy` documents the intended stack and carries a **"Not yet active"** badge. That badge
is accurate today and must not come off before the implementation ships.

**Blocked on** a real self-hosted Matomo instance and site ID, and a GA measurement ID.

The site currently loads **no third-party resources at all** — fonts, icons and badges are served
from its own origin, and `observatory-ui/nginx.conf` ships a `default-src 'self'` CSP that keeps
it that way. Adding analytics means deliberately relaxing that policy, so treat the CSP change as
part of the work rather than as something discovered late.

**Recommendation: Matomo alone.** Self-hosted, cookieless (`disableCookies`), IP-anonymised — no
consent banner needed under ePrivacy, so there is no banner to build, no consent state to persist
and version, and nothing for a visitor to dismiss. Adding GA buys little and imports the whole
gating problem plus an EU/EEA data transfer the privacy page then has to disclose.

**If GA is added anyway**, half-gating it is worse than not having it:

- Consent state persisted and **versioned**, so a policy change re-asks rather than inheriting a
  stale answer.
- Rejecting exactly as easy as accepting — same prominence, same clicks.
- **No GA tag in `index.html`**; the script is injected only after affirmative consent.
- A visible way to withdraw consent, linked from the privacy page.
- Do Not Track / Global Privacy Control treated as a rejection.

Update the privacy page in the same change that ships the implementation, never before.

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
