# Contributing to DOME Observatory

Thank you for your interest in contributing to DOME Observatory. This project, hosted by the
**UNIPD Biocomputing Lab**, provides a searchable database of AI/ML methods-paper metadata --
records classified by LLM processing, using a method validated against a hand-annotated expert
benchmark before being scaled, and cross-linked to Europe PMC. Individual records are not
curator-reviewed.

We primarily use a GitHub-based workflow. Contributions are made via Pull Requests (PRs), which
are reviewed and merged by the UNIPD lead developer. For general enquiries or coordination before
starting a large contribution, you can reach the team at **contact@dome-ml.org**.

## On this page
* [Working on the code](#working-on-the-code)
* [How to Contribute](#how-to-contribute)
    * [Reporting Issues or Suggesting Improvements](#reporting-issues-or-suggesting-improvements)
    * [Submitting Changes via Pull Requests](#submitting-changes-via-pull-requests)
* [What to Contribute](#what-to-contribute)
* [What Not to Contribute](#what-not-to-contribute)
* [Contribution Licensing](#contribution-licensing)
* [Review Process](#review-process)

---

## Working on the code

Running the service needs only Docker — see the root [`README.md`](README.md#running-it-locally).
This section is for changing it, which does need a local Node toolchain.

```bash
git clone https://github.com/BioComputingUP/dome-ml-observatory.git
cd dome-ml-observatory
npm run setup                # npm ci in both apps
cp .env.example .env         # then set MONGODB_URI
```

Node 24 is required and pinned in each app's `.nvmrc` (`nvm install && nvm use`, or the equivalent
for `fnm`/`asdf`). This is a monorepo of two independent apps: each keeps its own install, with no
root lockfile and no npm-workspaces hoisting.

You still need a database to develop against. The options and what they need are the same two
modes the README describes; the self-contained `--profile offline` stack is the one that needs no
VPN and no real data, and it is usually the right one to develop against.

### Frontend

```bash
cd observatory-ui
npm run start        # dev server at http://localhost:4200
```

`npm run build-prod` builds to `observatory-ui/dist/`. The dev server proxies `/api` to
`http://localhost:3000` via [`observatory-ui/proxy.conf.json`](observatory-ui/proxy.conf.json), so
development is same-origin exactly like production.

### Backend

```bash
cd observatory-ws
cp .env.example .env   # observatory-ws/.env, not the root one -- see below
npm run start:dev      # hot reload at http://localhost:3000
```

Backend development needs read-only network reach to the MongoDB host — over VPN if that host is
network-restricted. Configuration is environment variables only, validated at boot, and every
variable is documented in the root README's
[Environment variables](README.md#environment-variables) table.

Two `.env.example` files exist and are kept identical: the root one feeds the Compose file's
`env_file`, and [`observatory-ws/.env.example`](observatory-ws/.env.example) is what non-Docker
local dev reads (the npm scripts `chdir` into `observatory-ws/`, so that is where `@nestjs/config`
looks). **Update both if either changes.**

From the repo root the same commands are available unprefixed (`npm run start`,
`npm run build-prod`) for the frontend and suffixed (`npm run start:ws`, `npm run build:ws`,
`npm run test:ws`, `npm run lint:ws`) for the backend.

### Gates

There is no CI yet (see [`ROADMAP.md`](ROADMAP.md)). These local gates are the only gate — run the
ones for whichever app you touched, and make sure they pass before opening a PR:

```bash
npm test        && npm run lint     && npm run build-prod   # observatory-ui
npm run test:ws && npm run lint:ws  && npm run build:ws     # observatory-ws
```

For backend changes touching database queries, also run the service against the real database and
exercise the affected endpoint. Several defects in this service were reproducible only that way.

### Conventions worth knowing

- **`npm ci`, never `npm install`,** in either app. A bare install can silently upgrade a pinned
  toolchain, and in the backend's case pull a Mongoose major that cannot connect to MongoDB 4.2 at
  all.
- **`dist/` and `observatory-ui/src/assets/vocab/` are generated and gitignored.** A fresh clone
  has no vocabulary files until a build runs — `scripts/sync-schema.js` copies them out of
  `schema/` and is wired to every `pre*` npm hook, so this is automatic, but it does mean
  `schema/` has to be present in the build context.
- **Never hand-edit a published [`schema/releases/vX.Y.Z/`](schema/releases/) folder.** Releases
  are immutable; a change means a new release folder. See [`schema/README.md`](schema/README.md)
  and [`schema/CHANGELOG.md`](schema/CHANGELOG.md).

[`AGENTS.md`](AGENTS.md) carries the rest: the working conventions in more depth, and a record of
things that have gone wrong before. Read it before changing code, whether you are a person or an
AI coding agent.

### Deploying without Docker

Supported, but not the documented path — the README covers the container deployment. The backend's
`npm run start:prod` in `observatory-ws/` runs `node dist/main`, byte-identical to the container's
`CMD`, so a systemd or equivalent deployment needs no Docker. The frontend in that shape is
`npm run build-prod` plus serving `observatory-ui/dist/` as static files behind a web server
providing the SPA fallback and the `/api` proxy — [`observatory-ui/nginx.conf`](observatory-ui/nginx.conf)
is a working reference for that configuration.

`npm run deploy-prod-quick` builds the frontend and rsyncs `dist/` to `$DEPLOY_TARGET` with
`--delete`. The target is not committed — set it in your environment:

```bash
DEPLOY_TARGET=user@host:/var/www/dome-ml-observatory/dist/ npm run deploy-prod-quick
```

Without it the script exits before building. It publishes immediately and has no staging step; run
it only as a deliberate deploy.

---

## How to Contribute

### Reporting Issues or Suggesting Improvements
If you find a bug, spot an incorrect or missing record, or have an idea for improving the site or
API:

1. **Check existing issues:** See if someone has already reported the same item or made a similar
   suggestion.
2. **Create a new issue:** If not, please
   [create a new issue](https://github.com/BioComputingUP/dome-ml-observatory/issues).
    * Provide a clear title and description.
    * For bug reports, include steps to reproduce the issue.
    * For complex suggestions, feel free to email **contact@dome-ml.org** to discuss the roadmap.

### Submitting Changes via Pull Requests
This is the preferred way to modify the frontend, backend, or documentation.

1. **Fork the Repository:** Create your own copy of the
   [DOME Observatory repository](https://github.com/BioComputingUP/dome-ml-observatory) on
   GitHub.
2. **Create a Local Branch:** In your fork, create a new branch for your changes.
    ```bash
    git checkout -b feature/add-record-filter
    ```
3. **Make Your Changes:**
    * This is a monorepo -- `observatory-ui/` (Angular frontend) and `observatory-ws/` (NestJS
      backend) are independent apps with their own `package.json` and dependencies. Work inside
      the one relevant to your change, and match the existing style in whichever you touch.
    * See [Working on the code](#working-on-the-code) below for the dev setup of whichever app
      you're touching, and run that app's gates before opening the PR.
4. **Commit Your Changes:**
    ```bash
    git add .
    git commit -m "feat: add year-range filter to record search"
    ```
    (Use clear, descriptive commit messages starting with a prefix like `feat:`, `fix:`, or
    `docs:`.)
5. **Push to Your Fork:**
    ```bash
    git push origin feature/add-record-filter
    ```
6. **Open a Pull Request:**
    * Navigate to the original DOME Observatory repository on GitHub.
    * Click the "New Pull Request" button.
    * Provide a clear title and a brief description of your changes.
    * Submit the Pull Request for review.

---

## What to Contribute
We welcome contributions that add or improve:

* **Frontend:** Search/browse UX, accessibility, and general Angular code quality in
  `observatory-ui/`.
* **Backend:** New read-only query/filter capabilities, performance improvements, and test
  coverage in `observatory-ws/`.
* **Schema:** Well-justified additions or corrections to the record schema, with a matching
  changelog entry.
* **Documentation:** Improvements to the README, API documentation, or setup instructions.
* **Bug Fixes:** Resolving issues in either app or in the way they integrate.

Corrections to a *specific record's* metadata (rather than the code) should go through an issue
rather than a PR: records are generated by the classification pipeline, not hand-edited files in
this repo.

---

## What Not to Contribute
* Off-topic content that does not align with the goal of a FAIR, well-curated AI/ML paper
  metadata database.
* Proprietary code or resources that do not permit open-access sharing.
* Anything that would give the frontend, or any code outside `observatory-ws/`, direct access to
  the MongoDB instance -- the backend is the only thing that talks to the database, by design.
* Changes to core infrastructure or deployment configuration without prior discussion via an
  Issue or email -- production deployment is handled by the lab.
* Promotional material or advertisements.

---

## Contribution Licensing
By contributing to this project, you agree that your contributions will be licensed under the
project's **CC-BY-4.0** license (see [`LICENSE.md`](LICENSE.md)). All contributed content must
respect the copyrights and intellectual property of others.

---

## Review Process
The **UNIPD lead developer** will review all Pull Requests.
* We aim to provide feedback on contributions promptly.
* Requests for changes or clarifications may be made via comments on the Pull Request.
* Once the PR is approved and passes any automated checks, the UNIPD lead developer will merge it
  into the `main` branch.

For any questions regarding the review process or if you need to report an urgent issue, please
contact **contact@dome-ml.org**.

We appreciate your effort in helping the UNIPD Biocomputing Lab build a robust, FAIR resource for
the AI/ML-in-life-sciences community.
