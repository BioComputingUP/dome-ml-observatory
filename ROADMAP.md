# Roadmap — DOME Observatory

What has been built, what is still open, and the runbooks for the recurring jobs this service
needs. [AGENTS.md](AGENTS.md) covers day-to-day repo conventions and [README.md](README.md)
covers deploying and running the stack; this file covers direction and the operational work that
happens on a cadence rather than on a commit.

Last updated **2026-09-03**.

---

## Where things stand

| | |
|---|---|
| Frontend | `observatory-ui/` — Angular 22, standalone components, containerised, every route in the sitemap real |
| Backend | `observatory-ws/` — NestJS 11, read-only API under `/api`, containerised |
| Database | `dome_observatory.Content` on the database server — MongoDB 4.2.25, standalone, **827,061 documents**, `schema_version` `1.1.0` uniformly |
| Indexes | `_id_`, `class_year_id`, `positives_text` — all three live (built 2026-09-03) |
| Search | free text, authors, 17 filters, index-backed; counts exact |
| Enrichment | **0 records enriched.** The `llm_enrichment` group and `content_filters`' six reserved fields are present-but-null on every document |
| Schema | `schema/releases/v1.1.0/`, published and versioned |
| Zenodo | **not yet minted** — `/download/bulk` currently advertises a DOI that does not resolve (Phase 9) |
| Analytics | none installed; the privacy page's "Not yet active" badge is accurate (Phase 11) |
| CI | none — there is no `.github/` in this repo (Phase 12) |

Open phases: **8** (data refresh), **9** (Zenodo), **10** (help page), **11** (analytics and
consent), **12** (CI).

---

## Decisions locked — do not reopen

| Decision | Choice |
|---|---|
| Repo shape | **One monorepo**, both apps inside |
| Folder names | `observatory-ui/` and `observatory-ws/` |
| Frontend | Fresh Angular scaffold with content ported, not an incremental `ng update` chain |
| Backend framework | **NestJS** |
| Shared `-core` package | **No.** Two parts only; any overlapping type or shape is duplicated on each side rather than introducing a third linked package to keep in sync |
| Mongo access | The backend is the only thing that ever touches Mongo. The frontend never gets a connection string, and the Mongo port is never exposed publicly — the database server has no authentication of its own, so the backend is the entire security boundary |
| Write access | **Read-only, always.** `observatory-ws` has no write path and must never acquire one; nothing here touches the other databases sharing that host |
| Deployment | Owned by the hosting lab, not by this repo — see the last section |
| Brand | DOME-family colours and typography retained; `#103344` deep blue, `#0b2735` darker blue, `#F66729` orange, Lato, as CSS custom properties in `styles.scss` |

---

# Delivered

## Phases 0–3 — Restructure, frontend rebuild, content and rebrand ✅

The Angular app moved into `observatory-ui/` and the root `package.json` became a thin delegator,
keeping `deploy-prod-quick` working verbatim from the repo root. OSAI feature code, dead
scaffolding, `e2e/`, and tslint were removed; the app was rebuilt on Angular 22 / Node 24 with
standalone components, Vitest and ESLint, Bootstrap 5.3, and `ngx-bootstrap` and
`@nsalaun/ng-logger` dropped entirely.

⚠️ **The one build detail that can silently break the lab's deploy**: modern Angular writes to
`dist/<project>/browser/`, but `deploy-prod-quick` rsyncs `dist/*` into a server path that serves
`dist/` directly. `angular.json` sets `outputPath: { "base": "dist", "browser": "" }` so files
land flat. Verify by inspecting the built tree, never by assuming.

Phase 3 rebranded the site and built every page in the sitemap: Home, Search, Journals,
Record, Download (overview / bulk / API), About (overview / processing / team / governance /
integrations / licensing / privacy), News. An original navbar mark
(`assets/img/observatory_logo.svg`) replaced the OSAI logo. The **`schema/` folder was pulled
forward from Phase 8** because the search UI needed it immediately: a versioned
`releases/v1.1.0/` with a described JSON Schema, one real example record, three controlled
vocabularies, a dependency-free `validate.py`, a `CHANGELOG.md`, and the `schema-version` agent
skill to manage future releases. `observatory-ui/src/assets/vocab/` is generated from it by
`scripts/sync-schema.js` and gitignored — `schema/` is the single source of truth.

Design principle carried through every page: **Observatory is a discovery hub, and a dead end is
a bug.** Every record routes outward — Europe PMC, PubMed, PMC full text, publisher DOI, and the
reserved cross-refs to DOME Registry, HuggingFace, Kaggle and Zenodo.

