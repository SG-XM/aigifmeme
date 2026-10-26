import {
  AIConfigs,
  AIFile,
  AIGenerateParams,
  AIImage,
  AIMediaType,
  AIProvider,
  AISong,
  AITaskResult,
  AITaskStatus,
  AIVideo,
  SaveFilesFunction,
  UuidFunction,
} from './types';

const defaultUuid: UuidFunction = () => crypto.randomUUID();

/**
 * Kie configs
 * @docs https://kie.ai/
 */
export interface KieConfigs extends AIConfigs {
  apiKey: string;
  customStorage?: boolean;
  saveFiles?: SaveFilesFunction;
  uuid?: UuidFunction;
}

/**
 * Kie provider
 * @docs https://kie.ai/
 */
/** Edit models on Kie read `input.image_urls`. Other image jobs use `image_input`. */
export function kieImageListField(model: string): 'image_urls' | 'image_input' {
  const id = model.toLowerCase();
  if (
    id.includes('nano-banana') ||
    id.endsWith('-edit') ||
    id.includes('/edit')
  ) {
    return 'image_urls';
  }
  return 'image_input';
}

export class KieProvider implements AIProvider {
  readonly name = 'kie';
  configs: KieConfigs;

  private baseUrl = 'https://api.kie.ai/api/v1';

  constructor(configs: KieConfigs) {
    this.configs = configs;
  }

  private getUuid(): string {
    return (this.configs.uuid || defaultUuid)();
  }

  private async trySaveFiles(files: AIFile[]): Promise<AIFile[] | undefined> {
    if (!this.configs.saveFiles) return undefined;
    try {
      return await this.configs.saveFiles(files);
    } catch (error) {
      console.error('save files failed:', error);
      return undefined;
    }
  }

  async generateMusic({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    const apiUrl = `${this.baseUrl}/generate`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.configs.apiKey}`,
    };

    if (!params.model) {
      params.model = 'V5';
    }

    let payload: any = {
      prompt: params.prompt,
      model: params.model,
      callBackUrl: params.callbackUrl,
    };

    if (params.options && params.options.customMode) {
      payload.customMode = true;
      payload.title = params.options.title;
      payload.style = params.options.style;
      payload.instrumental = params.options.instrumental;
      if (!params.options.instrumental) {
        payload.prompt = params.options.lyrics;
      }
    } else {
      payload.customMode = false;
      payload.prompt = params.prompt;
      payload.instrumental = params.options?.instrumental;
    }

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`request failed with status: ${resp.status}`);
    }

    const { code, msg, data } = await resp.json();

    if (code !== 200) {
      throw new Error(`generate music failed: ${msg}`);
    }

    if (!data || !data.taskId) {
      throw new Error(`generate music failed: no taskId`);
    }

    return {
      taskStatus: AITaskStatus.PENDING,
      taskId: data.taskId,
      taskInfo: {},
      taskResult: data,
    };
  }

  async generateImage({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    const apiUrl = `${this.baseUrl}/jobs/createTask`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.configs.apiKey}`,
    };

    if (!params.model) {
      throw new Error('model is required');
    }

    if (!params.prompt) {
      throw new Error('prompt is required');
    }

    let payload: any = {
      model: params.model,
      callBackUrl: params.callbackUrl,
      input: {
        prompt: params.prompt,
      },
    };

