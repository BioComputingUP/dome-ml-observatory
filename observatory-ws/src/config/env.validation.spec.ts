import 'reflect-metadata';
import { validate } from './env.validation';

const REQUIRED = {
  MONGODB_URI: 'mongodb://localhost:27017',
  MONGODB_DB: 'dome_observatory',
  MONGODB_COLLECTION: 'Content',
};

describe('validate (env)', () => {
  it('accepts the shipped default, with Matomo off', () => {
    expect(() => validate({ ...REQUIRED })).not.toThrow();
  });

  it('refuses MATOMO_TOKEN without MATOMO_SITE_ID, naming the variable, rather than crashing later', () => {
    // Without this check the tracker's constructor asserts on the missing site ID during boot.
    expect(() => validate({ ...REQUIRED, MATOMO_TOKEN: 'secret' })).toThrow(/MATOMO_SITE_ID/);
    expect(() => validate({ ...REQUIRED, MATOMO_TOKEN: 'secret', MATOMO_SITE_ID: '' })).toThrow(
      /MATOMO_SITE_ID/,
    );
  });

  it('accepts MATOMO_TOKEN together with MATOMO_SITE_ID', () => {
    expect(() =>
      validate({ ...REQUIRED, MATOMO_TOKEN: 'secret', MATOMO_SITE_ID: '7' }),
    ).not.toThrow();
  });
});
