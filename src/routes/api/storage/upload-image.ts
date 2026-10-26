import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { envConfigs } from '@/config';
import { getStorage } from '@/modules/storage/service';
import { md5 } from '@/lib/hash';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_REFERENCE_TYPES = new Set([
  ...ALLOWED_IMAGE_TYPES,
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
]);
const MAX_FILES_PER_UPLOAD = 10;
const MAX_REFERENCE_BYTES = 100 * 1024 * 1024;
const MAX_REFERENCE_BATCH_BYTES = 200 * 1024 * 1024;

const extFromMime = (mimeType: string) => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/x-m4a': 'm4a',
    'audio/x-wav': 'wav',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v',
  };
  return map[mimeType] || '';
};

// Cap for the no-storage local-disk fallback (dev). Configurable via INLINE_IMAGE_MAX_KB.
const INLINE_MAX_BYTES =
  (Number(envConfigs.inline_image_max_kb) || 10240) * 1024;

function hasExpectedSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === 'image/webp') {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    );
  }
  if (mimeType === 'audio/mpeg') {
    return (
      String.fromCharCode(...bytes.slice(0, 3)) === 'ID3' ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    );
  }
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE'
    );
  }
  if (mimeType === 'audio/ogg') {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'OggS';
  }
  if (mimeType === 'audio/webm' || mimeType === 'video/webm') {
    return (
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    );
  }
  if (
    mimeType === 'audio/mp4' ||
    mimeType === 'audio/x-m4a' ||
    mimeType === 'video/mp4' ||
    mimeType === 'video/quicktime' ||
    mimeType === 'video/x-m4v'
  ) {
    return String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
  }
  return false;
}

async function POST({ request }: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 1000,
    keyPrefix: 'upload-image',
  });
  if (limited) return limited;

  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return respErr('Unauthorized');

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const referenceMedia = formData.get('referenceMedia') === 'true';
    const allowedTypes = referenceMedia
      ? ALLOWED_REFERENCE_TYPES
      : ALLOWED_IMAGE_TYPES;
    if (!files.length) return respErr('No files provided');
    if (files.length > MAX_FILES_PER_UPLOAD) {
      return respErr(`Upload at most ${MAX_FILES_PER_UPLOAD} files at once`, {
        status: 413,
      });
    }
    if (
      referenceMedia &&
      files.reduce((total, file) => total + file.size, 0) >
        MAX_REFERENCE_BATCH_BYTES
    ) {
      return respErr('Reference uploads are limited to 200MB per request', {
        status: 413,
      });
    }

    const storage = await getStorage();
    const requirePublic = formData.get('requirePublic') === 'true';
    if ((requirePublic || referenceMedia) && !storage) {
      return respErr(
        'Public storage is not configured. Configure Storage in Admin Settings before adding reference media.'
      );
    }
    const uploadResults: Array<{
      url: string;
      key: string;
      filename: string;
      deduped: boolean;
    }> = [];

    for (const file of files) {
      if (!allowedTypes.has(file.type)) {
        return respErr(
          referenceMedia
            ? `File ${file.name} must be a supported image, audio, or video file`
            : `File ${file.name} must be a JPEG, PNG, or WebP image`,
          { status: 415 }
        );
      }
      const maxBytes = referenceMedia ? MAX_REFERENCE_BYTES : INLINE_MAX_BYTES;
      if (file.size <= 0 || file.size > maxBytes) {
        const limitMb = Math.round(maxBytes / 1024 / 1024);
        return respErr(`File ${file.name} exceeds the ${limitMb}MB limit`, {
          status: 413,
        });
      }

      const arrayBuffer = await file.arrayBuffer();
      const body = new Uint8Array(arrayBuffer);
      if (!hasExpectedSignature(body, file.type)) {
        return respErr(`File ${file.name} does not match its declared type`, {
          status: 415,
        });
      }

      const digest = md5(body);
      const ext =
        (extFromMime(file.type) || file.name.split('.').pop() || 'bin').replace(
          /[^a-zA-Z0-9]/g,
          ''
        ) || 'bin';
      // R2Provider prepends its own uploadPath (default `uploads`), so the object
      // key is the bare filename. The local fallback uses `public/uploads/<file>`.
      const objectKey = `${digest}.${ext}`;

      // No storage configured → persist to public/uploads and return a short
      // local URL. Avoids inlining a giant base64 data URL into DB columns (some
      // are varchar(255)). Configure R2 (admin → Storage) for production.
      if (!storage) {
        const dir = path.join(process.cwd(), 'public', 'uploads');
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, objectKey), body);
        uploadResults.push({
          url: `/uploads/${objectKey}`,
          key: `uploads/${objectKey}`,
          filename: file.name,
          deduped: false,
        });
        continue;
      }

      const exists = await storage.exists({ key: objectKey });
      if (exists) {
        const publicUrl = storage.getPublicUrl({ key: objectKey });
        if (publicUrl) {
          uploadResults.push({
            url: publicUrl,
            key: objectKey,
            filename: file.name,
            deduped: true,
          });
          continue;
        }
      }

      const result = await storage.uploadFile({
        body,
        key: objectKey,
        contentType: file.type,
        disposition: 'inline',
      });

      if (!result.success || !result.url) {
        return respErr(result.error || 'Upload failed');
      }

      uploadResults.push({
        url: result.url,
        key: result.key || objectKey,
        filename: file.name,
        deduped: false,
      });
    }

    return respData({
      urls: uploadResults.map((r) => r.url),
      results: uploadResults,
    });
  } catch (e: any) {
    console.error('upload image failed:', e);
    return respErr(e?.message || 'upload image failed');
  }
}

async function GET() {
  return respData({ configured: Boolean(await getStorage()) });
}

export const Route = createFileRoute('/api/storage/upload-image')({
  server: {
    handlers: { GET, POST },
  },
});
