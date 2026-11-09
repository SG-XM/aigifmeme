import { eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { gifPackBlob } from '@/config/db/schema';
import { getAllConfigs } from '@/modules/config/service';

export type StoredBytes = { bytes: Uint8Array; contentType: string };

export interface ByteStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredBytes | null>;
  delete(key: string): Promise<void>;
}

const LOCAL_LIMIT = 700_000;
let override: ByteStore | null = null;

export function setGifPackByteStore(store: ByteStore | null) {
  override = store;
}

export function memoryByteStore(): ByteStore {
  const files = new Map<string, StoredBytes>();
  return {
    async put(key, bytes, contentType) {
      files.set(key, { bytes: new Uint8Array(bytes), contentType });
    },
    async get(key) {
      const found = files.get(key);
      return found
        ? { bytes: new Uint8Array(found.bytes), contentType: found.contentType }
        : null;
    },
    async delete(key) {
      files.delete(key);
    },
  };
}

export async function gifPackByteStore(): Promise<ByteStore> {
  if (override) return override;
  const configs = await getAllConfigs();
  if (
    configs.r2_access_key &&
    configs.r2_secret_key &&
    configs.r2_bucket_name
  ) {
    return r2Store(configs);
  }
  return sqliteStore();
}

function sqliteStore(): ByteStore {
  return {
    async put(key, bytes, contentType) {
      if (bytes.byteLength > LOCAL_LIMIT) {
        throw new Error(
          'Object storage is not configured. Set Cloudflare R2 in admin settings before generating packs.'
        );
      }
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const encoded = btoa(binary);
      const [existing] = await db()
        .select({ storageKey: gifPackBlob.storageKey })
        .from(gifPackBlob)
        .where(eq(gifPackBlob.storageKey, key))
        .limit(1);
      if (existing) {
        await db()
          .update(gifPackBlob)
          .set({ bytes: encoded, contentType })
          .where(eq(gifPackBlob.storageKey, key));
      } else {
        await db()
          .insert(gifPackBlob)
          .values({ storageKey: key, bytes: encoded, contentType });
      }
    },
    async get(key) {
      const [row] = await db()
        .select()
        .from(gifPackBlob)
        .where(eq(gifPackBlob.storageKey, key))
        .limit(1);
      if (!row) return null;
      const binary = atob(row.bytes);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i);
      return { bytes, contentType: row.contentType };
    },
    async delete(key) {
      await db().delete(gifPackBlob).where(eq(gifPackBlob.storageKey, key));
    },
  };
}

function r2Store(configs: Record<string, string>): ByteStore {
  const bucket = configs.r2_bucket_name;
  const uploadPath = (configs.r2_upload_path || 'uploads').replace(
    /^\/+|\/+$/g,
    ''
  );
  const endpoint = (
    configs.r2_endpoint ||
    `https://${configs.r2_account_id}.r2.cloudflarestorage.com`
  ).replace(/\/+$/, '');
  const objectUrl = (key: string) =>
    `${endpoint}/${bucket}/${uploadPath}/${key.replace(/^\/+/, '')}`;
  const clientPromise = import('aws4fetch').then(
    ({ AwsClient }) =>
      new AwsClient({
        accessKeyId: configs.r2_access_key,
        secretAccessKey: configs.r2_secret_key,
        region: 'auto',
      })
  );
  return {
    async put(key, bytes, contentType) {
      const client = await clientPromise;
      const response = await client.fetch(objectUrl(key), {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(bytes.byteLength),
        },
        body: bytes as unknown as BodyInit,
      });
      if (!response.ok)
        throw new Error(`Private upload failed with HTTP ${response.status}`);
    },
    async get(key) {
      const client = await clientPromise;
      const response = await client.fetch(objectUrl(key), { method: 'GET' });
      if (response.status === 404) return null;
      if (!response.ok)
        throw new Error(`Private read failed with HTTP ${response.status}`);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType:
          response.headers.get('content-type') || 'application/octet-stream',
      };
    },
    async delete(key) {
      const client = await clientPromise;
      const response = await client.fetch(objectUrl(key), { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Private delete failed with HTTP ${response.status}`);
      }
    },
  };
}
