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

---

## 1. The Zenodo release in the release metadata

Each load is archived to Zenodo as a new version of the Observatory's record (the sister
repository's `refresh-cycle` step 8, `scripts/zenodo_archive.py`), under the concept DOI
10.5281/zenodo.22259905 that `/download/bulk` names. What is left, in the sister repository:
`build_release_metadata.py` should add the month's Zenodo version to `metadata/releases/<YYYY-MM>/`
as a DCAT distribution with its DOI, so `/api/catalog` names it. Until then `metadata/README.md`
says the catalogue carries no DOI.
