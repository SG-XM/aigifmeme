import { rmSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { is, SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import {
  getTableConfig,
  SQLiteSyncDialect,
  SQLiteTable,
} from 'drizzle-orm/sqlite-core';
import { encode as encodePng } from 'fast-png';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '@/config/db/schema';
import { saveConfigs } from '@/modules/config/service';
import { setGifPackFetch } from '@/lib/gif-pack/provider';

import {
  createGifPack,
  deleteGifPack,
  drainGifPack,
  GifPackError,
  readPackFile,
  regenerateSticker,
  saveUpload,
} from './service';
import { memoryByteStore, setGifPackByteStore } from './storage';

const state = vi.hoisted(() => ({
  database: null as ReturnType<typeof drizzle> | null,
}));
vi.mock('@/core/db', () => ({ db: () => state.database }));
vi.mock('@/config', () => ({
  envConfigs: {
    auth_secret: 'gif-pack-test-secret-longer-than-thirty-two',
    database_provider: 'sqlite',
    database_url: 'file:gif-pack-test',
  },
}));

const databaseFile = '/tmp/gif-pack-unit.db';
rmSync(databaseFile, { force: true });
const client = createClient({ url: `file:${databaseFile}` });
const tables = Object.values(schema).filter((table) => is(table, SQLiteTable));
const store = memoryByteStore();

function subjectPng() {
  const rgba = new Uint8Array(96 * 96 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 250;
    rgba[i + 3] = 255;
  }
  for (let y = 28; y < 68; y += 1) {
    for (let x = 30; x < 66; x += 1) {
      const o = (y * 96 + x) * 4;
      rgba[o] = rgba[o + 1] = rgba[o + 2] = 15;
    }
  }
  return encodePng({
    width: 96,
    height: 96,
    data: rgba,
    channels: 4,
    depth: 8,
  });
}

function movingSheet() {
  const cell = 32;
  const size = cell * 4;
  const rgba = new Uint8Array(size * size * 4);
  for (let frame = 0; frame < 16; frame += 1) {
    const col = frame % 4;
    const row = Math.floor(frame / 4);
    for (let y = 0; y < cell; y += 1) {
      for (let x = 0; x < cell; x += 1) {
        const o = ((row * cell + y) * size + col * cell + x) * 4;
        rgba[o] = 255;
        rgba[o + 2] = 255;
        rgba[o + 3] = 255;
        const bar = 4 + frame;
        if (x > 16 - bar / 2 && x < 16 + bar / 2 && y > 8 && y < 22) {
          rgba[o] = rgba[o + 1] = rgba[o + 2] = 12;
        }
      }
    }
  }
  return encodePng({
    width: size,
    height: size,
    data: rgba,
    channels: 4,
    depth: 8,
  });
}

beforeAll(async () => {
  const dialect = new SQLiteSyncDialect();
  for (const table of tables) {
    const cfg = getTableConfig(table);
    const columns = cfg.columns.map((column) => {
      let value = `"${column.name}" ${column.getSQLType()}`;
      if (column.primary) value += ' primary key';
      if (column.isUnique) value += ' unique';
      if (column.default !== undefined) {
        const expression = is(column.default, SQL)
          ? dialect.sqlToQuery(column.default).sql
          : typeof column.default === 'string'
            ? `'${column.default.replaceAll("'", "''")}'`
            : String(Number(column.default));
        value += ` default ${expression}`;
      }
      return value;
    });
    await client.execute(`create table "${cfg.name}" (${columns.join(',')})`);
  }
  await client.execute(
    'create unique index gif_pack_user_day on gif_pack (user_id, day_key)'
  );
  await client.execute(
    'create unique index gif_pack_user_idempotency on gif_pack (user_id, idempotency_key)'
  );
  state.database = drizzle(client);
  setGifPackByteStore(store);
});

beforeEach(async () => {
  for (const table of tables) {
    await client.execute(`delete from "${getTableConfig(table).name}"`);
  }
  await saveConfigs({
    gif_pack_base_url: 'https://api.aigifmeme.com/v1',
    gif_pack_api_key: 'test-fixture-key',
    gif_pack_image_model: 'gpt-image-2',
  });
});

describe('pack quota and private jobs', () => {
  it('allows one pack per Shanghai day and replays the same idempotency key', async () => {
    const now = new Date('2026-11-08T16:30:00.000Z');
    const firstUpload = await saveUpload('user-a', subjectPng(), 'image/png');
    const secondUpload = await saveUpload('user-a', subjectPng(), 'image/png');
    const themes = await (await import('./service')).listThemes();
    const created = await createGifPack({
      userId: 'user-a',
      uploadId: firstUpload.uploadId,
      themeId: themes[0].id,
      style: 'q-cartoon',
      motionMode: 'medium',
      background: 'transparent',
      language: 'zh',
      idempotencyKey: 'idem-key-001',
      now,
    });
    const replay = await createGifPack({
      userId: 'user-a',
      uploadId: firstUpload.uploadId,
      themeId: themes[0].id,
      style: 'q-cartoon',
      motionMode: 'medium',
      background: 'transparent',
      language: 'zh',
      idempotencyKey: 'idem-key-001',
      now,
    });
    expect(replay?.id).toBe(created?.id);
    await expect(
      createGifPack({
        userId: 'user-a',
        uploadId: secondUpload.uploadId,
        themeId: themes[0].id,
        style: 'pixel',
        motionMode: 'fast',
        background: 'theme',
        language: 'en',
        idempotencyKey: 'idem-key-002',
        now,
      })
    ).rejects.toMatchObject({ code: 'daily_quota' });
  });

  it('stops system retries at three and does not spend a user regeneration', async () => {
    let calls = 0;
    setGifPackFetch(async () => {
      calls += 1;
      return new Response('busy', { status: 503 });
    });
    const upload = await saveUpload('user-a', subjectPng(), 'image/png');
    const themes = await (await import('./service')).listThemes();
    const created = await createGifPack({
      userId: 'user-a',
      uploadId: upload.uploadId,
      themeId: themes[0].id,
      style: 'anime',
      motionMode: 'large',
      background: 'theme',
      language: 'en',
      idempotencyKey: 'idem-key-retry',
      now: new Date('2026-11-09T02:00:00.000Z'),
    });
    if (!created) throw new Error('pack was not created');
    await drainGifPack(created.id, store);
    const { packView } = await import('./service');
    const view = await packView(created.id, 'user-a');
    expect(calls).toBe(3);
    expect(view?.userRegens).toBe(0);
    expect(view?.status).toBe('failed');
    expect(view?.errorCode).toBe('anchor_failed');
  });

  it('limits user regenerations and hides another user’s files', async () => {
    const sheet = movingSheet();
    let binary = '';
    for (const byte of sheet) binary += String.fromCharCode(byte);
    setGifPackFetch(
      async () =>
        new Response(JSON.stringify({ data: [{ b64_json: btoa(binary) }] }), {
          status: 200,
        })
    );
    const upload = await saveUpload('user-a', subjectPng(), 'image/png');
    const themes = await (await import('./service')).listThemes();
    const created = await createGifPack({
      userId: 'user-a',
      uploadId: upload.uploadId,
      themeId: themes[1].id,
      style: 'felt',
      motionMode: 'fast',
      background: 'transparent',
      language: 'zh',
      idempotencyKey: 'idem-key-regen',
      now: new Date('2026-11-10T03:00:00.000Z'),
    });
    if (!created) throw new Error('pack was not created');
    await drainGifPack(created.id, store);
    const { packView } = await import('./service');
    const ready = await packView(created.id, 'user-a');
    expect(ready?.status).toBe('ready');
    expect(ready?.zipFileId).toBeTruthy();
    const gif = ready?.stickers[0];
    expect(gif?.gifFileId).toBeTruthy();
    expect(
      await readPackFile(created.id, gif!.gifFileId!, 'user-b')
    ).toBeNull();
    expect(
      await readPackFile(created.id, gif!.gifFileId!, 'user-a')
    ).not.toBeNull();
    expect(await deleteGifPack(created.id, 'user-b')).toBe(false);
    await regenerateSticker(created.id, gif!.id, 'user-a');
    await drainGifPack(created.id, store);
    await regenerateSticker(created.id, ready!.stickers[1].id, 'user-a');
    await expect(
      regenerateSticker(created.id, ready!.stickers[2].id, 'user-a')
    ).rejects.toBeInstanceOf(GifPackError);
    expect(await deleteGifPack(created.id, 'user-a')).toBe(true);
    expect(
      await readPackFile(created.id, gif!.gifFileId!, 'user-a')
    ).toBeNull();
  });
});
