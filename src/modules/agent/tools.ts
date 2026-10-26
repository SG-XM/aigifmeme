import { defineTool, type ToolDefinition } from '@codeany/open-agent-sdk';
import {
  BufferTarget,
  Conversion,
  Input,
  Mp4InputFormat,
  Mp4OutputFormat,
  Output,
  UrlSource,
  WebMInputFormat,
} from 'mediabunny';

import {
  AIMediaType,
  AITaskStatus,
  ApiMartProvider,
  FalProvider,
  GRouterProvider,
  KieProvider,
  ReplicateProvider,
  type AIProvider,
  type AITaskResult,
} from '@/core/ai';
import type { StorageManager } from '@/core/storage';
import { envConfigs } from '@/config';
import type { AiTask } from '@/config/db/schema';
import {
  createTask,
  AITaskStatus as DbTaskStatus,
  findTask,
  getActiveTasksForSession,
  markTaskProcessing,
  updateTask,
} from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { getStorage } from '@/modules/storage/service';
import {
  creditsForGeneration,
  DEFAULT_DURATION,
  defaultComposerSettings,
  generationDurationSeconds,
  isSelectableModelOption,
  modelOptionFor,
  normalizeDurationForModel,
  providerModelFor,
  type AgentGenerationSettings,
  type AgentModelOptionValue,
  type VideoProviderName,
} from '@/lib/agent-settings';
import {
  BULIN_SOUNDTRACKS,
  isBulinMediaVersion,
  LEGACY_BULIN_SOUNDTRACK_PATH,
  type BulinMediaVersion,
} from '@/lib/bulin-reference';
import {
  isTrioMediaVersion,
  TRIO_SOUNDTRACKS,
  type TrioMediaVersion,
} from '@/lib/bulin-trio-reference';
import {
  BURNING_BRIDGES_SOUNDTRACK,
  isBurningBridgesMediaVersion,
  type BurningBridgesMediaVersion,
} from '@/lib/burning-bridges-reference';
import { mergeVideoAudio } from '@/lib/merge-video-audio';
import {
  isWindowPeeperMediaVersion,
  WINDOW_PEEPER_SOUNDTRACK,
  type WindowPeeperMediaVersion,
} from '@/lib/window-peeper-reference';

type SampleSoundtrackVersion =
  | BulinMediaVersion
  | BurningBridgesMediaVersion
  | TrioMediaVersion
  | WindowPeeperMediaVersion;

// Tools Video Agent can call. They are the ONLY tools the agent gets:
// no filesystem/bash base tools — so the agent loop can't touch anything
// outside video generation.

export interface AgentToolContext {
  userId: string;
  sessionId: string;
  settings?: AgentGenerationSettings;
  useSampleSoundtrack?: boolean;
  soundtrackVersion?: SampleSoundtrackVersion;
}

// Video renders are minutes, not seconds — a 10s clip on a busy queue
// regularly runs past five minutes, so the window is far wider than the
// image agent's was and the poll is correspondingly lazier.
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 900_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolveSleep, rejectSleep) => {
    const timer = setTimeout(resolveSleep, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        rejectSleep(new Error('aborted'));
      },
      { once: true }
    );
  });
}

/**
 * Reference media arrives as public URLs (uploads and examples both
 * live in object storage) or as data URIs. Anything else can't be read from a
 * Worker, so it's rejected instead of silently failing upstream.
 */
export function resolveReferenceImage(src: string): string {
  const value = src.trim();
  if (value.startsWith('data:')) return value;
  if (/^https?:\/\//i.test(value)) {
    let hostname: string;
    try {
      hostname = new URL(value).hostname.toLowerCase();
    } catch {
      throw new Error(`unsupported image reference: ${src}`);
    }
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname)
    ) {
      throw new Error(`unsupported image reference: ${src}`);
    }
    return value;
  }
  // Site-relative and localhost URLs must be copied to public storage by the
  // composer first. Converting them to app_url here only hides the problem in
  // local development and lets the provider fail later with a 422 download
  // error.
  throw new Error(`unsupported image reference: ${src}`);
}

