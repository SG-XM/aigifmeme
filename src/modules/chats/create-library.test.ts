import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/core/db';

import { listGeneratedImages } from './service';

const fixture = vi.hoisted(() => ({ directory: '' }));
vi.mock('@/core/db', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { createDb } = await import('@/core/db/create-db');
  fixture.directory = mkdtempSync(tmpdir() + '/create-library-test-');
  const instance = createDb({
    database_provider: 'sqlite',
    database_url: `file:${fixture.directory}/library.db`,
  });
  return { db: () => instance };
});

beforeAll(async () => {
  await db().run(
    sql`CREATE TABLE chat (id text PRIMARY KEY, user_id text, title text, status text)`
  );
  await db().run(
    sql`CREATE TABLE chat_message (id text PRIMARY KEY, chat_id text, status text, parts text, created_at integer)`
  );
  await db().run(
    sql`CREATE TABLE ai_task (id text PRIMARY KEY, user_id text NOT NULL, media_type text NOT NULL, provider text NOT NULL, model text NOT NULL, prompt text NOT NULL, options text, status text NOT NULL, created_at integer NOT NULL, updated_at integer NOT NULL DEFAULT 0, deleted_at integer, task_id text, task_info text, task_result text, cost_credits integer DEFAULT 0 NOT NULL, scene text DEFAULT '' NOT NULL, credit_id text)`
  );
  await db().run(
    sql`INSERT INTO chat VALUES ('chat-1', 'owner', 'My Chat', 'active'), ('chat-other', 'other', 'Private', 'active')`
  );
  for (const [id, createdAt, chatId] of [
    ['m-1', 1000, 'chat-1'],
    ['m-2', 2000, 'chat-1'],
    ['m-private', 4000, 'chat-other'],
  ] as const) {
    const parts = JSON.stringify([
      {
        type: 'tool_call',
        id,
        name: 'generate_video',
        arguments: '{}',
        result: JSON.stringify({
          files: [`https://media.example.com/${id}.mp4`],
          model: 'seedance-2-mini',
        }),
      },
    ]);
    await db().run(
      sql`INSERT INTO chat_message VALUES (${id}, ${chatId}, 'active', ${parts}, ${createdAt})`
    );
  }
  for (const [id, owner, source, status, deleted] of [
    ['t-3', 'owner', 'create', 'success', null],
    ['t-other', 'other', 'create', 'success', null],
    ['t-chat', 'owner', 'chat', 'success', null],
    ['t-failed', 'owner', 'create', 'failed', null],
    ['t-deleted', 'owner', 'create', 'success', 3000],
  ] as const) {
    await db().run(
      sql`INSERT INTO ai_task (id, user_id, media_type, provider, model, prompt, options, status, created_at, deleted_at, task_result) VALUES (${id}, ${owner}, 'video', 'kie', 'seedance-2-mini', 'My Create video', ${JSON.stringify({ source })}, ${status}, 2000, ${deleted}, ${JSON.stringify({ files: [`https://media.example.com/${id}.mp4`], model: 'seedance-2-mini' })})`
    );
  }
});
afterAll(async () => {
  db().$client.close();
  const { rmSync } = await import('node:fs');
  rmSync(fixture.directory, { recursive: true, force: true });
});

describe('Library combines standalone and Chat videos', () => {
  it('merges both sources in time/id order and excludes private, failed and deleted tasks', async () => {
    const page = await listGeneratedImages('owner');
    expect(page.items.map((item) => item.src)).toEqual([
      'https://media.example.com/t-3.mp4',
      'https://media.example.com/m-2.mp4',
      'https://media.example.com/m-1.mp4',
    ]);
    expect(page.items[0].chatId).toBe('');
    expect(page.items[1].chatId).toBe('chat-1');
  });
  it('does not skip or duplicate items when sources share a timestamp across pages', async () => {
    const files: string[] = [];
    let cursor: string | undefined;
    for (let count = 0; count < 5; count++) {
      const page = await listGeneratedImages('owner', { limit: 1, cursor });
      files.push(...page.items.map((item) => item.src));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(files).toEqual([
      'https://media.example.com/t-3.mp4',
      'https://media.example.com/m-2.mp4',
      'https://media.example.com/m-1.mp4',
    ]);
  });
});
