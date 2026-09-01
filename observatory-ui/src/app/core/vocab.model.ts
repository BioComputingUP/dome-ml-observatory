/** Mirrors schema/releases/v1.1.0/vocab/*.json -- see schema/README.md. */

export interface VocabTerm {
  label: string;
  [key: string]: unknown;
}

export interface VocabField {
  max_tags: number;
  terms: VocabTerm[];
}

export interface DomainVocab {
  source: string;
  fields: {
    domain_tier1: VocabField;
    domain_tier2: VocabField;
    domain_tier3: VocabField;
  };
}

export interface ModellingBranchVocab {
  source: string;
  fields: {
    learning_paradigm: VocabField;
    model_family: VocabField;
  };
}

export interface ModelTypeTerm {
  canonical: string;
  aliases?: string[];
}

export interface ModelTypeSeedVocab {
  n_seed_entries: number;
  terms: ModelTypeTerm[];
}

export interface Vocabularies {
  domain: DomainVocab;
  modellingBranch: ModellingBranchVocab;
  modelTypeSeed: ModelTypeSeedVocab;
}
