# AGENTS.md

Guidance for any AI coding agent (Claude, Copilot, Cursor, etc.) working in this repository.
Read this fully before making changes. If something here conflicts with what you observe in
the code, trust the code and update this file.

`ROADMAP.md` is the companion: what is still open, and the runbooks for the recurring jobs (data
refresh, Zenodo archive). It covers what is *planned*, not what has shipped — the record of what
has been built and why lives in this file and in the code comments.

## What this is

DOME Observatory: a searchable database of AI/ML methods-paper metadata (LLM-classified by a method
validated against a hand-annotated expert benchmark, cross-linked to Europe PMC -- individual records
are *not* curator-reviewed; don't describe them as such). **Monorepo, two independent apps:**

- **`observatory-ui/`** — Angular frontend (Angular 22, standalone components). Talks to the
  backend only via `HttpClient` calls under `/api`, same-origin through nginx's proxy — see
  `observatory-ui/nginx.conf`.
- **`observatory-ws/`** — NestJS backend, read-only API over the record dataset (`GET /api/health`,
  `/api/health/ready`, `/api/records`, `/api/records/:pid`, `/api/stats`, `/api/facets/:field`,
  `/api/journals`, `/api/journals/detail`, Swagger at `/api/docs`). The only thing in this repo
  that ever opens a connection to Mongo.

No shared `-core` package between them — overlapping types/shapes are duplicated on each side
deliberately, not linked. **The backend is the only thing that ever talks to the database.**
Never give the frontend a database connection string or expose a database port publicly; the
backend is the entire security boundary. This is a hosting requirement, not a style choice.

## Environment

- **`observatory-ui/`**: `.nvmrc` pins `lts/krypton` (Node 24 LTS — krypton is 24, not 22). Run
  `nvm use` inside `observatory-ui/` before installing or building.
- **`observatory-ws/`**: `.nvmrc` pins `24.20.0` (Node 24 LTS) — a separate, independent install
  from the UI's, deliberately not assumed to match it. **Mongoose is pinned to the `8.x` line
  (`mongoose@^8.19.1`, bundling MongoDB driver ~6.x) and must not be bumped to `9.x`.** Verified
  directly, 2026-09-01: MongoDB driver `7.x` refuses to connect to the MongoDB server at all
  (`MongoServerSelectionError: ... reports maximum wire version 8, but this version of the
  Node.js Driver requires at least 9 (MongoDB 4.4)`) — the MongoDB server runs MongoDB **4.2.25**, and only
  driver `6.x` still supports it. `@nestjs/mongoose@11.x`'s own peer range (`^7.0.0 || ^8.0.0`)
  already blocks `9.x`, but don't assume a future bump is safe without re-checking this against
  the MongoDB server directly first.
- **`observatory-ws` is configured by environment variables only**, validated at boot
  (`src/config/env.validation.ts` — it names the bad variable and refuses to start). Seven of them,
  all documented in `.env.example`; two are easy to miss because they look like one setting:
  `MONGO_MAX_TIME_MS` (5s, filter-only queries) and `MONGO_SEARCH_MAX_TIME_MS` (20s, applied only
  when `q=` is present). There is no config file and no `environments/*.yaml` — deliberately, so
  the image carries nothing environment-specific.
- Install deps with `npm ci`, **never `npm install`**, in whichever app you're working in — a
  bare install can silently upgrade/break a pinned toolchain (and, in `observatory-ws/`'s case,
  could silently pull in the incompatible Mongoose major above). If you need to add or bump a
  dependency, do it deliberately (edit that app's `package.json`, then
  `npm install <pkg>@<version>` from inside it), not as a side effect of an unrelated task.

## Common commands

Run from the repo root (delegates into each app via `npm run <script> --prefix <app>` — this
actually `chdir`s into that app before running, confirmed directly; it is not just a
package.json/node_modules path override — no npm-workspaces hoisting, each app keeps its own
independent install) or from inside the app directly — both work:

```bash
npm run start             # observatory-ui dev server, http://localhost:4200
npm run build-dev         # observatory-ui dev build -> observatory-ui/dist/
npm run build-prod        # observatory-ui production build -> observatory-ui/dist/
npm test                  # observatory-ui unit tests (Vitest)
npm run deploy-prod-quick # build-prod, then rsync dist/ to the production host

npm run start:ws          # observatory-ws dev server w/ hot reload, http://localhost:3000
npm run build:ws          # observatory-ws production build -> observatory-ws/dist/
npm run test:ws           # observatory-ws unit tests (Jest)
npm run lint:ws           # observatory-ws ESLint
```

`observatory-ui` has its own `npm run lint` (ESLint) and `npm run test` (Vitest) runnable from
inside that folder; there is no `e2e` script (protractor was removed, dead upstream).
`observatory-ws` likewise has its own `npm run lint`/`npm test`/`npm run build` runnable directly
from inside `observatory-ws/`.

`npm run deploy-prod-quick` **pushes straight to the live production server** over rsync with
`--delete`. Never run it as a side effect of something else, on uncommitted/unreviewed changes,
or without the user explicitly asking to deploy right now. Production deployment (Docker or
otherwise) is ultimately owned by the hosting lab, not by ad-hoc commands run from a laptop. The
same caution applies to anything that would touch `observatory-ws`'s production config or the MongoDB server
in production — local dev against the MongoDB server over the VPN, read-only, is fine and expected (see
`observatory-ws/.env.example`); writes, schema changes, or touching any other database on that
host are not.

## Skills

- **`.claude/skills/schema-version/SKILL.md`** — the only skill in this repo. Use it for anything
  that touches `schema/`: pulling vocab/schema updates from `dome-triage`, deciding the semver
  bump, cutting a new immutable release, writing the changelog entry, and re-syncing
  `observatory-ui/src/assets/vocab/`. Don't hand-roll a release; the skill exists because the
  release folders are immutable and the sync/validate steps are easy to forget. Background on the
  folder itself is in `schema/README.md`.

## Repo layout

- `observatory-ui/src/app/` — one folder per route/feature: `home`, `search`, `record`,
  `journals`, `news`, `navbar`, `footer`, `not-found`, plus `about/` and `download/`, which are
  each a side-nav layout wrapping several child-route pages. Two non-route folders alongside them:
  `core/` (models, services, the URL<->query parsing in `search-params.ts`, outbound-link and
  citation helpers) and `shared/` (`line-chart`, `copy-button`, `side-nav`, `status-badge`).
- `observatory-ui/src/assets/data/content-items.json` — hand-maintained news/event feed consumed
  by the `news` feature. Entries are plain objects (`type`, `date`, `title`, `description`,
  `link`, `linkText`, `linkIcon`, `tags`); follow the existing shape and keep `date` as a
  human-readable string like the surrounding entries, not ISO.
- `observatory-ui/scripts/sync_news.py` (`npm run sync-news`) — pulls that `content-items.json`
  from the **private** `BioComputingUP/dome-ml-ui` repo via the GitHub contents API, needing a
  token (`$GITHUB_TOKEN` → `$GH_TOKEN` → `gh auth token`). Deliberately manual, never wired to a
  `pre*` hook — don't automate it.
- `observatory-ui/scripts/convert_images.py` — image conversion helper (PNG→WebP, needs Python 3
  with `Pillow`). **Currently stale**: its paths are hardcoded to `dome-ml-osai-ui`, a different
  repo, so it does not run against this one as-is. Fix the paths before using it rather than
  assuming it works.
- `schema/` — the versioned record schema and its controlled vocabularies (EDAM domain tiers,
  learning paradigm, model family, model type seed). Source of truth for `observatory-ui`'s
  search filters/record model and for `observatory-ws`'s Mongoose schema. **Never hand-edit a
  published `schema/releases/vX.Y.Z/` folder** — use the `schema-version` skill, which also
  re-syncs `observatory-ui/src/assets/vocab/` (generated, gitignored — don't hand-edit that
  either). See `schema/README.md`.
- `schema/generate_facet_stats.py` — writes `schema/stats/facet-stats.json`. **Not a UI input as
  of Phase 7**: `observatory-ui`'s search page now reads facet counts and corpus-wide metrics live
  from `observatory-ws`'s `GET /api/stats` (`RecordsService.getFacetStats()`), not this file. The
  script still exists for offline/fixture-mode work (regenerating a snapshot against
  `observatory-ui/fixtures/sample-records.json` with no `observatory-ws` running) and its
  `--from-api <base-url>` mode is still useful as a manual sanity-check against a running backend,
  it just no longer feeds anything the app reads.
- `observatory-ui/fixtures/sample-records.json` — the 200-record dev fixture. Lives outside
  `src/assets/` on purpose (Phase 7) so it doesn't ship in production builds; nothing in the
  running app reads it directly any more (search hits the real API), but
  `generate_facet_stats.py`'s default mode and anyone testing offline still use it.
- `observatory-ws/src/records/records.query.ts` — the pure, HTTP- and Mongo-free query-building
  core (filter/sort/pagination logic), deliberately mirroring `observatory-ui/src/app/core/
  search-params.ts`'s parsing rules field-for-field (e.g. absent `class` param defaults to
  positive, `class=` explicitly clears it) so a shared search-results URL from the frontend is a
  valid `/api/records` query string with no translation layer. If you change filter behaviour on
  one side, check whether the other needs the matching change.
  **Multi-value filters are repeatable params (`?jrnl=A&jrnl=B`) and their values are matched
  verbatim — never split a filter value on a delimiter.** They used to be comma-joined, which
  silently destroyed every facet value containing a comma: `Bioinformatics (Oxford, England)`
  (2,663 records) matched nothing, and so did most multi-part MeSH headings and several EDAM
  domain terms we ship. `class` is the sole exception and still comma-splits — fixed literals, a
  documented API contract, and the `class=` cleared-signal that `canUseTextIndex` depends on.
