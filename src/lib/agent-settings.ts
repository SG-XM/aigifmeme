/** The video backends an admin can route generation through. */
export type VideoProviderName =
  | 'grouter'
  | 'fal'
  | 'replicate'
  | 'kie'
  | 'apimart';

export interface AgentGenerationSettings {
  /** Picker key (`seedance-2-mini`) — resolved to a provider model server-side. */
  modelName?: string;
  aspectRatio?: string;
  resolution?: string;
  /** Clip length in seconds. */
  duration?: number;
  creditCost?: number;
  /** Server-derived reference input billed together with the generated clip. */
  referenceVideoDurationSeconds?: number;
  /** Output length when it must follow a non-15s reference cut (trio 12s). */
  referenceOutputSeconds?: number;
  audioMode?: AudioMode;
}

export type AudioMode = 'model' | 'silent' | 'mute_after';

export const AUTO_ASPECT_RATIO = 'auto';
export const ADAPTIVE_ASPECT_RATIO = 'adaptive';
export const AUTO_RESOLUTION = 'auto';
export const DEFAULT_RESOLUTION = '720p';
export const DEFAULT_DURATION = 12;
/**
 * Seedance 2.5 reference-video output follows the 15-second source clip.
 * Billing uses this length even when a client still sends the 12-second default.
 */
export const SEEDANCE_25_REFERENCE_OUTPUT_SECONDS = 15;

/** User credits per 12-second clip; independent of provider billing credits. */
export const VIDEO_CREDIT_BASE_SECONDS = 12;

const seedanceAspectRatios = ['auto', '16:9', '9:16'] as const;
const seedanceDurations = [12, 15] as const;
const wanDurations = [12, 15, 30] as const;
const seedanceDefaults = {
  defaultDuration: 12,
  durationMin: 4,
  supportsAutoDuration: false,
  defaultResolution: '720p',
  aspectRatios: seedanceAspectRatios,
  defaultAspectRatio: 'auto',
  audio: true,
  maxImages: 2,
} as const;

/** Catalog for pricing and labels, including models no longer offered in the UI. */
export const AGENT_MODEL_OPTIONS = [
  {
    ...seedanceDefaults,
    value: 'seedance-2-mini',
    label: 'Seedance 2.0 Mini',
    tier: 'Standard',
    creditsPer12Seconds: { '480p': 5, '720p': 10 },
    durations: seedanceDurations,
    durationMax: 15,
    resolutions: ['480p', '720p'],
    providers: {
      kie: {
        model: 'bytedance/seedance-2-mini',
        imageModel: 'bytedance/seedance-2-mini',
      },
      apimart: {
        model: 'seedance-2.0-mini',
        imageModel: 'seedance-2.0-mini',
      },
      grouter: null,
      fal: null,
      replicate: null,
    },
  },
  {
    ...seedanceDefaults,
    value: 'seedance-2-fast',
    label: 'Seedance 2.0 Fast',
    tier: 'Fast',
    creditsPer12Seconds: { '480p': 8, '720p': 17 },
    durations: seedanceDurations,
    durationMax: 15,
    resolutions: ['480p', '720p'],
    providers: {
      kie: {
        model: 'bytedance/seedance-2-fast',
        imageModel: 'bytedance/seedance-2-fast',
      },
      apimart: {
        model: 'seedance-2.0-fast',
        imageModel: 'seedance-2.0-fast',
      },
      grouter: null,
      fal: null,
      replicate: null,
    },
  },
  {
    ...seedanceDefaults,
    value: 'seedance-2',
    label: 'Seedance 2.0',
    tier: 'Pro',
    creditsPer12Seconds: { '480p': 10, '720p': 20, '1080p': 50 },
    durations: seedanceDurations,
    durationMax: 15,
    resolutions: ['480p', '720p', '1080p'],
    providers: {
      kie: {
        model: 'bytedance/seedance-2',
        imageModel: 'bytedance/seedance-2',
      },
      apimart: {
        model: 'seedance-2.0',
        imageModel: 'seedance-2.0',
      },
      grouter: null,
      fal: null,
      replicate: null,
    },
  },
  {
    ...seedanceDefaults,
    value: 'seedance-2-5',
    label: 'Seedance 2.5',
    tier: 'Ultra',
    creditsPer12Seconds: { '480p': 17, '720p': 37, '1080p': 93 },
    durations: seedanceDurations,
    durationMax: 30,
    resolutions: ['480p', '720p', '1080p'],
    providers: {
      kie: {
        model: 'bytedance/seedance-2-5',
        imageModel: 'bytedance/seedance-2-5',
      },
      apimart: {
        model: 'seedance-2.5',
        imageModel: 'seedance-2.5',
      },
      grouter: { model: 'seedance-2.5', imageModel: 'seedance-2.5' },
      fal: {
        model: 'bytedance/seedance-2.5/text-to-video',
        imageModel: 'bytedance/seedance-2.5/image-to-video',
      },
      replicate: null,
    },
  },
  {
    ...seedanceDefaults,
    value: 'wan-3-video',
    label: 'Wan 3.0 Video',
    tier: 'Wan',
    creditsPer12Seconds: { '480p': 10, '720p': 20, '1080p': 40 },
    durations: wanDurations,
    durationMax: 30,
    resolutions: ['480p', '720p', '1080p'],
    providers: {
      kie: {
        model: 'wan/3-0-video',
        imageModel: 'wan/3-0-video',
      },
      // TODO: map Wan when APIMart publishes a model id. Public video docs cover Seedance only.
      apimart: null,
      grouter: null,
      fal: null,
      replicate: null,
    },
  },
  {
    ...seedanceDefaults,
    value: 'wan-3-video-prime',
    label: 'Wan 3.0 Video Prime',
    tier: 'Wan Prime',
    creditsPer12Seconds: { '480p': 15, '720p': 30, '1080p': 60 },
    durations: wanDurations,
    durationMax: 30,
    resolutions: ['480p', '720p', '1080p'],
    providers: {
      kie: {
        model: 'wan/3-0-video-prime',
        imageModel: 'wan/3-0-video-prime',
      },
      apimart: null,
      grouter: null,
      fal: null,
      replicate: null,
    },
  },
] as const;

