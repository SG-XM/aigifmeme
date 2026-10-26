import { eq, sql } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { db } from '@/core/db';
import { envConfigs } from '@/config';
import { aiTask, credit } from '@/config/db/schema';
import { createTask } from '@/modules/ai-tasks/service';

import { consume, getBalance, grant, revoke } from './service';

const fixture = vi.hoisted(() => ({ directory: '' }));
vi.mock('@/core/db', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  fixture.directory = mkdtempSync(tmpdir() + '/video-credits-test-');
  const { createDb } = await import('@/core/db/create-db');
  const instance = createDb({
    database_provider: 'sqlite',
    database_url: 'file:' + fixture.directory + '/credits.db',
  });
  return { db: () => instance };
});

beforeAll(async () => {
  await db().run(sql`CREATE TABLE config (name text NOT NULL, value text)`);
  await db().run(
    sql`INSERT INTO config VALUES ('video_credit_pricing_version', 'seedance-12s-v2')`
  );
  await db().run(
    sql`CREATE TABLE ai_task (id text PRIMARY KEY, user_id text NOT NULL, media_type text NOT NULL, provider text NOT NULL, model text NOT NULL, prompt text NOT NULL, options text, status text NOT NULL, created_at integer NOT NULL DEFAULT (unixepoch()*1000), updated_at integer NOT NULL DEFAULT (unixepoch()*1000), deleted_at integer, task_id text, task_info text, task_result text, cost_credits integer DEFAULT 0 NOT NULL, scene text DEFAULT '' NOT NULL, credit_id text)`
  );
  await db().run(sql`CREATE TABLE credit (
    id text PRIMARY KEY, user_id text NOT NULL, user_email text, order_no text,
    subscription_no text, transaction_no text UNIQUE NOT NULL,
    transaction_type text NOT NULL, transaction_scene text, credits integer NOT NULL,
    remaining_credits integer NOT NULL DEFAULT 0, description text, expires_at integer,
    status text NOT NULL, created_at integer NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at integer NOT NULL DEFAULT (unixepoch() * 1000), deleted_at integer,
    consumed_detail text, metadata text
  )`);
});
afterAll(async () => {
  db().$client.close();
  const { rmSync } = await import('node:fs');
  rmSync(fixture.directory, { recursive: true, force: true });
});
beforeEach(async () => {
  envConfigs.database_provider = 'sqlite';
  delete (globalThis as any).__CF_ENV__;
  await db().delete(aiTask);
  await db().delete(credit);
});

describe('shared pack/subscription credit balance', () => {
  it('spends expiring subscription credits before an older permanent pack', async () => {
    const pack = await grant({ userId: 'u1', credits: 50, expiresAt: null });
    const plan = await grant({
      userId: 'u1',
      credits: 100,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const result = await consume({ userId: 'u1', credits: 10 });
    expect(result.success).toBe(true);
    const rows = await db()
      .select()
      .from(credit)
      .where(eq(credit.transactionType, 'grant'));
    expect(rows.find((r: any) => r.id === pack.id).remainingCredits).toBe(50);
    expect(rows.find((r: any) => r.id === plan.id).remainingCredits).toBe(90);
    expect(await getBalance('u1')).toBe(140);
  });
  it('refunds a render spanning two grants exactly once', async () => {
    await grant({
      userId: 'u1',
      credits: 5,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await grant({ userId: 'u1', credits: 10, expiresAt: null });
    const result = await consume({ userId: 'u1', credits: 10 });
    expect(await getBalance('u1')).toBe(5);
    await revoke(result.consumedCredit.id);
    await revoke(result.consumedCredit.id);
    expect(await getBalance('u1')).toBe(15);
  });
  it('rejects negative/fractional deductions and leaves insufficient balances intact', async () => {
    await grant({ userId: 'u1', credits: 10 });
    await expect(consume({ userId: 'u1', credits: -10 })).rejects.toThrow();
    await expect(consume({ userId: 'u1', credits: 0.5 })).rejects.toThrow();
    expect((await consume({ userId: 'u1', credits: 37 })).success).toBe(false);
    expect(await getBalance('u1')).toBe(10);
  });
});

function enableD1() {
  envConfigs.database_provider = 'd1';
  // Native batch semantics exercised on SQLite with bound SQL and real rollback.
  const binding = {
    prepare: (query: string) => ({
      bind: (...params: any[]) => ({ sql: query, args: params }),
    }),
    batch: async (statements: any[]) => {
      if (statements.some((statement) => statement.args.length > 100))
        throw new Error('D1 bound parameter limit exceeded');
      return db().$client.batch(statements, 'write');
    },
  };
  (globalThis as any).__CF_ENV__ = { DB: binding };
  return binding;
}

describe('D1 atomic financial writes', () => {
  it('deducts and refunds a two-grant render once', async () => {
    enableD1();
    await grant({ userId: 'd1', credits: 5 });
    await grant({ userId: 'd1', credits: 10 });
    const result = await consume({ userId: 'd1', credits: 10 });
    expect(await getBalance('d1')).toBe(5);
    await revoke(result.consumedCredit.id);
    await revoke(result.consumedCredit.id);
    expect(await getBalance('d1')).toBe(15);
  });
  it('supports many source grants within the D1 parameter limit', async () => {
    enableD1();
    for (let i = 0; i < 26; i++) await grant({ userId: 'd1', credits: 1 });
    const result = await consume({ userId: 'd1', credits: 26 });
    expect(result.success).toBe(true);
    expect(await getBalance('d1')).toBe(0);
    await revoke(result.consumedCredit.id);
    expect(await getBalance('d1')).toBe(26);
  });
  it('rolls back deduction and ledger if a task write fails', async () => {
    enableD1();
    await grant({ userId: 'd1', credits: 10 });
    await expect(
      consume({
        userId: 'd1',
        credits: 10,
        d1AdditionalWrites: () => [
          { sql: 'INSERT INTO missing_table VALUES (1)', params: [] },
        ],
      })
    ).rejects.toThrow();
    expect(await getBalance('d1')).toBe(10);
    expect(
      await db()
        .select()
        .from(credit)
        .where(eq(credit.transactionType, 'consume'))
    ).toHaveLength(0);
  });
  it('detects a concurrent spend and never overwrites its balance', async () => {
    const binding = enableD1();
    const source = await grant({ userId: 'd1', credits: 10 });
    const batch = binding.batch;
    let first = true;
    binding.batch = async (statements) => {
      if (first) {
        first = false;
        await db()
          .update(credit)
          .set({ remainingCredits: 2 })
          .where(eq(credit.id, source.id!));
      }
      return batch(statements);
    };
    expect((await consume({ userId: 'd1', credits: 10 })).success).toBe(false);
    expect(await getBalance('d1')).toBe(2);
  });
  it('creates the task, credit link and deduction atomically; insufficient funds leave no orphan', async () => {
    enableD1();
    const params = {
      userId: 'd1',
      mediaType: 'video',
      provider: 'kie',
      model: 'bytedance/seedance-2-mini',
      prompt: 'test',
      costCredits: 10,
    };
    await expect(createTask(params)).rejects.toThrow('Insufficient credits');
    expect(await db().select().from(aiTask)).toHaveLength(0);
    await grant({ userId: 'd1', credits: 10 });
    const task = await createTask(params);
    const [saved] = await db()
      .select()
      .from(aiTask)
      .where(eq(aiTask.id, task.id));
    expect(JSON.parse(saved.taskInfo!).creditId).toBeTruthy();
    expect(await getBalance('d1')).toBe(0);
  });
});
