export type StoredBytes = { bytes: Uint8Array; contentType: string };

export interface ByteStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredBytes | null>;
  delete(key: string): Promise<void>;
}

/** Existing private bucket. Objects never leave this prefix. */
export const GIF_PACK_OBJECT_PREFIX = 'private/gif-packs/';

export type GifPackR2Bucket = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: { httpMetadata?: { contentType?: string } }
  ) => Promise<unknown>;
  get: (key: string) => Promise<{
    arrayBuffer: () => Promise<ArrayBuffer>;
    httpMetadata?: { contentType?: string };
  } | null>;
  delete: (key: string) => Promise<void>;
};

const LOCAL_LIMIT = 700_000;
let override: ByteStore | null = null;

export function setGifPackByteStore(store: ByteStore | null) {
  override = store;
}

export function memoryByteStore(): ByteStore {
  const files = new Map<string, StoredBytes>();
  return {
    async put(key, bytes, contentType) {
      const objectKey = privateGifPackKey(key);
      files.set(objectKey, { bytes: new Uint8Array(bytes), contentType });
    },
    async get(key) {
      const found = files.get(privateGifPackKey(key));
      return found
        ? { bytes: new Uint8Array(found.bytes), contentType: found.contentType }
        : null;
    },
    async delete(key) {
      files.delete(privateGifPackKey(key));
    },
  };
}

export function gifPackR2Binding(): GifPackR2Bucket | null {
  const host = globalThis as {
    __CF_ENV__?: { GIF_PACK_BUCKET?: GifPackR2Bucket };
    __env__?: { GIF_PACK_BUCKET?: GifPackR2Bucket };
  };
  const bucket =
    host.__CF_ENV__?.GIF_PACK_BUCKET ?? host.__env__?.GIF_PACK_BUCKET;
  if (
    !bucket ||
    typeof bucket.put !== 'function' ||
    typeof bucket.get !== 'function'
  ) {
    return null;
  }
  return bucket;
}

export async function gifPackByteStore(): Promise<ByteStore> {
  if (override) return override;
  const bucket = gifPackR2Binding();
  if (bucket) return bindingStore(bucket);
  return sqliteFallbackStore();
}

function bindingStore(bucket: GifPackR2Bucket): ByteStore {
  return {
    async put(key, bytes, contentType) {
      const objectKey = privateGifPackKey(key);
      await bucket.put(objectKey, bytes, {
        httpMetadata: { contentType },
      });
    },
    async get(key) {
      const object = await bucket.get(privateGifPackKey(key));
      if (!object) return null;
      return {
        bytes: new Uint8Array(await object.arrayBuffer()),
        contentType:
          object.httpMetadata?.contentType || 'application/octet-stream',
      };
    },
    async delete(key) {
      await bucket.delete(privateGifPackKey(key));
    },
  };
}

export function privateGifPackKey(key: string) {
  const normalized = key.replace(/^\/+/, '');
  if (normalized.includes('..') || normalized.includes('\\')) {
    throw new Error('Invalid GIF pack object key');
  }
  if (!normalized.startsWith(GIF_PACK_OBJECT_PREFIX)) {
    throw new Error('GIF pack objects must stay under private/gif-packs/');
  }
  return normalized;
}

/**
 * Local sqlite only when the Worker binding is absent. Production packs use
 * GIF_PACK_BUCKET. Files above the row limit fail instead of using S3 keys.
 */
async function sqliteFallbackStore(): Promise<ByteStore> {
  const { eq } = await import('drizzle-orm');
  const { db } = await import('@/core/db');
  const { gifPackBlob } = await import('@/config/db/schema');
  return {
    async put(key, bytes, contentType) {
      const objectKey = privateGifPackKey(key);
      if (bytes.byteLength > LOCAL_LIMIT) {
        throw new Error(
          'GIF_PACK_BUCKET is not bound. Pack files are not stored with admin S3 keys.'
        );
      }
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const encoded = btoa(binary);
      const [existing] = await db()
        .select({ storageKey: gifPackBlob.storageKey })
        .from(gifPackBlob)
        .where(eq(gifPackBlob.storageKey, objectKey))
        .limit(1);
      if (existing) {
        await db()
          .update(gifPackBlob)
          .set({ bytes: encoded, contentType })
          .where(eq(gifPackBlob.storageKey, objectKey));
      } else {
        await db()
          .insert(gifPackBlob)
          .values({ storageKey: objectKey, bytes: encoded, contentType });
      }
    },
    async get(key) {
      const objectKey = privateGifPackKey(key);
      const [row] = await db()
        .select()
        .from(gifPackBlob)
        .where(eq(gifPackBlob.storageKey, objectKey))
        .limit(1);
      if (!row) return null;
      const binary = atob(row.bytes);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i);
      return { bytes, contentType: row.contentType };
    },
    async delete(key) {
      const objectKey = privateGifPackKey(key);
      await db()
        .delete(gifPackBlob)
        .where(eq(gifPackBlob.storageKey, objectKey));
    },
  };
}
