import { createAgent } from '@codeany/open-agent-sdk';

import { envConfigs } from '@/config';
import { getAllConfigs } from '@/modules/config/service';
import type { AgentGenerationSettings } from '@/lib/agent-settings';
import {
  normalizeAnthropicBaseUrl,
  normalizeOpenAIBaseUrl,
} from '@/lib/llm-base-url';

import { loadAgentHistory } from './history';
import { createAgentTools } from './tools';

// In-process runtime for the Video Agent chat, replacing the remote
// FastClaw runtime the Next.js version proxied to. Each request creates a
// fresh Agent seeded with the conversation replayed from the database, runs
// one turn, and emits the same event shapes the old runtime streamed:
// content / tool_call / tool_result / error / done.
//
// Nothing here touches a filesystem: history comes from `chat_message` and
// generated clips go to object storage, so the whole runtime works on
// Cloudflare Workers.

export interface AgentStreamEvent {
  type: 'content' | 'tool_call' | 'tool_result' | 'error' | 'done';
  data?: Record<string, unknown>;
}

function systemPrompt(appName: string) {
  const name = appName.trim() || 'the assistant';
  return `You are ${name}, an AI video-generation assistant. You help users create video clips through conversation.

Rules:
- Understand the user's intent, then call generate_video (text-to-video) or animate_image (when the user provides a still image to bring to life, or refers to one already in the conversation).
- "Attached media" lists what the user supplied, not how it must be used. You decide the correct tool parameters from the user's words and the conversation; do not ask them to classify uploads as frames or references when their intent is reasonably inferable.
- For an attached image: use animate_image when the user asks to animate it, make it move, or explicitly calls images the first/opening and last/ending frames. Preserve attachment order when passing multiple images. Use generate_video reference_images when the image is described as visual, character, object, composition, or style guidance instead of a frame.
- Pass attached audio to generate_video as reference_audios when it should guide sound or rhythm. Video references are not included in the current pricing; ask the user to use text or still images instead.
- Legacy messages may use "Attached frames", "Attached images", or parameter-specific reference headings; honor those explicit roles.
- Write video prompts in English, enriching the user's request with useful cinematic detail — subject, action, camera movement, lens, lighting, pacing and mood — but never changing their intent.
- A clip is one shot, not a montage. If the user describes a sequence, either pick the strongest single shot or generate the shots one at a time, saying which is which.
- Reply to the user in the language they used.
- Rendering takes a few minutes. Call the tool once and wait for it; never retry a call that has not returned yet.
- The only valid model keys are seedance-2-mini (Standard), seedance-2-fast (Fast), seedance-2 (Pro) and seedance-2-5 (Ultra). Leave the model argument empty unless the user explicitly asks to switch.
- After a tool returns generated files, the chat already shows the clip with a player. Reference it as a markdown link, e.g. [clip](<url>), and never paste the raw URL as plain text or embed it as a markdown image.
- If a tool returns an error, explain it briefly and suggest what the user can do (e.g. top up credits, shorten the clip, try a simpler prompt). Never invent file paths.`;
}

export interface RunAgentTurnParams {
  sessionId: string;
  userId: string;
  message: string;
  settings?: AgentGenerationSettings;
  signal?: AbortSignal;
}

type LlmProvider = 'openai' | 'anthropic';

interface LlmSetup {
  provider: LlmProvider;
  apiKey: string;
  baseURL?: string;
  apiType: 'openai-completions' | 'anthropic-messages';
  model: string;
}

/**
 * Resolve which LLM the agent talks to, entirely from Admin Settings.
 *
 * `default_llm_provider` picks the card whose credentials are used; `auto`
 * prefers OpenAI and falls back to Anthropic. The protocol follows from that
 * choice rather than being guessed from the URL — an OpenAI-compatible
 * gateway can live on any host.
 */
function resolveLlm(configs: Record<string, string>): LlmSetup | null {
  const openaiKey = configs.openai_api_key?.trim();
  const anthropicKey = configs.anthropic_api_key?.trim();
  const preference = configs.default_llm_provider?.trim() || 'auto';

  // Either preference still falls back to the other card, so a missing key
  // degrades to "whatever is configured" instead of a dead agent.
  const order: LlmProvider[] =
    preference === 'anthropic'
      ? ['anthropic', 'openai']
      : ['openai', 'anthropic'];

  const provider = order.find((name) =>
    name === 'openai' ? openaiKey : anthropicKey
  );
  if (!provider) return null;

  const model = configs.agent_model?.trim();
  if (provider === 'anthropic') {
    return {
      provider,
      apiKey: anthropicKey!,
      baseURL: normalizeAnthropicBaseUrl(configs.anthropic_base_url),
      apiType: 'anthropic-messages',
      model: model || 'claude-sonnet-4-6',
    };
  }
  return {
    provider,
    apiKey: openaiKey!,
    baseURL: normalizeOpenAIBaseUrl(configs.openai_base_url),
    apiType: 'openai-completions',
    model,
  };
}