## Phase 4 — Containerise the frontend ✅

Two containers only, ever. `nginx` in the frontend image does double duty as reverse proxy for
`/api/*`, so the API is same-origin (no CORS) and the backend is never directly exposed — rather
than adding a third component.

**The Docker build context is the repo root, not `observatory-ui/`**, so each Dockerfile can
`COPY schema/` alongside its own app. `.dockerignore` therefore lives at the repo root and is
shared by both images.

Two bugs that only appeared by running the container, not by building it:

- `proxy_pass http://observatory-ws:3000/...` crash-looped the **whole** container, not just the
  `/api/` route: nginx resolves a bare hostname in `proxy_pass` at config-*load* time, so an
  absent backend meant nginx refused to start at all. Fixed with the standard pattern — a
  `set $backend` variable plus an explicit `resolver 127.0.0.11` (Docker's embedded DNS), which
  defers resolution to request time, and `resolver_timeout 5s` so an unreachable backend fails
  fast instead of hanging 30s. Unresolvable backend now returns 502 in ~13ms and the container
  stays up.
- `HEALTHCHECK` failed against a healthy container: `wget http://localhost/` resolved to the IPv6
  loopback inside the container, where nginx does not bind. Healthchecks target `127.0.0.1`
  explicitly.

## Phase 5 — Backend: `observatory-ws` ✅

NestJS 11 with `@nestjs/mongoose`, `@nestjs/config` and `@nestjs/swagger`. Read-only routes under
`/api`: `GET /api/health` (liveness, never touches Mongo), `GET /api/health/ready` (readiness,
does), `GET /api/records`, `GET /api/records/:pid`, `GET /api/stats`, `GET /api/facets/:field`,
`GET /api/journals`, `GET /api/journals/detail`, and Swagger UI at `/api/docs`. Config is
env-only and validated at boot — a bad variable is named and the app refuses to start, rather
than failing on the first request that needs it.

**Ground truth, measured rather than assumed**: the database is `dome_observatory`, collection
`Content` — *not* `ai_ml_landscape`, which the old prototype and an early `.env.example` guessed.
Every `_id` is a **UUID5 string, not an ObjectId**, so the prototype's `ObjectId.isValid()` guard
was deliberately not ported.

Live corpus figures: positive **355,558**, negative 464,581, undeterminable 6,922, open access
548,412, full text available 615,151, of 827,061 total.

**Filter translation** — how a URL parameter becomes a Mongo clause:

| URL | Mongo |
|---|---|
| `q` | tokenised, per-term `\b`-anchored regex across title / abstract / authors, AND-ed |
| `class` absent | `classification: 'positive'` (the default) |
| `class=` (empty) | no classification clause at all — matches everything |
| `class=a,b` | `$in: ['a','b']` |
| `year=2020-` | `$gte: 2020`, no upper bound |
| `lic=` (empty value in the list) | expands to `$in: ['', null]` |
| array facets (mesh, pub types, …) | `$in` against the array field — overlap, not equality |
| `sort=relevance` | `_id` ascending — stable, and index-backed |
| `sort=year_desc` | two-step aggregation, see below |

**Real bugs found only by running against the database server:**

- **MongoDB driver `7.x` cannot connect to the database server at all** — `reports maximum wire version 8, but
  this version of the Node.js Driver requires at least 9 (MongoDB 4.4)`. the database server is 4.2.25.
  `mongoose@8.x` (bundling driver ~6.x) connects fine. **Do not bump Mongoose past `8.x`** without
  re-verifying directly against the database server.
- **Naive deep pagination failed outright.** `find().sort({'publication_metadata.year': -1}).skip(9000)`
  raised `Sort operation used more than the maximum 33554432 bytes of RAM` — MongoDB 4.2's `find()`
  has no `allowDiskUse`. Fixed with a two-step pipeline for year sorts: aggregate only `{_id, year}`
  (tens of bytes per document instead of ~3.5KB) with `allowDiskUse: true` to get the ordered id
  list, then `find({_id: {$in}})` and restore order in JS. `MAX_RESULT_WINDOW` (`page * pageSize
  <= 10,000`) also makes the sort-buffer failure structurally unreachable.
- **`lazyConnection: true` alone still crashed the process** a few seconds after a cold boot
  against an unreachable Mongo, taking `/api/health` down with it — the opposite of its purpose.
  The connection's own failed attempt became an unhandled promise rejection with nothing awaiting
  it. A `connection.on('error')` listener does **not** fix this (the promise rejecting and the
  event firing are independent), and `onConnectionCreate` is never called on the lazy path. The
  fix that works: `connectionFactory`, calling `connection.asPromise().catch(...)` inside it
  without awaiting. Written up in `AGENTS.md` — re-verify (kill the Mongo route, confirm
  `/api/health` stays 200) before ever touching this pairing.
- **Counting is the expensive half of a search, not fetching.** `CountService` caches exact counts
  (24h TTL) and degrades to a bounded `10,000+` rather than discarding a page of results that was
  fetched successfully. `MongoUnavailableFilter` catches `mongo.MongoError` alongside
  `MongooseError` — a raw `MongoServerError` (code 50, `MaxTimeMSExpired`) is a different class
  hierarchy from a different package, and was slipping through.
- A stale `.tsbuildinfo` from `incremental: true` made `nest build` **silently skip emitting
  `app.module.js`** — `dist/` looked complete but the app could not boot. `incremental` removed
  entirely rather than worked around.

**Timing table** (the database server, bare metal, before the indexes of Phase 7.6 — kept as the baseline those
figures are measured against):

| Query | Cold | Notes |
|---|---|---|
| Default (`class=positive`), page 1 | 93ms | warmed at boot |
| Deepest allowed page, `sort=relevance` (page 400) | 462ms | `_id` sort |
| Deepest allowed page, `sort=year_desc` (page 400) | 1.9s | two-step aggregation |
| `q=cancer` (41,582 hits) | 4.4s | exact count succeeds |
| `q=transformer` (10,939 hits) | 10.1s | both count attempts time out, degrades to `10,000+` |
| `/api/stats` | 3ms | cached |
| `/api/facets/journal?q=…` | 9ms | in-memory, boot-loaded |

**Verification** included running the compiled server against the database server over the VPN and exercising
every endpoint with `curl` — every filter, the open year bound, deep pagination at and past the
window boundary, both sorts, malformed `:pid`, facet allowlist rejection, CORS, Swagger, helmet
headers — and then running it a second time against a genuinely unreachable Mongo host to prove
the liveness/readiness split holds rather than assuming it.

## Phase 6 — Containerise the backend, one Compose project ✅

`observatory-ws/Dockerfile` (Node 24 alpine, multi-stage, non-root `node` user, `schema/` and
`observatory-ws/` kept as sibling dirs under `/app` so the existing relative schema lookup needed
no code change) and `docker-compose-local.yml` at the repo root — both services on one
user-defined bridge network, `init: true` so `enableShutdownHooks()` is actually exercised, plain
`depends_on` for start order only.

Readiness checklist, all confirmed:

1. `HEALTHCHECK` targets `/api/health` only, never `/api/health/ready` — a Mongo outage must not
   make Docker kill a healthy process.
2. Healthcheck uses `node -e` and the built-in `http` module, sidestepping whether wget or curl
   exist in the image, against `127.0.0.1` not `localhost` (Phase 4's IPv6 gotcha).
3. `--start-period=60s`, chosen against the measured worst case below.
4. Graceful shutdown well inside the 10s SIGKILL grace period.
5. …12. **`app.set('trust proxy', 1)`** so client IPs and protocol survive nginx, which the rate
   limiter and logging both depend on.

**Bug found during live verification, not planning**: `proxy_pass http://$backend/api/;` silently
dropped the entire tail of every request — `/api/records?pageSize=1` arrived at the backend as a
bare `GET /api/`, 404ing every real route. A **variable** in `proxy_pass` disables the normal
location-prefix substitution. Fixed with `proxy_pass http://$backend$request_uri;`. Phase 4 had
only ever tested the "backend absent → 502" path, never a real request reaching a live backend —
which is exactly how this survived.

**Measured:**

| Check | Result |
|---|---|
| Image sizes | `observatory-ws` 294MB, `observatory-ui` 70.5MB |
| Container → the database server over the VPN | reachable on the default bridge, no `network_mode: host` needed |
| Boot → healthy, the database server reachable | ~15–27s |
| Boot → healthy, the database server **unreachable** | ~40s — every warm-up step times out and degrades in sequence; still inside the 60s start period, but this is the realistic worst case. **Re-measure this specifically if any more sequential boot-time warm-up is added.** |
| `docker compose down` | 1.5s |
| VPN drop and restore | `/api/health` stayed 200 throughout; `/api/health/ready` correctly 503; recovered within 15s |

## Phase 7 — Local end-to-end ✅

`RecordsService` in the frontend became a thin `HttpClient` wrapper and ~50 lines of in-memory
filter/sort/free-text logic were deleted — the backend owns all of it. `queryToHttpParams()` drops
anything at its default so the backend applies the identical default itself, but **keeps `''`** —
the literal `class=` signal meaning "every classification", as opposed to an absent `class`
meaning positives only. Getting that one bit backwards would silently narrow every cleared search.

Defects that only appeared once the data was real rather than a 200-record fixture:

- The old typeahead fetched `pageSize: 100000` to derive journal and MeSH lists client-side — a
  hard 400 against the real API, and an 827k-row download if it weren't. Journal and MeSH now call
  `/api/facets/:field` (debounced 250ms, `switchMap`-cancelled) against the backend's boot cache.
  **Author keywords has no backend typeahead by design** — 694,411 distinct values — and is a
  plain comma-separated text input whose copy says so.
- The pager promised pages that would 400: `ceil(355558/25)` is 14,223 pages against a hard 10,000
  row window. `totalPages` is capped at `floor(MAX_RESULT_WINDOW / pageSize)` with an honest note
  at the cap pointing at `/download`.
- The record page conflated "not found" with "unreachable". The service now resolves only 404/400
  to `undefined` and lets 503s and network errors propagate, so "Record not found" and
  "Temporarily unavailable — this record may well exist" are genuinely independent states.

The 200-record fixture was retired to `observatory-ui/fixtures/`, outside the assets glob. There
is deliberately **no fixture fallback when the API is down** — that would reintroduce the exact
fixture-vs-real mismatch the old preview banner existed to catch.

**A data-quality finding, not a rendering bug**: at least one record's title is stored in Mongo
as double-HTML-encoded markup (`&lt;i&gt;Halomonas elongata&lt;/i&gt;`), so it renders as literal
text. Angular's interpolation is behaving correctly. Fixing it upstream in the ingestion pipeline
is the right repair; a UI-side entity decode would risk mis-rendering titles that legitimately
contain `<` or `>`. See Phase 8.

## Phase 7.5 — Search repair ✅

**The bug**: free text was matched as one literal regex phrase, so `q=random forest sepsis` — which
appears verbatim nowhere — scanned all 827,061 documents to prove it, blew the 5s `maxTimeMS`, and
surfaced as a 503 "database unavailable". Deterministic, not intermittent.

**The fix is AND-of-terms, not a bigger timeout**: `tokenizeQuery` plus per-term `\b`-anchored
regexes across title, abstract and **authors** (author search is new). Two measurements shaped the
design, and reordering the query "for tidiness" would silently undo the first:

- Putting the cheap `classification` equality clause **before** the regex clauses is 2,566ms vs
  5,809ms — it short-circuits the 464,581 non-positive documents before the expensive part runs.
- `\b`-anchoring costs ~10–20% and drops `cell`'s false hits (`excellent`, `parcellation`) from
  61,288 to 46,141.

**Search space narrowed to the positives in the UI** — the API is unchanged, `class=` still works
for anyone calling it directly. `/api/stats` computes a `search_space` object scoped to positives
alongside the unfiltered `corpus`, and the facet typeahead cache is built from a positives-only
`distinct()`.

A live bug found in this pass: `clearAll()` reset `classification: []`, which is the
"explicitly cleared" signal, silently widening Clear All from 355,558 to all 827,061.

**Year picker**: `<input type="number" [attr.min]>` snapped an empty field straight to the native
min on the first arrow click. Replaced with a text input (`inputmode="numeric"`, no native
min/max) and custom steppers that seed from the search-space bound then step by 1.

## Phase 7.6 — Search indexes on the database server ✅ (2026-09-03)

Two indexes now exist on `dome_observatory.Content`. Nothing outside that collection was touched:
no server config, no `mongod` restart, no other database read or written.

```js
// Free-text, scoped to the positives -- a collection may have only one text index.
// partialFilterExpression matches the search page's whole search space exactly.
db.Content.createIndex(
  { "publication_metadata.title": "text",
    "publication_metadata.abstract": "text",
    "publication_metadata.authors": "text" },
  { partialFilterExpression: { "llm_classification.classification": "positive" },
    weights: { "publication_metadata.title": 10,
               "publication_metadata.authors": 5,
               "publication_metadata.abstract": 1 },
    name: "positives_text", background: true });

// Sort/filter support -- turns the default and year-sorted browse into an index walk.
db.Content.createIndex(
  { "llm_classification.classification": 1, "publication_metadata.year": -1, _id: 1 },
  { name: "class_year_id", background: true });
```

| | Built in | Size | vs estimate |
|---|---|---|---|
| `class_year_id` | 4.1s | 36.7 MB | ~38 MB predicted |
| `positives_text` | 188s (43.8M keys) | 391.5 MB | ~515 MB predicted, 24% under |

The collection stayed readable throughout — checked mid-build at 18%, a 3-document read returned
in 112ms. MongoDB 4.2's hybrid builder behaved as documented.

**Measured before/after, live:**

| Query | regex only | `$text` + regex | count |
|---|---|---|---|
| random forest | 45,116 in 3,979ms | 45,116 in **864ms** | identical |
| deep learning | 70,661 in 3,135ms | 70,661 in **2,602ms** | identical |
| single cell transformer | 187 in 15,856ms | 187 in **3,903ms** | identical |
| graph neural network | 5,749 in 2,776ms | 5,749 in **1,180ms** | identical |
| `"Farrell G"` | ~3,400ms | **562ms** | 2 hits |
| `"Tosatto SCE"` | ~3,900ms | **163ms** | 13 hits |

**Counts are identical, not merely close.** Keeping the per-term regex clauses alongside `$text` is
what buys that: `$text` narrows to a few thousand candidates via the index and the regexes then
decide what actually matches, so recall is unchanged and only the speed differs. An unplanned
bonus from `class_year_id`: the regex path's counts became exact too, because the classification
predicate is now an index scan — `transformer` reports 10,860 where it used to degrade to
`10,000+`.

**Two behaviours deliberately kept off the index path**, both of which are correctness rather
than tuning:

1. **A single bare word** (`neuro`, `cancer`). With one term there is no second clause to rescue
   what `$text` fails to select, and stemming cannot match a non-stem fragment — `neuro` returned
   1,701 through the index where the regex finds 28,622. Recall is never traded for speed on a
   lone word.
2. **A cleared classification filter** (`class=`). Not a choice: MongoDB **rejects** a `$text`
   query that omits a partial index's filter predicate — `planner returned error :: … failed to
   use text index to satisfy $text query`. It does not quietly fall back to a collection scan.
   `canUseTextIndex` is the guard, and **`?q=…&class=` returning 200 rather than 500 is the single
   most important regression check on this feature.**

The backend detects both indexes at boot via `Model.listIndexes()` — note *not*
`collection.listIndexes().toArray()`, which is not a cursor on Mongoose 8's bundled driver and
throws — and silently uses the regex path if they are absent, so nothing breaks without them.

---

# Open work

## Phase 8 — Data refresh: reloading the database server, and new classification / enrichment runs 🔲

The corpus is refreshed **6–12 times a year**, and every cache in `observatory-ws` is sized around
that assumption. There is no runbook for it today — the initial load was a one-off manual Compass
import. This phase writes one and builds the missing pieces.

### Where the data comes from

Everything upstream lives in [`dome-triage`](https://github.com/BioComputingUP/dome-triage), not
here. Two distinct kinds of refresh, which need different treatment:

- **Classification** (dome-triage Step 23a) — a Europe PMC harvest triaged and classified, producing
  `data/processed/ai_ml_landscape_classified.csv`, one row per unique paper. Adds *new documents*
  and may revise `llm_classification` on existing ones.
- **Enrichment** (Step 23b) — populates `content_filters`' six reserved fields and the whole
  `llm_enrichment` group on documents that **already exist**. This is an update-in-place by
  `_id`/`pid`, never a re-import. **Zero records are enriched today** (verified against the database server
  2026-09-03), which is why the search page's enrichment-coverage banner is still showing.

The staging chain that turns a classified CSV into loadable documents already exists and is
tested, in `dome-triage/mongo_landscape_export/`:

```bash
cd mongo_landscape_export/scripts
python3 inspect_sample.py
python3 filter_missing_rationale.py
python3 add_pid_column.py
python3 drop_dead_columns.py
python3 ../../epmc_licensing/fetch_licensing.py   # close any new coverage gap first
python3 join_license.py
python3 write_schema_template.py
python3 convert_to_jsonl.py
python3 -m pytest .
```

`pid.py` mints a **deterministic UUID5** from `pmcid > doi > pmid`, so the same paper always mints
the same `_id`. That property is what makes an incremental refresh possible at all, and it is the
foundation of everything below.

### What needs building

1. **An upsert loader, not drop-and-reimport.** Dropping `Content` destroys both indexes, and
   rebuilding `positives_text` takes ~3 minutes of tokenising plus the time to read 1.5GB of
   collection storage — during which search silently degrades to the regex path. Because `_id` is
   deterministic, a refresh should be an upsert:

   ```bash
   mongoimport --uri "$MONGODB_URI" --db dome_observatory --collection Content \
     --file output/ai_ml_landscape.jsonl \
     --mode upsert --upsertFields _id
   ```

   Verify the `--mode upsert` behaviour on a copy before running it against `Content` for the
   first time. A small `bulkWrite` script doing `updateOne({_id}, {$set: doc}, {upsert: true})` in
   batches is the alternative if finer control over which fields get overwritten is wanted — in
   particular, a classification refresh must not blank an `llm_enrichment` group that a later
   enrichment run has since populated. Decide that field-level merge policy explicitly rather
   than letting `$set` of a whole document decide it by accident.

2. **An enrichment writer.** Step 23b's output has to land on existing documents by `_id`. This
   belongs in `dome-triage`, **not here** — `observatory-ws` is read-only by design and must never
   gain write credentials.

3. **Index recreation, if the collection is ever dropped.** Both indexes go with it. Re-run the
   two `createIndex` calls in Phase 7.6 verbatim. The backend will not error meanwhile; search
   just gets slow again.

4. **A post-refresh checklist**, because a data change is not visible until the service is
   restarted:

   | What | Behaviour |
   |---|---|
   | `FacetsService` (journal / mesh / pub types / licence typeaheads) | **Boot-loaded, no TTL.** A restart is *required* — new journals will not appear otherwise |
   | `StatsService` (`/api/stats`) | 24h TTL, boot-warmed |
   | `CountService` (exact counts) | 24h TTL |
   | `JournalsService` | 24h TTL |

   Then: re-run `schema/generate_facet_stats.py --from-api https://observatory.dome-ml.org` to
   refresh the offline facet stats, check `/api/stats` reports the new totals, and confirm
   `/api/health/ready` shows the expected `estimatedCount`.

5. **A schema-version decision.** If the document shape changed, cut a release with the
   `schema-version` skill rather than editing a published release folder — and remember every
   record carries `schema_version`, so a mixed-version collection is detectable and should be
   treated as a migration to finish, not a state to live in.

6. **Trigger the Zenodo archive** (Phase 9) once the refresh is verified, so the public snapshot
   and the live service do not drift.

### A data-quality item to fix at ingestion

At least one document's `publication_metadata.title` is stored double-HTML-encoded. The fix
belongs in the dome-triage conversion step, not in the UI — see Phase 7. Worth a scan of the whole
corpus for the pattern while a refresh is being run anyway.

## Phase 9 — Automated monthly Zenodo archive 🔲

### Start here: the DOI on the site does not resolve

`observatory-ui/src/app/download/download-bulk/download-bulk.ts` hardcodes
`ZENODO_DOI = '10.5281/zenodo.22259905'` and the page presents it as "the permanent identifier for
the current corpus release", with a copy button and a citation block. **That DOI is not
registered** — `https://doi.org/10.5281/zenodo.22259905` returns 404 and Zenodo's API reports "The
persistent identifier is not registered" (checked 2026-09-03). Every visitor who clicks it hits a
dead link, and the suggested citation points at nothing.

The first task of this phase is to mint the real deposition and replace that literal. Until then
the honest interim is to describe the mechanism without asserting a DOI, which is what the page
did before the literal was added.

### What to build

A reusable Python script — `scripts/zenodo_archive.py` or a small `archive/` folder — driven by a
monthly GitHub Actions workflow at `.github/workflows/zenodo-archive.yml` (`schedule:` cron plus
`workflow_dispatch` so it can be run by hand).

**Reuse the working lifecycle in `DOME_zenodo_archive/download_dome_registry.py`**, which already
archives the DOME Registry to deposition `18301461` (`10.5281/zenodo.18301461`, "DOME Registry
Archived Dataset"). It solves the fiddly parts correctly and they should not be re-derived:

- `POST …/actions/newversion`, handling the 400 "draft already exists" case by fetching
  `links.latest_draft` from the deposition rather than failing.
- Deleting the files inherited into the new draft before uploading, so a version does not
  accumulate every prior snapshot.
- Uploading via the draft's `links.bucket` with a bare `Authorization` header — **not**
  `Content-Type: application/json`, which breaks a file PUT.
- Stripping `doi` and `prereserve_doi` from the metadata before `PUT`ting it back; Zenodo rejects
  an attempt to set them.
- Setting `metadata.version` to a date stamp (`YYYY.MM.DD`) and `publication_date`, then
  `POST …/actions/publish` to mint the new version DOI.

Three things must change rather than be copied:

- **The token is hardcoded in that script's source.** Here it comes from a `ZENODO_TOKEN`
  repository secret via `env:`, and nothing else. The script should refuse to start if it is
  unset rather than failing halfway through a publish.
- **Parameterise it** — source URL, deposition ID, output filenames, and record title — so the
  same script can serve both the Registry archive and the Observatory archive rather than being
  forked into a near-identical second copy.
- **Cite the concept DOI, not the version DOI**, on `/download/bulk`. Zenodo's all-versions
  identifier is what should be printed on a page that outlives any single release.

### The export blocker, and the recommended fix

⚠️ **GitHub-hosted runners cannot reach the database server** — it is lab-internal with no public route. The
dump therefore has to come through `https://observatory.dome-ml.org/api/`, after the service is
deployed.

But **the public API cannot currently export the corpus**: `MAX_RESULT_WINDOW` hard-rejects
`page * pageSize > 10,000`, so a paginated dump tops out at 10,000 of 827,061 records. This is not
a tuning problem — the cap exists because MongoDB 4.2's `find()` sort has no `allowDiskUse` and a
deep skip blows the 32MB sort buffer.

Two ways forward:

- **Recommended — add a keyset-paginated export endpoint.** `GET /api/export` streaming NDJSON,
  paging on `_id` (`{_id: {$gt: lastId}}`, sorted by `_id`, which is indexed) rather than
  `skip`/`limit`. Keyset pagination has no result-window problem and no sort buffer to blow, it
  reads the whole corpus in bounded memory on both ends, and NDJSON matches the format the data
  already ships in. It should be rate-limited and, if wanted, gated behind a token — but it is a
  read-only route over already-public data, so the simpler the better. This also gives
  `/download/bulk` something real to point at between Zenodo releases.
- **Alternative — dump lab-side.** A scheduled job on a host that can reach the database server writes the
  JSONL, and Actions only does the Zenodo upload. Fewer moving parts in this repo, but it moves
  the schedule somewhere this repo cannot see or test, and it needs the hosting lab's agreement.

Build and test against the local `docker-compose-local.yml` stack now; it can only go live once
the service is deployed publicly.

### What each deposit should contain

- The corpus itself, as gzipped NDJSON.
- A metadata sidecar — timestamp, record count, file size, sha256, source URL, and the
  `schema_version` — mirroring the pattern the Registry archive already uses.
- **The schema release** (`schema/releases/<CURRENT>/`), so a deposit is self-describing and a
  future reader can validate it without this repo.

## Phase 10 — Help page 🔲

A `/help` route. Search behaviour here is genuinely non-obvious — several rules are the direct
result of Phase 7.5 and 7.6 measurements — and nothing currently explains it to a visitor.

**Route and navigation**: `/help`, in the navbar and the footer, with `/faq` redirecting to it.
Follow the existing page conventions — dark-blue full-bleed header band, in-page anchors, and
outward links wherever another site is the better answer.

**What it has to cover:**

- **How search actually works.** Multiple words are AND-ed, not treated as a phrase. Matching is
  word-boundary anchored, so `cell` does not match `excellent`. Quoted phrases work. The default
  search space is AI/ML methods papers (the positives), not the whole 827k corpus.
- **Author search**, which is the least discoverable feature: names are indexed as surname plus
  initials (`Tosatto SCE`), so a full first name will not match. The search page already carries a
  one-line hint; this is where the explanation lives.
- **Why a rare single word can be slower than two words** — a lone term deliberately takes the
  regex path so recall is never traded for speed. Explain the trade rather than hiding it.
- **What the classification labels mean** — positive / negative / undeterminable — and that they
  are LLM-generated rather than curated, with a link to `/about/processing`.
- **What the enrichment fields will be**, and that they are empty today. This section should read
  correctly both before and after Phase 8's enrichment run.
- **Why browsing stops at page 400**, and that `/download` is the answer for anything deeper.
- **Filters and vocabularies** — where the controlled vocabularies come from and what `max_tags`
  caps mean in the UI.
- **Getting the data out** — pointers to `/download/bulk`, `/download/api` and `/api/docs`, rather
  than duplicating them.
- **Citing and reuse** — a pointer to `/about/licensing`, and the distinction it already makes
  between Observatory's CC BY 4.0 metadata licence and each paper's own licence.
- **Who to contact** for a wrong record or a missing paper.

Keep it a real page of prose with anchors, not an accordion of one-liners — the explanations that
matter here (the AND rule, the author format, the single-word path) need a sentence of *why* to be
useful rather than surprising.

## Phase 11 — Analytics and cookie consent 🔲

`/about/privacy` already documents the intended stack and carries a **"Not yet active"** badge on
the analytics section. That badge is accurate today and must not be removed before the
implementation actually ships — the policy must never describe analytics as live before it is.

**Blocked on** a real self-hosted Matomo instance and site ID, and a GA measurement ID.

**Strong recommendation: Matomo only.** Configured self-hosted, cookieless (`disableCookies`) and
IP-anonymised, it needs no consent banner under ePrivacy — which means no banner to build, no
consent state to persist and version, no rejected-consent path to test, and nothing for a visitor
to dismiss. Adding GA alongside it buys little and imports the entire consent-gating problem,
plus a data transfer outside the EU/EEA that the privacy page already has to disclose.

**If GA is wanted anyway**, it must be gated properly, and half of it is not enough:

- A consent-state service, persisted and **versioned**, so a policy change can re-ask rather than
  silently inheriting a stale answer.
- A banner where rejecting is exactly as easy as accepting — same prominence, same number of
  clicks. A pre-ticked box or a hidden reject is not consent.
- **No GA script tag in `index.html`.** The script is injected only after affirmative consent,
  never loaded by default.
- A visible way to withdraw consent afterwards, linked from the privacy page.
- Do Not Track / Global Privacy Control respected as a rejection.

Update `/about/privacy` in the same change that ships the implementation, not before, and drop the
"Not yet active" badge only then.

## Phase 12 — Continuous integration 🔲

There is no `.github/` directory in this repo at all. Nothing that has been verified so far is
verified automatically.

`.github/workflows/ci.yml`, on pull request and push to `main`:

- Node from `.nvmrc`, `npm ci` (never `npm install` — an unpinned install has already broken the
  the database server connection once by floating Mongoose past `8.x`).
- Both apps: `lint`, `test`, `build`. `observatory-ui` currently has 74 tests and `observatory-ws`
  68; a drop in either is a signal, not noise.
- `python3 schema/validate.py` against the current release, plus the `schema-version` skill's own
  drift guard.
- `docker build` both images from the repo root context — build only, never push. This catches the
  cross-directory `COPY schema/` breaking, which a plain `npm run build` will not.
- **A guard on the deploy output path.** Assert that `build-prod` produces a flat `dist/` with
  `index.html` at its root. This is the single most likely silent break to the lab's
  `deploy-prod-quick`, and it is trivially checkable.

Explicitly **not** in scope: any workflow that deploys anything. Deployment is the hosting lab's,
and CI here exists to catch breakage before handover, not to push.

---

## Deferred, tracked

- **Mongoose is pinned to `8.x` deliberately.** Driver `7.x` cannot connect to the database server at all
  (max wire version 8 vs. the driver's required 9). Do not bump without re-verifying directly
  against the real server. A `a newer database server` on MongoDB v8 has been offered if v4 proves limiting — that
  would remove this constraint and several others (`allowDiskUse` on `find()`, better text search),
  and is worth revisiting if the sort and export workarounds start to bite.
- **Relevance ranking.** `sort=relevance` sorts by `_id` and the dropdown honestly calls it
  "Default order". Now that `positives_text` exists with field weights, a genuine
  `{ score: { $meta: 'textScore' } }` ranking is available for the queries that take the index
  path — but not for the two cases in Phase 7.6 that deliberately do not, so the sort would be
  inconsistent between them. Worth doing only with a clear answer to that.
- **Ecosystem-wide dependency upgrades** (Node, Angular, Bootstrap across the other DOME apps) are
  out of scope for this repo; this repo's own upgrade is done.
- **Shipping Docker artifacts and switching production to Docker are two different things**, and
  only the first is this repo's. `dome-ml-ui` has working Docker artifacts and still runs without
  Docker in production.
- **Contextual (within-filter) facet counts** were deliberately not built. They cannot be
  precomputed, so they would reintroduce the per-query aggregation cost over 827k documents that
  precomputed stats exist to avoid.

## Owned by the hosting lab, not by this repo

Production deployment, the production and staging Compose files, published port allocation,
TLS and the `observatory.dome-ml.org` domain, and the database server itself. `npm run deploy-prod-quick` must
keep **working** — buildable, correct output path, invocable verbatim from the repo root — but it
is run by the lab, not from here. Nothing in this repo hardcodes a production connection string;
Mongo configuration is env-only, via `.env` (gitignored) and `.env.example` (committed,
placeholders).
