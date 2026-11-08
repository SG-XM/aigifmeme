import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { isHiddenPublicPath } from './public-page-visibility';

const REMOVED = ['/settings/payments', '/settings/billing'] as const;

describe('temporarily removed settings pages', () => {
  it('hides both pages, including locale prefixes, and leaves the rest', () => {
    for (const path of REMOVED) {
      expect(isHiddenPublicPath(path), path).toBe(true);
      expect(isHiddenPublicPath(`/zh${path}`), path).toBe(true);
      expect(isHiddenPublicPath(`/es${path}/`), path).toBe(true);
      expect(isHiddenPublicPath(`/ar${path}?success=1`), path).toBe(true);
    }
    for (const path of [
      '/settings',
      '/settings/credits',
      '/settings/profile',
      '/settings/tickets',
      '/pricing',
      '/api/payment/checkout',
      '/api/top-up-products',
      '/api/subscription-plans',
    ]) {
      expect(isHiddenPublicPath(path), path).toBe(false);
    }
  });

  it('drops the pages from settings nav, overview, and footer', () => {
    const sources = [
      'src/routes/settings/route.tsx',
      'src/routes/settings/index.tsx',
      'src/blocks/footer.tsx',
    ].map((file) => readFileSync(file, 'utf8'));
    const combined = sources.join('\n');
    expect(combined).not.toContain("href: '/settings/payments'");
    expect(combined).not.toContain("href: '/settings/billing'");
    expect(sources[0]).toContain("href: '/settings/credits'");
    expect(sources[0]).toContain("href: '/settings/tickets'");
    expect(sources[0]).toContain("href: '/settings/profile'");
    expect(sources[1]).toContain("href: '/pricing'");
    expect(sources[2]).toContain("href: '/settings/credits'");
  });

  it('does not send checkout returns to the removed pages', () => {
    const callback = readFileSync('src/routes/api/payment/callback.ts', 'utf8');
    const checkout = readFileSync('src/modules/payment/service.ts', 'utf8');
    expect(callback).not.toContain('/settings/billing');
    expect(callback).not.toContain('/settings/payments');
    expect(checkout).not.toContain('/settings/billing');
    expect(checkout).not.toContain('/settings/payments');
    expect(callback).toContain('/settings');
  });
});
