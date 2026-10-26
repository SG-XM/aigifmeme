import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config, creditTopUpProduct, order } from '@/config/db/schema';
import {
  getAdminConfigs,
  getCustomConfigs,
  replaceCustomConfigs,
  saveConfigs,
} from '@/modules/config/service';
import {
  listEnabledTopUpProducts,
  listTopUpProductsForAdmin,
} from '@/modules/top-up-products/service';
import {
  retentionTimeLeft,
  VIDEO_RETENTION_CONFIG_PREFIX,
  VIDEO_RETENTION_DURATION_MS,
  VIDEO_RETENTION_PRODUCT_ID,
} from '@/lib/video-retention-offer';

import {
  finishRetentionCheckout,
  getVideoRetentionOffer,
  issueVideoRetentionOffer,
  recoverRetentionCheckout,
  reserveRetentionCheckout,
} from './service';

const state = vi.hoisted(() => ({ database: null as any }));
vi.mock('@/core/db', () => ({ db: () => state.database }));
vi.mock('@/config', () => ({
  envConfigs: { database_provider: 'sqlite', database_url: 'file:test' },
}));
let client: ReturnType<typeof createClient>;
let testDir: string;
const key = VIDEO_RETENTION_CONFIG_PREFIX + 'u1';
const start = 1_800_000_000_000;