/** Whether an LLM provider is configured in Admin Settings. */
export async function isAgentConfigured(): Promise<boolean> {
  return resolveLlm(await getAllConfigs()) !== null;
}

/**
 * Run one chat turn through the in-process agent loop, yielding stream
 * events as they happen.
 */
export async function* runAgentTurn(
  params: RunAgentTurnParams
): AsyncGenerator<AgentStreamEvent> {
  const { sessionId, userId, message, settings, signal } = params;

  const configs = await getAllConfigs();
  const llm = resolveLlm(configs);

  if (!llm) {
    yield {
      type: 'error',
      data: {
        message:
          'The chat model is not configured: add an OpenAI or Anthropic API key under Admin Settings → AI.',
      },
    };
    yield { type: 'done' };
    return;
  }

  if (!llm.model) {
    yield {
      type: 'error',
      data: {
        message:
          'No chat model set: fill in Admin Settings → AI → Chat Model → Model (OpenAI-compatible endpoints have no safe default).',
      },
    };
    yield { type: 'done' };
    return;
  }

  // Stateless: the transcript comes from the database and goes back to it
  // (the chat route persists each round), so the SDK never reads or writes
  // session files — there's no disk to write to on Workers.
  const history = await loadAgentHistory(sessionId, userId);

  const agent = createAgent({
    model: llm.model,
    apiKey: llm.apiKey,
    baseURL: llm.baseURL,
    apiType: llm.apiType,
    sessionId,
    history,
    persistSession: false,
    systemPrompt: systemPrompt(configs.app_name || envConfigs.app_name),
    tools: createAgentTools({ userId, sessionId, settings }),
    maxTurns: 12,
    permissionMode: 'bypassPermissions',
    abortSignal: signal,
  });

  try {
    for await (const msg of agent.query(
      withGenerationSettings(message, settings)
    )) {
      if (signal?.aborted) break;
      switch (msg.type) {
        case 'assistant': {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              yield { type: 'content', data: { content: block.text } };
            } else if (block.type === 'tool_use') {
              yield {
                type: 'tool_call',
                data: {
                  id: block.id,
                  name: block.name,
                  arguments: JSON.stringify(block.input ?? {}),
                },
              };
            }
          }
          break;
        }
        case 'tool_result': {
          yield {
            type: 'tool_result',
            data: {
              id: msg.result.tool_use_id,
              name: msg.result.tool_name,
              result: msg.result.output,
            },
          };
          break;
        }
        case 'result': {
          // The engine's failure results don't always set is_error (a plain
          // `subtype: 'error'` is emitted when the LLM call fails after
          // retries) — treat any non-success subtype as an error.
          if (msg.is_error || msg.subtype !== 'success') {
            const errors = Array.isArray(msg.errors)
              ? msg.errors.filter(Boolean).map(String)
              : [];
            yield {
              type: 'error',
              data: {
                message:
                  errors.join('; ') ||
                  String(msg.result || '') ||
                  `agent run failed (${msg.subtype})`,
              },
            };
          }
          break;
        }
        default:
          break;
      }
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError' && !signal?.aborted) {
      yield {
        type: 'error',
        data: { message: String(err?.message ?? err) },
      };
    }
  } finally {
    // Closes MCP links and drops the engine; persistence is the database's
    // job (persistSession: false), so nothing is written here.
    await agent.close().catch(() => {});
  }

  yield { type: 'done' };
}

function withGenerationSettings(
  message: string,
  settings: AgentGenerationSettings | undefined
) {
  if (
    !settings?.modelName &&
    !settings?.aspectRatio &&
    !settings?.resolution &&
    !settings?.duration
  )
    return message;
  const lines = [
    '',
    'UI generation settings:',
    // The tools resolve this name to whatever id the active provider uses —
    // the agent should pass the name through, not invent a provider id.
    settings.modelName
      ? `- The user picked the "${settings.modelName}" video model. Leave the \`model\` argument of generate_video/animate_image empty so it is used, unless the user explicitly asks for a different model.`
      : '',
    settings.aspectRatio
      ? `- Use aspect_ratio "${settings.aspectRatio}" when calling generate_video or animate_image unless the user explicitly asks for a different aspect ratio.`
      : '',
    settings.duration
      ? `- Generate ${settings.duration}-second clips unless the user explicitly asks for a different length.`
      : '',
    settings.resolution
      ? `- Target ${settings.resolution} output. If the selected video model supports a resolution parameter, use it; otherwise incorporate "${settings.resolution}, sharp detail, clean motion" into the video prompt.`
      : '',
    settings.creditCost
      ? `- The selected model costs ${settings.creditCost} credits for a clip of this length.`
      : '',
  ].filter(Boolean);
  return `${message}\n\n${lines.join('\n')}`;
}
