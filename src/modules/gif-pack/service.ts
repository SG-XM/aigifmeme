import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { envConfigs } from '@/config';
import {
  gifPack,
  gifPackDemo,
  gifPackFile,
  gifPackMotion,
  gifPackSticker,
  gifPackTheme,
  gifPackUpload,
} from '@/config/db/schema';
import { getAllConfigs } from '@/modules/config/service';
import { assembleStickerGif } from '@/lib/gif-pack/assemble';
import {
  GIF_PACK_STICKER_COUNT,
  GIF_PACK_SYSTEM_ATTEMPTS,
  GIF_PACK_USER_REGENS,
  gifPackDayKey,
  isGifPackBackground,
  isGifPackLanguage,
  isGifPackMotion,
  isGifPackStyle,
  type GifPackBackground,
  type GifPackLanguage,
  type GifPackMotion,
  type GifPackStyle,
} from '@/lib/gif-pack/options';
import { anchorPrompt, sheetPrompt } from '@/lib/gif-pack/prompts';
import {
  requestImageEdit,
  resolveGifPackProvider,
} from '@/lib/gif-pack/provider';
import { inspectSubject, isFlatImage } from '@/lib/gif-pack/subject';
import {
  DEFAULT_GIF_PACK_THEMES,
  DEMO_NOTE,
  DEMO_REFERENCES,
} from '@/lib/gif-pack/themes';
import { zipStored } from '@/lib/gif-pack/zip';

import { gifPackByteStore, type ByteStore } from './storage';

type ThemeRow = typeof gifPackTheme.$inferSelect;
type MotionRow = typeof gifPackMotion.$inferSelect;
type StickerRow = typeof gifPackSticker.$inferSelect;
type FileRow = typeof gifPackFile.$inferSelect;
type PackRow = typeof gifPack.$inferSelect;

export class GifPackError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function id() {
  return crypto.randomUUID();
}

