import { afterEach, describe, expect, it } from 'vitest';

import {
  GIF_PACK_OBJECT_PREFIX,
  gifPackByteStore,
  gifPackR2Binding,
  privateGifPackKey,
  setGifPackByteStore,
  type GifPackR2Bucket,
} from './storage';

type Stored = { bytes: Uint8Array; contentType: string };

function mockBucket() {
  const objects = new Map<string, Stored>();
  const bucket: GifPackR2Bucket & { objects: Map<string, Stored> } = {
    objects,
    async put(key, value, options) {
      const view = value instanceof Uint8Array ? value : new Uint8Array(value);
      objects.set(key, {
        bytes: new Uint8Array(view),
        contentType:
          options?.httpMetadata?.contentType || 'application/octet-stream',
      });
    },
    async get(key) {
      const found = objects.get(key);
      if (!found) return null;
      return {
        httpMetadata: { contentType: found.contentType },
        arrayBuffer: async () =>
          found.bytes.buffer.slice(
            found.bytes.byteOffset,
            found.bytes.byteOffset + found.bytes.byteLength
          ) as ArrayBuffer,
      };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  return bucket;
}

afterEach(() => {
  setGifPackByteStore(null);
  delete (globalThis as { __CF_ENV__?: unknown }).__CF_ENV__;
});

describe('GIF_PACK_BUCKET binding', () => {
  it('stores only under private/gif-packs and round-trips through the binding mock', async () => {
    const bucket = mockBucket();
    (
      globalThis as { __CF_ENV__?: { GIF_PACK_BUCKET: GifPackR2Bucket } }
    ).__CF_ENV__ = { GIF_PACK_BUCKET: bucket };
    expect(gifPackR2Binding()).toBe(bucket);
    const store = await gifPackByteStore();
    const key = `${GIF_PACK_OBJECT_PREFIX}user-a/pack-1/gif-sticker.gif`;
    await store.put(
      key,
      Uint8Array.from([71, 73, 70, 56, 57, 97]),
      'image/gif'
    );
    expect([...bucket.objects.keys()]).toEqual([key]);
    const loaded = await store.get(key);
    expect(loaded?.contentType).toBe('image/gif');
    expect(Array.from(loaded?.bytes ?? [])).toEqual([71, 73, 70, 56, 57, 97]);
    await store.delete(key);
    expect(await store.get(key)).toBeNull();
    expect(bucket.objects.size).toBe(0);
  });

  it('refuses keys outside the private prefix and does not write them', async () => {
    const bucket = mockBucket();
    (
      globalThis as { __CF_ENV__?: { GIF_PACK_BUCKET: GifPackR2Bucket } }
    ).__CF_ENV__ = { GIF_PACK_BUCKET: bucket };
    const store = await gifPackByteStore();
    await expect(
      store.put('uploads/public.png', new Uint8Array([1]), 'image/png')
    ).rejects.toThrow(/private\/gif-packs/);
    await expect(
      store.put(
        `${GIF_PACK_OBJECT_PREFIX}../secret`,
        new Uint8Array([1]),
        'image/png'
      )
    ).rejects.toThrow(/Invalid/);
    expect(bucket.objects.size).toBe(0);
    expect(
      privateGifPackKey(`${GIF_PACK_OBJECT_PREFIX}user/pack/file.gif`)
    ).toBe('private/gif-packs/user/pack/file.gif');
  });
});
