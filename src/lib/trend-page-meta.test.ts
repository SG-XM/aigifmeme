import { describe, expect, it } from 'vitest';

import { canonicalOrigin, trendPageMeta } from './trend-page-meta';

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

describe('public homepage origin', () => {
  it('pins the homepage to aigifmeme.com', () => {
    expect(canonicalOrigin('http://localhost:3000', '/')).toBe(
      'https://aigifmeme.com'
    );
    expect(canonicalOrigin('https://workers.dev', '')).toBe(
      'https://aigifmeme.com'
    );
  });
});