function uniqueError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 6; depth += 1) {
    const message =
      current instanceof Error ? current.message : String(current);
    if (/unique|constraint/i.test(message)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

export async function ensureGifPackCatalog() {
  const [theme] = await db()
    .select({ id: gifPackTheme.id })
    .from(gifPackTheme)
    .limit(1);
  if (!theme) {
    for (const seed of DEFAULT_GIF_PACK_THEMES) {
      const themeId = id();
      await db().insert(gifPackTheme).values({
        id: themeId,
        slug: seed.slug,
        version: 1,
        nameEn: seed.nameEn,
        nameZh: seed.nameZh,
        backgroundColor: seed.backgroundColor,
        status: 'active',
      });
      await db()
        .insert(gifPackMotion)
        .values(
          seed.motions.map((motion, position) => ({
            id: id(),
            themeId,
            position,
            intent: motion.intent,
            captionEn: motion.captionEn,
            captionZh: motion.captionZh,
          }))
        );
    }
  }
  const [demo] = await db()
    .select({ id: gifPackDemo.id })
    .from(gifPackDemo)
    .limit(1);
  if (!demo) {
    const rows = [];
    for (const referenceId of DEMO_REFERENCES) {
      for (const theme of DEFAULT_GIF_PACK_THEMES) {
        rows.push({
          id: id(),
          referenceId,
          themeSlug: theme.slug,
          title: `${referenceId} · ${theme.nameEn}`,
          assetStatus: 'not_in_repo',
          note: DEMO_NOTE,
        });
      }
    }
    await db().insert(gifPackDemo).values(rows);
  }
}

export async function listThemes() {
  await ensureGifPackCatalog();
  const themes: ThemeRow[] = await db()
    .select()
    .from(gifPackTheme)
    .where(eq(gifPackTheme.status, 'active'))
    .orderBy(gifPackTheme.slug, desc(gifPackTheme.version));
  const latest = new Map<string, (typeof themes)[number]>();
  for (const theme of themes)
    if (!latest.has(theme.slug)) latest.set(theme.slug, theme);
  const chosen = [...latest.values()];
  const motions: MotionRow[] = chosen.length
    ? await db()
        .select()
        .from(gifPackMotion)
        .where(
          inArray(
            gifPackMotion.themeId,
            chosen.map((theme) => theme.id)
          )
        )
    : [];
  return chosen.map((theme) => ({
    id: theme.id,
    slug: theme.slug,
    version: theme.version,
    nameEn: theme.nameEn,
    nameZh: theme.nameZh,
    backgroundColor: theme.backgroundColor,
    motions: motions
      .filter((motion) => motion.themeId === theme.id)
      .sort((a, b) => a.position - b.position)
      .map((motion) => ({
        position: motion.position,
        intent: motion.intent,
        captionEn: motion.captionEn,
        captionZh: motion.captionZh,
      })),
  }));
}

export async function publishThemeVersion(input: {
  slug: string;
  nameEn: string;
  nameZh: string;
  backgroundColor: string;
  motions: { intent: string; captionEn: string; captionZh: string }[];
}) {
  await ensureGifPackCatalog();
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
    throw new GifPackError(
      'invalid_theme',
      'Theme slug must be 2–40 letters, numbers, or hyphens.'
    );
  }
  if (!HEX.test(input.backgroundColor)) {
    throw new GifPackError(
      'invalid_theme',
      'Theme background must be a #RRGGBB color.'
    );
  }
  if (input.motions.length !== GIF_PACK_STICKER_COUNT) {
    throw new GifPackError('invalid_theme', 'A theme has exactly 8 motions.');
  }
  for (const motion of input.motions) {
    if (!motion.intent.trim() || motion.intent.length > 400) {
      throw new GifPackError(
        'invalid_theme',
        'Each motion intent is required and stays under 400 characters.'
      );
    }
    if (!motion.captionEn.trim() || !motion.captionZh.trim()) {
      throw new GifPackError(
        'invalid_theme',
        'Each motion needs an English and a Chinese caption.'
      );
    }
    if (motion.captionEn.length > 16 || motion.captionZh.length > 8) {
      throw new GifPackError(
        'invalid_theme',
        'Captions must stay short enough to read on a sticker.'
      );
    }
  }
  const existing: { version: number }[] = await db()
    .select({ version: gifPackTheme.version })
    .from(gifPackTheme)
    .where(eq(gifPackTheme.slug, slug));
  const version =
    existing.reduce((max, row) => Math.max(max, row.version), 0) + 1;
  if (version > 1) {
    await db()
      .update(gifPackTheme)
      .set({ status: 'retired' })
      .where(eq(gifPackTheme.slug, slug));
  }
  const themeId = id();
  await db().insert(gifPackTheme).values({
    id: themeId,
    slug,
    version,
    nameEn: input.nameEn.trim(),
    nameZh: input.nameZh.trim(),
    backgroundColor: input.backgroundColor,
    status: 'active',
  });
  await db()
    .insert(gifPackMotion)
    .values(
      input.motions.map((motion, position) => ({
        id: id(),
        themeId,
        position,
        intent: motion.intent.trim(),
        captionEn: motion.captionEn.trim(),
        captionZh: motion.captionZh.trim(),
      }))
    );
  return { id: themeId, slug, version };
}

export async function saveUpload(
  userId: string,
  bytes: Uint8Array,
  mime?: string
) {
  const subject = inspectSubject(bytes, mime);
  if (!subject.ok) throw new GifPackError(subject.code, subject.message);
  const uploadId = id();
  const store = await gifPackByteStore();
  const originalKey = `private/gif-packs/${userId}/uploads/${uploadId}/original.png`;
  const cropKey = `private/gif-packs/${userId}/uploads/${uploadId}/crop.png`;
  await store.put(originalKey, bytes, mime || 'application/octet-stream');
  await store.put(cropKey, subject.png, 'image/png');
  await db().insert(gifPackUpload).values({
    id: uploadId,
    userId,
    originalKey,
    cropKey,
    width: subject.raster.width,
    height: subject.raster.height,
  });
  return {
    uploadId,
    width: subject.raster.width,
    height: subject.raster.height,
  };
}

export async function readUploadPreview(userId: string, uploadId: string) {
  const [upload] = await db()
    .select()
    .from(gifPackUpload)
    .where(
      and(eq(gifPackUpload.id, uploadId), eq(gifPackUpload.userId, userId))
    )
    .limit(1);
  if (!upload) return null;
  const store = await gifPackByteStore();
  return store.get(upload.cropKey);
}

export type CreatePackInput = {
  userId: string;
  uploadId: string;
  themeId: string;
  style: string;
  motionMode: string;
  background: string;
  language: string;
  idempotencyKey: string;
  now?: Date;
};

export async function createGifPack(input: CreatePackInput) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)) {
    throw new GifPackError(
      'invalid_request',
      'Idempotency key must be 8–80 letters, numbers, _ or -.'
    );
  }
  if (!isGifPackStyle(input.style) || !isGifPackMotion(input.motionMode)) {
    throw new GifPackError(
      'invalid_request',
      'Style or motion mode is not one of the pack choices.'
    );
  }
  if (
    !isGifPackBackground(input.background) ||
    !isGifPackLanguage(input.language)
  ) {
    throw new GifPackError(
      'invalid_request',
      'Background or language is not one of the pack choices.'
    );
  }
  await ensureGifPackCatalog();
  const existing = await findOwnedPack(input.userId, input.idempotencyKey);
  if (existing) {
    const view = await packView(existing.id, input.userId);
    if (view) return view;
    throw new GifPackError(
      'daily_quota',
      'You can start one new pack per Shanghai calendar day. Try again tomorrow.'
    );
  }
  const [upload] = await db()
    .select()
    .from(gifPackUpload)
    .where(
      and(
        eq(gifPackUpload.id, input.uploadId),
        eq(gifPackUpload.userId, input.userId)
      )
    )
    .limit(1);
  if (!upload)
    throw new GifPackError('upload_missing', 'Upload the image again.');
  if (upload.packId)
    throw new GifPackError(
      'upload_used',
      'That upload was already used. Upload a new image.'
    );
  const [theme] = await db()
    .select()
    .from(gifPackTheme)
    .where(
      and(eq(gifPackTheme.id, input.themeId), eq(gifPackTheme.status, 'active'))
    )
    .limit(1);
  if (!theme) throw new GifPackError('theme_missing', 'Choose a theme again.');
  const motions: MotionRow[] = await db()
    .select()
    .from(gifPackMotion)
    .where(eq(gifPackMotion.themeId, theme.id));
  if (motions.length !== GIF_PACK_STICKER_COUNT) {
    throw new GifPackError(
      'theme_missing',
      'This theme does not have 8 motions.'
    );
  }
  const packId = id();
  const now = input.now ?? new Date();
  const dayKey = gifPackDayKey(now);
  const stickers = [...motions]
    .sort((a, b) => a.position - b.position)
    .map((motion) => ({
      id: id(),
      packId,
      position: motion.position,
      intent: motion.intent,
      caption: input.language === 'zh' ? motion.captionZh : motion.captionEn,
      status: 'pending',
      systemAttempts: 0,
    }));
  try {
    if (envConfigs.database_provider === 'd1') {
      const { runD1Batch } = await import('@/core/db/atomic-batch');
      await runD1Batch([
        db()
          .insert(gifPack)
          .values(packRow(packId, input, theme, dayKey, now))
          .toSQL(),
        db().insert(gifPackSticker).values(stickers).toSQL(),
        db()
          .update(gifPackUpload)
          .set({ packId })
          .where(
            and(eq(gifPackUpload.id, upload.id), isNull(gifPackUpload.packId))
          )
          .toSQL(),
      ]);
    } else {
      await db().transaction(async (tx: any) => {
        await tx
          .insert(gifPack)
          .values(packRow(packId, input, theme, dayKey, now));
        await tx.insert(gifPackSticker).values(stickers);
        await tx
          .update(gifPackUpload)
          .set({ packId })
          .where(
            and(eq(gifPackUpload.id, upload.id), isNull(gifPackUpload.packId))
          );
      });
    }
  } catch (error) {
    if (!uniqueError(error)) throw error;
    const replay = await findOwnedPack(input.userId, input.idempotencyKey);
    if (replay) return packView(replay.id, input.userId);
    throw new GifPackError(
      'daily_quota',
      'You can start one new pack per Shanghai calendar day. Try again tomorrow.'
    );
  }
  const [linked] = await db()
    .select({ packId: gifPackUpload.packId })
    .from(gifPackUpload)
    .where(eq(gifPackUpload.id, upload.id))
    .limit(1);
  if (linked?.packId && linked.packId !== packId) {
    await db().delete(gifPackSticker).where(eq(gifPackSticker.packId, packId));
    await db().delete(gifPack).where(eq(gifPack.id, packId));
    throw new GifPackError(
      'upload_used',
      'That upload was already used. Upload a new image.'
    );
  }
  await db()
    .insert(gifPackFile)
    .values([
      fileRow(
        packId,
        null,
        'original',
        upload.originalKey,
        'application/octet-stream'
      ),
      fileRow(packId, null, 'crop', upload.cropKey, 'image/png'),
    ]);
  return packView(packId, input.userId);
}