function extFromUrl(url: string): string {
  const m = url.match(/\.(mp4|webm|mov|m4v)(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'mp4';
}

function contentTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Persist the provider's clips to object storage and return their public
 * URLs. Nothing touches a local disk — the agent runs on Workers, where there
 * isn't one, and storage is the single home for generated files.
 */
async function storeGeneratedVideos(
  urls: string[],
  sessionId: string,
  storage: StorageManager,
  assetId?: string,
  audioMode: AgentGenerationSettings['audioMode'] = 'model',
  useSampleSoundtrack = false,
  soundtrackVersion?: SampleSoundtrackVersion
): Promise<{ files: string[]; storage: string }> {
  const files: string[] = [];
  const soundtrack = useSampleSoundtrack
    ? await fetchSampleSoundtrack(soundtrackVersion)
    : undefined;
  for (let i = 0; i < urls.length; i++) {
    const merged = !!soundtrack;
    const muted = !merged && audioMode === 'mute_after';
    const buf = merged
      ? await mergeVideoAudio(urls[i], soundtrack)
      : muted
        ? await removeVideoAudio(urls[i])
        : await fetchVideoBuffer(urls[i]);
    const ext = merged || muted ? 'mp4' : extFromUrl(urls[i]);
    const uploaded = await storage.uploadFile({
      body: buf,
      key: `agent/sessions/${sessionId}/vid_${assetId ?? Date.now()}_${i}.${ext}`,
      contentType: contentTypeFromExt(ext),
      disposition: 'inline',
    });
    if (!uploaded.success || !uploaded.url) {
      throw new Error(uploaded.error || 'storage upload failed');
    }
    files.push(uploaded.url);
  }
  return { files, storage: storage.getProviderNames()[0] };
}

/** Read the bundled, already-extracted sample audio from the Workers asset binding. */
async function fetchSampleSoundtrack(
  version?: SampleSoundtrackVersion
): Promise<Uint8Array> {
  if (isTrioMediaVersion(version)) {
    const response = await fetch(TRIO_SOUNDTRACKS[version].url);
    if (!response.ok) {
      throw new Error(
        `Bundled sample audio could not be loaded (${response.status}).`
      );
    }
    const trioBytes = new Uint8Array(await response.arrayBuffer());
    if (!trioBytes.byteLength)
      throw new Error('Bundled sample audio is empty.');
    return trioBytes;
  }
  const assets = (globalThis as any).__CF_ENV__?.ASSETS;
  const path = isBurningBridgesMediaVersion(version)
    ? BURNING_BRIDGES_SOUNDTRACK.url
    : isWindowPeeperMediaVersion(version)
      ? WINDOW_PEEPER_SOUNDTRACK.url
      : version
        ? BULIN_SOUNDTRACKS[version]?.url
        : LEGACY_BULIN_SOUNDTRACK_PATH;
  if (!path) throw new Error('The selected soundtrack is unavailable.');
  const assetUrl = new URL(path, envConfigs.app_url);
  const response = assets?.fetch
    ? await assets.fetch(new Request(assetUrl))
    : await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(
      `Bundled sample audio could not be loaded (${response.status}).`
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error('Bundled sample audio is empty.');
  return bytes;
}

/** Remux a provider clip while copying video packets and dropping audio. */
async function removeVideoAudio(url: string): Promise<Uint8Array> {
  const input = new Input({
    source: new UrlSource(url),
    formats: [new Mp4InputFormat(), new WebMInputFormat()],
  });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  try {
    const conversion = await Conversion.init({
      input,
      output,
      audio: { discard: true },
      copy: { mode: 'forced' },
    });
    if (!conversion.isValid) {
      throw new Error('Video could not be muted without re-encoding.');
    }
    await conversion.execute();
    const result = target.buffer;
    if (!result?.byteLength) throw new Error('Muted video output is empty.');
    return new Uint8Array(result);
  } finally {
    input.dispose();
  }
}

async function fetchVideoBuffer(url: string): Promise<Buffer> {
  let lastError: unknown;
  const host = safeUrlHost(url);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `video download from ${host} failed (${res.status}): ${text.slice(0, 300)}`
        );
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (error: any) {
      lastError = error;
      if (attempt < 3) {
        await sleep(attempt * 800);
        continue;
      }
    }
  }

  const cause =
    lastError instanceof Error
      ? `${lastError.message}${lastError.cause ? `; cause: ${String(lastError.cause)}` : ''}`
      : String(lastError);
  throw new Error(`video download from ${host} failed after retries: ${cause}`);
}

function safeUrlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown host';
  }
}

function createVideoProvider(
  provider: VideoProviderName,
  configs: Record<string, any>
): AIProvider {
  if (provider === 'grouter') {
    return new GRouterProvider({
      apiKey: configs.grouter_api_key,
      baseUrl: configs.grouter_base_url,
      appName: envConfigs.app_name,
      appUrl: envConfigs.app_url,
    });
  }
  if (provider === 'replicate') {
    return new ReplicateProvider({ apiToken: configs.replicate_api_token });
  }
  if (provider === 'kie') {
    return new KieProvider({ apiKey: configs.kie_api_key });
  }
  if (provider === 'apimart') {
    return new ApiMartProvider({ apiKey: configs.apimart_api_key });
  }
  return new FalProvider({ apiKey: configs.fal_api_key });
}

/**
 * Stop durable provider jobs for a chat. This works after refresh because the
 * chat id and upstream task id live in `ai_task`, not only in browser memory.
 */
