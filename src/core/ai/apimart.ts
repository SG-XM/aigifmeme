import {
  AIConfigs,
  AIGenerateParams,
  AIMediaType,
  AIProvider,
  AITaskResult,
  AITaskStatus,
  AIVideo,
} from './types';

/**
 * APIMart video provider.
 * @docs https://docs.apimart.ai/en/api-reference/videos/seedance-2-0/generation
 * @docs https://docs.apimart.ai/en/api-reference/videos/seedance-2-5/generation
 * @docs https://docs.apimart.ai/en/api-reference/tasks/status
 */
export interface ApiMartConfigs extends AIConfigs {
  apiKey: string;
}

export class ApiMartProvider implements AIProvider {
  readonly name = 'apimart';
  configs: ApiMartConfigs;

  private baseUrl = 'https://api.apimart.ai';

  constructor(configs: ApiMartConfigs) {
    this.configs = configs;
  }

  async generate({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    if (params.mediaType !== AIMediaType.VIDEO) {
      throw new Error(`mediaType not supported: ${params.mediaType}`);
    }
    return this.generateVideo({ params });
  }

  async generateVideo({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    if (!this.configs.apiKey) throw new Error('APIMart API key is required');
    if (!params.model) throw new Error('model is required');
    if (!params.prompt) throw new Error('prompt is required');

    const options = params.options || {};
    const imageUrls = strings(options.image_input);
    const referenceImages = strings(options.reference_image_urls);
    const referenceAudios = strings(options.reference_audio_urls);
    const referenceVideos = strings(options.reference_video_urls);
    if (imageUrls.length > 2) {
      throw new Error('At most two frame images are supported');
    }
    if (
      imageUrls.length &&
      (referenceImages.length ||
        referenceAudios.length ||
        referenceVideos.length)
    ) {
      throw new Error(
        'Frame images and multimodal references cannot be combined'
      );
    }

    // Seedance 2.5 treats a reference video as an edit: size must be adaptive
    // and duration must be -1. First/last-frame jobs also require adaptive.
    // https://docs.apimart.ai/en/api-reference/videos/seedance-2-5/generation
    const followsReferenceVideo =
      referenceVideos.length > 0 && params.model === 'seedance-2.5';
    const size =
      followsReferenceVideo || imageUrls.length
        ? 'adaptive'
        : aspectSize(options.aspect_ratio);
    const payload: Record<string, unknown> = {
      model: params.model,
      prompt: params.prompt,
      size,
      resolution: options.resolution || '720p',
      duration: followsReferenceVideo ? -1 : (options.duration ?? 12),
      generate_audio: options.generate_audio ?? true,
    };
    if (imageUrls.length) {
      payload.image_with_roles = imageUrls.map((url, index) => ({
        url,
        role: index === 0 ? 'first_frame' : 'last_frame',
      }));
    }
    if (referenceImages.length) payload.image_urls = referenceImages;
    if (referenceVideos.length) payload.video_urls = referenceVideos;
    if (referenceAudios.length) payload.audio_urls = referenceAudios;

    const body = await this.request('/v1/videos/generations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const taskId = taskIdFrom(body);
    if (!taskId) throw new Error('generate video failed: no task_id');
    return {
      taskStatus: AITaskStatus.PENDING,
      taskId,
      taskInfo: {},
      taskResult: body,
    };
  }

  async query({ taskId }: { taskId: string }): Promise<AITaskResult> {
    if (!this.configs.apiKey) throw new Error('APIMart API key is required');
    const body = await this.request(`/v1/tasks/${encodeURIComponent(taskId)}`);
    const data = body?.data;
    const status = typeof data?.status === 'string' ? data.status : '';
    if (!status) throw new Error('query failed');
    const videos = videosFrom(data);
    return {
      taskId,
      taskStatus: mapStatus(status),
      taskInfo: {
        videos,
        status,
        errorCode: data?.error?.code ? String(data.error.code) : undefined,
        errorMessage:
          typeof data?.error?.message === 'string'
            ? data.error.message
            : undefined,
        createTime: unixDate(data?.created),
      },
      taskResult: body,
    };
  }

  private async request(path: string, init: RequestInit = {}) {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.configs.apiKey}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.success === false || body?.error) {
      throw new Error(errorMessage(body, resp.status));
    }
    if (typeof body?.code === 'number' && body.code !== 200) {
      throw new Error(errorMessage(body, resp.status));
    }
    return body;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (url): url is string => typeof url === 'string' && !!url.trim()
      )
    : [];
}

function aspectSize(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value === 'auto') {
    return 'adaptive';
  }
  return value === 'adaptive' ? 'adaptive' : value;
}

function taskIdFrom(body: any): string {
  const data = body?.data;
  const task = Array.isArray(data) ? data[0] : data;
  return typeof task?.task_id === 'string' ? task.task_id : '';
}

function videosFrom(data: any): AIVideo[] | undefined {
  const groups = data?.result?.videos;
  if (!Array.isArray(groups)) return undefined;
  const created = unixDate(data?.created);
  const videos: AIVideo[] = [];
  for (const group of groups) {
    const urls = Array.isArray(group?.url)
      ? group.url
      : typeof group?.url === 'string'
        ? [group.url]
        : [];
    for (const url of urls) {
      if (typeof url === 'string' && url.trim()) {
        videos.push({ id: '', createTime: created, videoUrl: url });
      }
    }
  }
  return videos.length ? videos : undefined;
}

function unixDate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000)
    : undefined;
}

function mapStatus(status: string): AITaskStatus {
  switch (status) {
    case 'submitted':
    case 'pending':
    case 'unknown':
      return AITaskStatus.PENDING;
    case 'processing':
      return AITaskStatus.PROCESSING;
    case 'completed':
      return AITaskStatus.SUCCESS;
    case 'failed':
      return AITaskStatus.FAILED;
    case 'cancelled':
    case 'canceled':
      return AITaskStatus.CANCELED;
    default:
      throw new Error(`unknown status: ${status}`);
  }
}

function errorMessage(body: any, status: number) {
  const error = body?.error;
  if (typeof error === 'string' && error) return error;
  if (typeof error?.message === 'string' && error.message) return error.message;
  if (typeof body?.message === 'string' && body.message) return body.message;
  return `request failed with status: ${status}`;
}
