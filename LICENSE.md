# Licensing

DOME Observatory is a **discovery layer over publication metadata**, not a repository of
publications. What this project can license, and what it cannot, follow from that.

## What DOME Observatory licenses: the layer this project adds

The following are the original contribution of this project and are licensed under the
**Creative Commons Attribution 4.0 International License (CC BY 4.0)**:

- the AI/ML screening decisions and their rationales (`llm_classification`),
- the enrichment tags and their rationales (`llm_enrichment`, `content_filters`'s
  domain/paradigm/model fields),
- the controlled vocabularies and record schema in [`schema/`](schema/),
- and the aggregate statistics, journal rankings and facet counts the service computes.

You are free to share and adapt this material for any purpose, including commercially, as long as
you give appropriate credit. Full text: https://creativecommons.org/licenses/by/4.0/legalcode ·
Summary: https://creativecommons.org/licenses/by/4.0/

This covers the **data and documentation**. Creative Commons licences are not intended for
software, so CC BY 4.0 is not asserted over the application source code in this repository; no
separate code licence has been declared yet.

## What DOME Observatory does *not* license: the underlying publication data

Each record also carries bibliographic metadata and an abstract that this project did not create
and does not own. **CC BY 4.0 does not extend to it, and nothing here relicenses it.**

### Source and attribution

The great majority of that data is retrieved from **[Europe PMC](https://europepmc.org/)** through
their public APIs — roughly 93.5% of abstracts in the corpus are sourced from Europe PMC, with the
remainder from Crossref and PubMed, and a small fraction of records carrying no abstract at all.
The open-access flag and the per-paper licence string on each record come from the Europe PMC
licensing lookup.

Europe PMC should be credited alongside DOME Observatory in any work that reuses this corpus:

> Rosonovski S, Levchenko M, Bhatnagar R, Chandrasekaran U, Faulk L, Hassan I, Jeffryes M,
> Mubashar SI, Nassar M, Palanisamy MJ, Parkin M, Poluru J, Rogers F, Saha S, Selim M, Shafique Z,
> Ide-Smith M, Stephenson D, Tirunagari S, Venkatesan A, Xing L, Harrison M.
> "Europe PMC in 2023." *Nucleic Acids Research* 52(D1):D1668–D1676 (2024).
> [doi:10.1093/nar/gkad1085](https://doi.org/10.1093/nar/gkad1085)

Europe PMC's own terms govern that upstream content — see their
**[copyright notice](https://europepmc.org/Copyright)**. Two points from it are worth restating,
because they shape how this corpus may be reused:

- Europe PMC does not place a blanket open licence on the metadata and abstracts it serves.
  Standard copyright should be assumed for an individual article unless that article states
  otherwise.
- Automated retrieval must go through their APIs and bulk-download services; systematic crawling
  of their site is not permitted. This corpus was assembled through those APIs.

Where a record's data came from Crossref or PubMed instead, those sources' own terms apply in the
same way.

## Publication full text is linked, never hosted

DOME Observatory stores title, abstract, authors, year, journal and citation count. **It does not
hold, mirror or redistribute the full text of any publication.** Every route to the article itself
is an outbound link to the source that holds it — Europe PMC, PubMed, PMC, or the publisher via
DOI. Access to the full text is governed entirely by whoever hosts it.

## Each paper's own licence still governs that paper

Access terms vary across the corpus and are recorded per record where a licence lookup matched:
roughly two thirds of the source corpus is flagged open access, and each record's licence string
(for example `cc by`) is shown on its record page. Some papers are open access under CC BY or a
similar licence; others remain under a publisher's standard copyright; for some, no licence
information was available at all and the field is empty — which means *unknown*, not *unrestricted*.

**Before reusing a paper's abstract, text or figures, check that specific paper's own terms at the
source.** A CC BY 4.0 licence on Observatory's classification of a paper says nothing about what
you may do with the paper.

## Citing

See [`CITATION.cff`](CITATION.cff) for the machine-readable citation for the software and corpus,
and cite Europe PMC alongside it, as above. To cite an individual paper, use the BibTeX or RIS
export on its record page — that citation is for the paper, under its own terms, not for
Observatory's metadata about it.

## Corrections

If you believe a record misrepresents your work, or that anything here is redistributed in a way
its licence does not permit, please
[open an issue](https://github.com/BioComputingUP/dome-ml-observatory/issues) or email
**contact@dome-ml.org**, and we will correct or remove it.
