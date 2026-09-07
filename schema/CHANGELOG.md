# Changelog

All notable changes to the DOME Observatory record schema and its controlled vocabularies.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versioning is semver —
see `README.md` for what counts as major/minor/patch here.

## v1.3.0 — 2026-09-07

Three additive fields so a preprint can say where it was posted. 56,863 corpus documents are
preprints and every one has `publication_metadata.journal: null`, because Europe PMC returns no
`journalTitle` for a `SRC:PPR` record — so the Observatory showed them with no venue at all.

**Added:**
- `publication_metadata.preprint_server` — the server's own name, as Europe PMC gives it in
  `bookOrReportDetails.publisher` (`bioRxiv`, `medRxiv`, `Research Square`, `Preprints.org`, …),
  verbatim casing.
- `source.epmc_source` — which Europe PMC index the record came from: `MED`, `PPR`, `PMC`, `AGR`,
  `PAT`. The authoritative "is this a preprint" test. The corpus query applies no `SRC:`
  restriction, so all five occur.
- `identifiers.epmc_id` — Europe PMC's own accession (`PPR18364`). A Europe PMC article URL is
  `/article/{source}/{id}`, so without this a preprint cannot be linked correctly; the pmid-based
  `/article/MED/` form the frontend builds today is wrong for the 3,157 preprints that carry a PMID.

**Migration note:** additive — no existing field changed, renamed or retyped, and no consumer
breaks. All three read `null` on every document in the corpus right now: nothing populates them
yet. `preprint.md` at the repo root is the specification for the Europe PMC capture and the
~56,863-document backfill that will. Until that runs, `observatory-ui` infers the server from the
DOI prefix at display time (`src/app/core/venue.ts`, table verified against Europe PMC 2026-09-07,
100% prefix coverage of current preprints) and prefers the stored field the moment it appears.

**Still pending:** the upstream `SCHEMA_VERSION` in `dome-observatory-triage`'s `schema.py` is
still `1.2.0`. It has to be bumped to `1.3.0` in the same change that starts emitting these three
fields, or newly-loaded documents will claim a version whose fields they lack.

## v1.2.0 — 2026-09-07 (catch-up; shape dated 2026-09-03)

**A catch-up release, not new work.** The corpus has carried `schema_version: "1.2.0"` on every
document since the 2026-09-03 load, and `dome-observatory-triage`'s `schema.py` has been at 1.2.0
since then, but this folder still stopped at v1.1.0. This publishes the shape that is already live
so the changelog has no hole. Cut alongside v1.3.0.

**Added:**
- `source.decision_provenance` — `llm` / `human_curated` / `registry_confirmed`, never null. Says
  WHO decided a record's classification, which a null `provider` only failed to say. Corpus-wide:
  840,537 llm, 5,960 human_curated, 219 registry_confirmed.
- `publication_metadata.citation_count_updated` and `.citation_source` — so a populated count says
  when it was fetched and from where. A count that cannot be dated ages invisibly, and this is what
  lets a refresh re-fetch only stale entries.

**Changed (descriptions only, no shape change):**
- `publication_metadata.citation_count` was documented as a never-populated placeholder. It is real
  as of the 2026-09-03 load: 830,689 of 846,716 documents (98.11%) carry a count. `null` means "not
  available", never zero.
- `llm_classification` no longer implies the LLM decided every record, and its corpus counts are
  refreshed to the post-2026-09-03 figures (366,234 positive / 473,503 negative / 6,979
  undeterminable).
- `vocab/domain.json` gains `parent_ids` on every term plus a `parent_ids_added` provenance note,
  copied verbatim from upstream. Additive: all 259 terms, their labels, their tier assignments and
  every `max_tags` are unchanged, so nothing previously valid became invalid.

**Migration note:** additive — no existing field changed, renamed or retyped. Every document in the
corpus already conforms; this release documents them rather than asking anything to migrate.

## v1.1.0 — 2026-08-31

Initial publication of this `schema/` folder, brought forward because the search UI and record
page needed it then rather than later. Not a schema
change in itself — the shape and version number (`1.1.0`) already existed in
`dome-triage/mongo_landscape_export/scripts/schema.py`; this is that same shape published here as
a versioned, documented artifact for `observatory-ui` (and, from Phase 5, `observatory-ws`) to
depend on.

**Migration note:** none — this is the first release in this folder. Every one of the 827,061
records in the corpus already conforms to this shape.

**Contents:**
- `ai-ml-landscape.schema.json` — all 5 top-level groups (`identifiers`, `publication_metadata`,
  `source`, `content_filters`, `llm_classification`, `llm_enrichment`), documented field-by-field.
- `ai-ml-landscape.example.json` — one real, positive-classified, open-access record with a full
  identifier set (pmid/pmcid/doi). Its `content_filters` enrichment fields and all of
  `llm_enrichment` are null/empty, same as every other record right now — see the next entry.
- `vocab/domain.json`, `vocab/modelling-branch.json`, `vocab/model-type-seed.json` — the
  controlled vocabularies the enrichment pass (not yet run at this version's publish date) will
  populate `content_filters.domain_tier1-3` / `learning_paradigm` / `model_family` / `model_type`
  from.

**Known state at publish time:** the AI/ML enrichment pass (`content_filters.domain_tier1-3`,
`learning_paradigm`, `model_family`, `model_type`, and all of `llm_enrichment`) has not run on any
record yet. The fields exist in every document (per `schema.py`'s deliberate design — see that
file's docstring) but are `null`/`[]` across the whole corpus. Gavin is loading an initial
enriched batch (~10-20k of the 355,569 positive records) into Mongo shortly after this version's
publish date. **This does not require a schema version bump** — the shape doesn't change, only the
data populating it does. Coverage numbers shown in the UI become live once that batch lands.