function packRow(
  packId: string,
  input: CreatePackInput,
  theme: { id: string; version: number },
  dayKey: string,
  now: Date
) {
  return {
    id: packId,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    dayKey,
    themeId: theme.id,
    themeVersion: theme.version,
    style: input.style,
    motionMode: input.motionMode,
    background: input.background,
    language: input.language,
    status: 'queued',
    phase: 'subject',
    userRegens: 0,
    anchorAttempts: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function fileRow(
  packId: string,
  stickerId: string | null,
  kind: string,
  storageKey: string,
  contentType: string
) {
  return {
    id: id(),
    packId,
    stickerId,
    kind,
    storageKey,
    contentType,
    byteSize: 0,
  };
}

async function findOwnedPack(userId: string, idempotencyKey: string) {
  const [row] = await db()
    .select()
    .from(gifPack)
    .where(
      and(
        eq(gifPack.userId, userId),
        eq(gifPack.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function packView(packId: string, userId: string, admin = false) {
  const [pack] = await db()
    .select()
    .from(gifPack)
    .where(eq(gifPack.id, packId))
    .limit(1);
  if (!pack || pack.deletedAt) return null;
  if (!admin && pack.userId !== userId) return null;
  const stickers: StickerRow[] = await db()
    .select()
    .from(gifPackSticker)
    .where(eq(gifPackSticker.packId, packId));
  const files: FileRow[] = await db()
    .select()
    .from(gifPackFile)
    .where(eq(gifPackFile.packId, packId));
  const zip = files.find((file) => file.kind === 'zip');
  return {
    id: pack.id,
    status: pack.status,
    phase: pack.phase,
    style: pack.style,
    motionMode: pack.motionMode,
    background: pack.background,
    language: pack.language,
    themeId: pack.themeId,
    themeVersion: pack.themeVersion,
    userRegens: pack.userRegens,
    userRegensRemaining: Math.max(0, GIF_PACK_USER_REGENS - pack.userRegens),
    errorCode: pack.errorCode,
    errorMessage: pack.errorMessage,
    createdAt: pack.createdAt.toISOString(),
    stickers: stickers
      .sort((a, b) => a.position - b.position)
      .map((sticker) => ({
        id: sticker.id,
        index: sticker.position,
        caption: sticker.caption,
        status: sticker.status,
        errorCode: sticker.errorCode,
        errorMessage: sticker.errorMessage,
        gifFileId:
          files.find(
            (file) => file.kind === 'gif' && file.stickerId === sticker.id
          )?.id ?? null,
      })),
    zipFileId: zip?.id ?? null,
  };
}

export async function listGifPacks(userId: string) {
  const rows: { id: string }[] = await db()
    .select({ id: gifPack.id })
    .from(gifPack)
    .where(and(eq(gifPack.userId, userId), isNull(gifPack.deletedAt)))
    .orderBy(desc(gifPack.createdAt));
  const views = [];
  for (const row of rows) {
    const view = await packView(row.id, userId);
    if (view) views.push(view);
  }
  return views;
}

export async function deleteGifPack(
  packId: string,
  userId: string,
  admin = false
) {
  const [pack] = await db()
    .select()
    .from(gifPack)
    .where(eq(gifPack.id, packId))
    .limit(1);
  if (!pack || pack.deletedAt) return false;
  if (!admin && pack.userId !== userId) return false;
  const files: FileRow[] = await db()
    .select()
    .from(gifPackFile)
    .where(eq(gifPackFile.packId, packId));
  const store = await gifPackByteStore();
  for (const file of files) {
    await store.delete(file.storageKey).catch(() => undefined);
  }
  await db()
    .update(gifPack)
    .set({
      deletedAt: new Date(),
      status: 'deleted',
      lockToken: null,
      updatedAt: new Date(),
    })
    .where(eq(gifPack.id, packId));
  return true;
}

export async function readPackFile(
  packId: string,
  fileId: string,
  userId: string,
  admin = false
) {
  const [pack] = await db()
    .select()
    .from(gifPack)
    .where(eq(gifPack.id, packId))
    .limit(1);
  if (!pack || pack.deletedAt) return null;
  if (!admin && pack.userId !== userId) return null;
  const [file] = await db()
    .select()
    .from(gifPackFile)
    .where(and(eq(gifPackFile.id, fileId), eq(gifPackFile.packId, packId)))
    .limit(1);
  if (!file) return null;
  const store = await gifPackByteStore();
  const body = await store.get(file.storageKey);
  if (!body) return null;
  return {
    ...body,
    contentType: file.contentType || body.contentType,
    kind: file.kind,
  };
}

export async function regenerateSticker(
  packId: string,
  stickerId: string,
  userId: string
) {
  const [pack] = await db()
    .select()
    .from(gifPack)
    .where(
      and(
        eq(gifPack.id, packId),
        eq(gifPack.userId, userId),
        isNull(gifPack.deletedAt)
      )
    )
    .limit(1);
  if (!pack) throw new GifPackError('not_found', 'Pack not found.');
  if (
    pack.errorCode === 'subject_not_found' ||
    pack.errorCode === 'anchor_failed'
  ) {
    throw new GifPackError(
      pack.errorCode,
      pack.errorMessage || 'Replace the image and start a new pack.'
    );
  }
  if (!['ready', 'partial', 'failed'].includes(pack.status)) {
    throw new GifPackError('pack_busy', 'This pack is still generating.');
  }
  const [sticker] = await db()
    .select()
    .from(gifPackSticker)
    .where(
      and(eq(gifPackSticker.id, stickerId), eq(gifPackSticker.packId, packId))
    )
    .limit(1);
  if (!sticker) throw new GifPackError('not_found', 'Sticker not found.');
  const updated = await db()
    .update(gifPack)
    .set({
      userRegens: sql`${gifPack.userRegens} + 1`,
      status: 'running',
      phase: `sheet:${sticker.position}`,
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gifPack.id, packId),
        eq(gifPack.userId, userId),
        isNull(gifPack.deletedAt),
        lt(gifPack.userRegens, GIF_PACK_USER_REGENS)
      )
    )
    .returning({ id: gifPack.id });
  if (!updated.length) {
    throw new GifPackError(
      'regen_quota',
      `This pack can regenerate ${GIF_PACK_USER_REGENS} stickers. That limit is used.`
    );
  }
  await db()
    .delete(gifPackFile)
    .where(
      and(eq(gifPackFile.packId, packId), eq(gifPackFile.stickerId, stickerId))
    );
  await db()
    .update(gifPackSticker)
    .set({
      status: 'pending',
      systemAttempts: 0,
      errorCode: null,
      errorMessage: null,
    })
    .where(eq(gifPackSticker.id, stickerId));
  return packView(packId, userId);
}

export async function listAdminRecords(limit = 50) {
  const rows: PackRow[] = await db()
    .select()
    .from(gifPack)
    .orderBy(desc(gifPack.createdAt))
    .limit(limit);
  return Promise.all(rows.map((row) => packView(row.id, row.userId, true)));
}

export async function listAdminDemos() {
  await ensureGifPackCatalog();
  return db()
    .select()
    .from(gifPackDemo)
    .orderBy(gifPackDemo.referenceId, gifPackDemo.themeSlug);
}

export async function advanceGifPack(packId: string, store?: ByteStore) {
  const token = id();
  const now = new Date();
  const stale = new Date(now.getTime() - 90_000);
  await db()
    .update(gifPack)
    .set({
      lockToken: token,
      heartbeatAt: now,
      status: 'running',
      updatedAt: now,
    })
    .where(
      and(
        eq(gifPack.id, packId),
        isNull(gifPack.deletedAt),
        inArray(gifPack.status, ['queued', 'running']),
        or(
          isNull(gifPack.lockToken),
          lt(gifPack.heartbeatAt, stale),
          eq(gifPack.lockToken, token)
        )
      )
    );
  const [locked] = await db()
    .select()
    .from(gifPack)
    .where(eq(gifPack.id, packId))
    .limit(1);
  if (!locked || locked.lockToken !== token || locked.deletedAt)
    return 'idle' as const;
  const bytes = store ?? (await gifPackByteStore());
  try {
    const step = await oneStep(locked, bytes);
    await db()
      .update(gifPack)
      .set({ lockToken: null, heartbeatAt: new Date(), updatedAt: new Date() })
      .where(and(eq(gifPack.id, packId), eq(gifPack.lockToken, token)));
    return step;
  } catch (error) {
    await db()
      .update(gifPack)
      .set({ lockToken: null, heartbeatAt: new Date(), updatedAt: new Date() })
      .where(and(eq(gifPack.id, packId), eq(gifPack.lockToken, token)));
    throw error;
  }
}

async function oneStep(
  pack: typeof gifPack.$inferSelect,
  store: ByteStore
): Promise<'progress' | 'done'> {
  const files: FileRow[] = await db()
    .select()
    .from(gifPackFile)
    .where(eq(gifPackFile.packId, pack.id));
  const stickers = (
    (await db()
      .select()
      .from(gifPackSticker)
      .where(eq(gifPackSticker.packId, pack.id))) as StickerRow[]
  ).sort((a, b) => a.position - b.position);
  const [theme] = await db()
    .select()
    .from(gifPackTheme)
    .where(eq(gifPackTheme.id, pack.themeId))
    .limit(1);
  const themeColor = theme?.backgroundColor || '#FFFFFF';
  const style = pack.style as GifPackStyle;
  const motion = pack.motionMode as GifPackMotion;
  const background = pack.background as GifPackBackground;
  const language = pack.language as GifPackLanguage;
  const crop = files.find((file) => file.kind === 'crop');
  if (!crop) {
    await failPack(
      pack.id,
      'subject_not_found',
      'The uploaded image is missing. Replace it and try again.'
    );
    return 'done';
  }
  const anchor = files.find((file) => file.kind === 'anchor');
  if (!anchor) {
    if (pack.anchorAttempts >= GIF_PACK_SYSTEM_ATTEMPTS) {
      await failPack(
        pack.id,
        'anchor_failed',
        'The character anchor failed after 3 tries. No sticker quota was used.'
      );
      return 'done';
    }
    const source = await store.get(crop.storageKey);
    if (!source) {
      await failPack(
        pack.id,
        'subject_not_found',
        'The uploaded image is missing. Replace it and try again.'
      );
      return 'done';
    }
    try {
      const png = await editImage(
        source.bytes,
        anchorPrompt(style, background, themeColor),
        'anchor.png'
      );
      if (isFlatImage(png)) {
        await failPack(
          pack.id,
          'subject_not_found',
          'No single main subject could be selected. Replace the image. There is no manual crop.'
        );
        return 'done';
      }
      await putFile(
        store,
        pack.id,
        null,
        'anchor',
        'anchor.png',
        png,
        'image/png'
      );
      await touch(pack.id, 'sheet:0');
    } catch (error) {
      await db()
        .update(gifPack)
        .set({
          anchorAttempts: pack.anchorAttempts + 1,
          errorCode: 'anchor_failed',
          errorMessage: messageOf(error),
          updatedAt: new Date(),
        })
        .where(eq(gifPack.id, pack.id));
    }
    return 'progress';
  }
  const sticker = stickers.find(
    (item) => item.status === 'pending' || item.status === 'generating'
  );
  if (!sticker) {
    await finishPack(pack.id, stickers, store);
    return 'done';
  }
  const sheet = files.find(
    (file) => file.kind === 'sheet' && file.stickerId === sticker.id
  );
  if (!sheet) {
    if (sticker.systemAttempts >= GIF_PACK_SYSTEM_ATTEMPTS) {
      await markSticker(
        sticker.id,
        'failed',
        'provider_failed',
        'This sticker failed after 3 system tries.'
      );
      return 'progress';
    }
    const anchorBytes = await store.get(anchor.storageKey);
    if (!anchorBytes) {
      await failPack(
        pack.id,
        'anchor_failed',
        'The character anchor is missing.'
      );
      return 'done';
    }
    try {
      const png = await editImage(
        anchorBytes.bytes,
        sheetPrompt(style, motion, background, themeColor, sticker.intent),
        `sheet-${sticker.position + 1}.png`
      );
      await putFile(
        store,
        pack.id,
        sticker.id,
        'sheet',
        `sheet-${sticker.position + 1}.png`,
        png,
        'image/png'
      );
      await markSticker(sticker.id, 'generating', null, null);
      await touch(pack.id, `encode:${sticker.position}`);
    } catch (error) {
      await db()
        .update(gifPackSticker)
        .set({
          systemAttempts: sticker.systemAttempts + 1,
          status: 'pending',
          errorCode: 'provider_failed',
          errorMessage: messageOf(error),
        })
        .where(eq(gifPackSticker.id, sticker.id));
    }
    return 'progress';
  }
  if (sticker.systemAttempts >= GIF_PACK_SYSTEM_ATTEMPTS) {
    await markSticker(
      sticker.id,
      'failed',
      'encode_failed',
      'This sticker could not be assembled after 3 tries.'
    );
    return 'progress';
  }
  const sheetBytes = await store.get(sheet.storageKey);
  if (!sheetBytes) {
    await markSticker(
      sticker.id,
      'pending',
      'encode_failed',
      'The sprite sheet is missing and will be requested again.'
    );
    await db().delete(gifPackFile).where(eq(gifPackFile.id, sheet.id));
    return 'progress';
  }
  try {
    const gif = await assembleStickerGif({
      sheetPng: sheetBytes.bytes,
      caption: sticker.caption,
      language,
      background,
      themeColor,
      motion,
    });
    await putFile(
      store,
      pack.id,
      sticker.id,
      'gif',
      `${sticker.position + 1}.gif`,
      gif,
      'image/gif'
    );
    await markSticker(sticker.id, 'ready', null, null);
    await touch(pack.id, `sheet:${sticker.position + 1}`);
  } catch (error) {
    await db()
      .update(gifPackSticker)
      .set({
        systemAttempts: sticker.systemAttempts + 1,
        status: 'generating',
        errorCode: 'encode_failed',
        errorMessage: messageOf(error),
      })
      .where(eq(gifPackSticker.id, sticker.id));
  }
  return 'progress';
}

async function editImage(png: Uint8Array, prompt: string, filename: string) {
  const configs = await getAllConfigs();
  const provider = resolveGifPackProvider(configs);
  return requestImageEdit(provider, png, prompt, filename);
}

async function putFile(
  store: ByteStore,
  packId: string,
  stickerId: string | null,
  kind: string,
  filename: string,
  bytes: Uint8Array,
  contentType: string
) {
  const [pack] = await db()
    .select({ userId: gifPack.userId })
    .from(gifPack)
    .where(eq(gifPack.id, packId))
    .limit(1);
  const key = `private/gif-packs/${pack?.userId ?? 'unknown'}/${packId}/${kind}-${stickerId ?? 'pack'}-${filename}`;
  await store.put(key, bytes, contentType);
  await db()
    .insert(gifPackFile)
    .values({
      id: id(),
      packId,
      stickerId,
      kind,
      storageKey: key,
      contentType,
      byteSize: bytes.byteLength,
      frameCount: kind === 'gif' ? 16 : null,
    });
}

async function finishPack(
  packId: string,
  stickers: { id: string; position: number; caption: string; status: string }[],
  store: ByteStore
) {
  const files: FileRow[] = await db()
    .select()
    .from(gifPackFile)
    .where(eq(gifPackFile.packId, packId));
  const ready = stickers.filter((sticker) => sticker.status === 'ready');
  const entries = [];
  for (const sticker of ready) {
    const file = files.find(
      (item) => item.kind === 'gif' && item.stickerId === sticker.id
    );
    if (!file) continue;
    const body = await store.get(file.storageKey);
    if (body)
      entries.push({
        name: `${String(sticker.position + 1).padStart(2, '0')}-${safeName(sticker.caption)}.gif`,
        bytes: body.bytes,
      });
  }
  if (entries.length) {
    await db()
      .delete(gifPackFile)
      .where(and(eq(gifPackFile.packId, packId), eq(gifPackFile.kind, 'zip')));
    const zip = zipStored(entries);
    await putFile(
      store,
      packId,
      null,
      'zip',
      'pack.zip',
      zip,
      'application/zip'
    );
  }
  const status =
    ready.length === stickers.length
      ? 'ready'
      : ready.length
        ? 'partial'
        : 'failed';
  await db()
    .update(gifPack)
    .set({
      status,
      phase: 'done',
      errorCode: status === 'ready' ? null : 'partial_pack',
      errorMessage:
        status === 'ready'
          ? null
          : 'Some stickers failed. You can regenerate a failed sticker. System retries did not use your regeneration limit.',
      updatedAt: new Date(),
    })
    .where(eq(gifPack.id, packId));
}

function safeName(value: string) {
  const cleaned = value.replace(/[^\w\u4e00-\u9fff-]+/g, '').slice(0, 24);
  return cleaned || 'sticker';
}

async function failPack(packId: string, code: string, message: string) {
  await db()
    .update(gifPack)
    .set({
      status: 'failed',
      phase: 'done',
      errorCode: code,
      errorMessage: message,
      updatedAt: new Date(),
    })
    .where(eq(gifPack.id, packId));
}

async function markSticker(
  stickerId: string,
  status: string,
  errorCode: string | null,
  errorMessage: string | null
) {
  await db()
    .update(gifPackSticker)
    .set({ status, errorCode, errorMessage })
    .where(eq(gifPackSticker.id, stickerId));
}

async function touch(packId: string, phase: string) {
  await db()
    .update(gifPack)
    .set({ phase, errorCode: null, errorMessage: null, updatedAt: new Date() })
    .where(eq(gifPack.id, packId));
}

function messageOf(error: unknown) {
  const message = error instanceof Error ? error.message : 'Image step failed';
  return message.slice(0, 240);
}

export async function drainGifPack(packId: string, store?: ByteStore) {
  for (let step = 0; step < 40; step += 1) {
    const result = await advanceGifPack(packId, store);
    if (result === 'done' || result === 'idle') return result;
  }
  return 'progress' as const;
}

export async function resumeStaleGifPacks(now = Date.now()) {
  const stale = new Date(now - 90_000);
  const rows: { id: string }[] = await db()
    .select({ id: gifPack.id })
    .from(gifPack)
    .where(
      and(
        isNull(gifPack.deletedAt),
        inArray(gifPack.status, ['queued', 'running']),
        or(isNull(gifPack.heartbeatAt), lt(gifPack.heartbeatAt, stale))
      )
    )
    .limit(2);
  const ids = [];
  for (const row of rows) {
    await drainGifPack(row.id);
    ids.push(row.id);
  }
  return ids;
}

export async function continueGifPack(packId: string) {
  const work = drainGifPack(packId).catch((error) => {
    console.error(
      '[gif-pack] background step failed',
      error instanceof Error ? error.name : 'error'
    );
  });
  try {
    const moduleName = 'cloudflare:workers';
    const mod = (await import(/* @vite-ignore */ moduleName)) as {
      waitUntil?: (promise: Promise<unknown>) => void;
    };
    if (typeof mod.waitUntil === 'function') {
      mod.waitUntil(work);
      return;
    }
  } catch {
    /* Node and tests keep the promise on the server process. */
  }
  void work;
}
