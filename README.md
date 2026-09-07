# DOME Observatory

[![CI](https://github.com/BioComputingUP/dome-ml-observatory/actions/workflows/ci.yml/badge.svg)](https://github.com/BioComputingUP/dome-ml-observatory/actions/workflows/ci.yml)

A searchable database of AI/ML methods-paper metadata: 846,716 publications screened, 366,234
classified as AI/ML methods papers, and cross-linked to [Europe PMC](https://europepmc.org/).
Most classifications come from LLM processing, using a method validated against a hand-annotated
expert benchmark before being scaled; 6,179 records are human-curated or DOME Registry-confirmed.
The rest are not individually curator-reviewed.

Live at [observatory.dome-ml.org](https://observatory.dome-ml.org/). Part of the
[DOME-ML](https://dome-ml.org/) family, alongside the [DOME Registry](https://registry.dome-ml.org/).

## Architecture

A monorepo with two independent apps, following the `*-ui` / `*-ws` convention used across the
DOME-ML services.

| Part | Stack | Role |
|---|---|---|
| [`observatory-ui/`](observatory-ui/) | Angular 22 (standalone components, signals), Bootstrap 5.3, Vitest | Static SPA. **No runtime configuration at all** — no env vars, no `environment.ts`. |
| [`observatory-ws/`](observatory-ws/) | NestJS 11, Mongoose 8, Swagger, Jest | Read-only REST API. The only process in this repo that opens a database connection. |
| [`schema/`](schema/) | Versioned JSON Schema + controlled vocabularies | Build-time input to both apps. Current release: [`schema/releases/v1.1.0/`](schema/releases/v1.1.0/). See [`schema/README.md`](schema/README.md). |

There is deliberately no shared `-core` package between the two apps; overlapping types are
duplicated on each side rather than linked.

**The backend is the entire security boundary.** The MongoDB instance has no authentication of its
own, so the frontend never receives a connection string and the database port is never published.
This is a hosting requirement, not a style preference.

## API

All routes sit under `/api`. Everything is read-only — the service issues no writes.

| Route | Purpose |
|---|---|
| `GET /api/health` | Liveness. Never touches the database. This is the container healthcheck target. |
| `GET /api/health/ready` | Readiness. Pings the database; returns db/collection name, estimated document count and the active schema version. |
| `GET /api/records` | Paginated search. All filter params mirror the frontend's URL params exactly. |
| `GET /api/records/:pid` | Single record. `pid` is a UUID5 string, not an ObjectId. |
| `GET /api/export` | Whole-corpus retrieval as NDJSON, keyset-paginated on `_id`. No result window; takes every `/api/records` filter. |
| `GET /api/stats` | Corpus headline figures and facet counts. Cached 24 h. |
| `GET /api/facets/:field` | Typeahead for `journal`, `mesh_headings`, `pub_types`, `license`. Served from an in-memory cache — no database round trip. |
| `GET /api/journals` | Journals ranked by AI/ML methods-paper count or share. |
| `GET /api/journals/detail?journal=` | One journal: totals, year series, rank. |
| `GET /api/docs` | Swagger UI. `/api/docs-json` for the raw OpenAPI document. |

Publicly documented limits, enforced server-side. They exist to stop one runaway client degrading
a shared database host, not to ration access — pulling the entire corpus through this API is
supported:

- **1200 requests/minute per client IP** over a rolling 60 s window; 429 above it. One budget
  across all endpoints, not one per endpoint. Health checks are exempt.
- **`/api/export` has its own 60/minute budget**, because one request there returns up to 1000
  records. A separate bucket, so an export cannot starve ordinary search traffic. The limit
  permits 60,000 records/minute, but in practice the client's bandwidth binds first, not the
  limit: records average ~3.7 KB, so the full corpus is **roughly 3 GB** and a whole-corpus walk
  is measured in hours, not minutes. Filter it down if you do not need all of it.
- **Result window capped at 10,000 on `/api/records`** — `page × pageSize > 10000` returns 400
  rather than silently truncating. A *browsing* limit specific to that endpoint, forced by
  MongoDB 4.2's sort ceiling, and the reason `/api/export` exists. Export has no window.
- **Query budget** 5 s for filter-only queries, 20 s for free-text (`q=`), 30 s per export chunk.
- **503, not 500,** when the database is unreachable. Safe to retry with backoff.

Walking the corpus is a cursor loop — repeat until `X-Next-Cursor` stops coming back:

```bash
cursor=""
while :; do
  curl -sD headers.txt "https://observatory.dome-ml.org/api/export?class=positive&limit=1000${cursor:+&cursor=$cursor}" >> corpus.ndjson
  cursor=$(grep -i '^x-next-cursor:' headers.txt | tr -d '\r' | cut -d' ' -f2)
  [ -n "$cursor" ] || break
done
```

## Running it locally

Docker is the only supported way to run the service, and there are exactly two ways to run it:
against the corpus database, or entirely self-contained on the bundled sample entries. Both start
the same two containers with the same command; the only thing that differs is what `MONGODB_URI`
points at.

**Prerequisites.** Docker with a Compose v2 CLI — `docker compose`, space-separated. The Compose
file deliberately has no `version:` key, which Compose v1 misparses. Nothing else: Node is not
needed to *run* the service, only to work on the code (see
[`CONTRIBUTING.md`](CONTRIBUTING.md#working-on-the-code)).

Two images are built, no others:

| Image | Base | Size | Notes |
|---|---|---|---|
| `observatory-ui` | `nginx:alpine` | ~70 MB | Serves the built SPA and reverse-proxies `/api/` to the backend. |
| `observatory-ws` | `node:24-alpine` | ~294 MB | Multi-stage, production deps only, runs as the non-root `node` user. |

**Both build from the repo root as context** — each needs `schema/`, which sits outside its own
directory, and Docker refuses to `COPY` anything outside the build context.

### Mode A — against the corpus database

```bash
cp .env.example .env    # first time only; .env is gitignored and never committed
# set MONGODB_URI to the corpus host, then:
docker compose -f docker-compose-local.yml up --build
```

The corpus database is read-only and **not publicly routable** — it is reachable only from inside
the hosting institution's network, so you need to be on its VPN (University of Padua) for the
connection to resolve at all. The host itself is shared out of band, never through this
repository; it is the one genuinely sensitive value in the configuration.

Without that reachability the stack still comes up rather than failing: `/api/health` returns 200,
`/api/health/ready` returns 503, and the frontend serves. That is deliberate — see
[Expected startup behaviour](#expected-startup-behaviour).

A MongoDB running on your own machine, outside Compose, is reachable as
`mongodb://host.docker.internal:27017`. Plain `localhost` will not work from inside a container.

### Mode B — self-contained, on the bundled sample entries

```bash
cp .env.example .env    # first time only
# set MONGODB_URI=mongodb://mongo:27017, then:
docker compose -f docker-compose-local.yml --profile offline up --build
```

No network access to anything, no VPN, no credentials. The `offline` profile adds a throwaway
MongoDB, then [`offline-database/seed.sh`](offline-database/seed.sh) seeds it from the tracked
200-record fixture
([`observatory-ui/fixtures/sample-records.json`](observatory-ui/fixtures/sample-records.json)) and
builds the same two indexes the real collection carries. The backend waits for the seed to finish
before starting, because it warms its caches once at boot and then holds them for 24 h — start it
mid-seed and it caches "0 records" and serves that all day.

This is what makes the repository runnable and reviewable on any machine. It is a demo dataset,
not a mirror of production, and it is ephemeral: `down` discards it and the next `up` reseeds. The
image defaults to `mongo:7` for multi-architecture support, while production runs MongoDB 4.2, so
it is not a version-parity environment. Override with `MONGO_IMAGE` if you need closer parity.

### Either mode

| Service | Host port | Container port |
|---|---|---|
| `observatory-ui` | 8080 | 80 — **the only browser-facing origin** |
| `observatory-ws` | 3000 | 3000 — host side is for `curl`ing the API directly; the browser never uses it |

### Coupled settings

- **The service name `observatory-ws` and the container port `3000` are a hard contract.**
  [`observatory-ui/nginx.conf`](observatory-ui/nginx.conf) hardcodes `observatory-ws:3000` as its
  proxy upstream. That pairing appears in three uncoupled places — the Compose service name, `PORT`
  in `.env`, and the nginx config — and nothing keeps them in sync. Renaming or re-porting one
  silently breaks the frontend.
- **A user-defined network is required.** nginx resolves the backend at request time via Docker's
  embedded DNS (`resolver 127.0.0.11`), which only resolves service names on a user-defined network,
  not the default `bridge`.
- **`depends_on` is start-order only, deliberately.** nginx tolerates a not-yet-ready backend by
  design, so health-gating startup would only add dead time.

### Expected startup behaviour

The backend warms in-memory caches against the database before it calls `listen()` — facet values,
the corpus stats aggregation, and the journals table. Consequently:

- `/` serves immediately; `/api/*` returns **502 for roughly the first 40–50 seconds**. This is
  designed tolerance, not a fault.
- The backend's healthcheck is **liveness only**, deliberately: a database blip must make individual
  requests fail, not restart-loop the container.
- With the database unreachable the process still starts and stays up — `/api/health` returns 200,
  `/api/health/ready` returns 503, and the process does not die.

## Server deployment

[`docker-compose-local.yml`](docker-compose-local.yml) is a working two-service project and the
intended starting point for a production Compose file. It carries no volumes and no secrets. Build
both images from the repository root as context.

**What a production Compose file changes** relative to it:

- Do not publish the backend port. Only the frontend needs to be reachable; the backend is
  reached over the internal network by service name.
- Set `MONGODB_URI` and `FRONTEND_URL` to real values.
- Set a restart policy appropriate to the host's orchestration.
- Do not enable the `offline` profile — it exists for local development only.

Deploying without Docker is also possible — the backend's start command is byte-identical either
way — but it is a contributor/operator path rather than the documented one, so it lives in
[`CONTRIBUTING.md`](CONTRIBUTING.md#deploying-without-docker) alongside the rest of the npm
workflow.

### Decisions the deployment makes

The repository is neutral on all of these, and none of them require code changes:

| Decision | Constraint it must satisfy |
|---|---|
| Published ports | The frontend is the only browser-facing origin. The backend port need not be published at all. |
| `/api` on the live domain | Must resolve to the backend on the same origin as the SPA — see below. |
| Containers or bare process | Both supported; the backend's start command is identical either way. |
| Staging environment | Nothing in the repository is environment-specific; a second deployment needs only different env values. |
| TLS and DNS | Terminated in front of the frontend. The backend expects `X-Forwarded-*` headers from it. |

### Networking — what to connect where

- **The SPA uses relative URLs only.** There is no `apiUrl` constant and no build-time environment
  file. It must be served from a **domain root** with the API co-located at **`/api` on the same
  origin**. Serving it under a path prefix, or putting the API on a different host, will not work
  without code changes. This is the single most important constraint for whoever fronts it.
- Because it is same-origin, **CORS is never exercised** in either shape. `FRONTEND_URL` only
  matters for a split-host deployment or for `ng serve` without the dev proxy. Never set it to `*`.
- The backend binds `0.0.0.0` and expects to sit behind a proxy forwarding `X-Forwarded-For`; it
  sets `trust proxy` to **1**, meaning exactly one proxy hop. If you put another reverse proxy in
  front of the frontend container, raise that value to match the real hop count — otherwise a
  client can spoof `X-Forwarded-For` and evade the rate limit.
- The frontend container sets the site's security headers, including its Content Security Policy
  (see [`observatory-ui/nginx.conf`](observatory-ui/nginx.conf)). It listens on plain HTTP, so
  `Strict-Transport-Security` is left to whatever terminates TLS in front of it.
- For a split-host deployment, replace `nginx.conf`'s `$backend` value using nginx:alpine's envsubst
  templating (`/etc/nginx/templates/*.template`) rather than hand-editing the file per environment.
- nginx's `resolver_timeout` is set to 5 s so an unreachable backend fails fast instead of hanging a
  client request for nginx's 30 s default.

### Secrets and configuration

The service has **no credentials**. Every setting is one of the environment variables below; none
is a password, token or key, and none reaches the browser — the SPA has no build-time
configuration and issues only relative-URL requests.

- The real `.env` is **never committed**. `.gitignore` matches `.env` at any depth, and
  `.dockerignore` excludes it from every build context, so it cannot reach an image layer either.
- `.env.example` documents every variable with placeholder values and is the file to keep
  up to date.
- The only genuinely sensitive value is whatever host `MONGODB_URI` points at, when that host is
  not publicly reachable. Share it out of band, not through this repository.
- Anything CI needs later — for example a Zenodo API token for the planned archive workflow —
  belongs in **GitHub repository Actions secrets**, referenced by name from the workflow and
  never written to a file in the repository.

### Environment variables

All backend. The frontend needs none. Every value is validated at boot; a missing or malformed one
fails startup immediately, naming the offending variable, rather than failing on the first request
that needs it.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | yes | — | Connection string. The server is treated as a standalone (not a replica set), with a 5 s server-selection timeout and a pool of 10. |
| `MONGODB_DB` | yes | — | Database name. |
| `MONGODB_COLLECTION` | yes | — | Collection name. One collection; the service reads nothing else. |
| `PORT` | no | `3000` | Must stay `3000` under the shipped Compose/nginx pair — see above. |
| `FRONTEND_URL` | no | `http://localhost:4200` | CORS origin allowlist. Never `*`. |
| `MONGO_MAX_TIME_MS` | no | `5000` | `maxTimeMS` for filter-only queries, so a slow query fails fast instead of holding a connection on a shared host. |
| `MONGO_SEARCH_MAX_TIME_MS` | no | `20000` | Larger budget, applied only when `q=` is present. |
| `MONGO_EXPORT_MAX_TIME_MS` | no | `30000` | Budget for one `/api/export` chunk, which is up to 1000 documents rather than 25. |
| `RATE_LIMIT_PER_MINUTE` | no | `1200` | Requests per minute per client IP, one budget across all endpoints. |
| `EXPORT_RATE_LIMIT_PER_MINUTE` | no | `60` | Separate budget for `/api/export`, so a corpus walk cannot starve search traffic. |

Two `.env.example` files exist and are kept identical: the root one feeds the Compose file's
`env_file`, and [`observatory-ws/.env.example`](observatory-ws/.env.example) is what non-Docker local
dev reads (the npm scripts `chdir` into `observatory-ws/`, so that is where `@nestjs/config` looks).
Update both if either changes.

### Database expectations

A single read-only collection, on MongoDB 4.2. The service never writes, never changes schema, and
never touches any other database on the host.

Two indexes exist and carry most of the search load. The backend checks for the text index at boot
and silently falls back to a slower regex path if it is absent, so their absence degrades
performance rather than breaking anything — but **if the collection is ever dropped and reloaded,
both indexes go with it and need recreating**:

```js
db.Content.createIndex(
  { "publication_metadata.title": "text",
    "publication_metadata.abstract": "text",
    "publication_metadata.authors": "text" },
  { name: "positives_text",
    partialFilterExpression: { "llm_classification.classification": "positive" },
    weights: { "publication_metadata.title": 10,
               "publication_metadata.authors": 5,
               "publication_metadata.abstract": 1 },
    background: true });

db.Content.createIndex(
  { "llm_classification.classification": 1, "publication_metadata.year": -1, _id: 1 },
  { name: "class_year_id", background: true });
```

Measured on the live collection: `class_year_id` builds in ~4 s for ~37 MB; `positives_text` takes
~3 minutes for ~390 MB, plus roughly 1 GB of transient sort files. Both use `background: true`, and
the collection stayed readable throughout the build.

## Design constraints

The boot-time warm caches, 24 h TTLs, bounded counts that report `10,000+` rather than an exact
figure, split query budgets and hard result window all follow from one fact: this is a large
collection on a shared database host running MongoDB 4.2. The indexes above now carry most of that
load, but the fallback paths remain, because the service must survive their absence.

## Tests and gates

There is no CI yet (see [`ROADMAP.md`](ROADMAP.md)); the local gates are the only gate. They, the
npm dev-server workflow and the repository's code conventions all live in
[`CONTRIBUTING.md`](CONTRIBUTING.md#working-on-the-code) — running the service needs none of them,
only Docker.

One rule is worth repeating here because it is a deployment concern rather than a contributor one:
for backend changes touching database queries, run the service against the real database and
exercise the affected endpoint. Several defects in this service were reproducible only that way.

## Support

**[contact@dome-ml.org](mailto:contact@dome-ml.org)** reaches the team, for anything at all —
questions about the data, collaborations, or a request to correct or remove a record.

For anything worth a public trail, open an issue. There is a short form for each kind of report,
so you are not guessing what we need:

| Template | Use it for |
|---|---|
| A record is wrong or missing | A paper misclassified, wrong metadata, or absent from the corpus. |
| Search isn't finding what I expect | A search returning nothing, too little, or the wrong things. |
| Something on the site is broken | A page that errors or renders wrong. |
| A question or suggestion | Everything else. |

The forms live in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/). Blank issues stay enabled —
the forms are there to save people guesswork, not to refuse anything that does not fit one of four
shapes.

The [Support page](https://observatory.dome-ml.org/about/support) carries the same routes plus an
FAQ covering the behaviours that surprise people most — authors are indexed as surname plus
initials, search starts from the AI/ML positives rather than the whole screened corpus, and a
single uncommon search term deliberately takes a slower, higher-recall path. A Google Group for
release announcements is planned; until it exists, email is the route.

## More

- [`ROADMAP.md`](ROADMAP.md) — what is still to build, and the runbooks for the recurring jobs:
  refreshing the corpus on the MongoDB server, and the monthly Zenodo archive.
- [`AGENTS.md`](AGENTS.md) — working conventions, and a record of the things that have gone wrong
  before. Read it before changing code, whether you are a person or an AI coding agent.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to propose a change, and the npm dev workflow, local
  gates and code conventions for working on either app. · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- [`CITATION.cff`](CITATION.cff) — how to cite this.
- [`LICENSE.md`](LICENSE.md) — CC BY 4.0 on the classification/enrichment layer this project
  adds. The underlying bibliographic metadata and abstracts come largely from Europe PMC and keep
  their own terms; full text is linked, never hosted.