- `observatory-ws/src/records/records.service.ts` — free-text search, and the one place the Mongo
  indexes matter. Two indexes exist on the collection (built 2026-09-03): `positives_text` (a
  `$text` index on title/abstract/authors, scoped by `partialFilterExpression` to
  `classification: 'positive'`) and `class_year_id`. Three rules:
  - **The `$text` path is gated on `classification` resolving to exactly `['positive']`**
    (`canUseTextIndex`). This is not an optimisation — MongoDB **rejects** a `$text` query that
    omits a partial index's filter predicate rather than degrading to a scan, so getting the guard
    wrong turns every cleared-classification search into a 500. `?q=…&class=` returning 200, not
    500, is the single most important regression check on this feature.
  - **A single bare search word deliberately stays on the regex path.** With one term there's no
    second clause to rescue what `$text` misses, and stemming can't match a non-stem fragment
    (`neuro` found 1,701 via the index vs 28,622 via regex). Recall is not traded for speed here.
  - **Detect indexes with `Model.listIndexes()`**, not `collection.listIndexes().toArray()` —
    the latter isn't a cursor on Mongoose 8's bundled driver and throws. The service falls back to
    the regex path silently when the text index is absent, so a dropped-and-reloaded collection
    gets slow rather than broken; recreating both indexes is part of that reload runbook.
