import { Component, computed } from '@angular/core';

type Direction = 'out' | 'both';
type Status = 'live' | 'planned';

interface Integration {
  name: string;
  status: Status;
  direction: Direction;
  protocol: string;
  what: string;
  how: string;
  benefit: string;
  /** Path under assets/img/, when a logo asset exists. Omitted entries fall back to a lettermark
   *  tile (about-integrations.html) so the grid never has a broken image -- sourced opportunistically
   *  from each service's own brand assets, not every integration has one available yet. */
  logo?: string;
}

const INTEGRATIONS: Integration[] = [
  // ---- Live today ----
  {
    name: 'Europe PMC',
    status: 'live',
    direction: 'out',
    protocol: 'Web link',
    what: 'The European bioinformatics literature database — abstracts, citations and open-access full text.',
    how: 'Every record with a PMID links directly to its Europe PMC article page.',
    benefit: "One click from a record's metadata to its full literature context.",
    // The horizontal "Extended" lockup from europepmc.org/Outreach, not the stacked "Basic" one:
    // Basic is a ~1:1 composition with the wordmark set inside a circle, which is illegible at the
    // 40px row height these cards use. CC BY-SA, used unmodified as their terms require.
    logo: 'assets/img/europe-pmc-logo.png',
  },
  {
    name: 'PMC',
    status: 'live',
    direction: 'out',
    protocol: 'Web link',
    what: 'PubMed Central — hosted full-text articles.',
    how: 'Records with a PMCID link to the complete open-access article and figures.',
    benefit: 'The full text, not just the metadata Observatory holds.',
    logo: 'assets/img/pmc-logo.svg',
  },
  {
    name: 'Publisher (DOI)',
    status: 'live',
    direction: 'out',
    protocol: 'Web link',
    what: 'The version of record at the original publisher.',
    how: "Every record with a DOI resolves via doi.org to the publisher's page.",
    benefit: 'The canonical, citable version of the article.',
    logo: 'assets/img/doi-logo.svg',
  },
  {
    name: 'Europe PMC data links',
    status: 'live',
    direction: 'out',
    protocol: 'REST API (annotations + Scholix data links)',
    what: 'The datasets, accessions and supplementary files Europe PMC links to each paper — PDB, UniProt, ENA, GEO, BioStudies, Zenodo, Dryad and more.',
    how: 'Harvested per record by the pipeline, joined for AI/ML papers by the entries EBI Search holds that name the paper, and shown as one card per linked resource on the record page, with a Linked data filter on search.',
    benefit: 'From a method paper straight to the data it was built and evaluated on.',
    logo: 'assets/img/europe-pmc-logo.png',
  },
  {
    name: 'DOME Registry',
    status: 'live',
    direction: 'both',
    protocol: 'Cross-reference',
    what: 'The sibling registry of structured, community-reviewed DOME method annotations.',
    how: 'The pipeline matches Registry entries to AI/ML papers by PMID or PMCID through EBI Search, stores the entry on the record (identifiers.dome_registry), and links the record page straight to its Registry review.',
    benefit: 'Move between "this paper exists" (Observatory) and "here is its full structured method annotation" (Registry).',
    // The -cropped variant, not the full one: DOME_Registry_Rounded.svg is a 375x375 canvas whose
    // wordmark occupies a 349x78 band, so ~80% of it is empty and object-fit shrank the mark to an
    // illegible sliver. Same asset the record page's Registry card uses, for the same reason.
    logo: 'assets/img/DOME_Registry_Rounded-cropped.svg',
  },
  {
    name: 'EBI Search',
    status: 'live',
    direction: 'out',
    protocol: 'REST API (cross-references + domain dumps)',
    what: "EMBL-EBI's search engine across its data resources, which records the literature that each archive, registry and database entry names.",
    how: 'For every AI/ML paper, the pipeline asks EBI Search which deposits, bio.tools entries and DOME Registry reviews name it by PMID, PMCID or DOI, and adds each one to the record’s data links. Only assets from the paper count: databases that cite a paper as evidence for a curated fact are left out.',
    benefit: 'Finds the data and software a paper released even when its text never mentions them, because the repository recorded the paper instead.',
  },
  {
    name: 'bio.tools',
    status: 'live',
    direction: 'out',
    protocol: 'Cross-reference (EBI Search)',
    what: 'The ELIXIR registry of bioinformatics software and services, each described with EDAM terms.',
    how: 'The pipeline finds the bio.tools entries that name an AI/ML paper by PMID, PMCID or DOI through EBI Search, and the record page links to each entry as the paper’s software record, with a bio.tools option in the Linked data filter on search.',
    benefit: 'From a method paper straight to the registered tool that implements it, with its documentation, download and function annotations.',
  },
  {
    name: 'OAI-PMH',
    status: 'live',
    direction: 'both',
    protocol: 'OAI-PMH 2.0 · Dublin Core',
    what: 'The Open Archives Initiative Protocol for Metadata Harvesting — the standard aggregators use to pull records from a repository.',
    how: 'The AI/ML methods papers are harvestable at /api/oai in Dublin Core (oai_dc), incrementally by the date each record last changed.',
    benefit: 'Any compliant harvester can index Observatory records into its own catalogue, with no per-aggregator integration work.',
    logo: 'assets/img/oai-pmh-logo.svg',
  },
  {
    name: 'Dublin Core',
    status: 'live',
    direction: 'out',
    protocol: 'DCMI Metadata Terms · oai_dc',
    what: 'The DCMI metadata vocabulary — title, creator, date, subject, identifier, rights — that library and repository systems share.',
    how: 'Every AI/ML methods paper is served as a Dublin Core record over OAI-PMH (oai_dc), and the DCAT catalogue at /api/catalog describes the corpus and its releases in DCMI Terms.',
    benefit: 'Library catalogues, repositories and discovery services read the records in the most widely shared metadata standard.',
  },
  {
    name: 'schema.org / Bioschemas',
    status: 'live',
    direction: 'out',
    protocol: 'JSON-LD',
    what: 'The structured-data vocabulary search engines read, with the life-science profiles of the ELIXIR Bioschemas community.',
    how: 'Every record page embeds its record as JSON-LD — the screening verdict, EDAM and MeSH terms as ontology identifiers, provenance, and the article with its linked data — also at /api/records/{id}/jsonld.',
    benefit: 'Search engines and FAIR tools understand what a record is about, not just the words on the page.',
  },
  {
    name: 'W3C DCAT',
    status: 'live',
    direction: 'out',
    protocol: 'DCAT 3 · JSON-LD',
    what: 'The W3C Data Catalog Vocabulary, which research and public-sector data catalogues use to describe datasets.',
    how: 'The corpus, each release and the API are described as a DCAT catalogue at /api/catalog, embedded on the home and bulk-download pages.',
    benefit: 'Data catalogues and dataset search engines can list the corpus with its size, licence and provenance.',
  },
  {
    name: 'FAIR Signposting',
    status: 'live',
    direction: 'out',
    protocol: 'HTTP Link headers',
    what: 'A convention of typed HTTP links that point machines from a landing page to its identifier, metadata and licence.',
    how: 'Record pages answer with cite-as, describedby, license and collection links, and serve JSON-LD to clients that ask for it.',
    benefit: 'FAIR assessment tools and harvesters find a record’s metadata without scraping the page.',
  },
  {
    name: 'Zenodo',
    status: 'live',
    direction: 'both',
    protocol: 'Web link + REST API deposit',
    what: "Archival deposits — each paper's own, and Observatory's corpus releases.",
    how: "Each corpus release is archived as a new version of one Zenodo record — the records as gzipped JSON Lines, a checksum sidecar and the schema they follow — under one concept DOI that always resolves to the latest (see Download). A paper's own Zenodo deposits appear among its record's data links.",
    benefit: 'Archived artefacts with persistent identifiers, at both the paper and dataset level.',
    logo: 'assets/img/zenodo-logo.svg',
  },
  {
    name: 'FAIRsharing',
    status: 'live',
    direction: 'out',
    protocol: 'Registry record',
    what: 'A curated registry of data and metadata standards, databases and data policies.',
    how: 'Observatory is registered in FAIRsharing as a database record.',
    benefit: 'Makes Observatory findable where researchers, journals and funders look for databases and the standards behind them.',
    logo: 'assets/img/fairsharing-logo.svg',
  },
  // ---- Planned ----
  {
    name: 'MCP',
    status: 'planned',
    direction: 'both',
    protocol: 'MCP',
    what: 'The Model Context Protocol, for exposing tools/data to AI agents directly.',
    how: 'An MCP server over the public API could expose search and record lookup as agent-callable tools.',
    benefit: 'Lets AI assistants query the corpus directly rather than scraping the site.',
    logo: 'assets/img/mcp-logo.svg',
  },
];

@Component({
  selector: 'app-about-integrations',
  imports: [],
  templateUrl: './about-integrations.html',
  styleUrl: './about-integrations.scss',
})
export class AboutIntegrations {
  // Sorted at read time rather than reordering the literal array above, so the source data can
  // stay grouped by status (matching how new entries actually get added) while the two rendered
  // groups stay alphabetical regardless of insertion order.
  readonly live = computed(() =>
    INTEGRATIONS.filter((i) => i.status === 'live').sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly planned = computed(() =>
    INTEGRATIONS.filter((i) => i.status === 'planned').sort((a, b) => a.name.localeCompare(b.name)),
  );

  /** First letter(s) for the lettermark fallback tile, shown when an integration has no logo
   *  asset yet. "DOME Registry" -> "DR" (first letter of each word, capped at 2) so multi-word
   *  names stay legible rather than colliding on one letter. bio.tools, Dublin Core, EBI Search,
   *  schema.org / Bioschemas, W3C DCAT and FAIR Signposting use it today; Europe PMC sat here too
   *  until its logo was sourced. */
  initials(name: string): string {
    return name
      .replace(/\(.*?\)/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  }
}
