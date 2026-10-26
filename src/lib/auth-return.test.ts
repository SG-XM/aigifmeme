import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isFreshTimestamp,
  isSafeAuthCallback,
  rememberAuthIntent,
  takeAuthIntent,
} from './auth-return';

describe('auth return paths', () => {
  it('allows create-section callbacks and rejects auth pages and off-site urls', () => {
    expect(isSafeAuthCallback('/#create')).toBe(true);
    expect(isSafeAuthCallback('/burning-bridges-ai#create')).toBe(true);
    expect(isSafeAuthCallback('/pricing?plan=starter')).toBe(true);
    expect(isSafeAuthCallback('/sign-in?callbackUrl=%2F')).toBe(false);
    expect(isSafeAuthCallback('/sign-up')).toBe(false);
    expect(isSafeAuthCallback('/verify-email?sent=1')).toBe(false);
    expect(isSafeAuthCallback('/forgot-password')).toBe(false);
    expect(isSafeAuthCallback('/reset-password')).toBe(false);
    expect(isSafeAuthCallback('/redeem-invite')).toBe(false);
    expect(isSafeAuthCallback('//evil.example')).toBe(false);
    expect(isSafeAuthCallback('https://evil.example')).toBe(false);
    expect(isSafeAuthCallback('/\\evil')).toBe(false);
    expect(isSafeAuthCallback(null)).toBe(false);
  });

  it('expires timestamps outside the resume window', () => {
    const now = 1_000_000;
    expect(isFreshTimestamp(now - 1000, now)).toBe(true);
    expect(isFreshTimestamp(now + 1000, now)).toBe(false);
    expect(isFreshTimestamp(now - 31 * 60 * 1000, now)).toBe(false);
  });
});

describe('auth intent', () => {
  const memory = new Map<string, string>();

  afterEach(() => {
    memory.clear();
    vi.unstubAllGlobals();
  });

  it('returns the pending action once, then clears it', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    });
    rememberAuthIntent('generate');
    expect(takeAuthIntent()).toBe('generate');
    expect(takeAuthIntent()).toBeNull();
  });
});