- `observatory-ws/src/journals/journals.service.ts` — per-journal figures and year-by-year
  trends. Runs **one aggregation over the whole collection at boot** (~24s, measured) and serves
  every request from the resulting in-memory table with a 24h TTL, exactly like `StatsService`.
  Needs no index and writes nothing. Don't move this to a per-request aggregation: grouping 827k
  documents by journal-and-year on a page view is precisely what the cache exists to avoid on a
  shared database host. Its totals cover the 770,752 records carrying a journal name, not all
  827,061 — anything displaying them has to say so.
- `observatory-ws/src/database/content-model.module.ts` — the **only** place the `'Content'`
  Mongoose model is registered (`records`, `facets`, `stats` and `journals` modules all import
  this rather than each calling `MongooseModule.forFeatureAsync` themselves). Registering the same
  model name from two places on the same connection throws `OverwriteModelError` — don't add a
  second registration to "fix" a missing-model error in a new feature module; import this instead.
- **Boot-time warm-up is a contract, not an implementation detail.** `FacetsService`,
  `StatsService` and `JournalsService` each `await` real Mongo work in `onModuleInit` *before*
  Nest calls `app.listen()` — ~36k distinct facet values, one `$facet` aggregation, and the ~24s
  journals aggregation respectively. That's why the service takes ~40-50s to answer its first
  request on a cold start, and why `observatory-ws/Dockerfile`'s `HEALTHCHECK --start-period` has
  to stay comfortably above it. **If you add another serial warm-up step, re-measure boot time and
  raise `--start-period` to match** — the Dockerfile's own comment says the same thing.