export type AgentModelOptionValue =
  (typeof AGENT_MODEL_OPTIONS)[number]['value'];

/** Wan stays in the catalog so old jobs still price and label. */
export function isHiddenAgentModel(value: string | undefined): boolean {
  return !!value && value.toLowerCase().startsWith('wan');
}

/** Models a user can pick for a new render. */
export const SELECTABLE_AGENT_MODEL_OPTIONS = AGENT_MODEL_OPTIONS.filter(
  (option) => !isHiddenAgentModel(option.value)
);

export const AGENT_DURATIONS = [12, 15, 30] as const;

export const AGENT_ASPECT_RATIOS = [AUTO_ASPECT_RATIO, '16:9', '9:16'] as const;

export const AGENT_RESOLUTIONS = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
] as const;

export interface AgentComposerSettings {
  modelOption: AgentModelOptionValue;
  aspectRatio: string;
  resolution: string;
  duration: number;
  audioMode: AudioMode;
}

export function isAudioMode(value: unknown): value is AudioMode {
  return value === 'model' || value === 'silent' || value === 'mute_after';
}

export function modelOptionFor(value: string | undefined) {
  return AGENT_MODEL_OPTIONS.find((item) => item.value === value);
}

export function isModelOptionValue(
  value: string | undefined
): value is AgentModelOptionValue {
  return !!modelOptionFor(value);
}

export function isSelectableModelOption(
  value: string | undefined
): value is AgentModelOptionValue {
  return isModelOptionValue(value) && !isHiddenAgentModel(value);
}

export function durationsForModel(
  value: string | undefined
): readonly number[] {
  return modelOptionFor(value)?.durations ?? [DEFAULT_DURATION];
}

export function aspectRatiosForModel(
  value: string | undefined
): readonly string[] {
  return modelOptionFor(value)?.aspectRatios ?? [ADAPTIVE_ASPECT_RATIO];
}

export function resolutionsForModel(
  value: string | undefined
): readonly string[] {
  return modelOptionFor(value)?.resolutions ?? [DEFAULT_RESOLUTION];
}

export function isAutoAspectRatio(value: string): boolean {
  return value === AUTO_ASPECT_RATIO || value === ADAPTIVE_ASPECT_RATIO;
}

export function isAspectRatioValue(value: unknown): value is string {
  return AGENT_ASPECT_RATIOS.some((ratio) => ratio === value);
}

export function isResolutionValue(value: unknown): value is string {
  return AGENT_RESOLUTIONS.some((item) => item.value === value);
}

export function isDurationValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    AGENT_DURATIONS.some((seconds) => seconds === value)
  );
}

/** Restrict output length to the priced presets, choosing the nearest option. */
export function normalizeDurationForModel(
  modelKey: string | undefined,
  value: unknown
): number {
  const option = modelOptionFor(modelKey);
  if (!option) return DEFAULT_DURATION;
  const requested =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value)
      : option.defaultDuration;
  return option.durations.reduce((nearest, duration) =>
    Math.abs(duration - requested) < Math.abs(nearest - requested)
      ? duration
      : nearest
  );
}

/** Reset values that are invalid for the newly selected model. */
export function settingsForModel(
  settings: AgentComposerSettings,
  modelKey: AgentModelOptionValue
): AgentComposerSettings {
  const option = modelOptionFor(modelKey);
  if (!option) return defaultComposerSettings();

  // video-lite resets all controls to the new model's defaults when the
  // picker changes, even when an old value happens to be supported by both.
  if (settings.modelOption !== modelKey) {
    return {
      modelOption: modelKey,
      duration: option.defaultDuration,
      aspectRatio: option.defaultAspectRatio,
      resolution: option.defaultResolution,
      audioMode: settings.audioMode ?? 'model',
    };
  }

  return {
    modelOption: modelKey,
    duration: normalizeDurationForModel(modelKey, settings.duration),
    aspectRatio: (option.aspectRatios as readonly string[]).includes(
      settings.aspectRatio
    )
      ? settings.aspectRatio
      : option.defaultAspectRatio,
    resolution: (option.resolutions as readonly string[]).includes(
      settings.resolution
    )
      ? settings.resolution
      : option.defaultResolution,
    audioMode: settings.audioMode ?? 'model',
  };
}

