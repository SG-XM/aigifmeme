import {
  AIConfigs,
  AIGenerateParams,
  AIImage,
  AIMediaType,
  AIProvider,
  AITaskResult,
  AITaskStatus,
  AIVideo,
} from './types';

/**
 * gRouter configs
 * @docs <base_url>/docs (e.g. http://localhost:5173/docs)
 */
export interface GRouterConfigs extends AIConfigs {
  apiKey: string;
  /** Gateway API root, e.g. `http://localhost:8080/api/v1` */
  baseUrl: string;
  /** Sent as `X-App-Name`/`X-App-URL` so calls are attributable in the
   *  gateway's call log. */
  appName?: string;
  appUrl?: string;
}

/**
 * gRouter provider — an OpenAI-compatible gateway that fans a single model
 * name out to whichever upstream providers the admin configured.
 *
 * `POST /images/generations` covers both directions: with `image` (a gateway
 * extension — an http(s) URL or data URI, or an array of them) the request
 * switches to edit mode and the gateway routes it to the upstream edit model
 * configured for that route.
 *
 * By default we use the gateway's other extension, `"async": true`: the POST
 * returns a task envelope immediately and the task is polled via
 * `GET /images/generations/{id}`. Slow image models otherwise hold a request
 * open long enough to hit proxy timeouts.
 */
export class GRouterProvider implements AIProvider {
  readonly name = 'grouter';
  configs: GRouterConfigs;

  constructor(configs: GRouterConfigs) {
    this.configs = configs;
  }

  /**
   * Accepts either the full API root (`http://host:8080/api/v1`) or a bare
   * origin (`http://host:8080`), which gets the default `/api/v1` path.
   */
  private apiRoot(): string {
    const raw = String(this.configs.baseUrl ?? '').trim();
    if (!raw) throw new Error('grouter base url is not configured');
    const trimmed = raw.replace(/\/+$/, '');
    try {
      const url = new URL(trimmed);
      if (url.pathname === '' || url.pathname === '/') {
        return `${url.origin}/api/v1`;
      }
    } catch {
      throw new Error(`grouter base url is not a valid URL: ${raw}`);
    }
    return trimmed;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.configs.apiKey}`,
      ...(this.configs.appName ? { 'X-App-Name': this.configs.appName } : {}),
      ...(this.configs.appUrl ? { 'X-App-URL': this.configs.appUrl } : {}),
    };
  }

  private async fetchJson(
    url: string,
    init: RequestInit,
    label: string
  ): Promise<any> {
    const resp = await fetch(url, init);
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(
        `${label} failed: ${describeGatewayError(text, resp.status)}`
      );
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${label} returned invalid JSON: ${text.slice(0, 500)}`);
    }
  }

  async generate({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    const { model, prompt, options } = params;
    if (!model) throw new Error('model is required');
    if (!prompt) throw new Error('prompt is required');
    const isVideo = params.mediaType === AIMediaType.VIDEO;

    // Async by default; `async: false` holds the connection open and returns
    // the finished media in one call (used by the image settings test).
    const wantAsync = params.async !== false;
    const body: Record<string, unknown> = {
      model,
      prompt,
      ...(wantAsync ? { async: true } : {}),
      ...(isVideo ? formatVideoOptions(options) : formatImageOptions(options)),
    };

    const data = await this.fetchJson(
      `${this.apiRoot()}/${isVideo ? 'videos' : 'images'}/generations`,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
      `gRouter generate (${model})`
    );

    if (!wantAsync) {
      if (isVideo) {
        const videos = extractVideos(data?.data ?? data?.result ?? data);
        if (videos.length === 0) {
          throw new Error('generate failed: no video in response');
        }
        return {
          taskStatus: AITaskStatus.SUCCESS,
          taskId: '',
          taskInfo: { status: 'completed', videos },
          taskResult: data,
        };
      }

      const images = extractImages(data);
      if (images.length === 0) {
        throw new Error('generate failed: no image in response');
      }
      return {
        taskStatus: AITaskStatus.SUCCESS,
        taskId: '',
        taskInfo: { status: 'completed', images },
        taskResult: data,
      };
    }

    if (!data?.id) throw new Error('generate failed: no task id');

    return {
      taskStatus: mapStatus(data.status),
      taskId: String(data.id),
      taskInfo: { status: data.status },
      taskResult: data,
    };
  }

  async query({
    taskId,
    mediaType,
  }: {
    taskId: string;
    mediaType?: AIMediaType;
  }): Promise<AITaskResult> {
    const isVideo = mediaType === AIMediaType.VIDEO;
    const data = await this.fetchJson(
      `${this.apiRoot()}/${isVideo ? 'videos' : 'images'}/generations/${encodeURIComponent(taskId)}`,
      { method: 'GET', headers: this.headers() },
      `gRouter task (${taskId})`
    );

    const taskStatus = mapStatus(data?.status);
    const images = isVideo ? [] : extractImages(data?.result);
    const videos = isVideo
      ? extractVideos(data?.data ?? data?.result ?? data)
      : [];

    return {
      taskId,
      taskStatus,
      taskInfo: {
        status: data?.status,
        images: images.length > 0 ? images : undefined,
        videos: videos.length > 0 ? videos : undefined,
        errorMessage: data?.error ? formatGatewayError(data.error) : '',
        errorCode: data?.error?.type || '',
      },
      taskResult: data,
    };
  }

  async cancel({
    taskId,
    mediaType,
  }: {
    taskId: string;
    mediaType?: string;
  }): Promise<void> {
    const isVideo = mediaType === AIMediaType.VIDEO;
    await this.fetchJson(
      `${this.apiRoot()}/${isVideo ? 'videos' : 'images'}/generations/${encodeURIComponent(taskId)}`,
      { method: 'DELETE', headers: this.headers() },
      `gRouter cancel (${taskId})`
    );
  }
}

