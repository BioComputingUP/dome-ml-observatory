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
    name: 'Zenodo',
    status: 'live',
    direction: 'both',
    protocol: 'Web link + OAI-PMH',
    what: "Archival deposits — including Observatory's own bulk-download releases.",
    how: 'Corpus-wide bulk releases (see Download) are deposited here with persistent DOIs. Per-record code/data deposits remain a reserved field.',
    benefit: 'Archived artefacts with persistent identifiers, at both the paper and dataset level.',
    logo: 'assets/img/zenodo-logo.svg',
  },
  // ---- Planned ----
  {
    // Built and tested in the pipeline (schema v1.4.0, data_links; EBI Search's links for positives
    // from v1.5.0); flips to live once the corpus load has landed and the record pages show the cards.
    name: 'Europe PMC data links',
    status: 'planned',
    direction: 'out',
    protocol: 'REST API (annotations + Scholix data links)',
    what: 'The datasets, accessions and supplementary files Europe PMC links to each paper — PDB, UniProt, ENA, GEO, BioStudies, Zenodo, Dryad and more.',
    how: 'Harvested per record by the pipeline, joined for AI/ML papers by the entries EBI Search holds that name the paper, and shown as one card per linked resource on the record page, with a Linked data filter on search.',
    benefit: 'From a method paper straight to the data it was built and evaluated on.',
    logo: 'assets/img/europe-pmc-logo.png',
  },
  {
    name: 'DOME Registry',
    status: 'planned',
    direction: 'both',
    protocol: 'Cross-reference',
    what: 'The sibling registry of structured, community-reviewed DOME method annotations.',
    // Schema v1.5.0 fills identifiers.dome_registry from the Registry's EBI Search entries; flips to
    // live with the corpus load, as the data links above.
    how: 'The pipeline matches Registry entries to AI/ML papers by PMID or PMCID through EBI Search, stores the entry on the record (identifiers.dome_registry), and links the record page straight to its Registry review.',
    benefit: 'Move between "this paper exists" (Observatory) and "here is its full structured method annotation" (Registry).',
    // The -cropped variant, not the full one: DOME_Registry_Rounded.svg is a 375x375 canvas whose
    // wordmark occupies a 349x78 band, so ~80% of it is empty and object-fit shrank the mark to an
    // illegible sliver. Same asset the home page already uses for the same reason.
    logo: 'assets/img/DOME_Registry_Rounded-cropped.svg',
  },
  {
    name: 'Hugging Face',
    status: 'planned',
    direction: 'out',
    protocol: 'Web link',
    what: 'Hosted models and datasets.',
    how: "A reserved identifier field will link to a paper's released model or dataset once populated.",
    benefit: 'Go from a paper directly to a runnable model.',
    logo: 'assets/img/hf-logo.svg',
  },
  {
    name: 'Kaggle',
    status: 'planned',
    direction: 'out',
    protocol: 'Web link',
    what: 'Datasets and notebooks.',
    how: 'A reserved identifier field will link associated datasets or notebooks once populated.',
    benefit: 'Reach the data a paper actually used.',
    logo: 'assets/img/Kaggle_logo.png',
  },
  {
    name: 'FAIRsharing',
    status: 'planned',
    direction: 'out',
    protocol: 'Web link',
    what: 'A registry of data and metadata standards.',
    how: 'Domain and method vocabulary terms would link to their FAIRsharing standard entries where one exists.',
    benefit: "Ties Observatory's controlled vocabularies to the broader standards landscape.",
    logo: 'assets/img/fairsharing-logo.svg',
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
    how: 'The corpus, each monthly release and the API are described as a DCAT catalogue at /api/catalog, embedded on the home and bulk-download pages.',
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
    name: 'MCP',
    status: 'planned',
    direction: 'both',
    protocol: 'MCP',
    what: 'The Model Context Protocol, for exposing tools/data to AI agents directly.',
    how: 'Once the API exists, an MCP server could expose search and record lookup as agent-callable tools.',
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
   *  names stay legible rather than colliding on one letter. Every entry currently has a logo, so
   *  nothing reaches this today -- it stays as the fallback for the next integration added before
   *  its asset is sourced, which is exactly how Europe PMC sat here until one was. */
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
