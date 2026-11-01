import { describe, expect, it } from 'vitest';

import { resolveSiteName } from './site-name';

describe('resolveSiteName', () => {
  it('prefers the admin (DB) app_name over the build-time env name', () => {
    expect(resolveSiteName('Dance AI', 'Uptown')).toBe('Dance AI');
  });
  it('falls back to the env name when the DB value is empty/blank', () => {
    expect(resolveSiteName('', 'Uptown')).toBe('Uptown');
    expect(resolveSiteName('   ', 'Uptown')).toBe('Uptown');
    expect(resolveSiteName(undefined, 'Uptown')).toBe('Uptown');
  });
  it('falls back to FileMeta Wipe when neither is set', () => {
    expect(resolveSiteName(undefined, undefined)).toBe('FileMeta Wipe');
    expect(resolveSiteName('', ' ')).toBe('FileMeta Wipe');
  });
  it('trims surrounding whitespace', () => {
    expect(resolveSiteName('  Dance AI  ', 'x')).toBe('Dance AI');
  });
});