beforeEach(async () => {
  vi.spyOn(Date, 'now').mockReturnValue(start);
  testDir = mkdtempSync(join(tmpdir(), 'video-offer-test-'));
  client = createClient({ url: `file:${testDir}/test.db` });
  state.database = drizzle(client);
  const snapshot = JSON.parse(
    readFileSync('drizzle/meta/0015_snapshot.json', 'utf8')
  );
  for (const table of Object.values(snapshot.tables) as any[]) {
    const columns = Object.values(table.columns).map(
      (c: any) =>
        `"${c.name}" ${c.type}${c.primaryKey ? ' PRIMARY KEY' : ''}${c.notNull ? ' NOT NULL' : ''}${c.default !== undefined ? ` DEFAULT ${c.default}` : ''}`
    );
    await client.execute(
      `CREATE TABLE "${table.name}" (${columns.join(', ')})`
    );
    for (const index of Object.values(table.indexes) as any[])
      await client.execute(
        `CREATE ${index.isUnique ? 'UNIQUE ' : ''}INDEX "${index.name}" ON "${table.name}" (${index.columns.map((c: string) => `"${c}"`).join(', ')})`
      );
  }
  // Use the actual additive production seed and repeat it to prove idempotence.
  await client.execute(
    readFileSync('scripts/seed-video-retention-offer.sql', 'utf8')
  );
  await client.execute(
    readFileSync('scripts/seed-video-retention-offer.sql', 'utf8')
  );
  await state.database.insert(creditTopUpProduct).values({
    productId: 'single_v2',
    name: 'Single',
    priceInCents: 990,
    credits: 10,
  });
});
afterEach(() => {
  client.close();
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('video retention lifecycle', () => {
  it('issues once across concurrent tabs and cannot restart an expired offer', async () => {
    const results = await Promise.all([
      issueVideoRetentionOffer('u1', '/#create'),
      issueVideoRetentionOffer('u1', '/#create'),
    ]);
    expect(results.filter((result) => result.newlyIssued)).toHaveLength(1);
    expect(results[0].offer?.expiresAt).toBe(
      start + VIDEO_RETENTION_DURATION_MS
    );
    vi.mocked(Date.now).mockReturnValue(start + VIDEO_RETENTION_DURATION_MS);
    expect((await getVideoRetentionOffer('u1')).offer).toBeNull();
    expect(await issueVideoRetentionOffer('u1', '/#create')).toEqual({
      offer: null,
      newlyIssued: false,
    });
    await expect(reserveRetentionCheckout('u1')).rejects.toThrow('expired');
  });
  it('keeps the peeper campaign on the offer through checkout reservation', async () => {
    const issued = await issueVideoRetentionOffer(
      'u1',
      '/window-peeper#create',
      'peeper'
    );
    expect(issued.offer?.campaign).toBe('peeper');
    expect(issued.offer?.redirect).toBe('/window-peeper#create');
    const reserved = await reserveRetentionCheckout('u1');
    expect(JSON.parse(reserved.locked!).campaign).toBe('peeper');
    expect((await getVideoRetentionOffer('u1')).offer?.campaign).toBe('peeper');
  });
  it('rejects an account with no offer and isolates account deadlines', async () => {
    await issueVideoRetentionOffer('u1', '/#create');
    expect((await getVideoRetentionOffer('u2')).offer).toBeNull();
    await expect(reserveRetentionCheckout('u2')).rejects.toThrow();
    vi.mocked(Date.now).mockReturnValue(start + 20000);
    const second = await issueVideoRetentionOffer('u2', '/#create');
    expect(second.offer?.expiresAt).toBe(
      start + 20000 + VIDEO_RETENTION_DURATION_MS
    );
    expect((await getVideoRetentionOffer('u1')).offer?.expiresAt).toBe(
      start + VIDEO_RETENTION_DURATION_MS
    );
  });
  it('allows only one concurrent checkout and reuses its URL', async () => {
    await issueVideoRetentionOffer('u1', '/#create');
    const results = await Promise.allSettled([
      reserveRetentionCheckout('u1'),
      reserveRetentionCheckout('u1'),
    ]);
    const winner = results.find((result) => result.status === 'fulfilled');
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    if (winner?.status !== 'fulfilled' || !winner.value.locked)
      throw new Error('Missing reservation');
    await finishRetentionCheckout(
      'u1',
      winner.value.locked,
      'https://checkout.stripe.com/test'
    );
    expect(await reserveRetentionCheckout('u1')).toEqual({
      checkoutUrl: 'https://checkout.stripe.com/test',
    });
  });
  it('preserves the provider idempotency token after a failed attempt', async () => {
    await issueVideoRetentionOffer('u1', '/#create');
    const first = await reserveRetentionCheckout('u1');
    await recoverRetentionCheckout('u1', first.locked!);
    const second = await reserveRetentionCheckout('u1');
    expect(second.token).toBe(first.token);
  });
  it('recovers a crashed request with the same idempotency key after the lease', async () => {
    await issueVideoRetentionOffer('u1', '/#create');
    const first = await reserveRetentionCheckout('u1');
    vi.mocked(Date.now).mockReturnValue(start + 30001);
    const second = await reserveRetentionCheckout('u1');
    expect(second.token).toBe(first.token);
    expect(second.locked).not.toBe(first.locked);
    await recoverRetentionCheckout('u1', first.locked!);
    await expect(reserveRetentionCheckout('u1')).rejects.toThrow(
      'being prepared'
    );
  });
  it('recovers a persisted checkout and hides paid offers', async () => {
    await issueVideoRetentionOffer('u1', '/#create');
    const first = await reserveRetentionCheckout('u1');
    await state.database.insert(order).values({
      id: 'o1',
      orderNo: `retention_${first.token}`,
      userId: 'u1',
      userEmail: 'one@example.test',
      status: 'created',
      amount: 799,
      currency: 'usd',
      productId: VIDEO_RETENTION_PRODUCT_ID,
      paymentType: 'one-time',
      paymentProvider: 'stripe',
      checkoutInfo: '{}',
      checkoutUrl: 'https://checkout.stripe.com/recovered',
    });
    await recoverRetentionCheckout('u1', first.locked!);
    expect(await reserveRetentionCheckout('u1')).toEqual({
      checkoutUrl: 'https://checkout.stripe.com/recovered',
    });
    await state.database
      .update(order)
      .set({ status: 'paid' })
      .where(eq(order.id, 'o1'));
    expect((await getVideoRetentionOffer('u1')).offer).toBeNull();
    await expect(reserveRetentionCheckout('u1')).rejects.toThrow(
      'already been used'
    );
  });
  it('keeps admin price changes authoritative and respects the enabled switch', async () => {
    await issueVideoRetentionOffer('u1', '/#create');
    await state.database
      .update(creditTopUpProduct)
      .set({ priceInCents: 699 })
      .where(eq(creditTopUpProduct.productId, VIDEO_RETENTION_PRODUCT_ID));
    expect((await getVideoRetentionOffer('u1')).offer?.priceInCents).toBe(699);
    await state.database
      .update(creditTopUpProduct)
      .set({ enabled: false })
      .where(eq(creditTopUpProduct.productId, VIDEO_RETENTION_PRODUCT_ID));
    expect((await getVideoRetentionOffer('u1')).offer).toBeNull();
  });
  it('hides the reserved product from public catalog but keeps it editable in admin', async () => {
    expect(
      (await listEnabledTopUpProducts('en')).map((row: any) => row.productId)
    ).toEqual(['single_v2']);
    const all = await listTopUpProductsForAdmin();
    const product = all.find(
      (row: any) => row.productId === VIDEO_RETENTION_PRODUCT_ID
    );
    expect(product).toMatchObject({
      priceInCents: 799,
      credits: 10,
      enabled: true,
    });
    expect(
      all
        .filter((row: any) =>
          String(row.productId).startsWith('single_retention_name_')
        )
        .map((row: any) => row.priceInCents)
        .sort()
    ).toEqual([499, 599, 799, 999]);
    expect(all).toHaveLength(6);
  });
  it('reuses a name-your-price checkout only for the same chip', async () => {
    await issueVideoRetentionOffer('u1', '/#create');
    const first = await reserveRetentionCheckout(
      'u1',
      'single_retention_name_599'
    );
    await finishRetentionCheckout(
      'u1',
      first.locked!,
      'https://checkout.stripe.com/599'
    );
    expect(
      await reserveRetentionCheckout('u1', 'single_retention_name_599')
    ).toEqual({ checkoutUrl: 'https://checkout.stripe.com/599' });
    const next = await reserveRetentionCheckout(
      'u1',
      'single_retention_name_799'
    );
    expect(next.checkoutUrl).toBeUndefined();
    expect(next.token).not.toBe(first.token);
    await state.database.insert(order).values({
      id: 'o-name',
      orderNo: 'ORD-NAME',
      userId: 'u1',
      userEmail: 'one@example.test',
      status: 'paid',
      amount: 599,
      currency: 'usd',
      productId: 'single_retention_name_599',
      paymentType: 'one-time',
      paymentProvider: 'stripe',
      checkoutInfo: '{}',
    });
    expect((await getVideoRetentionOffer('u1')).offer).toBeNull();
  });
  it('protects private state from config exports, overwrites and custom config deletion', async () => {
    await issueVideoRetentionOffer('u1', '/#create');
    expect(await getCustomConfigs()).toEqual([]);
    expect(await getAdminConfigs()).not.toHaveProperty(key);
    await saveConfigs({ [key]: 'tampered', ordinary: 'setting' });
    await expect(
      replaceCustomConfigs([{ key, value: 'tampered' }])
    ).rejects.toThrow('Reserved');
    await replaceCustomConfigs([]);
    expect((await getVideoRetentionOffer('u1')).offer?.expiresAt).toBe(
      start + VIDEO_RETENTION_DURATION_MS
    );
    const rows = await state.database
      .select()
      .from(config)
      .where(eq(config.name, key));
    expect(rows).toHaveLength(1);
  });
  it('clamps countdown at zero with an exact expiry boundary', () => {
    const end = start + VIDEO_RETENTION_DURATION_MS;
    expect(retentionTimeLeft(end, start)).toBe(
      VIDEO_RETENTION_DURATION_MS / 1000
    );
    expect(retentionTimeLeft(end, end - 1)).toBe(1);
    expect(retentionTimeLeft(end, end)).toBe(0);
    expect(retentionTimeLeft(end, end + 10_000)).toBe(0);
  });
});
