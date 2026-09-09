# DOME Observatory

[![CI](https://github.com/BioComputingUP/dome-ml-observatory/actions/workflows/ci.yml/badge.svg)](https://github.com/BioComputingUP/dome-ml-observatory/actions/workflows/ci.yml)

A searchable database of AI/ML methods-paper metadata, live at
[observatory.dome-ml.org](https://observatory.dome-ml.org/) and one of the
[DOME-ML](https://dome-ml.org/) family of services alongside the
[DOME Registry](https://registry.dome-ml.org/). Over 800,000 publications have been screened and
more than 360,000 classified as AI/ML methods papers, cross-linked to
[Europe PMC](https://europepmc.org/). Most classifications come from LLM processing, using a method
validated against a hand-annotated expert benchmark before being scaled; over 6,000 records are
human-curated or DOME Registry-confirmed, and the rest are not individually curator-reviewed.

## Architecture

A monorepo with two independent apps, following the `*-ui` / `*-ws` convention used across the
DOME-ML services.

| Part | Stack | Role |
|---|---|---|
| [`observatory-ui/`](observatory-ui/) | Angular 22 (standalone components, signals), Bootstrap 5.3, Vitest | Static SPA. No runtime configuration at all — no env vars, no `environment.ts`. |
| [`observatory-ws/`](observatory-ws/) | NestJS 11, Mongoose 8, Swagger, Jest | Read-only REST API. The only process in this repo that opens a database connection. See [`observatory-ws/README.md`](observatory-ws/README.md). |
| [`schema/`](schema/) | Versioned JSON Schema + controlled vocabularies | Build-time input to both apps. Releases live in [`schema/releases/`](schema/releases/); see [`schema/README.md`](schema/README.md). |

There is no shared `-core` package between the two apps; overlapping types are duplicated on each
side rather than linked.

The SPA uses relative URLs only, so it must be served from a domain root with the API at `/api` on
the same origin.

## Running it locally

Docker is the only supported way to run the service, and there are two modes: against the corpus
database, or self-contained on a bundled 200-record sample. Both start the same two containers with
the same command; the only difference is what `MONGODB_URI` points at.

Both need a `.env` first: `cp .env.example .env`.

```bash
# Mode A -- against the corpus database. Set MONGODB_URI to the corpus host.
# That host is reachable only from the hosting institution's network, so you need
# the University of Padua VPN. It is shared out of band, not through this repository.
docker compose -f docker-compose-local.yml up --build

# Mode B -- self-contained, no VPN and no network access to anything.
# Set MONGODB_URI=mongodb://mongo:27017 in .env first. Starts a throwaway MongoDB
# and seeds it with the sample fixture.
docker compose -f docker-compose-local.yml --profile offline up --build
```

Then open **http://localhost:8080**. `/api/*` returns 502 for the first 40–50 seconds while the
backend warms its caches, which is expected.

```bash
# Same again without rebuilding the images -- much faster once built.
docker compose -f docker-compose-local.yml up
docker compose -f docker-compose-local.yml --profile offline up

# Run in the background, then follow the logs.
docker compose -f docker-compose-local.yml up --build -d
docker compose -f docker-compose-local.yml logs -f

# Stop and remove. Repeat the --profile offline flag, or the mongo containers are left behind.
docker compose -f docker-compose-local.yml down
docker compose -f docker-compose-local.yml --profile offline down -v
```

**Prerequisites.** Docker with a Compose v2 CLI — `docker compose`, space-separated. Node is not
needed to *run* the service, only to work on the code (see
[`CONTRIBUTING.md`](CONTRIBUTING.md#working-on-the-code)). Both images build from the repo root as
context, because each needs `schema/`, which sits outside its own directory.

| Service | Host port | Container port |
|---|---|---|
| `observatory-ui` | 8080 | 80 — the only browser-facing origin |
| `observatory-ws` | 3000 | 3000 — for `curl`ing the API directly; the browser never uses it |

Mode A still comes up if the database is unreachable: `/api/health` returns 200,
`/api/health/ready` returns 503, and the frontend serves.

Mode B is what makes the repository runnable on any machine. The `offline` profile adds a throwaway
MongoDB, then [`offline-database/seed.sh`](offline-database/seed.sh) seeds it from the tracked
fixture ([`observatory-ui/fixtures/sample-records.json`](observatory-ui/fixtures/sample-records.json))
and builds the same two indexes the real collection carries. It is a demo dataset, not a mirror of
production, and it is ephemeral: `down` discards it and the next `up` reseeds. It defaults to
`mongo:7` for multi-architecture support while production runs MongoDB 4.2, so it is not a
version-parity environment; override with `MONGO_IMAGE` for closer parity.

Two things will break the stack quietly if changed:

- **The service name `observatory-ws` and container port `3000` are a hard contract.**
  [`observatory-ui/nginx.conf`](observatory-ui/nginx.conf) hardcodes `observatory-ws:3000` as its
  proxy upstream. That pairing appears in three uncoupled places — the Compose service name, `PORT`
  in `.env`, and the nginx config — and nothing keeps them in sync.
- **A user-defined network is required.** nginx resolves the backend at request time via Docker's
  embedded DNS, which only resolves service names on a user-defined network, not the default
  `bridge`.

**API.** Read-only REST under `/api`, browsable as Swagger at
[`/api/docs`](https://observatory.dome-ml.org/api/docs). Routes, limits, the whole-corpus export
loop and the environment variables are in [`observatory-ws/README.md`](observatory-ws/README.md).

## Tests and CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, tests, builds, both Docker images
and schema validation on every pull request and every push to `main`. It reports on the commit; it
does not block a push. The same gates run locally in seconds — see
[`CONTRIBUTING.md`](CONTRIBUTING.md#gates).

## Support

**[contact@dome-ml.org](mailto:contact@dome-ml.org)** reaches the team, for anything at all —
questions about the data, collaborations, or a request to correct or remove a record.

For anything worth a public trail, open an issue. There is a short form for each kind of report, so
you are not guessing what we need:

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
FAQ covering the behaviours that surprise people most: authors are indexed as surname plus initials,
search starts from the AI/ML positives rather than the whole screened corpus, and a single uncommon
search term takes a slower, higher-recall path.

## Key links and further information

- [`observatory-ws/README.md`](observatory-ws/README.md) — the API reference, environment variables
  and database expectations.
- [`schema/README.md`](schema/README.md) — the record schema and controlled vocabularies, and how
  releases are versioned.
- [`ROADMAP.md`](ROADMAP.md) — what is still to build, and the runbooks for the recurring jobs:
  refreshing the corpus, and the monthly Zenodo archive.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to propose a change, and the npm dev workflow, local
  gates and code conventions. · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- [`AGENTS.md`](AGENTS.md) — working conventions, and a record of the things that have gone wrong
  before. Read it before changing code, whether you are a person or an AI coding agent.
- [`CITATION.cff`](CITATION.cff) — how to cite this.
- [`LICENSE.md`](LICENSE.md) — CC BY 4.0 on the classification/enrichment layer this project adds.
  The underlying bibliographic metadata and abstracts come largely from Europe PMC and keep their
  own terms; full text is linked, never hosted.
