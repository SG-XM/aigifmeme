import { describe, expect, it } from 'vitest';

import { decodeStoredConfigString } from './config-value';

describe('decodeStoredConfigString', () => {
  it('decodes one JSON string literal and leaves plain text alone', () => {
    expect(decodeStoredConfigString('"seedance-12s-v2"')).toBe(
      'seedance-12s-v2'
    );
    expect(decodeStoredConfigString('seedance-12s-v2')).toBe('seedance-12s-v2');
    expect(decodeStoredConfigString('"say \\"hi\\""')).toBe('say "hi"');
  });

  it('does not parse numbers, objects, or broken quotes', () => {
    expect(decodeStoredConfigString('80')).toBe('80');
    expect(decodeStoredConfigString('{"version":"seedance-12s-v2"}')).toBe(
      '{"version":"seedance-12s-v2"}'
    );
    expect(decodeStoredConfigString('"seedance-12s-v2" ')).toBe(
      '"seedance-12s-v2" '
    );
    expect(decodeStoredConfigString('"seedance-12s-v2')).toBe(
      '"seedance-12s-v2'
    );
    expect(decodeStoredConfigString('')).toBe('');
  });
});
