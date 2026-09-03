# DOME Observatory

A searchable database of AI/ML methods-paper metadata: 827,061 publications screened, 355,558
classified as AI/ML methods papers by LLM processing, using a method validated against a
hand-annotated expert benchmark before being scaled, and cross-linked to
[Europe PMC](https://europepmc.org/). Individual records are not curator-reviewed.

Live at [observatory.dome-ml.org](https://observatory.dome-ml.org/). Part of the
[DOME-ML](https://dome-ml.org/) family, alongside the [DOME Registry](https://registry.dome-ml.org/).

## Architecture

A monorepo with two independent apps, matching the lab's usual `*-ui` / `*-ws` split.

| Part | Stack | Role |
|---|---|---|
| [`observatory-ui/`](observatory-ui/) | Angular 22 (standalone components, signals), Bootstrap 5.3, Vitest | Static SPA. **No runtime configuration at all** — no env vars, no `environment.ts`. |
| [`observatory-ws/`](observatory-ws/) | NestJS 11, Mongoose 8, Swagger, Jest | Read-only REST API. The only process in this repo that opens a database connection. |
| [`schema/`](schema/) | Versioned JSON Schema + controlled vocabularies | Build-time input to both apps. See [`schema/README.md`](schema/README.md). |

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
| `GET /api/stats` | Corpus headline figures and facet counts. Cached 24 h. |
| `GET /api/facets/:field` | Typeahead for `journal`, `mesh_headings`, `pub_types`, `license`. Served from an in-memory cache — no database round trip. |
| `GET /api/journals` | Journals ranked by AI/ML methods-paper count or share. |
| `GET /api/journals/detail?journal=` | One journal: totals, year series, rank. |
| `GET /api/docs` | Swagger UI. `/api/docs-json` for the raw OpenAPI document. |

Publicly documented limits, enforced server-side:

- **300 requests/minute per client IP** over a rolling 60 s window; 429 above it.
- **Result window capped at 10,000** — `page × pageSize > 10000` returns 400 rather than silently
  truncating. Use the bulk archive for whole-corpus retrieval.
- **Query budget** 5 s for filter-only queries, 20 s for free-text (`q=`).
- **503, not 500,** when the database is unreachable. Safe to retry with backoff.

## Local development

### Frontend

```bash
cd observatory-ui
nvm use              # Node 24 LTS, pinned in observatory-ui/.nvmrc
npm ci               # never `npm install` -- see AGENTS.md (toolchain pinning)
npm run start        # dev server at http://localhost:4200
```

`npm run build-prod` builds to `observatory-ui/dist/`. The dev server proxies `/api` to
`http://localhost:3000` via [`observatory-ui/proxy.conf.json`](observatory-ui/proxy.conf.json), so
development is same-origin exactly like production.

### Backend

```bash
cd observatory-ws
nvm use               # Node 24, pinned in observatory-ws/.nvmrc
npm ci                # never `npm install` -- see AGENTS.md (Mongoose is version-pinned)
cp .env.example .env  # fill in real values; .env is gitignored, never committed
npm run start:dev     # hot reload at http://localhost:3000
```

Backend development needs network reach to the lab MongoDB host (VPN), read-only. Configuration is
environment variables only, validated at boot — see [Environment variables](#environment-variables).

From the repo root the same commands are available unprefixed (`npm run start`, `npm run build-prod`)
for the frontend and suffixed (`npm run start:ws`, `npm run build:ws`, `npm run test:ws`,
`npm run lint:ws`) for the backend. Each app keeps its own independent install; there is no root
lockfile and no npm-workspaces hoisting.

## Running the whole service with Docker

Two images, no others:

| Image | Base | Size | Notes |
|---|---|---|---|
| `observatory-ui` | `nginx:alpine` | ~70 MB | Serves the built SPA and reverse-proxies `/api/` to the backend. |
| `observatory-ws` | `node:24-alpine` | ~294 MB | Multi-stage, production deps only, runs as the non-root `node` user. |

**Both build from the repo root as context** — each needs `schema/`, which sits outside its own
directory, and Docker refuses to `COPY` anything outside the build context:

```bash
cp .env.example .env   # first time only
docker compose -f docker-compose-local.yml up --build
```

| Service | Host port | Container port |
|---|---|---|
| `observatory-ui` | 8080 | 80 — **the only browser-facing origin** |
| `observatory-ws` | 3000 | 3000 — host side is for `curl`ing the API directly; the browser never uses it |

### Things that will bite you if changed independently

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

## Deploying

Production deployment is owned by the hosting lab, not by this repo's contributors. Both of the
plausible shapes are supported deliberately, so the choice stays open:

**Containers.** [`docker-compose-local.yml`](docker-compose-local.yml) is a working two-service
project intended as the starting point for a production compose file, not as a deployment artifact
itself. It carries no volumes and no secrets.

**Bare process.** `npm run start:prod` in `observatory-ws/` runs `node dist/main` — byte-identical
to the container's `CMD`, so a service-manager deployment needs no Docker at all. The frontend in
that shape is `npm run build-prod` plus serving `observatory-ui/dist/` as static files. This is what
production runs today for the frontend; `npm run deploy-prod-quick` builds and rsyncs `dist/` to it
and is the lab's command to run, not something to invoke casually.

### Networking — where to connect it up

- **The SPA uses relative URLs only.** There is no `apiUrl` constant and no build-time environment
  file. It must be served from a **domain root** with the API co-located at **`/api` on the same
  origin**. Serving it under a path prefix, or putting the API on a different host, will not work
  without code changes. This is the single most important constraint for whoever fronts it.
- Because it is same-origin, **CORS is never exercised** in either shape. `FRONTEND_URL` only
  matters for a split-host deployment or for `ng serve` without the dev proxy. Never set it to `*`.
- The backend binds `0.0.0.0` and expects to sit behind a proxy forwarding `X-Forwarded-For`; it
  sets `trust proxy` so the rate limiter keys on the real client IP rather than the proxy's.
- For a split-host deployment, replace `nginx.conf`'s `$backend` value using nginx:alpine's envsubst
  templating (`/etc/nginx/templates/*.template`) rather than hand-editing the file per environment.
- nginx's `resolver_timeout` is set to 5 s so an unreachable backend fails fast instead of hanging a
  client request for nginx's 30 s default.

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

### Still the lab's call

Production port allocation; whether `/api/` on the live domain is already reserved or proxied;
whether a staging subdomain is wanted; and containers versus a bare process under a service manager.
Nothing in this repo assumes an answer to any of them.

## Why the backend looks the way it does

The boot-time warm caches, the 24 h TTLs, the bounded counts that report `10,000+` rather than an
exact figure, the split query budgets and the hard result window all exist because this is a large
collection on a shared database host running MongoDB 4.2. The two indexes above now carry most of
that load, but the fallback paths stay, because the service has to survive their absence.

## Tests and gates

There is no CI. The local gates are the only gate — run the ones for whichever app you touched:

```bash
npm test          && npm run lint      && npm run build-prod   # observatory-ui
npm run test:ws   && npm run lint:ws   && npm run build:ws     # observatory-ws
```

For backend changes touching database queries, also run it for real against the database and hit the
affected endpoint — several real bugs in this service were only ever caught that way.

## Conventions worth knowing

- **`npm ci`, never `npm install`,** in either app. A bare install can silently upgrade a pinned
  toolchain, and in the backend's case pull a Mongoose major that cannot connect to MongoDB 4.2 at
  all.
- **`dist/` and `observatory-ui/src/assets/vocab/` are generated and gitignored.** A fresh clone has
  no vocabulary files until a build runs — `scripts/sync-schema.js` copies them out of `schema/` and
  is wired to every `pre*` npm hook, so this is automatic, but it does mean `schema/` has to be
  present in the build context.
- **Never hand-edit a published `schema/releases/vX.Y.Z/` folder.** Releases are immutable; see
  [`schema/README.md`](schema/README.md).

## More

- [`ROADMAP.md`](ROADMAP.md) — what is still to build, and the runbooks for the recurring jobs:
  refreshing the corpus on the database server, and the monthly Zenodo archive.
- [`AGENTS.md`](AGENTS.md) — working conventions, and a record of the things that have gone wrong
  before. Read it before changing code, whether you are a person or an AI coding agent.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- [`CITATION.cff`](CITATION.cff) — how to cite this.
- [`LICENSE.md`](LICENSE.md) — CC BY 4.0 on the classification/enrichment layer this project
  adds. The underlying bibliographic metadata and abstracts come largely from Europe PMC and keep
  their own terms; full text is linked, never hosted.
