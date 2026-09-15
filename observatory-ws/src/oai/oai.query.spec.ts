import {
  decodeResumptionToken,
  encodeResumptionToken,
  OaiErrorCode,
  parseOaiArgs,
  pidOf,
} from './oai.query';

const PID = '8b720ad0-8cf7-5304-a016-3b15feae2815';
const ID = `oai:observatory.dome-ml.org:${PID}`;

const code = (args: Record<string, unknown>): OaiErrorCode | undefined =>
  parseOaiArgs(args).errors[0]?.code;

describe('parseOaiArgs', () => {
  it.each<[Record<string, unknown>, OaiErrorCode]>([
    [{}, 'badVerb'],
    [{ verb: 'ListEverything' }, 'badVerb'],
    [{ verb: ['Identify', 'Identify'] }, 'badArgument'],
    [{ verb: 'Identify', metadataPrefix: 'oai_dc' }, 'badArgument'],
    [{ verb: 'ListRecords' }, 'badArgument'],
    [{ verb: 'ListRecords', metadataPrefix: '' }, 'badArgument'],
    [{ verb: 'ListRecords', metadataPrefix: 'marc21' }, 'cannotDisseminateFormat'],
    [{ verb: 'ListRecords', metadataPrefix: 'oai_dc', set: 'class:positive' }, 'noSetHierarchy'],
    [{ verb: 'ListRecords', metadataPrefix: 'oai_dc', from: '2026-02-30' }, 'badArgument'],
    [{ verb: 'ListRecords', metadataPrefix: 'oai_dc', from: '2026-09-15T10:00:00' }, 'badArgument'],
    [
      {
        verb: 'ListRecords',
        metadataPrefix: 'oai_dc',
        from: '2026-09-15',
        until: '2026-09-16T00:00:00Z',
      },
      'badArgument',
    ],
    [
      { verb: 'ListRecords', metadataPrefix: 'oai_dc', from: '2026-09-16', until: '2026-09-15' },
      'badArgument',
    ],
    [{ verb: 'ListIdentifiers', resumptionToken: 'abc', metadataPrefix: 'oai_dc' }, 'badArgument'],
    [{ verb: 'ListIdentifiers', resumptionToken: 'not-a-token' }, 'badResumptionToken'],
    [{ verb: 'GetRecord', identifier: ID }, 'badArgument'],
    [
      { verb: 'GetRecord', identifier: 'oai:elsewhere.org:1', metadataPrefix: 'oai_dc' },
      'idDoesNotExist',
    ],
    [{ verb: 'GetRecord', identifier: ID, metadataPrefix: 'mods' }, 'cannotDisseminateFormat'],
    [
      { verb: 'ListMetadataFormats', identifier: 'oai:observatory.dome-ml.org:nope' },
      'idDoesNotExist',
    ],
    [{ verb: 'ListSets' }, 'noSetHierarchy'],
    [{ verb: 'ListSets', resumptionToken: 'x' }, 'badResumptionToken'],
  ])('%j -> %s', (args, expected) => {
    expect(code(args)).toBe(expected);
  });

  it('echoes the arguments, except after badVerb or badArgument', () => {
    expect(parseOaiArgs({ verb: 'Nope' }).echo).toBeUndefined();
    expect(parseOaiArgs({ verb: 'Identify', x: '1' }).echo).toBeUndefined();
    expect(parseOaiArgs({ verb: 'ListRecords', metadataPrefix: 'marc21' }).echo).toEqual({
      verb: 'ListRecords',
      metadataPrefix: 'marc21',
    });
  });

  it('expands day bounds to whole days and keeps second bounds as they are', () => {
    expect(
      parseOaiArgs({
        verb: 'ListRecords',
        metadataPrefix: 'oai_dc',
        from: '2026-09-15',
        until: '2026-09-15',
      }).request,
    ).toEqual({
      verb: 'ListRecords',
      from: '2026-09-15T00:00:00Z',
      until: '2026-09-15T23:59:59Z',
      resumed: false,
    });
    expect(
      parseOaiArgs({
        verb: 'ListIdentifiers',
        metadataPrefix: 'oai_dc',
        until: '2026-09-15T10:00:00Z',
      }).request,
    ).toEqual({
      verb: 'ListIdentifiers',
      from: undefined,
      until: '2026-09-15T10:00:00Z',
      resumed: false,
    });
  });

  it('continues a list from its resumption token alone', () => {
    const token = encodeResumptionToken({
      until: '2026-09-15T23:59:59Z',
      t: '2026-09-15T18:00:00Z',
      i: PID,
    });
    expect(parseOaiArgs({ verb: 'ListRecords', resumptionToken: token }).request).toEqual({
      verb: 'ListRecords',
      from: undefined,
      until: '2026-09-15T23:59:59Z',
      after: { t: '2026-09-15T18:00:00Z', i: PID },
      resumed: true,
    });
  });

  it('accepts GetRecord and ListMetadataFormats for one of this repository’s identifiers', () => {
    expect(
      parseOaiArgs({ verb: 'GetRecord', identifier: ID, metadataPrefix: 'oai_dc' }).request,
    ).toEqual({
      verb: 'GetRecord',
      pid: PID,
    });
    expect(parseOaiArgs({ verb: 'ListMetadataFormats' }).request).toEqual({
      verb: 'ListMetadataFormats',
    });
  });
});

describe('resumption tokens', () => {
  it('round-trip, and reject anything tampered with', () => {
    const state = { from: '2026-09-01T00:00:00Z', t: '2026-09-15T18:00:00Z', i: PID };
    expect(decodeResumptionToken(encodeResumptionToken(state))).toEqual({
      ...state,
      until: undefined,
    });
    const forged = Buffer.from(JSON.stringify({ v: 1, t: 'yesterday', i: PID })).toString(
      'base64url',
    );
    expect(decodeResumptionToken(forged)).toBeUndefined();
    expect(decodeResumptionToken(Buffer.from('[1]').toString('base64url'))).toBeUndefined();
    expect(decodeResumptionToken('%%%')).toBeUndefined();
  });

  it('pidOf reads only this repository’s identifiers', () => {
    expect(pidOf(ID)).toBe(PID);
    expect(pidOf(`oai:observatory.dome-ml.org:${PID}x`)).toBeUndefined();
    expect(pidOf(undefined)).toBeUndefined();
  });
});
