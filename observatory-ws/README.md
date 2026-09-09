# observatory-ws

The DOME Observatory backend: a read-only REST API over the corpus collection, built with NestJS 11
and Mongoose 8. It is the only process in this repository that opens a database connection.

To run it, see [Running it locally](../README.md#running-it-locally) in the root README — Docker
starts this service and the frontend together. For the npm dev-server workflow, see
[`CONTRIBUTING.md`](../CONTRIBUTING.md#backend).

## API

All routes sit under `/api`. Everything is read-only — the service issues no writes. The live
service serves the same reference as Swagger UI at
[observatory.dome-ml.org/api/docs](https://observatory.dome-ml.org/api/docs).

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

### Limits

Enforced server-side. They exist to stop one runaway client degrading a shared database host, not
to ration access — pulling the entire corpus through this API is supported.

- **1200 requests/minute per client IP** over a rolling 60 s window; 429 above it. One budget
  across all endpoints, not one per endpoint. Health checks are exempt.
- **`/api/export` has its own 60/minute budget**, because one request there returns up to 1000
  records. A separate bucket, so an export cannot starve ordinary search traffic. In practice the
  client's bandwidth binds first: the full corpus is **roughly 3 GB** and a whole-corpus walk is
  measured in hours, not minutes. Filter it down if you do not need all of it.
- **Result window capped at 10,000 on `/api/records`** — `page × pageSize > 10000` returns 400
  rather than silently truncating. A *browsing* limit specific to that endpoint, forced by
  MongoDB 4.2's sort ceiling, and the reason `/api/export` exists. Export has no window.
- **Query budget** 5 s for filter-only queries, 20 s for free-text (`q=`), 30 s per export chunk.
- **503, not 500,** when the database is unreachable. Safe to retry with backoff.

### Walking the corpus

A cursor loop — repeat until `X-Next-Cursor` stops coming back:

```bash
cursor=""
while :; do
  curl -sD headers.txt "https://observatory.dome-ml.org/api/export?class=positive&limit=1000${cursor:+&cursor=$cursor}" >> corpus.ndjson
  cursor=$(grep -i '^x-next-cursor:' headers.txt | tr -d '\r' | cut -d' ' -f2)
  [ -n "$cursor" ] || break
done
```

## Environment variables

All configuration is environment variables; the frontend needs none. Every value is validated at
boot, so a missing or malformed one fails startup immediately, naming the offending variable,
rather than failing on the first request that needs it.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | yes | — | Connection string. The server is treated as a standalone (not a replica set), with a 5 s server-selection timeout and a pool of 10. |
| `MONGODB_DB` | yes | — | Database name. |
| `MONGODB_COLLECTION` | yes | — | Collection name. One collection; the service reads nothing else. |
| `PORT` | no | `3000` | Must stay `3000` under the shipped Compose/nginx pair — nginx hardcodes `observatory-ws:3000` as its proxy upstream. |
| `FRONTEND_URL` | no | `http://localhost:4200` | CORS origin allowlist. Never `*`. |
| `MONGO_MAX_TIME_MS` | no | `5000` | `maxTimeMS` for filter-only queries, so a slow query fails fast instead of holding a connection on a shared host. |
| `MONGO_SEARCH_MAX_TIME_MS` | no | `20000` | Larger budget, applied only when `q=` is present. |
| `MONGO_EXPORT_MAX_TIME_MS` | no | `30000` | Budget for one `/api/export` chunk, which is up to 1000 documents rather than 25. |
| `RATE_LIMIT_PER_MINUTE` | no | `1200` | Requests per minute per client IP, one budget across all endpoints. |
| `EXPORT_RATE_LIMIT_PER_MINUTE` | no | `60` | Separate budget for `/api/export`, so a corpus walk cannot starve search traffic. |

Two `.env.example` files exist and are kept identical: the root one feeds the Compose file's
`env_file`, and [`observatory-ws/.env.example`](.env.example) is what non-Docker local dev reads
(the npm scripts `chdir` into `observatory-ws/`, so that is where `@nestjs/config` looks). **Update
both if either changes.**

The service binds `0.0.0.0` and expects to sit behind a proxy forwarding `X-Forwarded-For`. It sets
`trust proxy` to **1**, meaning exactly one proxy hop; raise it to match if another reverse proxy is
added in front, or a client can spoof `X-Forwarded-For` and evade the rate limit.

## Database expectations

A single read-only collection, on MongoDB 4.2. The service never writes, never changes schema, and
never touches any other database on the host.

Two indexes carry most of the search load. The backend checks for the text index at boot and falls
back to a slower regex path if it is absent, so their absence degrades performance rather than
breaking anything — but **if the collection is ever dropped and reloaded, both indexes go with it
and need recreating**:

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

## Startup behaviour

The service warms in-memory caches against the database before it calls `listen()` — facet values,
the corpus stats aggregation, and the journals table. So `/api/*` returns 502 behind the frontend
proxy for roughly the first 40–50 seconds after start, and the caches then hold for 24 h.

The container healthcheck is liveness only: a database blip makes individual requests fail rather
than restart-looping the container. With the database unreachable the process still starts and
stays up — `/api/health` returns 200 and `/api/health/ready` returns 503.
