import { OAI_REPOSITORY_ID } from '../metadata/metadata-urls';
import { DatestampKey, toDatestamp } from '../metadata/record-keyset';

/**
 * OAI-PMH 2.0 argument handling, pure: request arguments in, a validated request or the protocol
 * errors out. The rules are the specification's (https://www.openarchives.org/OAI/openarchivesprotocol.html):
 * every argument at most once, no argument a verb does not define, `resumptionToken` exclusive.
 *
 * This repository has no sets, one metadata format (`oai_dc`) and exposes positives only.
 */

export const OAI_VERBS = [
  'Identify',
  'ListMetadataFormats',
  'ListSets',
  'GetRecord',
  'ListIdentifiers',
  'ListRecords',
] as const;
export type OaiVerb = (typeof OAI_VERBS)[number];

export const METADATA_PREFIX = 'oai_dc';

export type OaiErrorCode =
  | 'badArgument'
  | 'badResumptionToken'
  | 'badVerb'
  | 'cannotDisseminateFormat'
  | 'idDoesNotExist'
  | 'noRecordsMatch'
  | 'noSetHierarchy';

export interface OaiError {
  code: OaiErrorCode;
  message: string;
}

export interface OaiListRequest {
  verb: 'ListIdentifiers' | 'ListRecords';
  /** Inclusive lower bound, expanded to seconds. */
  from?: string;
  /** Inclusive upper bound, expanded to seconds. */
  until?: string;
  after?: DatestampKey;
  /** Whether the request continued a list through a resumption token. */
  resumed: boolean;
}

export type OaiRequest =
  | { verb: 'Identify' }
  | { verb: 'ListMetadataFormats'; pid?: string }
  | { verb: 'GetRecord'; pid: string }
  | OaiListRequest;

export interface ParsedOaiRequest {
  request?: OaiRequest;
  errors: OaiError[];
  /** The arguments to echo as attributes of `<request>`; absent after badVerb / badArgument, as
   *  the protocol requires. */
  echo?: Readonly<Record<string, string>>;
}

const RULES: Record<
  OaiVerb,
  { required: readonly string[]; optional: readonly string[]; exclusive?: string }
