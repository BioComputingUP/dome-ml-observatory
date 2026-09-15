# Changelog

All notable changes to the DOME Observatory record schema and its controlled vocabularies.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versioning is semver —
see `README.md` for what counts as major/minor/patch here.

## Unreleased

**Repository rename, 2026-09-07.** The upstream write-side repository was renamed
`dome-observatory-triage` → `dome-ml-observatory-triage`, so its name matches this one and the pair
reads as one system. Nothing about the schema changed. Every reference in this repository was
updated except the two published releases below: `v1.2.0/` and `v1.3.0/` still name
`dome-observatory-triage` in their `description`, because a release folder is immutable once
published (see `README.md`) and is never edited in place. GitHub redirects the old name, so those
strings still resolve. The next release will carry the new name.

## v1.6.0 — 2026-09-15

A record-level datestamp, so the corpus can be harvested incrementally.

**Added:** top-level `record_modified` (`string | null`, date-time): when the record last changed in
a field the Observatory's metadata exposes -- the Dublin Core served over OAI-PMH and the schema.org
JSON-LD on record pages. UTC to the second, `YYYY-MM-DDThh:mm:ssZ`, which is OAI-PMH's granularity
and one fixed width, so values compare correctly as strings. It moves when a load writes the
document, or when an enrichment, licence, preprint, data-links or identifiers write changes one of
its values; never for a citation-count refresh or a version-stamp migration, so neither forces a
full re-harvest. OAI-PMH `from`/`until` and the sitemap's `lastmod` read it.

**Changed (description):** `schema_version` is bumped on every release, a vocabulary-only release
included (the v1.5.1 precedent), not only when the document shape changes.

**Migration note:** additive for consumers; a reader that ignores unknown fields needs nothing. In
dome-ml-observatory-triage, `migrate_v1_6_0.py` moves `schema_version` from 1.5.1 to 1.6.0 and sets
`record_modified` to the migration's run time on every document, in one `updateMany` (a harvester's
first harvest is a full one whatever the date says; the group timestamps stay as provenance). Its
`ensure_indexes.py` then builds `record_modified_positive` (`{record_modified: 1, _id: 1}`, partial
on positives), the keyset the OAI-PMH and sitemap walks page by. The example predates the migration,
so its `record_modified` is null.

**Migrated 2026-09-15:** `migrate_v1_6_0.py` stamped all 846,716 documents (`record_modified` = 2026-09-15T20:09:03Z)
and `ensure_indexes.py` built `record_modified_positive` in 2.8 s. `verify_corpus.py` passed and
`check_alignment.py --live` reported `aligned`.

## v1.5.1 — 2026-09-15

The two modelling vocabularies carry ontology ids for their terms.

