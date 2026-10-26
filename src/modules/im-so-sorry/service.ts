import { and, desc, eq, isNull } from 'drizzle-orm';

import {
  AIMediaType,
  KieProvider,
  AITaskStatus as ProviderStatus,
} from '@/core/ai';
import { db } from '@/core/db';
import { aiTask, type AiTask } from '@/config/db/schema';
import {
  AITaskStatus,
  createTask,
  findTask,
  replaceTaskInfo,
  updateTask,
} from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { getStorage } from '@/modules/storage/service';
import { burnCaptionJpeg } from '@/lib/caption-burn';
import {
  isPublicHttpsUrl,
  planSorrySet,
  SORRY_CREDIT_COST,
  SORRY_MODEL,
  SORRY_SCENE,
  SorryRequestError,
  type SorryPlan,
} from '@/lib/im-so-sorry';

const LOCK_MS = 120_000;
const TIMEOUT_MS = 900_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

class SorryFatal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SorryFatal';
  }
}

export interface SorrySlide {
  index: number;
  url: string;
  caption: string;
  kind: 'edit' | 'original';
}

interface SorryState {
  photoUrl: string;
  styleId: string;
  lieIds: string[];
  costumeNote: string;
  locale: 'en' | 'es';
  captions: string[];
  closing: string;
  phase: 'edit' | 'compose';
  editIndex: number;
  kieTaskId?: string;
  rawUrls: string[];
  slides: SorrySlide[];
  composeIndex: number;
  lockUntil: number;
}

interface SorryInfo {
  creditId?: string;
  sorry?: SorryState;
}

export interface SorryRuntime {
  now: () => number;
  generate: (prompt: string, imageUrl: string) => Promise<{ taskId: string }>;
  query: (
    taskId: string
  ) => Promise<{ status: 'pending' | 'success' | 'failed'; url?: string }>;
  fetchBytes: (url: string) => Promise<Uint8Array>;
  upload: (key: string, body: Uint8Array) => Promise<string>;
  burn: (
    bytes: Uint8Array,
    caption: string,
    closing: boolean
  ) => Promise<Uint8Array>;
}