> = {
  Identify: { required: [], optional: [] },
  ListMetadataFormats: { required: [], optional: ['identifier'] },
  ListSets: { required: [], optional: [], exclusive: 'resumptionToken' },
  GetRecord: { required: ['identifier', 'metadataPrefix'], optional: [] },
  ListIdentifiers: {
    required: ['metadataPrefix'],
    optional: ['from', 'until', 'set'],
    exclusive: 'resumptionToken',
  },
  ListRecords: {
    required: ['metadataPrefix'],
    optional: ['from', 'until', 'set'],
    exclusive: 'resumptionToken',
  },
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER_PREFIX = `oai:${OAI_REPOSITORY_ID}:`;

const error = (code: OaiErrorCode, message: string): OaiError => ({ code, message });

export const idDoesNotExist = (identifier: string): OaiError =>
  error('idDoesNotExist', `No harvestable record has the identifier ${identifier}.`);

export const noRecordsMatch = (): OaiError =>
  error('noRecordsMatch', 'No records match the request.');

const noSets = (): OaiError => error('noSetHierarchy', 'This repository does not support sets.');

function isVerb(value: string): value is OaiVerb {
  return (OAI_VERBS as readonly string[]).includes(value);
}

/** The record `_id` an OAI identifier names, or undefined when it is not one of this repository's. */
export function pidOf(identifier: string | undefined): string | undefined {
  if (!identifier?.startsWith(IDENTIFIER_PREFIX)) return undefined;
  const pid = identifier.slice(IDENTIFIER_PREFIX.length);
  return UUID.test(pid) ? pid : undefined;
}

interface Datestamp {
  granularity: 'day' | 'second';
  lower: string;
  upper: string;
}

/** undefined when absent, null when present but not a real date at either granularity. */
function parseDatestamp(value: string | undefined): Datestamp | null | undefined {
  if (value === undefined) return undefined;
  const granularity = DAY.test(value) ? 'day' : SECOND.test(value) ? 'second' : undefined;
  if (!granularity) return null;
  const lower = granularity === 'day' ? `${value}T00:00:00Z` : value;
  const date = new Date(lower);
  // Rejects dates that parse by rolling over, such as 2026-02-30.
  if (Number.isNaN(date.getTime()) || toDatestamp(date) !== lower) return null;
  return { granularity, lower, upper: granularity === 'day' ? `${value}T23:59:59Z` : value };
}

export function parseOaiArgs(raw: Readonly<Record<string, unknown>>): ParsedOaiRequest {
  const args: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== 'string') {
      return {
        errors: [error('badArgument', `The argument "${name}" must be given exactly once.`)],
      };
    }
    args[name] = value;
  }

  const verb = args.verb as string | undefined;
  if (verb === undefined) return { errors: [error('badVerb', 'The verb argument is missing.')] };
  if (!isVerb(verb)) return { errors: [error('badVerb', `"${verb}" is not an OAI-PMH verb.`)] };

  const rules = RULES[verb];
  const given = Object.keys(args).filter((name) => name !== 'verb');
  const legal = new Set([
    ...rules.required,
    ...rules.optional,
    ...(rules.exclusive ? [rules.exclusive] : []),
  ]);
  const illegal = given.filter((name) => !legal.has(name));
  if (illegal.length) {
    return {
      errors: [error('badArgument', `Illegal argument(s) for ${verb}: ${illegal.join(', ')}.`)],
    };
  }
  const empty = given.filter((name) => args[name] === '');
  if (empty.length) {
    return { errors: [error('badArgument', `Empty argument(s): ${empty.join(', ')}.`)] };
  }
  const token = rules.exclusive ? (args[rules.exclusive] as string | undefined) : undefined;
  if (token !== undefined && given.length > 1) {
    return { errors: [error('badArgument', 'resumptionToken is an exclusive argument.')] };
  }
  if (token === undefined) {
    const missing = rules.required.filter((name) => args[name] === undefined);
    if (missing.length) {
      return {
        errors: [error('badArgument', `Missing required argument(s): ${missing.join(', ')}.`)],
      };
    }
  }

  const echo: Readonly<Record<string, string>> = { ...args };
  const fail = (e: OaiError): ParsedOaiRequest => ({ errors: [e], echo });
  const ok = (request: OaiRequest): ParsedOaiRequest => ({ request, errors: [], echo });
  const identifier = args.identifier as string | undefined;
  const prefix = args.metadataPrefix as string | undefined;

  switch (verb) {
    case 'Identify':
      return ok({ verb });
    case 'ListSets':
      return fail(
        token !== undefined
          ? error(
              'badResumptionToken',
              'This repository has no sets, so no resumption token is valid.',
            )
          : noSets(),
      );
    case 'ListMetadataFormats': {
      if (identifier === undefined) return ok({ verb });
      const pid = pidOf(identifier);
      return pid ? ok({ verb, pid }) : fail(idDoesNotExist(identifier));
    }
    case 'GetRecord': {
      if (prefix !== METADATA_PREFIX) return fail(cannotDisseminate(prefix));
      const pid = pidOf(identifier);
      return pid ? ok({ verb, pid }) : fail(idDoesNotExist(identifier ?? ''));
    }
    case 'ListIdentifiers':
    case 'ListRecords': {
      if (token !== undefined) {
        const state = decodeResumptionToken(token);
        if (!state) return fail(error('badResumptionToken', 'The resumption token is not valid.'));
        return ok({
          verb,
          from: state.from,
          until: state.until,
          after: { t: state.t, i: state.i },
          resumed: true,
        });
      }
      if (prefix !== METADATA_PREFIX) return fail(cannotDisseminate(prefix));
      if (args.set !== undefined) return fail(noSets());
      const from = parseDatestamp(args.from);
      const until = parseDatestamp(args.until);
      if (from === null || until === null) {
        return fail(
          error('badArgument', 'from and until must be YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ.'),
        );
      }
      if (from && until && from.granularity !== until.granularity) {
        return fail(error('badArgument', 'from and until must have the same granularity.'));
      }
      if (from && until && from.lower > until.upper) {
        return fail(error('badArgument', 'from is later than until.'));
      }
      return ok({ verb, from: from?.lower, until: until?.upper, resumed: false });
    }
  }
}

function cannotDisseminate(prefix: string | undefined): OaiError {
  return error(
    'cannotDisseminateFormat',
    `The metadata format "${prefix ?? ''}" is not supported; this repository offers ${METADATA_PREFIX}.`,
  );
}

/** Everything needed to continue a list: the range, and the key the last page ended on. */
export interface ResumptionState {
  from?: string;
  until?: string;
  t: string;
  i: string;
}

/**
 * Keyset state, not a server-side session: nothing to expire or lose on a restart, and any number
 * of harvesters can page concurrently. Opaque to harvesters by the protocol's rules, so a version
 * field leaves room to change the shape.
 */
export function encodeResumptionToken(state: ResumptionState): string {
  return Buffer.from(JSON.stringify({ v: 1, ...state }), 'utf8').toString('base64url');
}

export function decodeResumptionToken(token: string): ResumptionState | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const { v, from, until, t, i } = parsed as Record<string, unknown>;
  const bound = (value: unknown): value is string | undefined =>
    value === undefined || (typeof value === 'string' && SECOND.test(value));
  if (
    v !== 1 ||
    typeof t !== 'string' ||
    !SECOND.test(t) ||
    typeof i !== 'string' ||
    !UUID.test(i)
  ) {
    return undefined;
  }
  if (!bound(from) || !bound(until)) return undefined;
  return { from, until, t, i };
}