    if (params.options) {
      const options = params.options;
      if (
        options.image_input &&
        Array.isArray(options.image_input) &&
        options.image_input.length > 0
      ) {
        // nano-banana-edit and other edit models take image_urls.
        // Older image jobs still use image_input. Video frames stay in
        // generateVideo, which maps image_input to first/last frame urls.
        payload.input[kieImageListField(params.model)] = options.image_input;
      }
      if (options.aspect_ratio) {
        payload.input.aspect_ratio = options.aspect_ratio;
      }
      if (options.resolution) {
        payload.input.resolution = options.resolution;
      }
      if (options.output_format) {
        payload.input.output_format = options.output_format;
      }
    }

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`request failed with status: ${resp.status}`);
    }

    const { code, msg, data } = await resp.json();

    if (code !== 200) {
      throw new Error(`generate image failed: ${msg}`);
    }

    if (!data || !data.taskId) {
      throw new Error(`generate image failed: no taskId`);
    }

    return {
      taskStatus: AITaskStatus.PENDING,
      taskId: data.taskId,
      taskInfo: {},
      taskResult: data,
    };
  }

  async generateVideo({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    const apiUrl = `${this.baseUrl}/jobs/createTask`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.configs.apiKey}`,
    };

    if (!params.model) {
      throw new Error('model is required');
    }

    const options = params.options || {};
    const strings = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter(
            (url): url is string => typeof url === 'string' && !!url.trim()
          )
        : [];
    const imageUrls = strings(options.image_input);
    const referenceImages = strings(options.reference_image_urls);
    const referenceAudios = strings(options.reference_audio_urls);
    const referenceVideos = strings(options.reference_video_urls);
    const isWan =
      params.model === 'wan/3-0-video' ||
      params.model === 'wan/3-0-video-prime';
    if (imageUrls.length > 2)
      throw new Error('At most two frame images are supported');
    if (
      imageUrls.length &&
      (referenceImages.length || referenceAudios.length)
    ) {
      throw new Error(
        'Frame images and multimodal references cannot be combined'
      );
    }
    // Seedance 2.5 treats a reference video as an edit. Kie rejects any other
    // ratio or duration: the output follows the reference clip. Seedance 2.0,
    // Mini, and Fast still accept a fixed ratio and a positive duration.
    const followsReferenceVideo =
      referenceVideos.length > 0 && params.model === 'bytedance/seedance-2-5';
    const input: Record<string, unknown> = {
      prompt: params.prompt,
      aspect_ratio: followsReferenceVideo
        ? 'adaptive'
        : options.aspect_ratio === 'auto'
          ? 'adaptive'
          : options.aspect_ratio || '16:9',
      duration: followsReferenceVideo ? -1 : (options.duration ?? 12),
      resolution: isWan
        ? String(options.resolution || '720p').toUpperCase()
        : options.resolution || '720p',
      ...(isWan
        ? { audio: options.generate_audio ?? true }
        : { generate_audio: options.generate_audio ?? true }),
    };
    if (imageUrls[0]) input.first_frame_url = imageUrls[0];
    if (imageUrls[1]) input.last_frame_url = imageUrls[1];
    if (referenceImages.length) input.reference_image_urls = referenceImages;
    if (referenceAudios.length) input.reference_audio_urls = referenceAudios;
    if (referenceVideos.length) input.reference_video_urls = referenceVideos;

    const payload = {
      model: params.model,
      ...(params.callbackUrl ? { callBackUrl: params.callbackUrl } : {}),
      input,
    };

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`request failed with status: ${resp.status}`);
    }

    const { code, msg, data } = await resp.json();

    if (code !== 200) {
      throw new Error(`generate video failed: ${msg}`);
    }

    if (!data || !data.taskId) {
      throw new Error(`generate video failed: no taskId`);
    }

    return {
      taskStatus: AITaskStatus.PENDING,
      taskId: data.taskId,
      taskInfo: {},
      taskResult: data,
    };
  }

  async generate({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    if (
      ![AIMediaType.MUSIC, AIMediaType.IMAGE, AIMediaType.VIDEO].includes(
        params.mediaType
      )
    ) {
      throw new Error(`mediaType not supported: ${params.mediaType}`);
    }

    if (params.mediaType === AIMediaType.MUSIC) {
      return this.generateMusic({ params });
    } else if (params.mediaType === AIMediaType.IMAGE) {
      return this.generateImage({ params });
    } else if (params.mediaType === AIMediaType.VIDEO) {
      return this.generateVideo({ params });
    }

    throw new Error(`mediaType not supported: ${params.mediaType}`);
  }

  async queryImage({ taskId }: { taskId: string }): Promise<AITaskResult> {
    const apiUrl = `${this.baseUrl}/jobs/recordInfo?taskId=${taskId}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.configs.apiKey}`,
    };

    const resp = await fetch(apiUrl, { method: 'GET', headers });
    if (!resp.ok) {
      throw new Error(`request failed with status: ${resp.status}`);
    }

    const { code, msg, data } = await resp.json();

    if (code !== 200) {
      throw new Error(msg);
    }

    if (!data || !data.state) {
      throw new Error(`query failed`);
    }

    let images: AIImage[] | undefined = undefined;

    if (data.resultJson) {
      const resultJson = JSON.parse(data.resultJson);
      const resultUrls = resultJson.resultUrls;
      if (Array.isArray(resultUrls)) {
        images = resultUrls.map((image: any) => ({
          id: '',
          createTime: new Date(data.createTime),
          imageUrl: image,
        }));
      }
    }

    const taskStatus = this.mapImageStatus(data.state);

    if (
      taskStatus === AITaskStatus.SUCCESS &&
      images &&
      images.length > 0 &&
      this.configs.customStorage
    ) {
      const filesToSave: AIFile[] = [];
      images.forEach((image, index) => {
        if (image.imageUrl) {
          filesToSave.push({
            url: image.imageUrl,
            contentType: 'image/png',
            key: `kie/image/${this.getUuid()}.png`,
            index: index,
            type: 'image',
          });
        }
      });

      if (filesToSave.length > 0) {
        const uploadedFiles = await this.trySaveFiles(filesToSave);
        if (uploadedFiles) {
          uploadedFiles.forEach((file: AIFile) => {
            if (file && file.url && images && file.index !== undefined) {
              const image = images[file.index];
              if (image) {
                image.imageUrl = file.url;
              }
            }
          });
        }
      }
    }

    return {
      taskId,
      taskStatus,
      taskInfo: {
        images,
        status: data.state,
        errorCode: data.failCode,
        errorMessage: data.failMsg,
        createTime: new Date(data.createTime),
      },
      taskResult: data,
    };
  }

  async queryVideo({ taskId }: { taskId: string }): Promise<AITaskResult> {
    const apiUrl = `${this.baseUrl}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.configs.apiKey}`,
    };

    const resp = await fetch(apiUrl, { method: 'GET', headers });
    if (!resp.ok) {
      throw new Error(`request failed with status: ${resp.status}`);
    }

    const { code, msg, data } = await resp.json();

    if (code !== 200) {
      throw new Error(msg);
    }

    if (!data || !data.state) {
      throw new Error(`query failed`);
    }

    let videos: AIVideo[] | undefined = undefined;

    if (data.resultJson) {
      const resultJson =
        typeof data.resultJson === 'string'
          ? JSON.parse(data.resultJson)
          : data.resultJson;
      const resultUrls = resultJson.resultUrls;
      if (Array.isArray(resultUrls)) {
        videos = resultUrls.map((video: any) => ({
          id: '',
          createTime: new Date(data.createTime),
          videoUrl: video,
        }));
      }
    }

    const taskStatus = this.mapImageStatus(data.state);

    if (
      taskStatus === AITaskStatus.SUCCESS &&
      videos &&
      videos.length > 0 &&
      this.configs.customStorage
    ) {
      const filesToSave: AIFile[] = [];
      videos.forEach((video, index) => {
        if (video.videoUrl) {
          filesToSave.push({
            url: video.videoUrl,
            contentType: 'video/mp4',
            key: `kie/video/${this.getUuid()}.mp4`,
            index: index,
            type: 'video',
          });
        }
      });

      if (filesToSave.length > 0) {
        const uploadedFiles = await this.trySaveFiles(filesToSave);
        if (uploadedFiles) {
          uploadedFiles.forEach((file: AIFile) => {
            if (file && file.url && videos && file.index !== undefined) {
              const video = videos[file.index];
              if (video) {
                video.videoUrl = file.url;
              }
            }
          });
        }
      }
    }

    return {
      taskId,
      taskStatus,
      taskInfo: {
        videos,
        status: data.state,
        errorCode: data.failCode,
        errorMessage: data.failMsg,
        createTime: new Date(data.createTime),
      },
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
    if (mediaType === AIMediaType.IMAGE) {
      return this.queryImage({ taskId });
    }

    if (mediaType === AIMediaType.VIDEO) {
      return this.queryVideo({ taskId });
    }

    const apiUrl = `${this.baseUrl}/generate/record-info?taskId=${taskId}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.configs.apiKey}`,
    };

    const resp = await fetch(apiUrl, { method: 'GET', headers });
    if (!resp.ok) {
      throw new Error(`request failed with status: ${resp.status}`);
    }

    const { code, msg, data } = await resp.json();

    if (code !== 200) {
      throw new Error(msg);
    }

    if (!data || !data.status) {
      throw new Error(`query failed`);
    }

    const songs: AISong[] = data?.response?.sunoData?.map((song: any) => ({
      id: song.id,
      createTime: new Date(song.createTime),
      audioUrl: song.audioUrl,
      imageUrl: song.imageUrl,
      duration: song.duration,
      prompt: song.prompt,
      title: song.title,
      tags: song.tags,
      style: song.style,
      model: song.modelName,
      artist: song.artist,
      album: song.album,
    }));

    const taskStatus = this.mapStatus(data.status);

    if (
      taskStatus === AITaskStatus.SUCCESS &&
      songs &&
      songs.length > 0 &&
      this.configs.customStorage
    ) {
      const audioFilesToSave: AIFile[] = [];
      const imageFilesToSave: AIFile[] = [];

      songs.forEach((song, index) => {
        if (song.audioUrl) {
          audioFilesToSave.push({
            url: song.audioUrl,
            contentType: 'audio/mpeg',
            key: `kie/audio/${this.getUuid()}.mp3`,
            index: index,
            type: 'audio',
          });
        }
        if (song.imageUrl) {
          imageFilesToSave.push({
            url: song.imageUrl,
            contentType: 'image/png',
            key: `kie/image/${this.getUuid()}.png`,
            index: index,
            type: 'image',
          });
        }
      });

      if (audioFilesToSave.length > 0) {
        const uploadedFiles = await this.trySaveFiles(audioFilesToSave);
        if (uploadedFiles) {
          uploadedFiles.forEach((file: AIFile) => {
            if (file && file.url && songs && file.index !== undefined) {
              const song = songs[file.index];
              song.audioUrl = file.url;
            }
          });
        }
      }

      if (imageFilesToSave.length > 0) {
        const uploadedFiles = await this.trySaveFiles(imageFilesToSave);
        if (uploadedFiles) {
          uploadedFiles.forEach((file: AIFile) => {
            if (file && file.url && songs && file.index !== undefined) {
              const song = songs[file.index];
              song.imageUrl = file.url;
            }
          });
        }
      }
    }

    return {
      taskId,
      taskStatus,
      taskInfo: {
        songs,
        status: data.status,
        errorCode: data.errorCode,
        errorMessage: data.errorMessage,
        createTime: new Date(data.createTime),
      },
      taskResult: data,
    };
  }

  private mapImageStatus(status: string): AITaskStatus {
    switch (status) {
      case 'waiting':
        return AITaskStatus.PENDING;
      case 'queuing':
        return AITaskStatus.PENDING;
      case 'generating':
        return AITaskStatus.PROCESSING;
      case 'success':
        return AITaskStatus.SUCCESS;
      case 'fail':
        return AITaskStatus.FAILED;
      default:
        throw new Error(`unknown status: ${status}`);
    }
  }

  private mapStatus(status: string): AITaskStatus {
    switch (status) {
      case 'PENDING':
        return AITaskStatus.PENDING;
      case 'TEXT_SUCCESS':
        return AITaskStatus.PROCESSING;
      case 'FIRST_SUCCESS':
        return AITaskStatus.PROCESSING;
      case 'SUCCESS':
        return AITaskStatus.SUCCESS;
      case 'CREATE_TASK_FAILED':
      case 'GENERATE_AUDIO_FAILED':
      case 'CALLBACK_EXCEPTION':
      case 'SENSITIVE_WORD_ERROR':
        return AITaskStatus.FAILED;
      default:
        throw new Error(`unknown status: ${status}`);
    }
  }
}
