/**
 * Base-URL normalization for the two LLM protocols.
 *
 * The two APIs disagree about where `/v1` belongs: an OpenAI base URL includes
 * it (`https://api.openai.com/v1` + `/chat/completions`), an Anthropic one does
 * not (`https://api.anthropic.com` + `/v1/messages`). Gateways get pasted in
 * both shapes, so accept either and fix it up rather than 404.
 */

/** Anthropic clients append `/v1/messages`, so the base must stop short of `/v1`. */
export function normalizeAnthropicBaseUrl(
  baseUrl: string | undefined
): string | undefined {
  const trimmed = trimSlashes(baseUrl);
  return trimmed ? trimmed.replace(/\/v1$/, '') : undefined;
}

/**
 * OpenAI clients append `/chat/completions`, so the base must carry the version.
 *
 * Only bare hosts and the one URL OpenRouter's own docs invite people to
 * mistype get a `/v1` — any other path is assumed deliberate, since gateways
 * are free to mount the API wherever they like.
 */
export function normalizeOpenAIBaseUrl(
  baseUrl: string | undefined
): string | undefined {
  const trimmed = trimSlashes(baseUrl);
  if (!trimmed) return undefined;
  if (trimmed === 'https://openrouter.ai/api') return `${trimmed}/v1`;
  return pathOf(trimmed) === '' ? `${trimmed}/v1` : trimmed;
}

function trimSlashes(baseUrl: string | undefined): string {
  return baseUrl?.trim().replace(/\/+$/, '') ?? '';
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}
