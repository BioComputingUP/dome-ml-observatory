# Changelog

All notable changes to the DOME Observatory record schema and its controlled vocabularies.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versioning is semver —
see `README.md` for what counts as major/minor/patch here.

## v1.1.0 — 2026-08-31

Initial publication of this `schema/` folder, pulled up from Phase 8 of `internal/ROADMAP.md`
into Phase 3 because the search UI and record page need it now rather than later. Not a schema
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
