import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';

const logger = new Logger('SchemaVersion');

/**
 * Fallback used only if schema/CURRENT can't be found at all -- kept in sync by hand with
 * schema/CURRENT's actual content. A stale fallback is a cosmetic drift in /api/health/ready's
 * response, never a functional break (nothing here validates documents against it at request
 * time), so this deliberately warns rather than crashing the app.
 */
const FALLBACK_SCHEMA_VERSION = '1.1.0';

/**
 * Locates schema/CURRENT from either of the two working directories this app runs from: repo
 * root (`observatory-ws/../schema`, when the process cwd is observatory-ws/ -- `npm run start:dev`)
 * or the repo root itself (`./schema`, if ever invoked from there directly). Phase 6's Dockerfile
 * will COPY schema/ into the image at a fixed path (mirroring observatory-ui/Dockerfile's root-
 * context build) -- add that path to this list once it's decided, rather than assuming it now.
 */
function findCurrentFile(): string | undefined {
  const candidates = [
    resolve(process.cwd(), '../schema/CURRENT'),
    resolve(process.cwd(), 'schema/CURRENT'),
  ];
  return candidates.find((path) => existsSync(path));
}

function readCurrentSchemaVersion(): string {
  const path = findCurrentFile();
  if (!path) {
    logger.warn(
      `schema/CURRENT not found (looked next to and inside cwd=${process.cwd()}) -- ` +
        `falling back to hardcoded ${FALLBACK_SCHEMA_VERSION}. This is cosmetic (only affects ` +
        `/api/health/ready's reported version) but means schema/ and this deployment have drifted.`,
    );
    return FALLBACK_SCHEMA_VERSION;
  }

  const version = readFileSync(path, 'utf8').trim();
  if (!version) {
    logger.warn(`schema/CURRENT at ${path} is empty -- falling back to ${FALLBACK_SCHEMA_VERSION}`);
    return FALLBACK_SCHEMA_VERSION;
  }
  return version;
}

/** Read once at module load, not per-request -- schema/CURRENT only changes on a deploy. */
export const CURRENT_SCHEMA_VERSION = readCurrentSchemaVersion();
