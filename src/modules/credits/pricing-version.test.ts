import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VIDEO_PRICING_VERSION_KEY } from '@/lib/video-pricing';

import { requireCurrentCreditPricing } from './service';

const state = vi.hoisted(() => ({ database: null as any }));
vi.mock('@/core/db', () => ({ db: () => state.database }));

let client: ReturnType<typeof createClient>;
let directory: string;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'pricing-version-'));
  client = createClient({ url: `file:${directory}/test.db` });
  state.database = drizzle(client);
  await client.execute(
    'CREATE TABLE config (name text NOT NULL UNIQUE, value text)'
  );
});

afterEach(() => {
  client.close();
  rmSync(directory, { recursive: true, force: true });
});

async function store(value: string | null) {
  await client.execute({
    sql: 'DELETE FROM config WHERE name = ?',
    args: [VIDEO_PRICING_VERSION_KEY],
  });
  if (value === null) return;
  await client.execute({
    sql: 'INSERT INTO config (name, value) VALUES (?, ?)',
    args: [VIDEO_PRICING_VERSION_KEY, value],
  });
}

describe('requireCurrentCreditPricing stored representations', () => {
  it('accepts the plain marker and the JSON string literal of that marker', async () => {
    await store('seedance-12s-v2');
    await expect(requireCurrentCreditPricing()).resolves.toBeUndefined();

    await store('"seedance-12s-v2"');
    const raw = await client.execute(
      `SELECT value FROM config WHERE name = '${VIDEO_PRICING_VERSION_KEY}'`
    );
    expect(raw.rows[0]?.value).toBe('"seedance-12s-v2"');
    await expect(requireCurrentCreditPricing()).resolves.toBeUndefined();
  });

  it('rejects a missing row, a different version, and a quoted different version', async () => {
    await expect(requireCurrentCreditPricing()).rejects.toThrow(
      'Credit pricing migration is required'
    );

    for (const value of [
      'legacy',
      '"legacy"',
      '"seedance-12s-v2 "',
      ' "seedance-12s-v2"',
      '"seedance-12s-v2"extra',
      '{"version":"seedance-12s-v2"}',
    ]) {
      await store(value);
      await expect(requireCurrentCreditPricing(), value).rejects.toThrow(
        'Credit pricing migration is required'
      );
    }
  });
});

describe('checkout and generation keep the pricing gate', () => {
  it('still calls requireCurrentCreditPricing before paid or generated work', () => {
    const files = [
      'src/routes/api/payment/checkout.ts',
      'src/routes/api/payment/video-retention-offer.ts',
      'src/routes/api/agent/chat.ts',
      'src/modules/ai-tasks/service.ts',
    ];
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).toContain(
        'requireCurrentCreditPricing('
      );
    }
    expect(
      readFileSync('src/lib/public-credit-packs-server.ts', 'utf8')
    ).not.toContain('requireCurrentCreditPricing(');
    expect(
      readFileSync('src/routes/api/subscription-plans.ts', 'utf8')
    ).not.toContain('requireCurrentCreditPricing(');
  });
});
