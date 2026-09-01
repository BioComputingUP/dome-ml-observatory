# DOME Observatory

A searchable database of AI/ML methods-paper metadata: records classified by LLM processing and
validated by human expert curation, cross-linked to [Europe PMC](https://europepmc.org/). It maps
the AI/ML landscape in the life sciences at scale (currently ~827,000 documents).

Live at [observatory.dome-ml.org](https://observatory.dome-ml.org/). Part of the
[DOME-ML](https://dome-ml.org/) family, alongside the [DOME Registry](https://registry.dome-ml.org/).

## Repo layout

This is a monorepo with two independent apps, matching the lab's usual `*-ui` / `*-ws` split
(no shared "core" package between them — any overlapping shapes are duplicated on each side):

- **[`observatory-ui/`](observatory-ui/)** — Angular frontend.
- **[`observatory-ws/`](observatory-ws/)** — NestJS backend: read-only REST API over the Mongo
  dataset (`GET /api/health`, `/api/records`, `/api/records/:pid`, `/api/stats`,
  `/api/facets/:field`; Swagger at `/api/docs`).

The frontend never talks to MongoDB directly — the database has no authentication of its own, so
the backend is the entire security boundary between it and the public internet.

## Local development

### Frontend (`observatory-ui/`)

```bash
cd observatory-ui
nvm use            # pinned Node version, see observatory-ui/.nvmrc
npm ci              # never `npm install` for a routine setup -- see observatory-ui/.nvmrc's
                     # neighbouring toolchain notes; a bare install can upgrade/break pinned deps
npm run start        # dev server at http://localhost:4200
```

`npm run build-prod` builds to `observatory-ui/dist/`. From the repo root, the same commands are
also available unprefixed (`npm run start`, `npm run build-prod`, ...) -- they just delegate into
`observatory-ui/`. Each app keeps its own independent install; there's no shared root lockfile or
npm-workspaces hoisting between them.

### Backend (`observatory-ws/`)

```bash
cd observatory-ws
nvm use              # pinned Node version, see observatory-ws/.nvmrc
npm ci                # never `npm install` -- see AGENTS.md on why (Mongoose version pinning)
cp .env.example .env  # fill in MONGODB_URI etc.; .env is gitignored, never committed
npm run start:dev      # dev server w/ hot reload at http://localhost:3000
```

Config is environment variables only (`MONGODB_URI`, `MONGODB_DB`, `MONGODB_COLLECTION`, `PORT`,
`FRONTEND_URL`, `MONGO_MAX_TIME_MS` — see `.env.example`), validated at boot. Read-only routes
under `/api`; Swagger UI at `http://localhost:3000/api/docs`. From the repo root, the same
commands are also available as `npm run start:ws` / `npm run build:ws` / `npm run test:ws` /
`npm run lint:ws` — they delegate into `observatory-ws/`, same pattern as the frontend's.

### Both together

`docker-compose-local.yml` at the repo root (Phase 6) runs both apps as one Docker project for
local integration testing.

## Deployment

Production deployment is handled by the lab (BioComputingUP), not by this repo's contributors
directly. `npm run deploy-prod-quick` (from the repo root or from `observatory-ui/`) builds the
frontend and rsyncs it to the production host — treat that command as the lab's, not something to
run casually. The backend's production deployment is decided and executed by the lab once a
working local Docker setup exists.

## Citing

See [`CITATION.cff`](CITATION.cff).

## License

See [`LICENSE.md`](LICENSE.md).
