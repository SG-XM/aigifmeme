import {
  GIF_PACK_IMAGE_MODEL,
  GIF_PACK_IMAGE_QUALITY,
  GIF_PACK_IMAGE_SIZE,
} from '@/lib/gif-pack/options';
import {
  assertPublicProviderBase,
  providerEditsUrl,
} from '@/lib/gif-pack/ssrf';

export type GifPackProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: typeof GIF_PACK_IMAGE_MODEL;
};

function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

/**
 * Admin DB values override worker secrets. Empty model means the pin.
 * Any other model refuses the call. There is no fallback model or endpoint.
 */
export function resolveGifPackProvider(
  configs: Record<string, string | undefined>
): GifPackProviderConfig {
  const model = clean(configs.gif_pack_image_model) || GIF_PACK_IMAGE_MODEL;
  if (model !== GIF_PACK_IMAGE_MODEL) {
    throw new Error(
      `GIF pack image model is pinned to ${GIF_PACK_IMAGE_MODEL}`
    );
  }
  const baseUrl =
    clean(configs.gif_pack_base_url) || 'https://api.aigifmeme.com/v1';
  assertPublicProviderBase(baseUrl);
  const apiKey = clean(configs.gif_pack_api_key);
  if (!apiKey) throw new Error('GIF pack provider API key is not configured');
  return { baseUrl, apiKey, model };
}

export function assertGifPackSetting(name: string, value: string) {
  if (name === 'gif_pack_base_url' && value.trim()) {
    assertPublicProviderBase(value);
  }
  if (
    name === 'gif_pack_image_model' &&
    value.trim() &&
    value.trim() !== GIF_PACK_IMAGE_MODEL
  ) {
    throw new Error(
      `GIF pack image model is pinned to ${GIF_PACK_IMAGE_MODEL}`
    );
  }
}

export function imageEditRequest(
  png: Uint8Array,
  prompt: string,
  filename: string
) {
  let binary = '';
  for (const byte of png) binary += String.fromCharCode(byte);
  return {
    model: GIF_PACK_IMAGE_MODEL,
    prompt,
    n: 1,
    size: GIF_PACK_IMAGE_SIZE,
    quality: GIF_PACK_IMAGE_QUALITY,
    response_format: 'b64_json' as const,
    images: [
      {
        b64_json: btoa(binary),
        mime_type: 'image/png',
        filename,
      },
    ],
  };
}

function safeProviderMessage(
  status: number,
  body: string,
  secret: string
): string {
  const clipped = body
    .replaceAll(secret, '[redacted]')
    .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_\-]{24,}/g, '[redacted]')
    .slice(0, 180);
  return `Image provider returned HTTP ${status}. ${clipped}`.trim();
}

/**
 * Reference edits use the wrapper's JSON /v1/images/edits contract
 * (chatgpt2api v1.7.0, git 1f96b49): inline b64_json, n=1, no remote image URL.
 * Plain /images/generations is text-only in that build and is not a fallback.
 */
let fetchOverride: typeof fetch | null = null;

/** Tests inject a fake fetch. Production uses the platform fetch. */
export function setGifPackFetch(fetchImpl: typeof fetch | null) {
  fetchOverride = fetchImpl;
}

export async function requestImageEdit(
  config: GifPackProviderConfig,
  png: Uint8Array,
  prompt: string,
  filename: string,
  fetchImpl: (
    input: string,
    init?: RequestInit
  ) => Promise<Response> = fetchOverride ?? fetch
): Promise<Uint8Array> {
  if (config.model !== GIF_PACK_IMAGE_MODEL) {
    throw new Error(
      `GIF pack image model is pinned to ${GIF_PACK_IMAGE_MODEL}`
    );
  }
  const endpoint = providerEditsUrl(config.baseUrl);
  const body = imageEditRequest(png, prompt, filename);
  if (body.model !== GIF_PACK_IMAGE_MODEL) {
    throw new Error(
      `GIF pack image model is pinned to ${GIF_PACK_IMAGE_MODEL}`
    );
  }
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error('Image provider redirect was refused');
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(safeProviderMessage(response.status, text, config.apiKey));
  }
  let parsed: { data?: Array<{ b64_json?: string }> };
  try {
    parsed = JSON.parse(text) as { data?: Array<{ b64_json?: string }> };
  } catch {
    throw new Error('Image provider returned invalid JSON');
  }
  const encoded = parsed.data?.[0]?.b64_json;
  if (!encoded)
    throw new Error('Image provider response did not include b64_json');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  if (!bytes.byteLength)
    throw new Error('Image provider returned an empty image');
  return bytes;
}
