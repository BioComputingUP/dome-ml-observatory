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
  /** Overrides the initials() fallback. Needed where the derived initials would collide (PMC and
   *  "Publisher (DOI)" both reduce to "P") or where the service is known by an acronym its own
   *  name doesn't spell out. */
  initials?: string;
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
  },
  {
    name: 'PMC',
    status: 'live',
    direction: 'out',
    protocol: 'Web link',
    what: 'PubMed Central — hosted full-text articles.',
    how: 'Records with a PMCID link to the complete open-access article and figures.',
    benefit: 'The full text, not just the metadata Observatory holds.',
    initials: 'PMC',
  },
  {
    name: 'Publisher (DOI)',
    status: 'live',
    direction: 'out',
    protocol: 'Web link',
    what: 'The version of record at the original publisher.',
    how: "Every record with a DOI resolves via doi.org to the publisher's page.",
    benefit: 'The canonical, citable version of the article.',
    initials: 'DOI',
  },
  {
    name: 'Zenodo',
    status: 'live',
    direction: 'both',
    protocol: 'Web link + OAI-PMH',
    what: "Archival deposits — including Observatory's own bulk-download releases.",
    how: 'Corpus-wide bulk releases (see Download) are deposited here with citable DOIs. Per-record code/data deposits remain a reserved field.',
    benefit: 'Archived, citable artefacts at both the paper and dataset level.',
    logo: 'assets/img/zenodo-logo.svg',
  },
  // ---- Planned ----
  {
    name: 'DOME Registry',
    status: 'planned',
    direction: 'both',
    protocol: 'Cross-reference',
    what: 'The sibling registry of structured, community-reviewed DOME method annotations.',
    how: 'A reserved identifier field (identifiers.dome_registry) will link a record to its matching Registry entry once the cross-linking pass runs.',
    benefit: 'Move between "this paper exists" (Observatory) and "here is its full structured method annotation" (Registry).',
    logo: 'assets/img/DOME_Registry_Rounded.svg',
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
    status: 'planned',
    direction: 'both',
    protocol: 'OAI-PMH',
    what: 'The Open Archives Initiative Protocol for Metadata Harvesting — the standard aggregators use to pull records from a repository.',
    how: 'Exposing an OAI-PMH endpoint would let any compliant harvester index Observatory records into its own catalogue.',
    benefit: 'Discoverability for Observatory content well beyond this site, with no per-aggregator integration work.',
    logo: 'assets/img/oai-pmh-logo.svg',
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
   *  names stay legible rather than colliding on one letter. An entry's own `initials` wins over
   *  this, for the cases where derivation would still collide. */
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
