import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Locates metadata/CURRENT from either working directory the app runs from, the same two
 * candidates common/schema-version.ts uses for schema/CURRENT (the Dockerfile copies metadata/ next
 * to schema/ for exactly that reason).
 */
export function findMetadataCurrent(cwd: string = process.cwd()): string | undefined {
  return [resolve(cwd, '../metadata/CURRENT'), resolve(cwd, 'metadata/CURRENT')].find((path) =>
    existsSync(path),
  );
}

/**
 * The corpus description of the release metadata/CURRENT names: its `dataset.jsonld`, verbatim.
 * Undefined when either file is missing. A file that is not JSON throws, so a broken release is
 * found on the first request instead of being served.
 */
export function readCatalog(currentFile: string | undefined): string | undefined {
  if (!currentFile) return undefined;
  const release = readFileSync(currentFile, 'utf8').trim();
  const file = resolve(dirname(currentFile), 'releases', release, 'dataset.jsonld');
  if (!release || !existsSync(file)) return undefined;
  const text = readFileSync(file, 'utf8');
  JSON.parse(text);
  return text;
}

/**
 * Serves the corpus's DCAT / schema.org description. The file is built on the write side at each
 * release (dome-ml-observatory-triage's build_release_metadata.py) and published here under
 * metadata/releases/<YYYY-MM>/, the way schema releases are; it changes only with a deploy, so it
 * is read once.
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private loaded = false;
  private text: string | undefined;

  current(): string | undefined {
    if (!this.loaded) {
      this.text = readCatalog(findMetadataCurrent());
      this.loaded = true;
      if (!this.text) {
        this.logger.warn(
          `metadata/CURRENT or the dataset.jsonld it names was not found (cwd=${process.cwd()}) ` +
            '-- /api/catalog answers 404 until a release is published.',
        );
      }
    }
    return this.text;
  }
}
