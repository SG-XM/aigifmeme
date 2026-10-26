import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { checkCredits, insufficientCreditsBody } from '@/modules/agent/paywall';
import { runAgentTurn } from '@/modules/agent/service';
import {
  appendMessage,
  ensureChat,
  type StoredPart,
} from '@/modules/chats/service';
import {
  getBalance,
  requireCurrentCreditPricing,
} from '@/modules/credits/service';
import { getCurrentSubscription } from '@/modules/subscriptions/service';
import { isAgentSessionId } from '@/lib/agent';
import {
  normalizeClientGenerationSettings,
  type AgentGenerationSettings,
} from '@/lib/agent-settings';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';

const MAX_AGENT_MESSAGE_CHARS = 50_000;

interface ChatRequest {
  sessionId: string;
  message: string;
  settings?: AgentGenerationSettings;
}

async function POST({ request }: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 2000,
    keyPrefix: 'agent-chat',
  });
  if (limited) return limited;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = session.user.id;

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (!body?.sessionId || !body?.message) {
    return new Response('sessionId and message are required', { status: 400 });
  }
  if (body.message.length > MAX_AGENT_MESSAGE_CHARS) {
    return new Response('message is too long', { status: 413 });
  }
  if (!isAgentSessionId(body.sessionId)) {
    return new Response('invalid sessionId', { status: 400 });
  }

  const generationSettings = normalizeClientGenerationSettings(body.settings);
  if (!generationSettings) {
    return new Response('unsupported video model', { status: 400 });
  }

  try {
    await requireCurrentCreditPricing();
  } catch {
    return new Response('Credit pricing setup is required', { status: 503 });
  }

  // Gate on credits before spending anything.
  const verdict = checkCredits({
    modelName: generationSettings.modelName,
    duration: generationSettings.duration,
    resolution: generationSettings.resolution,
    balance: await getBalance(userId),
  });
  if (!verdict.allowed) {
    const subscribed = Boolean(await getCurrentSubscription(userId));
    return new Response(
      JSON.stringify(insufficientCreditsBody(verdict, subscribed)),
      { status: 402, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Persist the user turn before running the agent — that way the message
  // is recoverable even if the agent loop errors mid-stream.
  await ensureChat({
    chatId: body.sessionId,
    userId,
    seedMessage: body.message,
  });
  await appendMessage({
    chatId: body.sessionId,
    userId,
    role: 'user',
    parts: [{ type: 'text', text: body.message }],
  });

  // Server-side reducer mirrors the chat UI's grouping: one "round" is
  // either a tool-group (text preamble + one or more tool_calls with their
  // results) or a final assistant reply (text-only). When the stream ends
  // each round is persisted as its own chat_message row so replay renders
  // the same shapes the live UI does.
  type Round = StoredPart[];
  const rounds: Round[] = [];
  let current: Round = [];

  const hasToolCall = (round: Round) =>
    round.some((p) => p.type === 'tool_call');

  const reduceContent = (text: string) => {
    if (!text) return;
    // Content after a tool round opens a new round (the tool round is done).
    if (hasToolCall(current)) {
      rounds.push(current);
      current = [];
    }
    const last = current[current.length - 1];
    if (last && last.type === 'text') last.text += text;
    else current.push({ type: 'text', text });
  };

  const reduceToolCall = (id: string, name: string, args: string) => {
    current.push({ type: 'tool_call', id, name, arguments: args });
  };

  const reduceToolResult = (id: string, result: string) => {
    const targets = [current, ...rounds.slice().reverse()];
    for (const round of targets) {
      for (let i = round.length - 1; i >= 0; i--) {
        const p = round[i];
        if (p.type === 'tool_call' && p.id === id) {
          p.result = result;
          return;
        }
      }
    }
  };

  const markPendingToolsCanceled = () => {
    const result = JSON.stringify({
      status: 'canceled',
      message: 'Generation stopped by the user.',
    });
    for (const round of [...rounds, current]) {
      for (const part of round) {
        if (part.type === 'tool_call' && part.result === undefined) {
          part.result = result;
        }
      }
    }
  };

  const persistRounds = async () => {
    if (current.length > 0) {
      rounds.push(current);
      current = [];
    }
    for (const round of rounds) {
      if (round.length === 0) continue;
      try {
        await appendMessage({
          chatId: body.sessionId,
          userId,
          role: 'assistant',
          parts: round,
        });
      } catch (err) {
        // Persistence failures shouldn't blow up the stream — log and
        // continue so the user still sees the response in-page.
        console.error('[agent chat] failed to persist round', err);
      }
    }
  };

  const encoder = new TextEncoder();
  const runController = new AbortController();
  if (request.signal.aborted) runController.abort();
  else {
    request.signal.addEventListener('abort', () => runController.abort(), {
      once: true,
    });
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (evt: { type: string; data?: Record<string, unknown> }) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(evt)}\n\n`)
          );
        } catch {
          // The client has already stopped reading the stream.
        }
      };

      try {
        for await (const evt of runAgentTurn({
          sessionId: body.sessionId,
          userId,
          message: body.message,
          settings: generationSettings,
          signal: runController.signal,
        })) {
          switch (evt.type) {
            case 'content': {
              // Generated files are public storage URLs now — nothing to
              // rewrite, the model embeds them as-is.
              const content = String(evt.data?.content ?? '');
              reduceContent(content);
              emit({ type: 'content', data: { content } });
              break;
            }
            case 'tool_call': {
              const id = String(evt.data?.id ?? '');
              if (id) {
                reduceToolCall(
                  id,
                  String(evt.data?.name ?? ''),
                  String(evt.data?.arguments ?? '{}')
                );
              }
              emit(evt);
              break;
            }
            case 'tool_result': {
              const id = String(evt.data?.id ?? '');
              if (id) reduceToolResult(id, String(evt.data?.result ?? ''));
              emit(evt);
              break;
            }
            case 'error': {
              // Persist failures too — otherwise a turn that died (bad
              // provider key, LLM outage) replays as an empty chat and looks
              // like nothing ever happened.
              reduceContent(
                `\n\n[error] ${String(evt.data?.message ?? 'unknown error')}\n\n`
              );
              emit(evt);
              break;
            }
            default:
              emit(evt);
          }
        }
      } catch (err: any) {
        if (!runController.signal.aborted) {
          emit({
            type: 'error',
            data: { message: String(err?.message ?? err) },
          });
        }
      } finally {
        if (runController.signal.aborted) markPendingToolsCanceled();
        await persistRounds();
        try {
          controller.close();
        } catch {
          // Already canceled by the response consumer.
        }
      }
    },
    cancel() {
      runController.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export const Route = createFileRoute('/api/agent/chat')({
  server: { handlers: { POST } },
});