export function defaultComposerSettings(): AgentComposerSettings {
  const option = SELECTABLE_AGENT_MODEL_OPTIONS[0] ?? AGENT_MODEL_OPTIONS[0];
  return {
    modelOption: option.value,
    aspectRatio: option.defaultAspectRatio,
    resolution: option.defaultResolution,
    duration: option.defaultDuration,
    audioMode: 'model',
  };
}

export function resolveGenerationSettings(
  settings: AgentComposerSettings
): AgentGenerationSettings {
  const normalized = settingsForModel(settings, settings.modelOption);
  return {
    modelName: normalized.modelOption,
    aspectRatio: normalized.aspectRatio,
    resolution: normalized.resolution,
    duration: normalized.duration,
    audioMode: normalized.audioMode,
    creditCost: creditsForGeneration(
      normalized.modelOption,
      normalized.duration,
      normalized.resolution
    ),
  };
}

/** Validate settings from the API request against the server catalog. */
export function normalizeClientGenerationSettings(
  settings: AgentGenerationSettings | undefined
): AgentGenerationSettings | null {
  const defaults = defaultComposerSettings();
  const modelOption = settings?.modelName ?? defaults.modelOption;
  if (!isSelectableModelOption(modelOption)) return null;

  return resolveGenerationSettings(
    settingsForModel(
      {
        modelOption,
        aspectRatio: settings?.aspectRatio ?? defaults.aspectRatio,
        resolution: settings?.resolution ?? defaults.resolution,
        duration:
          typeof settings?.duration === 'number'
            ? settings.duration
            : defaults.duration,
        audioMode: isAudioMode(settings?.audioMode)
          ? settings.audioMode
          : defaults.audioMode,
      },
      modelOption
    )
  );
}

/**
 * Output length that pricing and stored task options must use.
 * Seedance 2.5 with a reference video is always the 15-second source length.
 */
export function generationDurationSeconds(
  modelKey: string | undefined,
  requestedDuration: number,
  hasReferenceVideo: boolean,
  referenceDurationSeconds?: number
): number {
  if (modelKey === 'seedance-2-5' && hasReferenceVideo) {
    return referenceDurationSeconds ?? SEEDANCE_25_REFERENCE_OUTPUT_SECONDS;
  }
  return requestedDuration;
}

/** Round the complete render up once to a whole user credit. */
export function creditsForGeneration(
  modelKey: string | undefined,
  durationSeconds?: number,
  resolution?: string
): number {
  const option = modelOptionFor(modelKey);
  // Invalid keys never get a cheap fallback; request validation rejects them.
  if (!option) {
    const outputSeconds =
      typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)
        ? Math.max(4, Math.min(30, Math.round(durationSeconds)))
        : DEFAULT_DURATION;
    return Math.ceil((93 * outputSeconds) / VIDEO_CREDIT_BASE_SECONDS);
  }
  const prices = option.creditsPer12Seconds as Record<string, number>;
  const base = prices[resolution ?? option.defaultResolution];
  if (base === undefined) throw new Error('Unsupported video resolution');
  const outputSeconds = normalizeDurationForModel(
    option.value,
    durationSeconds
  );
  return Math.ceil((base * outputSeconds) / VIDEO_CREDIT_BASE_SECONDS);
}

/** Friendly name for a picker key or a provider id recorded on a task. */
export function labelForGeneratedModel(modelId: string): string {
  const option = AGENT_MODEL_OPTIONS.find(
    (item) =>
      item.value === modelId ||
      Object.values(item.providers).some(
        (ids) =>
          ids !== null && (ids.model === modelId || ids.imageModel === modelId)
      )
  );
  if (
    modelId === 'minimax-h3' ||
    modelId.startsWith('minimax/hailuo-2.3') ||
    modelId.startsWith('fal-ai/minimax/hailuo-2.3/')
  )
    return 'MiniMax H3';
  return option?.label ?? modelId;
}

export function labelForModelOption(value: string) {
  return modelOptionFor(value)?.label || 'Auto';
}

/** Resolve an explicitly supported provider route. */
export function providerModelFor(
  modelKey: string | undefined,
  provider: VideoProviderName,
  kind: 'generate' | 'animate',
  resolution?: string
): string | undefined {
  const option = modelOptionFor(modelKey);
  if (!option) return undefined;
  const ids = option.providers[provider];
  if (!ids) return undefined;
  return kind === 'animate' ? ids.imageModel : ids.model;
}
