import { Component } from '@angular/core';

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
}

@Component({
  selector: 'app-integrations',
  imports: [],
  templateUrl: './integrations.html',
  styleUrl: './integrations.scss',
})
export class Integrations {
  readonly integrations: Integration[] = [
    // ---- Live today ----
    {
      name: 'Europe PMC',
      status: 'live',
      direction: 'out',
      protocol: 'Web link',
      what: 'The European bioinformatics literature database — abstracts, citations and open-access full text.',
      how: 'Every record with a PMID links directly to its Europe PMC article page.',
      benefit: 'One click from a record’s metadata to its full literature context.',
    },
    {
      name: 'PubMed',
      status: 'live',
      direction: 'out',
      protocol: 'Web link',
      what: 'The MEDLINE literature index.',
      how: 'Every record with a PMID links to its PubMed entry.',
      benefit: 'MeSH indexing and related-article discovery beyond what Observatory itself stores.',
    },
    {
      name: 'PMC',
      status: 'live',
      direction: 'out',
      protocol: 'Web link',
      what: 'PubMed Central — hosted full-text articles.',
      how: 'Records with a PMCID link to the complete open-access article and figures.',
      benefit: 'The full text, not just the metadata Observatory holds.',
    },
    {
      name: 'Publisher (DOI)',
      status: 'live',
      direction: 'out',
      protocol: 'Web link',
      what: 'The version of record at the original publisher.',
      how: 'Every record with a DOI resolves via doi.org to the publisher’s page.',
      benefit: 'The canonical, citable version of the article.',
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
    },
    {
      name: 'Hugging Face',
      status: 'planned',
      direction: 'out',
      protocol: 'Web link',
      what: 'Hosted models and datasets.',
      how: 'A reserved identifier field will link to a paper’s released model or dataset once populated.',
      benefit: 'Go from a paper directly to a runnable model.',
    },
    {
      name: 'Kaggle',
      status: 'planned',
      direction: 'out',
      protocol: 'Web link',
      what: 'Datasets and notebooks.',
      how: 'A reserved identifier field will link associated datasets or notebooks once populated.',
      benefit: 'Reach the data a paper actually used.',
    },
    {
      name: 'Zenodo',
      status: 'planned',
      direction: 'both',
      protocol: 'Web link + OAI-PMH',
      what: 'Archival deposits — including Observatory’s own bulk-download releases.',
      how: 'Per-record: a reserved field for code/data deposits. Corpus-wide: monthly bulk releases (see Download) will be deposited here with citable DOIs.',
      benefit: 'Archived, citable artefacts on both the paper and dataset level.',
    },
    {
      name: 'ORCID',
      status: 'planned',
      direction: 'out',
      protocol: 'Web link',
      what: 'Persistent researcher identifiers.',
      how: 'Author name strings would resolve to ORCID iDs where disambiguation is possible.',
      benefit: 'Reliable author identity across papers with common names.',
    },
    {
      name: 'FAIRsharing',
      status: 'planned',
      direction: 'out',
      protocol: 'Web link',
      what: 'A registry of data and metadata standards.',
      how: 'Domain and method vocabulary terms would link to their FAIRsharing standard entries where one exists.',
      benefit: 'Ties Observatory’s controlled vocabularies to the broader standards landscape.',
    },
    {
      name: 'OpenAIRE',
      status: 'planned',
      direction: 'both',
      protocol: 'OAI-PMH',
      what: 'The European open-science aggregator.',
      how: 'Exposing an OAI-PMH feed would let OpenAIRE harvest Observatory records into its own index.',
      benefit: 'Discoverability for Observatory content well beyond this site.',
    },
    {
      name: 'APICURON',
      status: 'planned',
      direction: 'both',
      protocol: 'REST API',
      what: 'A curation-credit tracking service used elsewhere in the DOME family.',
      how: 'Human validation of enrichment/classification could be logged as credited curation activity.',
      benefit: 'Curators get recognised credit for the expert validation this resource depends on.',
    },
    {
      name: 'ELIXIR',
      status: 'planned',
      direction: 'both',
      protocol: 'Schema.org / Bioschemas',
      what: 'The European life-science research infrastructure, and its AI/ML ecosystem work.',
      how: 'Bioschemas markup on record pages would make Observatory content discoverable by ELIXIR’s own tooling.',
      benefit: 'Standard, machine-readable description of what each record is, for tools that already understand Bioschemas.',
    },
    {
      name: 'MCP',
      status: 'planned',
      direction: 'both',
      protocol: 'MCP',
      what: 'The Model Context Protocol, for exposing tools/data to AI agents directly.',
      how: 'Once the API exists, an MCP server could expose search and record lookup as agent-callable tools.',
      benefit: 'Lets AI assistants query the corpus directly rather than scraping the site.',
    },
  ];
}
