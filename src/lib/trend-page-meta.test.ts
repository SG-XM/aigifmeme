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

// Public tool canonicals must not inherit a localhost preview origin.
describe('public PDF tool origin', () => {
  it.each([
    '/pdf-metadata-remover',
    '/zh/pdf-metadata-remover',
    '/es/pdf-metadata-remover',
    '/ar/pdf-metadata-remover/',
  ])('pins %s to the product domain', (path) => {
    expect(canonicalOrigin('http://localhost:3000', path)).toBe(
      'https://filemetawipe.com'
    );
  });
});