**Changed (vocabulary metadata, additive):** every term in `vocab/modelling-branch.json` and
`vocab/model-type-seed.json` gains `ontology_mappings`, plus an `ontology_mappings_added` note,
copied verbatim from upstream. Each entry is an accepted match to a MeSH, AIO, NCIT, OBI, SWO,
STATO or EDAM term, with its `id`, `iri`, `label`, SKOS `predicate` and provenance. 87 mappings:
13 of the 17 learning-paradigm and model-family terms, and 31 of the 76 model-type seed terms (16
with a MeSH id, up from 2). No term, label, alias, `mesh_id` or `max_tags` changed.
`vocab/domain.json` and the record shape are unchanged; the schema differs from v1.5.0 only in `$id`
and the `content_filters` description. How the ids were sourced:
[`docs/vocabulary_ontology_mappings.md`](https://github.com/BioComputingUP/dome-ml-observatory-triage/blob/main/docs/vocabulary_ontology_mappings.md) in dome-ml-observatory-triage.

**Migration note:** nothing for consumers. Nothing previously valid became invalid, and the
enrichment prompt renders identically. In dome-ml-observatory-triage, `migrate_v1_5_1.py` moves
`schema_version` from 1.5.0 to 1.5.1 in one `updateMany`. Rebuild the apps so `CURRENT` and the UI
vocabulary copy follow.

## v1.5.0 — 2026-09-14

EBI Search's database-side links join Europe PMC's in `data_links`, and the DOME Registry
cross-reference is filled.

**Added (inside the existing arrays; no field path added or removed):**
- `data_links.sources` may carry `"ebisearch"`: the record's links were also looked up in EBI
  Search, where a repository, bio.tools or the DOME Registry names the paper by its PMID, PMCID or
  DOI. Positives only; present even when EBI Search found nothing.
- `data_links.resources[].routes`: every route that found a link to the resource
  (`tm_accession`, `tm_supplementary`, `ext_links`, `derived`, `ebisearch_xref`,
  `ebisearch_domain`), so a card can say when the article and the repository agree.
- `data_links.resources[].browse_url`: one page at the source listing every entry of the resource
  for the paper, where the source has one (NCBI GEO today); null otherwise.
- `data_links.links[].matched_by` (`pmid` | `pmcid` | `doi`) and `.source_domain` (the EBI Search
  domain that asserted the link); null for the Europe PMC routes.
- Documented values: `obtained_by` gains `ebisearch_xref` and `ebisearch_domain`; `relationship`
  gains `IsReviewedBy` (DOME Registry) and `IsDescribedBy` (bio.tools); categories gain
  `Software Registries` and `Transparency Reports`; resources gain bio.tools, DOME Registry, iProX,
  jPOST, Panorama Public, MassIVE, NODE, European Variation Archive, DGVa, Single Cell Expression
  Atlas, FAIRDOMHub, Physiome Model Repository and Cell Collective.

**Changed (value, not shape):** `identifiers.dome_registry` is filled for positives from the DOME
Registry's EBI Search entries: the entry id, `""` when looked up and none names the paper, `null`
when never looked up.

**Changed (what existing records hold):** every link is filed under its home resource before the
dedupe, so an ArrayExpress `E-GEOD-n` mirror is the GEO series `GSEn`, a versioned dbGaP study
(`phs000310.v1.p1`) is the study, and a PXD dataset sits under the ProteomeXchange partner EBI
Search says hosts it.

**Which EBI Search domains count** (decided 2026-09-14; listed with reasons in
dome-ml-observatory-triage's `docs/data_links_sources.md`): assets from the paper -- deposited data
(ENA, GEO, ArrayExpress, PRIDE and the ProteomeXchange partners, MassIVE, PDBe, EMDB, EMPIAR,
BioImage Archive, BioStudies, BioModels, MetaboLights, EGA, dbGaP, EVA, DGVa, NODE, FAIRDOMHub,
Physiome, Cell Collective, Single Cell Expression Atlas), bio.tools, the DOME Registry and
BioStudies' literature entries. Databases that cite a paper as curation evidence (UniProt, PDBe-KB,
InterPro, GO, IntAct, Reactome, ChEMBL, GWAS Catalog, ...), MeSH, Expression Atlas experiments and
GEO DataSets are not data links.

**Migration note:** additive for consumers — every new element key is optional (a record the build
withholds keeps its v1.4.0 elements until a later build completes it) and no existing key changed
meaning. In dome-ml-observatory-triage, `migrate_v1_5_0.py` moves `schema_version` from 1.4.0 to
1.5.0 in one `updateMany`; the rebuilt links and the identifier then arrive through
`load_fields.py --mode data_links` and `--mode identifiers`. Deploy this release's apps before that
load, and restart `observatory-ws` after it: the `data_resource` facet is boot-loaded.

**Pending at release:** the corpus load. Until it runs, live records stay at v1.4.0 and carry none
of the new keys or values; the apps render both shapes.

**Loaded 2026-09-15:** `load_fields.py --mode data_links` and `--mode identifiers` ran against
the whole corpus; every document then moved to v1.5.1.

## v1.4.0 — 2026-09-14

Europe PMC's data links for every paper, and the upstream authoring of v1.3.0.

**Added:**
- `data_links` — a new group holding the datasets, database accessions, data citations and
  supplementary files Europe PMC links to the paper, so a record can hand a reader straight to the
  PDB entries, GEO series, Zenodo deposits or BioStudies files behind a method. Two layers:
  - the summary captured from the Europe PMC search record: `has_data`, `tags`,
    `accession_types`, `db_cross_references`. `has_data: null` means never captured;
  - the links from a separate fetch (the annotations API, the `/datalinks` Scholix endpoint, the
    derived BioStudies entry): `fetched_at`, `sources`, `link_count`, `truncated`, `resources[]`
    (one entry per linked resource, always complete — the unit the record page renders a card
    for) and `links[]` (deduplicated detail, capped at 50 per resource and 300 per record).
    `fetched_at: null` means no fetch yet; a fetch that found nothing sets it with `link_count: 0`.
  `resources` and `links` are the first arrays of objects in the record; `validate.py`'s `items`
  support covers them.

**Changed (descriptions only):** `identifiers.epmc_id`, `source.epmc_source` and
`publication_metadata.preprint_server` now point at `docs/preprint.md` in
`dome-ml-observatory-triage`, where the spec moved; the top-level description names that
repository by its current name (see Unreleased below for why v1.2.0/v1.3.0 cannot).

**Changed (widened, additive):** `source.epmc_source`'s enum now lists every Europe PMC source code
(`MED`, `PPR`, `PMC`, `AGR`, `PAT`, `CBA`, `CTX`, `ETH`, `HIR`, `NBK`). v1.3.0 listed five, but the
first corpus-wide capture (2026-09-14) found `ETH` (93 theses) and `CTX` (21) as well, which v1.3.0
would have rejected. Nothing previously valid becomes invalid.

**Migration note:** additive — no existing field changed, renamed or retyped, and no consumer
breaks. `dome-ml-observatory-triage`'s `migrate_v1_4_0.py` sets every document from 1.2.0 to 1.4.0
in one in-place `updateMany`, writing the three v1.3.0 fields as `null` and the `data_links` group
at its never-looked-up values; the real values then arrive per document through
`load_fields.py --mode preprints` and `--mode data_links`. Until that migration runs, documents
carry no `data_links` key at all, which is why `record.model.ts` types it optional. The example
record shows the group unpopulated: no corpus record carries real link data yet, and this folder
never invents one.

**Resolves v1.3.0's "Still pending":** `SCHEMA_VERSION` in `dome-ml-observatory-triage`'s
`schema.py` is 1.4.0 and it emits all three preprint fields.

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

**Still pending:** the upstream `SCHEMA_VERSION` in `dome-ml-observatory-triage`'s `schema.py` is
still `1.2.0`. It has to be bumped to `1.3.0` in the same change that starts emitting these three
fields, or newly-loaded documents will claim a version whose fields they lack.

## v1.2.0 — 2026-09-07 (catch-up; shape dated 2026-09-03)

**A catch-up release, not new work.** The corpus has carried `schema_version: "1.2.0"` on every
document since the 2026-09-03 load, and `dome-ml-observatory-triage`'s `schema.py` has been at 1.2.0
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