/** Pull video URLs out of the gateway's completed task payload. */
function extractVideos(payload: any): AIVideo[] {
  const urls = new Set<string>();

  function collect(value: any): void {
    if (!value) return;
    if (typeof value === 'string') {
      if (/^(https?:\/\/|data:video\/)/.test(value)) urls.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value !== 'object') return;

    for (const key of ['url', 'video_url', 'videoUrl']) {
      if (typeof value[key] === 'string') collect(value[key]);
    }
    for (const key of ['data', 'result', 'output', 'video', 'videos']) {
      if (value[key] !== value) collect(value[key]);
    }
  }

  collect(payload);
  return [...urls].map((videoUrl) => ({
    id: '',
    createTime: new Date(),
    videoUrl,
  }));
}

/**
 * Pull images out of an OpenAI Images payload (`{ data: [{ url }] }`) — the
 * body of a sync response and the `result` of a completed async task.
 * Models that return base64 instead of a URL become data URIs.
 */
function extractImages(payload: any): AIImage[] {
  if (!Array.isArray(payload?.data)) return [];
  return payload.data
    .map((item: any) => {
      const url =
        item?.url ||
        (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
      return { id: '', createTime: new Date(), imageUrl: url };
    })
    .filter((image: AIImage) => !!image.imageUrl);
}

/**
 * The gateway returns failures as a structured object:
 * `{ message, type, code, provider, errors? }` — `message` is already one
 * readable sentence, `code` is the upstream HTTP status and `provider` names
 * the upstream that refused. Compose them into a single line for the agent.
 */
function formatGatewayError(error: any): string {
  if (typeof error === 'string') return error.trim() || 'request failed';
  const message = String(error?.message ?? '').trim() || 'request failed';
  const parts: string[] = [];
  if (error?.provider) parts.push(String(error.provider));
  if (error?.code) parts.push(`status ${error.code}`);
  if (error?.type && error.type !== 'upstream_error') {
    parts.push(String(error.type));
  }
  return parts.length > 0 ? `${message} (${parts.join(', ')})` : message;
}

/** Same, for an HTTP error body that may not be JSON at all. */
function describeGatewayError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error) return formatGatewayError(parsed.error);
  } catch {
    // not JSON — fall through to the raw body
  }
  const trimmed = body.trim().slice(0, 300);
  return trimmed ? `status ${status}: ${trimmed}` : `status ${status}`;
}

function mapStatus(status: unknown): AITaskStatus {
  switch (String(status ?? '')) {
    case 'completed':
      return AITaskStatus.SUCCESS;
    case 'failed':
      return AITaskStatus.FAILED;
    case 'canceled':
    case 'cancelled':
      return AITaskStatus.CANCELED;
    case 'in_progress':
      return AITaskStatus.PROCESSING;
    default:
      return AITaskStatus.PENDING;
  }
}

/**
 * The agent tools speak in aspect ratios; the Images API speaks in pixel
 * sizes. Only the ratios OpenAI-compatible image models actually accept are
 * mapped — anything else is left out so the model applies its own default.
 */
const SIZE_BY_ASPECT_RATIO: Record<string, string> = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '16:9': '1536x1024',
  '4:3': '1536x1024',
  '2:3': '1024x1536',
  '9:16': '1024x1536',
  '3:4': '1024x1536',
};

function formatImageOptions(options: any): Record<string, unknown> {
  if (!options || typeof options !== 'object') return {};
  const out: Record<string, unknown> = {};

  // `image_input` is the normalized source-image key every provider in this
  // repo speaks; the gateway calls it `image` and switches to edit mode when
  // it is present.
  if (Array.isArray(options.image_input) && options.image_input.length > 0) {
    out.image = options.image_input;
  }
  if (typeof options.size === 'string' && options.size) {
    out.size = options.size;
  } else if (typeof options.aspect_ratio === 'string') {
    const size = SIZE_BY_ASPECT_RATIO[options.aspect_ratio];
    if (size) out.size = size;
  }
  if (typeof options.n === 'number') out.n = options.n;
  if (typeof options.quality === 'string' && options.quality) {
    out.quality = options.quality;
  }
  if (typeof options.output_format === 'string' && options.output_format) {
    out.output_format = options.output_format;
  }

  return out;
}

/** Map normalized video options to gRouter's video generation API. */
function formatVideoOptions(options: any): Record<string, unknown> {
  if (!options || typeof options !== 'object') return {};
  const out: Record<string, unknown> = {};

  if (
    (typeof options.duration === 'string' && options.duration !== 'auto') ||
    typeof options.duration === 'number'
  ) {
    out.duration = options.duration;
  }
  if (typeof options.size === 'string' && options.size) {
    out.size = options.size;
  }
  if (typeof options.aspect_ratio === 'string' && options.aspect_ratio) {
    out.aspect_ratio = options.aspect_ratio;
  }
  if (typeof options.resolution === 'string' && options.resolution) {
    out.resolution = options.resolution;
  }
  if (typeof options.generate_audio === 'boolean') {
    out.generate_audio = options.generate_audio;
  }

  const imageInput = Array.isArray(options.image_input)
    ? options.image_input.filter(Boolean)
    : [];
  if (imageInput[0]) out.first_image_url = imageInput[0];
  if (imageInput[1]) out.last_image_url = imageInput[1];

  for (const key of [
    'mode',
    'first_image_url',
    'last_image_url',
    'reference_image_urls',
    'reference_audio_urls',
    'reference_video_urls',
    'params',
  ]) {
    if (options[key] !== undefined) out[key] = options[key];
  }

  return out;
}
