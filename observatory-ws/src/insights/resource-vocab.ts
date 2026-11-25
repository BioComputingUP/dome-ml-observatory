import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { currentReleaseDir } from '../common/schema-version';

const logger = new Logger('ResourceVocab');

/** What a data-link resource slug is. Only `data` resources are ranked on the Data page. */
export type ResourceKind =
  | 'data'
  | 'ontology'
  | 'identifier'
  | 'code'
  | 'model_hub'
  | 'software_registry'
  | 'transparency_report';

/** One entry of the release's vocab/data-resources.json (schema v1.9.0). */
export interface ResourceEntry {
  slug: string;
  label: string;
  category: string;
  kind: ResourceKind;
  host: string | null;
  /** The page the host was read from (schema v1.9.1). */
  host_source?: string | null;
  embl_ebi: boolean;
  /** The Global Core Biodata Resource the resource is, or belongs to; null when none. */
  gcbr: string | null;
  elixir_cdr: string | null;
  elixir_edd: string | null;
  elixir_nodes: string[];
}

export interface ElixirNode {
  code: string;
  name: string;
}

/** `sourced` lists can be trusted for "no"; a `pending` list's nulls mean "not known yet". */
export interface Designation {
  label: string;
  status: 'sourced' | 'pending';
  source?: string;
  retrieved?: string;
  note?: string;
}

export interface ResourceVocab {
  resources: Map<string, ResourceEntry>;
  designations: Record<string, Designation>;
  elixirNodes: ElixirNode[];
}

/** The four designations a resource can carry, in the order the Data page offers them. */
export const DESIGNATION_KEYS = ['embl_ebi', 'elixir_cdr', 'elixir_edd', 'gcbr'] as const;
export type DesignationKey = (typeof DESIGNATION_KEYS)[number];

export function hasDesignation(entry: ResourceEntry, key: DesignationKey): boolean {
  return key === 'embl_ebi' ? entry.embl_ebi : Boolean(entry[key]);
}

interface VocabFile {
  designations?: Record<string, Designation>;
  elixir_nodes?: ElixirNode[];
  resources?: ResourceEntry[];
}

/** Parses the file's contents; exported so tests need no file on disk. */
export function parseResourceVocab(file: VocabFile): ResourceVocab {
  return {
    resources: new Map((file.resources ?? []).map((entry) => [entry.slug, entry])),
    designations: file.designations ?? {},
    elixirNodes: file.elixir_nodes ?? [],
  };
}

/**
 * Read once, from the release schema/CURRENT names. A release before v1.9.0 has no such file:
 * then every slug is unclassified, the Data page ranks nothing, and this says so in the log
 * rather than failing the boot.
 */
export function loadResourceVocab(dir: string | undefined = currentReleaseDir()): ResourceVocab {
  const path = dir ? join(dir, 'vocab', 'data-resources.json') : undefined;
  if (!path || !existsSync(path)) {
    logger.warn(
      `data-resources.json not found (looked in ${dir ?? 'nowhere: schema/CURRENT not found'}) -- ` +
        'the Data page has no resource classification.',
    );
    return parseResourceVocab({});
  }
  return parseResourceVocab(JSON.parse(readFileSync(path, 'utf8')) as VocabFile);
}

/** Slugs the Data page ranks: kind `data`, nothing else. */
export function dataSlugs(vocab: ResourceVocab): string[] {
  return [...vocab.resources.values()]
    .filter((r) => r.kind === 'data')
    .map((r) => r.slug)
    .sort();
}
