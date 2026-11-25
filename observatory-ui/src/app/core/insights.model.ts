/**
 * The shapes of GET /api/insights/models and /api/insights/data. Mirrored by hand from
 * observatory-ws/src/insights/{models,data}-insights.ts, as record.model.ts mirrors the record:
 * the two apps share no code on purpose (AGENTS.md).
 */

export interface CountSeries {
  value: string;
  total: number;
  /** Aligned to the response's `years`. */
  series: number[];
}

export interface LiftCell {
  value: string;
  count: number;
  /** count / the group's total, 0-1. */
  share: number;
  /** share / the value's share of the whole; 1 is "as common as anywhere". */
  lift: number | null;
}

export interface GroupProfile {
  name: string;
  enriched: number;
  cells: LiftCell[];
}

export interface Mover {
  value: string;
  recent: number;
  previous: number;
  recentShare: number;
  previousShare: number;
  /** Percentage points. */
  change: number;
}

export interface ModelsOverview {
  generated: string;
  years: number[];
  lastYearPartial: boolean;
  coverage: { positive: number; enriched: number; withModelUse: number };
  positiveByYear: number[];
  enrichedByYear: number[];
  withUseByYear: number[];
  families: CountSeries[];
  paradigms: CountSeries[];
  uses: CountSeries[];
  modelTypes: { distinct: number; top: CountSeries[]; tail: { distinct: number; total: number } };
  movers: {
    recentYears: [number, number];
    previousYears: [number, number];
    minPapers: number;
    rising: Mover[];
    falling: Mover[];
  };
  journals: { minEnriched: number; qualifying: number; rows: GroupProfile[] };
  domains: GroupProfile[];
}

export interface JournalModelProfile {
  generated: string;
  profile: GroupProfile;
  rank: number;
  rankOf: number;
  minEnriched: number;
  corpusEnriched: number;
}

export type ResourceKind =
  | 'data'
  | 'ontology'
  | 'identifier'
  | 'code'
  | 'model_hub'
  | 'software_registry'
  | 'transparency_report';

export interface ResourceRow {
  slug: string;
  label: string;
  category: string;
  kind: ResourceKind;
  host: string | null;
  embl_ebi: boolean;
  gcbr: string | null;
  elixir_cdr: string | null;
  elixir_edd: string | null;
  elixir_nodes: string[];
  papers: number;
  deposited: number;
  mentioned: number;
  other: number;
  series: number[];
  enriched: number;
}

export type DesignationKey = 'embl_ebi' | 'elixir_cdr' | 'elixir_edd' | 'gcbr';

export interface TagSummary {
  key: string;
  label: string;
  status: 'sourced' | 'pending';
  source: string | null;
  resources: number;
  papers: number;
  series: number[];
}

export interface DataOverview {
  generated: string;
  years: number[];
  lastYearPartial: boolean;
  scope: {
    positive: number;
    linking: number;
    enrichedLinking: number;
    derivedBioStudies: number;
    excludedKinds: { kind: ResourceKind; slugs: string[] }[];
  };
  positiveByYear: number[];
  linkingByYear: number[];
  designations: TagSummary[];
  nodes: { code: string; name: string; resources: number; papers: number }[];
  categories: CountSeries[];
  resources: ResourceRow[];
  families: { value: string; count: number }[];
  resourceFamilies: { slug: string; enriched: number; cells: LiftCell[] }[];
}

export interface ResourceDetail {
  generated: string;
  years: number[];
  lastYearPartial: boolean;
  resource: ResourceRow;
  topJournals: { journal: string; papers: number }[];
  families: LiftCell[];
}
