import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { CURRENT_SCHEMA_VERSION, currentReleaseDir } from '../common/schema-version';
import { SubjectField } from './record-view';

interface OntologyMapping {
  iri?: string;
  predicate?: string;
}

interface DomainVocabFile {
  fields?: Record<string, { terms?: { edam_id?: string; label?: string }[] }>;
}

interface ModellingVocabFile {
  fields?: Record<
    string,
    { terms?: { label?: string; mesh_id?: string | null; ontology_mappings?: OntologyMapping[] }[] }
  >;
}

interface ModelTypeSeedFile {
  terms?: {
    canonical?: string;
    aliases?: string[];
    mesh_id?: string | null;
    ontology_mappings?: OntologyMapping[];
  }[];
}

/** The three published vocabulary files, as parsed JSON. */
export interface VocabFiles {
  domain?: DomainVocabFile;
  modellingBranch?: ModellingVocabFile;
  modelTypeSeed?: ModelTypeSeedFile;
}

export interface VocabTerm {
  /** The term's own IRI: EDAM for the domain tiers, MeSH where a descriptor exists, otherwise the
   *  first exact ontology match. Undefined for a project extension with no ontology term. */
  iri?: string;
  /** EDAM topic id or MeSH descriptor id. */
  code?: string;
  /** Every other IRI the vocabulary records as a `skos:exactMatch`. */
  exactMatches: string[];
}

const EDAM = 'http://edamontology.org/';
const MESH = 'http://id.nlm.nih.gov/mesh/';
const EXACT_MATCH = 'skos:exactMatch';

const logger = new Logger('VocabIndex');

/**
 * Label -> ontology identity for every controlled-vocabulary term, built from the vocabulary files
 * of the published release. Documents store labels only (`content_filters.domain_tier1:
 * "Biology"`); this is what turns them into IRIs in the metadata.
 */
export class VocabIndex {
  private readonly terms = new Map<string, VocabTerm>();

  constructor(files: VocabFiles) {
    for (const [field, spec] of Object.entries(files.domain?.fields ?? {})) {
      for (const term of spec.terms ?? []) {
        if (term.label && term.edam_id) {
          this.set(field, term.label, {
            iri: EDAM + term.edam_id,
            code: term.edam_id,
            exactMatches: [],
          });
        }
      }
    }
    for (const [field, spec] of Object.entries(files.modellingBranch?.fields ?? {})) {
      for (const term of spec.terms ?? []) {
        if (term.label) this.set(field, term.label, identity(term.mesh_id, term.ontology_mappings));
      }
    }
    for (const term of files.modelTypeSeed?.terms ?? []) {
      const id = identity(term.mesh_id, term.ontology_mappings);
      for (const label of [term.canonical, ...(term.aliases ?? [])]) {
        if (label) this.set('model_type', label, id);
      }
    }
  }

  get size(): number {
    return this.terms.size;
  }

  lookup(field: SubjectField, label: string): VocabTerm | undefined {
    return this.terms.get(key(field, label));
  }

  private set(field: string, label: string, term: VocabTerm): void {
    if (!this.terms.has(key(field, label))) this.terms.set(key(field, label), term);
  }

  /** The vocabularies of the release schema/CURRENT names. A missing release is logged and yields
   *  an empty index: the projections still work, their terms simply carry no IRIs. */
  static load(dir: string | undefined = currentReleaseDir()): VocabIndex {
    const read = <T>(file: string): T | undefined => {
      const path = dir ? join(dir, 'vocab', file) : undefined;
      if (!path || !existsSync(path)) return undefined;
      return JSON.parse(readFileSync(path, 'utf8')) as T;
    };
    const index = new VocabIndex({
      domain: read<DomainVocabFile>('domain.json'),
      modellingBranch: read<ModellingVocabFile>('modelling-branch.json'),
      modelTypeSeed: read<ModelTypeSeedFile>('model-type-seed.json'),
    });
    if (index.size === 0) {
      logger.warn(
        `No vocabulary found for schema ${CURRENT_SCHEMA_VERSION} (looked in ${
          dir ?? 'nowhere: ' + 'schema/CURRENT not found'
        }) -- metadata terms will carry labels but no ontology IRIs.`,
      );
    }
    return index;
  }
}

function key(field: string, label: string): string {
  return `${field}\u0000${label.trim().toLowerCase()}`;
}

function identity(
  meshId: string | null | undefined,
  mappings: OntologyMapping[] | undefined,
): VocabTerm {
  const exact = [
    ...new Set(
      (mappings ?? [])
        .filter((m) => m.predicate === EXACT_MATCH && m.iri)
        .map((m) => m.iri as string),
    ),
  ];
  const iri = meshId ? MESH + meshId : exact[0];
  return { iri, code: meshId ?? undefined, exactMatches: exact.filter((m) => m !== iri) };
}
