# Roadmap

What is still open across both repositories. Shipped work is not listed here — the record of what
was built and why is in each repository's `AGENTS.md` and its code. When the last item goes, so does
this file, along with the pointers to it in `README.md`, `AGENTS.md` and the sister repository's
stub `ROADMAP.md`.

**One roadmap, two repositories.** [`dome-ml-observatory-triage`](https://github.com/BioComputingUP/dome-ml-observatory-triage)
is the write side: it builds the corpus, authors the document schema and is the only writer to the
database. This repository is the read side: the UI, the API and the published schema releases. Each
item below says which side does the work; the triage repository keeps no separate list.

## At a glance

| # | Item | Side | Blocked on |
|---|---|---|---|
| 1 | [The Zenodo release in the release metadata](#1-the-zenodo-release-in-the-release-metadata) | triage | Nothing |
| 2 | [Finalise and optimise search](#2-finalise-and-optimise-search) | this repository | A plan, to be written |
| 3 | [Cross links](#3-cross-links) | triage | Nothing |

---

## 1. The Zenodo release in the release metadata

Each load is archived to Zenodo as a new version of the Observatory's record (the sister
repository's `refresh-cycle` step 8, `scripts/zenodo_archive.py`), under the concept DOI
10.5281/zenodo.22259905 that `/download/bulk` names. What is left, in the sister repository:
`build_release_metadata.py` should add the month's Zenodo version to `metadata/releases/<YYYY-MM>/`
as a DCAT distribution with its DOI, so `/api/catalog` names it. Until then `metadata/README.md`
says the catalogue carries no DOI.

## 2. Finalise and optimise search

Search works and is fast enough, but the behaviour was assembled incrementally and has known rough
edges: `sort=relevance` actually sorts by `_id`, the text index is bypassed for a single bare word
and for any query that clears the classification filter, and facet counts are corpus-wide rather
than contextual. A plan for this is still to be written, and it depends on decisions in the sister
repository — whether `citation_count` gets an index, and how open vocabularies become facets.

## 3. Cross links

`identifiers.dome_registry` and the `identifiers` write mode are built with v1.5.0. Left: derive
`identifiers.zenodo` and `bioai_repo` from `data_links`, and build the fetch process for Hugging
Face and Kaggle per [`cross_links/README.md`](https://github.com/BioComputingUP/dome-ml-observatory-triage/blob/main/cross_links/README.md).
That fills the reserved Zenodo, source-repository, Hugging Face and Kaggle cards on record pages,
which are empty today; data links already reach 13 Hugging Face and 40 Kaggle positives, and the
integrations page lists both as planned until this lands.

---

Short list, unranked, to judge later:

1. Self-hosted logos for the data-link resources (PDBe, UniProt, ENA, GEO, BioStudies, Dryad,
   figshare, ...); the cards use icon-font glyphs until then.
2. FAIR registrations and scoring: register the Observatory in FAIRsharing and re3data, score a
   record page and `/api/catalog` with F-UJI and FAIR-Checker, check a record page in the
   Schema.org validator and Google's Rich Results Test, run the openarchives.org validator against
   `/api/oai`, and submit `/sitemap.xml` to the search consoles.
3. Settle the refresh cadence (monthly or bimonthly) as stated policy, and make the sister
   repository's skills, the "Monthly to bimonthly" update cadence on `/download/bulk` and the "6-12
   times a year" in `core/facet-stats.model.ts` agree.
