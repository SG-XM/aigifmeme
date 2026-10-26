import { describe, expect, it } from 'vitest';

import { sanitizeGoogleAnalyticsId } from './google-analytics-id';

describe('sanitizeGoogleAnalyticsId', () => {
  it('drops a trailing quote and surrounding whitespace', () => {
    expect(sanitizeGoogleAnalyticsId('G-VL4PJW7S79"')).toBe('G-VL4PJW7S79');
    expect(sanitizeGoogleAnalyticsId('  G-VL4PJW7S79"  ')).toBe('G-VL4PJW7S79');
  });

  it('drops wrapping single or double quotes', () => {
    expect(sanitizeGoogleAnalyticsId('"G-VL4PJW7S79"')).toBe('G-VL4PJW7S79');
    expect(sanitizeGoogleAnalyticsId("'G-VL4PJW7S79'")).toBe('G-VL4PJW7S79');
    expect(sanitizeGoogleAnalyticsId(' "G-VL4PJW7S79" ')).toBe('G-VL4PJW7S79');
  });

  it('leaves an already clean id unchanged', () => {
    expect(sanitizeGoogleAnalyticsId('G-VL4PJW7S79')).toBe('G-VL4PJW7S79');
    expect(sanitizeGoogleAnalyticsId(undefined)).toBe('');
    expect(sanitizeGoogleAnalyticsId('   ')).toBe('');
  });
});