export async function cancelVideoGenerationsForSession(params: {
  userId: string;
  sessionId: string;
}): Promise<{ canceled: number; upstreamCanceled: number }> {
  const tasks = await getActiveTasksForSession(params);
  if (tasks.length === 0) return { canceled: 0, upstreamCanceled: 0 };

  const configs = await getAllConfigs();
  let upstreamCanceled = 0;
  for (const task of tasks) {
    // Set the durable flag first. The polling loop checks it before accepting
    // a late success and `updateTask` prevents cancellation being overwritten.
    await updateTask({
      taskId: task.id,
      status: DbTaskStatus.CANCELED,
      taskResult: { error: 'Generation stopped by the user.' },
    });

    if (!task.taskId) continue;
    const providerName = task.provider as VideoProviderName;
    if (
      !['grouter', 'fal', 'replicate', 'kie', 'apimart'].includes(providerName)
    )
      continue;
    try {
      const provider = createVideoProvider(providerName, configs);
      if (!provider.cancel) continue;
      await provider.cancel({
        taskId: task.taskId,
        model: task.model,
        mediaType: AIMediaType.VIDEO,
      });
      upstreamCanceled += 1;
    } catch (error) {
      // The local task is still canceled and refunded. Some providers cannot
      // interrupt a job that crossed from queued to completed concurrently.
      console.error(
        `failed to cancel ${providerName} video task ${task.taskId}:`,
        error
      );
    }
  }
  return { canceled: tasks.length, upstreamCanceled };
}

