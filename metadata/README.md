# metadata/

The corpus described in standard vocabularies: one immutable folder per monthly release, published
the way `schema/` publishes the record schema.

| Path | What it is |
|---|---|
| `CURRENT` | One line: the release `/api/catalog` serves, e.g. `2026-09`. |
| `releases/<YYYY-MM>/dataset.jsonld` | That release as DCAT 3 and schema.org JSON-LD: the catalogue, the corpus as a dataset series, this release in it, the API export as a distribution, the API as a data service, and the publisher, creator and contact point. |

**Built on the write side, never here.** `dome-ml-observatory-triage`'s
`moros_pipeline/scripts/build_release_metadata.py` writes both files from the release's verified
counts, the authored schema version, the curation-criteria and vocabulary hashes and the pipeline
commit (that repository's `docs/release_metadata.md`). A committed release folder is never edited;
a new month is a new folder.

**Served here.** `observatory-ws` reads `CURRENT` on the first `/api/catalog` request and serves the
file verbatim; the Dockerfile copies this folder next to `schema/` for that. The home page and
`/download/bulk` embed it as JSON-LD for dataset search engines. Every record's JSON-LD names the
dataset series `https://observatory.dome-ml.org/download/bulk#corpus` as what it is part of, so that
identifier is shared: `observatory-ws/src/metadata/metadata-urls.ts` and the builder must agree.

Each load is also archived to Zenodo, as a new version of one record under the concept DOI
10.5281/zenodo.22259905 that `/download/bulk` names (the sister repository's
`scripts/zenodo_archive.py`, run by its `refresh-cycle` skill). The release metadata does not name
that DOI yet: `build_release_metadata.py` adding the month's Zenodo version as a distribution is
still to do ([issue #5](https://github.com/BioComputingUP/dome-ml-observatory/issues/5)). A
committed release is never edited to add it; the next one carries it.
