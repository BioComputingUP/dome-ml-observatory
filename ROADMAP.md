# Roadmap

What is still open in this repository. Shipped work is not listed here — the record of what was
built and why is in `AGENTS.md` and the code.

**Check the sister repository first.** [`dome-observatory-triage`](https://github.com/BioComputingUP/dome-observatory-triage)
is the write side: it builds the corpus, authors the document schema and loads the database. Its
`ROADMAP.md` carries the data-side work, including the Zenodo archive and authoring schema v1.3.0.
Anything here that depends on the data depends on that list, so read it before planning here.

## At a glance

| # | Item | Blocked on |
|---|---|---|
| 1 | [Matomo analytics](#1-matomo-analytics) — built, switched off | A site ID from the Matomo admin |
| 2 | [Continuous integration](#2-continuous-integration) — nothing is checked automatically | Nothing |
| 3 | [Finalise and optimise search](#3-finalise-and-optimise-search) | A plan, to be written |
| 4 | [Verify the preprint fields](#4-verify-the-preprint-fields) | The backfill, in the sister repo |
| 5 | [The Zenodo DOI on the site is dead](#5-the-zenodo-doi-on-the-site-is-dead) | Minting a real deposition |

---

## 1. Matomo analytics

Both halves are written and shipped, each inert behind one switch. Nothing is contacted while they
are off, so turning analytics on is flipping two values — no code change, no container rebuild.

| Side | File | Switch | State |
|---|---|---|---|
| Browser page views | `observatory-ui/src/app/core/matomo.ts` | `MATOMO_SITE_ID` in `core/analytics.config.ts` | `null` |
| API usage | `observatory-ws/src/analytics/matomo.interceptor.ts` | `MATOMO_TOKEN` env var | unset |

API tracking exists because `/api/export` makes the whole corpus retrievable, and browser
analytics would see none of that traffic.

**Matomo only, no Google Analytics, no cookie banner.** GA sets non-essential cookies and
transfers data outside the EU/EEA, which would require a consent banner, versioned consent state,
a withdrawal path and a US-transfer disclosure. Matomo is self-hosted by the university,
cookieless (`disableCookies`) and IP-anonymised, so none of that applies. Do not remove the
`disableCookies` call.

The CSP already permits `matomo.biocomputingup.it` in `nginx.conf`. The privacy page reads the
same constant that turns tracking on, so its wording cannot drift.

### Activation

1. **Ask the `matomo.biocomputingup.it` administrator for a site ID.** Name: DOME Observatory.
   URL: `https://observatory.dome-ml.org`. Also confirm, because the privacy page asserts all
   three: IP anonymisation on, a retention period you are willing to publish, EU hosting.
2. **Browser tracking** — set `MATOMO_SITE_ID` in `analytics.config.ts` to the issued ID, rebuild,
   redeploy.
3. **API tracking** — generate a Matomo auth token with tracking scope. Set `MATOMO_SITE_ID` and
   `MATOMO_TOKEN` in the deployment environment for `observatory-ws`, never in a tracked file, and
   restart. The token is required, not optional: without it Matomo attributes every API call to
   the server's own IP rather than the caller's. It is the only credential this service has.
4. **Verify in the container, not `ng serve`** — the CSP only exists in the container and a
   CSP-blocked script fails silently. Check `matomo.js` loads, one request per navigation, no CSP
   violation, and **no cookies set**. Then `curl` an API endpoint and confirm it appears in
   Matomo's real-time log with the caller's IP.

**Rollback**, independently on each side: unset `MATOMO_TOKEN` and restart; or set
`MATOMO_SITE_ID` back to `null` and redeploy. The CSP entry can stay — a permitted host is not a
contacted one.

## 2. Continuous integration

**What this means.** Every check this project has is run by hand, on one machine, by whoever
remembers to. Lint, tests, the production build and the schema validator all exist and all pass,
but nothing runs them when a change is pushed. `.github/` holds issue templates and no workflow.

**Why it matters.** The gap is not "tests might fail" — it is that a change can reach `main`
having been checked on nobody's machine. Two of this project's worst breakages were of exactly
that kind: a bare `npm install` floated Mongoose past `8.x` and silently broke the database
connection, and a cross-directory `COPY schema/` broke the Docker image while a plain
`npm run build` still passed. Both are invisible to a local build and cheap for a machine to catch
every time.

**Proposed: one `ci.yml`, on pull request and push to `main`.** Build only, never deploy —
deployment stays the hosting lab's.

- Node from `.nvmrc`, dependencies with `npm ci`, never `npm install`.
- Both apps: lint, test, build. Currently 187 tests in `observatory-ui`, 185 in `observatory-ws`.
- `python3 schema/validate.py` against the current release.
- `docker build` both images from the repo root context. This is what catches the `COPY schema/`
  class of break.
- Assert `build-prod` produces a flat `dist/` with `index.html` at its root — the single most
  likely silent break to `deploy-prod-quick`.

Branch protection and required status checks want this to exist first.

## 3. Finalise and optimise search

Search works and is fast enough, but the behaviour was assembled incrementally and has known rough
edges: `sort=relevance` actually sorts by `_id`, the text index is bypassed for a single bare word
and for any query that clears the classification filter, and facet counts are corpus-wide rather
than contextual. A plan for this is still to be written, and it depends on decisions in the sister
repository — whether `citation_count` gets an index, and how open vocabularies become facets.

## 4. Verify the preprint fields

Schema v1.3.0 defines `publication_metadata.preprint_server`, `source.epmc_source` and
`identifiers.epmc_id`. Both apps read them; nothing populates them yet. Until then
`observatory-ui/src/app/core/venue.ts` derives the server from the DOI prefix, so cards already
read `Preprint: bioRxiv`.

Once the sister repository authors the fields and backfills the ~56,863 preprint records:
re-verify against real data that the stored value wins over the derived one, restart
`observatory-ws` so the boot-loaded facets pick the new values up, and fix the Europe PMC link —
`core/outbound-links.ts` builds `/article/MED/{pmid}`, which is wrong for the 3,157 preprints that
carry a PMID.

## 5. The Zenodo DOI on the site is dead

`download-bulk.ts` hardcodes `ZENODO_DOI = '10.5281/zenodo.22259905'` and `/download/bulk`
presents it as the permanent release identifier, with a copy button and a citation block. It is
not registered: `doi.org` 404s and Zenodo's API reports "the persistent identifier is not
registered" (re-checked 2026-09-07). Either mint the real deposition and replace the literal, or
revert the page to describing the mechanism without asserting a DOI. The archive job that would
produce that deposition belongs to the sister repository.