export async function runVideoGeneration(params: {
  ctx: AgentToolContext;
  prompt: string;
  /** Picker key — mapped to the active provider's model ID. */
  modelKey: AgentModelOptionValue;
  kind: 'generate' | 'animate';
  options: Record<string, unknown>;
  /** Force a provider for fixed-source workflows with a known API contract. */
  providerOverride?: VideoProviderName;
  signal?: AbortSignal;
  /** Submit only; Create resumes through persisted task polling. */
  deferPolling?: boolean;
}): Promise<string> {
  const { ctx, options, signal, kind, modelKey, providerOverride } = params;
  const configs = await getAllConfigs();
  const hasReferenceVideo =
    Array.isArray(options.reference_video_urls) &&
    options.reference_video_urls.length > 0;
  if (
    hasReferenceVideo &&
    !(ctx.settings?.referenceVideoDurationSeconds ?? 0)
  ) {
    return JSON.stringify({
      status: 'error',
      message:
        'Reference-video generation requires a priced source-video duration.',
    });
  }

  let selectedProvider =
    providerOverride ?? pickVideoProvider(configs, modelKey);

  if (selectedProvider === 'kie' && !configs.kie_api_key) {
    return JSON.stringify({
      status: 'error',
      message:
        'Kie is required for this reference-video workflow. Configure the Kie API key in Admin Settings → AI.',
    });
  }
  if (selectedProvider === 'apimart' && !configs.apimart_api_key) {
    return JSON.stringify({
      status: 'error',
      message:
        'APIMart is required for this workflow. Configure the APIMart API key in Admin Settings → AI.',
    });
  }

  if (!selectedProvider) {
    return JSON.stringify({
      status: 'error',
      message:
        'Video provider is not configured. Ask the site admin to configure gRouter, Fal, Replicate, Kie, or APIMart in Admin Settings.',
    });
  }

  const hasReferenceMedia = [
    options.reference_image_urls,
    options.reference_audio_urls,
    options.reference_video_urls,
  ].some((value) => Array.isArray(value) && value.length > 0);
  if (
    hasReferenceMedia &&
    selectedProvider !== 'grouter' &&
    selectedProvider !== 'kie' &&
    selectedProvider !== 'apimart'
  ) {
    if (configs.kie_api_key) {
      selectedProvider = 'kie';
    } else if (
      configs.grouter_api_key &&
      configs.grouter_base_url &&
      providerModelFor(modelKey, 'grouter', kind)
    ) {
      selectedProvider = 'grouter';
    } else {
      return JSON.stringify({
        status: 'error',
        message:
          'Image/audio references require Kie or a supported gRouter route. Configure one or remove the reference media.',
      });
    }
  }

  // Fail before paying the upstream provider. A successful render without a
  // durable public destination cannot be returned to a future chat replay.
  const storage = await getStorage();
  if (!storage) {
    return JSON.stringify({
      status: 'error',
      message:
        'Object storage is not configured. Ask the site admin to set up R2 in Admin Settings before generating videos.',
    });
  }

  const selectedResolution = String(
    options.resolution ??
      ctx.settings?.resolution ??
      modelOptionFor(modelKey)?.defaultResolution ??
      ''
  );
  const model = providerModelFor(
    modelKey,
    selectedProvider,
    kind,
    selectedResolution
  );

  if (!model) {
    return JSON.stringify({
      status: 'error',
      message: `${modelOptionFor(modelKey)?.label ?? modelKey} is not available on ${selectedProvider}. Select Kie or another provider that supports this model.`,
    });
  }

  const provider = createVideoProvider(selectedProvider, configs);

  // Priced from the model catalog and the requested length, never from the
  // request body — the composer sends `creditCost` for display, but trusting
  // it would let a crafted request buy a long high-resolution clip for less.
  const providerOptions = normalizeGenerationOptions(
    modelKey,
    options,
    ctx.settings?.audioMode
  );
  const duration = generationDurationSeconds(
    modelKey,
    durationSeconds(providerOptions.duration, ctx.settings?.duration, modelKey),
    hasReferenceVideo,
    ctx.settings?.referenceOutputSeconds
  );
  providerOptions.duration = duration;
  const prompt = params.prompt;
  const costCredits = creditsForGeneration(
    modelKey,
    duration,
    String(providerOptions.resolution ?? selectedResolution)
  );
  const upstreamOptions = providerOptionsFor({
    provider: selectedProvider,
    modelKey,
    kind,
    options: providerOptions,
  });

  // createTask consumes credits atomically and stores the credit id so a
  // failed generation can be refunded via updateTask(FAILED).
  let task: { id: string };
  try {
    task = await createTask({
      userId: ctx.userId,
      mediaType: 'video',
      provider: selectedProvider,
      model,
      prompt,
      costCredits,
      // Which chat asked for it. The library reads clips out of the message
      // rows today, but recording it here keeps the task row self-contained
      // for support questions — and leaves the door open to serving the
      // library from this table instead.
      options: {
        ...providerOptions,
        audioMode: ctx.settings?.audioMode ?? 'model',
        ...(ctx.useSampleSoundtrack ? { useSampleSoundtrack: true } : {}),
        ...(ctx.soundtrackVersion
          ? { soundtrackVersion: ctx.soundtrackVersion }
          : {}),
        providerModel: model,
        sessionId: ctx.sessionId,
      },
    });
  } catch (err: any) {
    if (String(err?.message).includes('Insufficient credits')) {
      return JSON.stringify({
        status: 'error',
        message:
          'Insufficient credits. The user needs to top up before generating more videos.',
      });
    }
    throw err;
  }

  let providerTaskId = '';
  try {
    const created = await provider.generate({
      params: {
        mediaType: AIMediaType.VIDEO,
        model,
        prompt,
        options: upstreamOptions,
      },
    });
    providerTaskId = created.taskId;
    const processing = await markTaskProcessing({
      taskId: task.id,
      providerTaskId,
    });
    if (!processing) throw new Error('generation canceled');
    if (params.deferPolling) {
      return JSON.stringify({ status: 'processing', taskId: task.id });
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const pollTask = provider.query?.bind(provider);
    let result: AITaskResult = created;
    while (
      result.taskStatus !== AITaskStatus.SUCCESS &&
      result.taskStatus !== AITaskStatus.FAILED &&
      result.taskStatus !== AITaskStatus.CANCELED
    ) {
      if (!pollTask) {
        throw new Error(`provider ${selectedProvider} cannot poll tasks`);
      }
      if (Date.now() > deadline) throw new Error('video generation timed out');
      await sleep(POLL_INTERVAL_MS, signal);
      const durableTask = await findTask(task.id);
      if (durableTask?.status === DbTaskStatus.CANCELED) {
        throw new Error('generation canceled');
      }
      result = await pollTask({
        taskId: created.taskId,
        model,
        mediaType: AIMediaType.VIDEO,
      });
    }

    if (result.taskStatus !== AITaskStatus.SUCCESS) {
      throw new Error(
        result.taskInfo?.errorMessage || `generation ${result.taskStatus}`
      );
    }

    const durableTask = await findTask(task.id);
    if (durableTask?.status === DbTaskStatus.CANCELED) {
      throw new Error('generation canceled');
    }

    const urls = (result.taskInfo?.videos ?? [])
      .map((video) => video.videoUrl)
      .filter((u): u is string => !!u);
    if (urls.length === 0) throw new Error('no video returned');

    const saved = await storeGeneratedVideos(
      urls,
      ctx.sessionId,
      storage,
      undefined,
      ctx.settings?.audioMode,
      ctx.useSampleSoundtrack,
      ctx.soundtrackVersion
    );
    const files = saved.files;

    const completedTask = await updateTask({
      taskId: task.id,
      status: DbTaskStatus.SUCCESS,
      taskResult: { files, model, storage: saved.storage },
    });
    if (completedTask.status === DbTaskStatus.CANCELED) {
      throw new Error('generation canceled');
    }

    return JSON.stringify({
      status: 'success',
      files,
      storage: saved.storage,
      provider: selectedProvider,
      model,
      duration,
      note:
        'The chat already shows the clip to the user with a player. Reference it in your reply as a markdown link, e.g. [clip](' +
        files[0] +
        ') — do not paste the raw URL as plain text.',
    });
  } catch (err: any) {
    const raw = String(err?.message ?? err);
    const canceled =
      signal?.aborted === true ||
      raw === 'aborted' ||
      raw.includes('generation canceled');
    const shouldCancelUpstream =
      canceled || raw.includes('video generation timed out');
    if (shouldCancelUpstream && providerTaskId && provider.cancel) {
      await provider
        .cancel({
          taskId: providerTaskId,
          model,
          mediaType: AIMediaType.VIDEO,
        })
        .catch((cancelError) => {
          console.error(
            `failed to cancel ${selectedProvider} video task ${providerTaskId}:`,
            cancelError
          );
        });
    }
    // Refunds consumed credits on failed/canceled work. The raw message stays
    // in the task record; the agent and chat only receive a readable summary.
    await updateTask({
      taskId: task.id,
      status: canceled ? DbTaskStatus.CANCELED : DbTaskStatus.FAILED,
      taskResult: { error: raw },
    }).catch((refundError) => {
      console.error('failed to refund video generation credits:', refundError);
    });
    if (canceled) {
      return JSON.stringify({
        status: 'canceled',
        message: 'Generation stopped by the user.',
      });
    }
    return JSON.stringify({
      status: 'error',
      message: summarizeProviderError(raw),
    });
  }
}

/** One provider poll for Create; terminal writes/refunds are idempotent. */
export async function refreshCreateVideo(
  task: Pick<
    AiTask,
    | 'id'
    | 'status'
    | 'createdAt'
    | 'taskId'
    | 'provider'
    | 'model'
    | 'taskResult'
    | 'options'
  >
) {
  if (
    task.status === DbTaskStatus.PENDING &&
    Date.now() - new Date(task.createdAt).getTime() > POLL_TIMEOUT_MS
  ) {
    return updateTask({
      taskId: task.id,
      status: DbTaskStatus.FAILED,
      taskResult: { error: 'Video submission timed out. Credits returned.' },
    });
  }
  if (task.status !== DbTaskStatus.PROCESSING) return task;
  const configs = await getAllConfigs();
  const provider = createVideoProvider(
    task.provider as VideoProviderName,
    configs
  );
  if (!task.taskId || !provider.query) return task;
  // Network errors are retriable; they must not refund a still-running job.
  const result = await provider.query({
    taskId: task.taskId,
    model: task.model,
    mediaType: AIMediaType.VIDEO,
  });
  // A completed render must survive a long absence from the page.
  const expired =
    Date.now() - new Date(task.createdAt).getTime() > POLL_TIMEOUT_MS;
  if (
    expired &&
    result.taskStatus !== AITaskStatus.SUCCESS &&
    result.taskStatus !== AITaskStatus.FAILED &&
    result.taskStatus !== AITaskStatus.CANCELED
  ) {
    await provider
      .cancel?.({
        taskId: task.taskId,
        model: task.model,
        mediaType: AIMediaType.VIDEO,
      })
      .catch(() => {});
    return updateTask({
      taskId: task.id,
      status: DbTaskStatus.FAILED,
      taskResult: { error: 'Video generation timed out. Credits returned.' },
    });
  }
  if (
    result.taskStatus === AITaskStatus.FAILED ||
    result.taskStatus === AITaskStatus.CANCELED
  ) {
    return updateTask({
      taskId: task.id,
      status:
        result.taskStatus === AITaskStatus.CANCELED
          ? DbTaskStatus.CANCELED
          : DbTaskStatus.FAILED,
      taskResult: {
        error: summarizeProviderError(
          result.taskInfo?.errorMessage || 'Video generation failed.'
        ),
      },
    });
  }
  if (result.taskStatus !== AITaskStatus.SUCCESS) return task;
  try {
    const urls = (result.taskInfo?.videos ?? [])
      .map((video) => video.videoUrl)
      .filter((url): url is string => !!url);
    if (!urls.length) throw new Error('No video returned');
    const storage = await getStorage();
    if (!storage) throw new Error('Object storage is not configured');
    let audioMode: AgentGenerationSettings['audioMode'] = 'model';
    let useSampleSoundtrack = false;
    let soundtrackVersion: SampleSoundtrackVersion | undefined;
    let options: Record<string, unknown> = {};
    try {
      options = JSON.parse(task.options || '{}') ?? {};
    } catch {
      // Existing tasks predate the audio mode setting.
    }
    if (options.audioMode === 'silent' || options.audioMode === 'mute_after') {
      audioMode = options.audioMode;
    }
    useSampleSoundtrack = options.useSampleSoundtrack === true;
    if (options.soundtrackVersion !== undefined) {
      if (isBulinMediaVersion(options.soundtrackVersion)) {
        soundtrackVersion = options.soundtrackVersion;
      } else if (isBurningBridgesMediaVersion(options.soundtrackVersion)) {
        soundtrackVersion = options.soundtrackVersion;
      } else if (isTrioMediaVersion(options.soundtrackVersion)) {
        soundtrackVersion = options.soundtrackVersion;
      } else if (isWindowPeeperMediaVersion(options.soundtrackVersion)) {
        soundtrackVersion = options.soundtrackVersion;
      } else if (
        options.soundtrackVersion !== '15s' &&
        options.soundtrackVersion !== 'full'
      ) {
        throw new Error('Invalid saved soundtrack version.');
      }
    }
    const saved = await storeGeneratedVideos(
      urls,
      `create/${task.id}`,
      storage,
      task.id,
      audioMode,
      useSampleSoundtrack,
      soundtrackVersion
    );
    return updateTask({
      taskId: task.id,
      status: DbTaskStatus.SUCCESS,
      taskResult: {
        files: saved.files,
        model: task.model,
        storage: saved.storage,
      },
    });
  } catch (error) {
    return updateTask({
      taskId: task.id,
      status: DbTaskStatus.FAILED,
      taskResult: {
        error: summarizeProviderError(
          error instanceof Error ? error.message : 'Unable to save video'
        ),
      },
    });
  }
}

/**
 * Providers report failures by pasting the upstream response body into their
 * error message, which drags in the echoed request (prompt, image sizes, even
 * `openai_api_key: null`). Pull out the sentence a human needs — fal's
 * `detail[].msg`, an OpenAI-style `error.message`, or a plain `detail` — and
 * keep the prefix that says who failed and with what status.
 */
function summarizeProviderError(message: string): string {
  const start = message.search(/[[{]/);
  if (start === -1) return truncate(message);

  const prefix = message
    .slice(0, start)
    .trim()
    .replace(/[:\s]+$/, '');
  let payload: any;
  try {
    payload = JSON.parse(message.slice(start));
  } catch {
    return truncate(message);
  }

  const detail = payload?.detail ?? payload;
  const first = Array.isArray(detail) ? detail[0] : detail;
  const summary =
    (typeof first?.msg === 'string' && first.msg) ||
    (typeof first?.message === 'string' && first.message) ||
    (typeof payload?.error?.message === 'string' && payload.error.message) ||
    (typeof detail === 'string' && detail) ||
    '';
  if (!summary) return truncate(message);

  const type = typeof first?.type === 'string' ? ` (${first.type})` : '';
  return truncate(
    prefix ? `${prefix}: ${summary}${type}` : `${summary}${type}`
  );
}

function truncate(value: string, max = 300): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * The clip length actually sent upstream, and the one the charge is based on.
 * video-lite exposes continuous integer ranges. Clamp tool values to the
 * selected model's bounds and use its default when the value is unreadable.
 */
export function durationSeconds(
  requested: unknown,
  fallback: number | undefined,
  modelKey?: string
): number {
  const candidate =
    typeof requested === 'number' && Number.isFinite(requested)
      ? requested
      : typeof fallback === 'number' && Number.isFinite(fallback)
        ? fallback
        : DEFAULT_DURATION;
  return normalizeDurationForModel(modelKey, candidate);
}

function normalizeGenerationOptions(
  modelKey: AgentModelOptionValue,
  options: Record<string, unknown>,
  audioMode: AgentGenerationSettings['audioMode'] = 'model'
): Record<string, unknown> {
  const model = modelOptionFor(modelKey)!;
  const normalized = { ...options };
  const aspectRatio = String(normalized.aspect_ratio ?? '');
  normalized.aspect_ratio = (model.aspectRatios as readonly string[]).includes(
    aspectRatio
  )
    ? aspectRatio
    : model.defaultAspectRatio;
  const resolution = String(normalized.resolution ?? '');
  normalized.resolution = (model.resolutions as readonly string[]).includes(
    resolution
  )
    ? resolution
    : model.defaultResolution;
  normalized.generate_audio = audioMode === 'silent' ? false : model.audio;
  if (Array.isArray(normalized.image_input)) {
    normalized.image_input = normalized.image_input.slice(0, model.maxImages);
  }
  for (const key of [
    'reference_image_urls',
    'reference_audio_urls',
    'reference_video_urls',
  ]) {
    if (Array.isArray(normalized[key])) {
      normalized[key] = normalized[key].slice(0, 4);
    }
  }
  return normalized;
}

/** Convert normalized Agent options to the selected provider contract. */
function providerOptionsFor({
  provider,
  modelKey,
  kind,
  options,
}: {
  provider: VideoProviderName;
  modelKey: AgentModelOptionValue;
  kind: 'generate' | 'animate';
  options: Record<string, unknown>;
}): Record<string, unknown> {
  const requestedAspectRatio = String(
    options.aspect_ratio ?? modelOptionFor(modelKey)?.defaultAspectRatio ?? ''
  );
  const aspectRatio = normalizeProviderAspectRatio(
    modelKey,
    requestedAspectRatio
  );
  const resolution = String(
    options.resolution ?? modelOptionFor(modelKey)?.defaultResolution ?? ''
  );
  const duration = Number(options.duration);
  const imageUrls = Array.isArray(options.image_input)
    ? options.image_input.map(String)
    : [];
  const referenceImageUrls = Array.isArray(options.reference_image_urls)
    ? options.reference_image_urls.map(String)
    : [];
  const referenceAudioUrls = Array.isArray(options.reference_audio_urls)
    ? options.reference_audio_urls.map(String)
    : [];
  const referenceVideoUrls = Array.isArray(options.reference_video_urls)
    ? options.reference_video_urls.map(String)
    : [];
  const generateAudio = options.generate_audio !== false;

  if (provider === 'fal') {
    return {
      ...(aspectRatio !== 'auto' ? { aspect_ratio: aspectRatio } : {}),
      duration: String(duration),
      resolution,
      generate_audio: generateAudio,
      ...(imageUrls[0] ? { image_url: imageUrls[0] } : {}),
      ...(imageUrls[1] ? { end_image_url: imageUrls[1] } : {}),
    };
  }
  return {
    aspect_ratio:
      (provider === 'kie' || provider === 'apimart') && aspectRatio === 'auto'
        ? 'adaptive'
        : aspectRatio,
    duration,
    resolution,
    image_input: imageUrls,
    ...(referenceImageUrls.length
      ? { reference_image_urls: referenceImageUrls }
      : {}),
    ...(referenceAudioUrls.length
      ? { reference_audio_urls: referenceAudioUrls }
      : {}),
    ...(referenceVideoUrls.length
      ? { reference_video_urls: referenceVideoUrls }
      : {}),
    generate_audio: generateAudio,
  };
}

export function normalizeProviderAspectRatio(
  _modelKey: AgentModelOptionValue,
  aspectRatio: string
): string {
  return aspectRatio;
}

/**
 * Resolve which provider serves this call.
 *
 * The admin's `default_video_provider` decides; `auto` follows video-lite and
 * prefers gRouter, then Fal, Replicate, and Kie. APIMart is used only when
 * an admin selects it. An explicitly chosen provider that isn't usable falls
 * back to whatever is configured rather than failing. Returns null when
 * nothing usable is configured.
 */
export function pickVideoProvider(
  configs: Record<string, any>,
  modelKey?: AgentModelOptionValue
): VideoProviderName | null {
  const configured: Record<VideoProviderName, boolean> = {
    grouter: !!configs.grouter_api_key && !!configs.grouter_base_url,
    fal: !!configs.fal_api_key,
    replicate: !!configs.replicate_api_token,
    kie: !!configs.kie_api_key,
    apimart: !!configs.apimart_api_key,
  };

  const preferred = String(configs.default_video_provider || 'auto');
  // APIMart stays out of auto so saving a key does not move traffic off Kie.
  const fallbackOrder: VideoProviderName[] = [
    'grouter',
    'fal',
    'replicate',
    'kie',
  ];
  const explicit = (
    ['grouter', 'fal', 'replicate', 'kie', 'apimart'] as const
  ).find((name) => name === preferred);
  const order = explicit
    ? [explicit, ...fallbackOrder.filter((name) => name !== explicit)]
    : fallbackOrder;

  return (
    order.find(
      (name) =>
        configured[name] &&
        (!modelKey || !!providerModelFor(modelKey, name, 'generate'))
    ) ?? null
  );
}

/** Create stays on Kie unless an admin has explicitly selected APIMart. */
export function createVideoProviderOverride(
  configs: Record<string, string | undefined>
): 'kie' | 'apimart' {
  if (configs.default_video_provider === 'apimart' && configs.apimart_api_key) {
    return 'apimart';
  }
  return 'kie';
}

/**
 * Only picker keys are accepted. Letting the language model pass an arbitrary
 * provider id would bypass both the model allowlist and the pricing catalog.
 */
function modelSelection(
  requested: string,
  ctx: AgentToolContext
): { modelKey: AgentModelOptionValue } | { error: string } {
  const value =
    requested ||
    ctx.settings?.modelName ||
    defaultComposerSettings().modelOption;
  if (!isSelectableModelOption(value)) {
    return {
      error: `Unsupported video model "${value}". Choose a model from the video model picker.`,
    };
  }
  return { modelKey: value };
}

export function createAgentTools(ctx: AgentToolContext): ToolDefinition[] {
  const generateVideo = defineTool({
    name: 'generate_video',
    description:
      'Generate a video clip from a text prompt. Returns JSON with `files` — public URLs of the generated clips. Rendering takes a few minutes; call this once and wait for it.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed English prompt describing the shot: subject, action, camera move, lighting and mood',
        },
        aspect_ratio: {
          type: 'string',
          description: 'Aspect ratio: "16:9", "9:16" or "1:1". Default "16:9".',
        },
        duration: {
          type: 'number',
          description:
            'Clip length in seconds. Use a value supported by the selected model; omit it to use the composer setting.',
        },
        model: {
          type: 'string',
          description:
            'Optional picker key: seedance-2-mini, seedance-2-fast, seedance-2 or seedance-2-5. Leave empty to use the composer setting.',
        },
        resolution: {
          type: 'string',
          description:
            'Optional target output resolution supported by the selected model.',
        },
        reference_videos: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Public http(s) URLs of reference videos whose motion, subject, or visual direction should guide the result.',
        },
        reference_images: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Public http(s) URLs of reference images whose subject, composition, or visual style should guide the result.',
        },
        reference_audios: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Public http(s) URLs of reference audio clips whose sound or rhythm should guide the result.',
        },
      },
      required: ['prompt'],
    },
    isConcurrencySafe: true,
    async call(input, context) {
      const requested = String(input.model ?? '');
      const selection = modelSelection(requested, ctx);
      if ('error' in selection) {
        return JSON.stringify({ status: 'error', message: selection.error });
      }
      const options: Record<string, unknown> = {};
      for (const [inputKey, optionKey] of [
        ['reference_images', 'reference_image_urls'],
        ['reference_audios', 'reference_audio_urls'],
        ['reference_videos', 'reference_video_urls'],
      ] as const) {
        const references = Array.isArray(input[inputKey])
          ? input[inputKey]
              .map((item: unknown) => String(item ?? '').trim())
              .filter(Boolean)
              .map((src: string) => resolveReferenceImage(src))
          : [];
        if (references.length > 0) options[optionKey] = references;
      }
      const aspectRatio = input.aspect_ratio || ctx.settings?.aspectRatio;
      if (aspectRatio) options.aspect_ratio = aspectRatio;
      const resolution = input.resolution || ctx.settings?.resolution;
      if (resolution) options.resolution = resolution;
      options.duration = durationSeconds(
        input.duration,
        ctx.settings?.duration,
        selection.modelKey
      );
      return runVideoGeneration({
        ctx,
        prompt: String(input.prompt ?? ''),
        ...selection,
        kind: 'generate',
        options,
        signal: context.abortSignal,
      });
    },
  });

  const animateImage = defineTool({
    name: 'animate_image',
    description:
      'Bring a still image to life as a video clip — the image becomes the opening frame and the prompt describes what happens next. Accepts the http(s) URL of an uploaded or previously generated image. Returns JSON with `files` — public URLs of the generated clips.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'English instruction describing the motion: what moves, how the camera travels, how the scene evolves',
        },
        image: {
          type: 'string',
          description:
            'The opening frame: the http(s) URL of an uploaded or previously generated image.',
        },
        images: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Several reference frames, in the order the prompt refers to them. Takes precedence over `image`; most models only use the first.',
        },
        aspect_ratio: {
          type: 'string',
          description: 'Optional output aspect ratio: "16:9", "9:16" or "1:1"',
        },
        duration: {
          type: 'number',
          description:
            'Clip length in seconds. Use a value supported by the selected model; omit it to use the composer setting.',
        },
        model: {
          type: 'string',
          description:
            'Optional picker key: seedance-2-mini, seedance-2-fast, seedance-2 or seedance-2-5. Leave empty to use the composer setting.',
        },
        resolution: {
          type: 'string',
          description:
            'Optional target output resolution supported by the selected model.',
        },
      },
      required: ['prompt'],
    },
    isConcurrencySafe: true,
    async call(input, context) {
      const requested = String(input.model ?? '');
      const selection = modelSelection(requested, ctx);
      if ('error' in selection) {
        return JSON.stringify({ status: 'error', message: selection.error });
      }
      const sources = (
        Array.isArray(input.images) && input.images.length > 0
          ? input.images
          : [input.image]
      )
        .map((item: unknown) => String(item ?? '').trim())
        .filter(Boolean);
      if (sources.length === 0) {
        return JSON.stringify({
          status: 'error',
          message: 'animate_image needs at least one source image',
        });
      }
      const inputImages = sources.map((src: string) =>
        resolveReferenceImage(src)
      );
      // Normalized key — each provider's formatInput() maps this to the
      // field name the selected model actually expects. Don't hardcode a
      // provider-specific key in the tool schema.
      const options: Record<string, unknown> = { image_input: inputImages };
      const aspectRatio = input.aspect_ratio || ctx.settings?.aspectRatio;
      if (aspectRatio) options.aspect_ratio = aspectRatio;
      const resolution = input.resolution || ctx.settings?.resolution;
      if (resolution) options.resolution = resolution;
      options.duration = durationSeconds(
        input.duration,
        ctx.settings?.duration,
        selection.modelKey
      );
      return runVideoGeneration({
        ctx,
        prompt: String(input.prompt ?? ''),
        ...selection,
        kind: 'animate',
        options,
        signal: context.abortSignal,
      });
    },
  });

  return [generateVideo, animateImage];
}