function parseInfo(raw: string | null | undefined): SorryInfo {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as SorryInfo;
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

export async function fetchPublicImage(
  url: string,
  hops = 0
): Promise<Uint8Array> {
  if (!isPublicHttpsUrl(url)) throw new SorryFatal('Image URL was rejected');
  if (hops > 2) throw new SorryFatal('Image URL was rejected');
  const response = await fetch(url, { redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new SorryFatal('Image URL was rejected');
    return fetchPublicImage(new URL(location, url).href, hops + 1);
  }
  if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
  const advertised = Number(response.headers.get('content-length') || 0);
  if (advertised > MAX_IMAGE_BYTES) throw new SorryFatal('Image is too large');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES)
    throw new SorryFatal('Image is too large');
  if (!isJpeg(bytes) && !isPng(bytes))
    throw new SorryFatal('Image was not a photo');
  return bytes;
}

async function defaultRuntime(): Promise<SorryRuntime> {
  const configs = await getAllConfigs();
  if (!configs.kie_api_key)
    throw new SorryFatal('Image generation is not configured');
  const provider = new KieProvider({ apiKey: configs.kie_api_key });
  const storage = await getStorage();
  if (!storage) throw new SorryFatal('Storage is not configured');
  return {
    now: () => Date.now(),
    generate: async (prompt, imageUrl) => {
      const created = await provider.generate({
        params: {
          mediaType: AIMediaType.IMAGE,
          model: SORRY_MODEL,
          prompt,
          options: {
            image_input: [imageUrl],
            aspect_ratio: '3:4',
            output_format: 'jpeg',
          },
        },
      });
      if (!created.taskId) throw new Error('Image job was not accepted');
      return { taskId: created.taskId };
    },
    query: async (taskId) => {
      const result = await provider.query({
        taskId,
        mediaType: AIMediaType.IMAGE,
      });
      const url = result.taskInfo?.images?.[0]?.imageUrl;
      if (result.taskStatus === ProviderStatus.SUCCESS) {
        return {
          status: 'success',
          url: typeof url === 'string' ? url : undefined,
        };
      }
      if (result.taskStatus === ProviderStatus.FAILED)
        return { status: 'failed' };
      return { status: 'pending' };
    },
    fetchBytes: fetchPublicImage,
    upload: async (key, body) => {
      const uploaded = await storage.uploadFile({
        body,
        key,
        contentType: 'image/jpeg',
        disposition: 'inline',
      });
      if (!uploaded.success || !uploaded.url) {
        throw new Error(uploaded.error || 'Upload failed');
      }
      return uploaded.url;
    },
    burn: (bytes, caption, closing) =>
      burnCaptionJpeg(bytes, caption, { closing }),
  };
}

function initialState(plan: SorryPlan, photoUrl: string): SorryState {
  return {
    photoUrl,
    styleId: plan.styleId,
    lieIds: plan.lieIds,
    costumeNote: plan.costumeNote,
    locale: plan.locale,
    captions: plan.captions,
    closing: plan.closing,
    phase: 'edit',
    editIndex: 0,
    rawUrls: [],
    slides: [],
    composeIndex: 0,
    lockUntil: 0,
  };
}

export async function createSorrySet(input: {
  userId: string;
  photoUrl: unknown;
  styleId: unknown;
  lieIds: unknown;
  costumeNote?: unknown;
  captions?: unknown;
  locale?: unknown;
}): Promise<{ id: string }> {
  if (typeof input.photoUrl !== 'string' || !isPublicHttpsUrl(input.photoUrl)) {
    throw new SorryRequestError('Upload the photo through this site');
  }
  const [storage, configs] = await Promise.all([getStorage(), getAllConfigs()]);
  const publicUrl = storage?.getPublicUrl({ key: 'uploads/reference' });
  if (!storage || !publicUrl) {
    throw new SorryRequestError('Storage is not configured');
  }
  if (new URL(input.photoUrl).origin !== new URL(publicUrl).origin) {
    throw new SorryRequestError('Upload the photo through this site');
  }
  if (!configs.kie_api_key) {
    throw new SorryRequestError('Image generation is not configured');
  }
  const plan = planSorrySet(input);
  const created = await createTask({
    userId: input.userId,
    mediaType: 'image',
    provider: 'kie',
    model: SORRY_MODEL,
    prompt: plan.prompts[0].slice(0, 2000),
    costCredits: SORRY_CREDIT_COST,
    scene: SORRY_SCENE,
    options: {
      source: SORRY_SCENE,
      styleId: plan.styleId,
      lieIds: plan.lieIds,
      photoUrl: input.photoUrl,
      locale: plan.locale,
      costumeNote: plan.costumeNote || undefined,
    },
    taskInfo: { sorry: initialState(plan, input.photoUrl) },
  });
  return { id: created.id as string };
}

async function runStep(
  state: SorryState,
  taskId: string,
  runtime: SorryRuntime
): Promise<
  | { type: 'continue'; sorry: SorryState }
  | { type: 'success'; result: Record<string, unknown> }
> {
  const prompts = planSorrySet({
    styleId: state.styleId,
    lieIds: state.lieIds,
    costumeNote: state.costumeNote || undefined,
    captions: state.captions,
    locale: state.locale,
  }).prompts;
  if (state.phase === 'edit') {
    if (!state.kieTaskId) {
      const imageUrl =
        state.editIndex === 0
          ? state.photoUrl
          : state.rawUrls[state.editIndex - 1];
      if (!imageUrl) throw new SorryFatal('The previous slide is missing');
      const created = await runtime.generate(
        prompts[state.editIndex],
        imageUrl
      );
      return {
        type: 'continue',
        sorry: { ...state, kieTaskId: created.taskId, lockUntil: 0 },
      };
    }
    const queried = await runtime.query(state.kieTaskId);
    if (queried.status === 'pending') {
      return { type: 'continue', sorry: { ...state, lockUntil: 0 } };
    }
    if (queried.status === 'failed' || !queried.url) {
      throw new SorryFatal('The image edit failed');
    }
    const bytes = await runtime.fetchBytes(queried.url);
    const url = await runtime.upload(
      `sorry/${taskId}/raw-${state.editIndex}.jpg`,
      bytes
    );
    const rawUrls = [...state.rawUrls, url];
    const editIndex = state.editIndex + 1;
    const doneEditing = editIndex >= prompts.length;
    return {
      type: 'continue',
      sorry: {
        ...state,
        rawUrls,
        editIndex,
        kieTaskId: undefined,
        phase: doneEditing ? 'compose' : 'edit',
        lockUntil: 0,
      },
    };
  }

  const slideCount = state.captions.length + 1;
  if (state.composeIndex >= slideCount) {
    return { type: 'success', result: resultFor(state) };
  }
  const closing = state.composeIndex === state.captions.length;
  const sourceUrl = closing
    ? state.photoUrl
    : state.rawUrls[state.composeIndex];
  if (!sourceUrl) throw new SorryFatal('A slide photo is missing');
  const source = await runtime.fetchBytes(sourceUrl);
  const caption = closing ? state.closing : state.captions[state.composeIndex];
  let burned: Uint8Array;
  try {
    burned = await runtime.burn(source, caption, closing);
  } catch (error) {
    throw new SorryFatal(
      error instanceof Error ? error.message : 'Caption burn failed'
    );
  }
  const url = await runtime.upload(
    `sorry/${taskId}/slide-${state.composeIndex}.jpg`,
    burned
  );
  const slides = [
    ...state.slides,
    {
      index: state.composeIndex,
      url,
      caption,
      kind: closing ? 'original' : 'edit',
    } satisfies SorrySlide,
  ];
  const next: SorryState = {
    ...state,
    slides,
    composeIndex: state.composeIndex + 1,
    lockUntil: 0,
  };
  if (next.composeIndex >= slideCount) {
    return { type: 'success', result: resultFor(next) };
  }
  return { type: 'continue', sorry: next };
}

function resultFor(state: SorryState) {
  return {
    scene: SORRY_SCENE,
    styleId: state.styleId,
    slides: state.slides,
  };
}

export async function refreshSorryTask(
  taskId: string,
  runtime?: SorryRuntime
): Promise<AiTask | undefined> {
  const task = await findTask(taskId);
  if (!task || task.scene !== SORRY_SCENE) return task;
  if (
    task.status === AITaskStatus.SUCCESS ||
    task.status === AITaskStatus.FAILED ||
    task.status === AITaskStatus.CANCELED
  ) {
    return task;
  }
  const previous = (task.taskInfo as string | null) ?? null;
  const info = parseInfo(previous);
  if (!info.sorry) {
    return failTask(taskId);
  }
  const clock = runtime?.now ?? Date.now;
  const now = clock();
  if (info.sorry.lockUntil > now) return task;
  if (now - new Date(task.createdAt).getTime() > TIMEOUT_MS) {
    return failTask(taskId);
  }
  const locked = JSON.stringify({
    ...info,
    sorry: { ...info.sorry, lockUntil: now + LOCK_MS },
  });
  const won = await replaceTaskInfo({
    taskId,
    previous,
    next: locked,
    status: AITaskStatus.PROCESSING,
  });
  if (!won) return findTask(taskId);
  try {
    const active = runtime ?? (await defaultRuntime());
    const outcome = await runStep(info.sorry, taskId, active);
    if (outcome.type === 'success') {
      return updateTask({
        taskId,
        status: AITaskStatus.SUCCESS,
        taskResult: outcome.result,
      });
    }
    await replaceTaskInfo({
      taskId,
      previous: locked,
      next: JSON.stringify({ ...info, sorry: outcome.sorry }),
      providerTaskId: outcome.sorry.kieTaskId ?? null,
    });
    return findTask(taskId);
  } catch (error) {
    if (error instanceof SorryFatal) {
      console.error('im-so-sorry failed', taskId, error.message);
      return failTask(taskId);
    }
    console.error('im-so-sorry retry', taskId, error);
    await replaceTaskInfo({
      taskId,
      previous: locked,
      next: JSON.stringify({ ...info, sorry: { ...info.sorry, lockUntil: 0 } }),
    });
    return findTask(taskId);
  }
}

function failTask(taskId: string) {
  return updateTask({
    taskId,
    status: AITaskStatus.FAILED,
    taskResult: { error: 'failed' },
  });
}

export interface SorryTaskView {
  id: string;
  status: string;
  costCredits: number;
  styleId?: string;
  closing?: string;
  slides: SorrySlide[];
  error?: string;
}

export function sorryTaskView(task: AiTask): SorryTaskView {
  const info = parseInfo(task.taskInfo);
  let stored: { slides?: SorrySlide[]; styleId?: string } = {};
  if (task.taskResult) {
    try {
      stored = JSON.parse(task.taskResult) as typeof stored;
    } catch {
      stored = {};
    }
  }
  const slides = (
    task.status === AITaskStatus.SUCCESS ? stored.slides : info.sorry?.slides
  )?.filter(
    (slide) =>
      slide &&
      typeof slide.url === 'string' &&
      typeof slide.caption === 'string' &&
      typeof slide.index === 'number'
  );
  return {
    id: task.id,
    status: task.status,
    costCredits: SORRY_CREDIT_COST,
    styleId: info.sorry?.styleId ?? stored.styleId,
    closing: info.sorry?.closing,
    slides: slides ?? [],
    error:
      task.status === AITaskStatus.FAILED
        ? 'The set failed. The 5 credits were returned.'
        : undefined,
  };
}

export interface SorrySetSummary {
  id: string;
  status: string;
  styleId?: string;
  createdAt: string;
  slides: { url: string; caption: string }[];
}

export async function listSorrySets(
  userId: string,
  limit = 12
): Promise<SorrySetSummary[]> {
  const take = Math.min(Math.max(limit, 1), 24);
  const load = () =>
    db()
      .select()
      .from(aiTask)
      .where(
        and(
          eq(aiTask.userId, userId),
          eq(aiTask.mediaType, 'image'),
          eq(aiTask.scene, SORRY_SCENE),
          isNull(aiTask.deletedAt)
        )
      )
      .orderBy(desc(aiTask.createdAt))
      .limit(take);
  const rows = await load();
  const active = rows
    .filter(
      (row: AiTask) =>
        row.status === AITaskStatus.PENDING ||
        row.status === AITaskStatus.PROCESSING
    )
    .slice(0, 2);
  for (const row of active) {
    try {
      await refreshSorryTask(row.id);
    } catch (error) {
      console.error('im-so-sorry library refresh', row.id, error);
    }
  }
  const fresh = active.length ? await load() : rows;
  return fresh.map((row: AiTask) => {
    const view = sorryTaskView(row);
    return {
      id: view.id,
      status: view.status,
      styleId: view.styleId,
      createdAt: new Date(row.createdAt).toISOString(),
      slides: view.slides.map((slide) => ({
        url: slide.url,
        caption: slide.caption,
      })),
    };
  });
}
