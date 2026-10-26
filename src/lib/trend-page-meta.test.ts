import { describe, expect, it } from 'vitest';

import { trendPageMeta } from './trend-page-meta';

function jsonLdSiteName(siteName?: string) {
  const meta = trendPageMeta({
    locale: 'en',
    title: 'T',
    description: 'D',
    path: '/',
    siteName,
  });
  const script = (meta.scripts as any[])[0];
  return JSON.parse(script.children).isPartOf.name;
}

describe('trendPageMeta site name', () => {
  it('uses the DB site name when the loader provides one', () => {
    expect(jsonLdSiteName('Dance AI')).toBe('Dance AI');
  });
  it('falls back to the env app name when none is provided', () => {
    // envConfigs.app_name resolves to VITE_APP_NAME or its default in tests.
    expect(jsonLdSiteName(undefined)).toBeTruthy();
    expect(jsonLdSiteName('')).toBe(jsonLdSiteName(undefined));
  });
});