## Things that have gone wrong before — don't reintroduce these

- **`dist/` (in any app) is gitignored and must stay that way** — it's a build artifact, not
  committed. If `git status` ever shows files under a `dist/` folder as trackable, something is
  wrong (e.g. a stray `git add -A`); undo it, don't commit it.
- **Don't run `npm install` to "fix" a dependency issue** in either app — a bare install can
  silently upgrade a pinned toolchain or (in `observatory-ws/`'s case) the Mongoose major
  version, which breaks the MongoDB server connection outright (see Environment above). Use `npm ci`.
- **`observatory-ws`'s Mongo connection uses `lazyConnection: true` plus a `connectionFactory`
  hook that calls `connection.asPromise().catch(...)`** (see `app.module.ts`) — both parts are
  load-bearing, confirmed the hard way against a genuinely unreachable MongoDB server: `lazyConnection`
  alone still crashes the process a few seconds later (Mongoose's internal connection attempt
  becomes an unhandled promise rejection with nothing awaiting it), and a plain
  `connection.on('error', ...)` listener does **not** fix that (the rejection and the `'error'`
  event are two independent things). `@nestjs/mongoose`'s own `onConnectionCreate` option is also
  a dead end here — its source returns early on the lazy path before ever calling it.
  `connectionFactory` is the one hook this package calls unconditionally either way. Don't "clean
  up" this pairing without re-running the VPN-down test (kill the Mongo route, confirm
  `/api/health` still returns 200 and the process doesn't die) — it's easy to write something that
  looks equivalent and isn't.
- This repo previously carried an OSAI-ecosystem YAML-sync feature (`ai_ecosystem` page,
  `scripts/update_yaml.py`, a matching Claude Code skill). It has been removed entirely — this
  is now a from-scratch AI/ML paper-metadata database, not a copy of the OSAI site. If you find
  references to it anywhere, they're stale; remove them rather than trying to restore the
  feature.

## Making changes safely

- Match the existing idioms already in the file you're editing rather than mixing patterns
  within the same feature.
- Run the test suite for whichever app you touched before considering a change done
  (`observatory-ui`: `npm test` + `npm run lint` + `npm run build-prod`; `observatory-ws`:
  `npm run test:ws` + `npm run lint:ws` + `npm run build:ws` from the repo root, or the
  equivalents from inside `observatory-ws/`) — this project has no CI yet, so these local checks
  are the only gate. For `observatory-ws` changes touching Mongo queries, also actually run it
  (`npm run start:ws`) against the MongoDB server over the VPN and hit the affected endpoint with `curl` —
  several real bugs in this backend (wrong collection name, a Mongo-driver version that silently
  can't connect to the MongoDB server at all, a boot sequence that looked fine but crashed the whole process
  the moment Mongo was unreachable) were only caught by actually running it, not by tests or a
  clean build.
- Keep content edits (news items, about-page copy, images) and code edits as separate,
  clearly-described commits where practical.
- Never run `npm run deploy-prod-quick`, or anything touching the production/database hosts,
  without the user explicitly asking for that action in the current request.
