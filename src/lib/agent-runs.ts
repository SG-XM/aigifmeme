import { useCallback, useSyncExternalStore } from 'react';

import type { PendingAttachment } from '@/lib/agent';
import {
  buildAgentMessage,
  newId,
  parseToolError,
  reduceContent,
  reduceToolCall,
  reduceToolResult,
  type AgentEvent,
  type Message,
  type ToolCall,
} from '@/lib/agent-chat';
import type { AgentGenerationSettings } from '@/lib/agent-settings';

/**
 * Live agent turns, keyed by session and held outside React.
 *
 * A turn belongs to its chat, not to the page that started it: switching
 * conversations, going back to the launcher, or starting a second chat while
 * the first is still working all leave running turns untouched. Components
 * subscribe to the session they're showing and re-render as events land;
 * unmounting just drops the subscription.
 */

export interface AgentRun {
  messages: Message[];
  streaming: boolean;
}

interface RunEntry extends AgentRun {
  controller: AbortController | null;
}

const EMPTY_RUN: AgentRun = { messages: [], streaming: false };

// Browser-only: turns are started by user actions, so on the server this map
// stays empty and every session renders its empty snapshot.
const runs = new Map<string, RunEntry>();
const listeners = new Map<string, Set<() => void>>();

/** Separate channel for "which sessions are busy" (the sidebar's spinners). */
const runningListeners = new Set<() => void>();
let runningSnapshot: string[] = [];

function emit(sessionId: string) {
  listeners.get(sessionId)?.forEach((cb) => cb());
}

function emitRunning() {
  const next = [...runs.entries()]
    .filter(([, run]) => run.streaming)
    .map(([id]) => id)
    .sort();
  // useSyncExternalStore compares snapshots by identity — only swap when the
  // set actually changed, or every event would re-render every subscriber.
  if (
    next.length !== runningSnapshot.length ||
    next.some((id, i) => id !== runningSnapshot[i])
  ) {
    runningSnapshot = next;
    runningListeners.forEach((cb) => cb());
  }
}

function getEntry(sessionId: string): RunEntry | undefined {
  return runs.get(sessionId);
}

function update(sessionId: string, patch: Partial<RunEntry>) {
  const prev = runs.get(sessionId) ?? {
    messages: [],
    streaming: false,
    controller: null,
  };
  runs.set(sessionId, { ...prev, ...patch });
  emit(sessionId);
}

function updateMessages(
  sessionId: string,
  updater: (messages: Message[]) => Message[]
) {
  const prev = runs.get(sessionId);
  if (!prev) return;
  runs.set(sessionId, { ...prev, messages: updater(prev.messages) });
  emit(sessionId);
}

function getRun(sessionId: string): AgentRun {
  return runs.get(sessionId) ?? EMPTY_RUN;
}

function isRunning(sessionId: string): boolean {
  return !!runs.get(sessionId)?.streaming;
}

/**
 * Replace a session's transcript with what the server has. Ignored while a
 * turn is streaming — the live transcript is ahead of the persisted one.
 */
export function seedRun(sessionId: string, messages: Message[]) {
  if (isRunning(sessionId)) return;
  update(sessionId, { messages });
}

/**
 * Does this browser already know about the session? True for one it started
 * (or is streaming), false for an id it has only ever seen in the URL.
 */
export function hasRun(sessionId: string): boolean {
  return runs.has(sessionId);
}

/** Drop a finished session's cached transcript (the DB is the source now). */
export function dropRun(sessionId: string) {
  if (isRunning(sessionId)) return;
  runs.delete(sessionId);
  emit(sessionId);
}

export function stopRun(sessionId: string) {
  const run = runs.get(sessionId);
  // Stop the visible tool spinner even when this transcript was restored
  // from history and no longer has the original browser AbortController.
  // The chat stop endpoint persists the same terminal result server-side.
  updateMessages(sessionId, (messages) =>
    messages.map((message) =>
      message.role === 'tool-group'
        ? {
            ...message,
            tools: message.tools.map((tool) =>
              tool.result === undefined
                ? {
                    ...tool,
                    result: JSON.stringify({
                      status: 'canceled',
                      message: 'Generation stopped by the user.',
                    }),
                  }
                : tool
            ),
          }
        : message
    )
  );
  run?.controller?.abort();
}

export function useAgentRun(sessionId: string): AgentRun {
  const subscribe = useCallback(
    (cb: () => void) => {
      let set = listeners.get(sessionId);
      if (!set) {
        set = new Set();
        listeners.set(sessionId, set);
      }
      set.add(cb);
      return () => {
        set!.delete(cb);
        if (set!.size === 0) listeners.delete(sessionId);
      };
    },
    [sessionId]
  );
  const snapshot = useCallback(() => getRun(sessionId), [sessionId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Session ids with a turn in flight — for busy indicators. */
export function useRunningSessions(): string[] {
  return useSyncExternalStore(
    (cb) => {
      runningListeners.add(cb);
      return () => runningListeners.delete(cb);
    },
    () => runningSnapshot,
    () => runningSnapshot
  );
}

export interface StartRunOptions {
  sessionId: string;
  text: string;
  attachments?: PendingAttachment[];
  settings?: AgentGenerationSettings;
  /** Called once the server has the turn (and has persisted the user message). */
  onAccepted?: () => void;
  /** Called when the turn ends, however it ends. */
  onSettled?: () => void;
  /** The turn was refused for lack of credits — show the matching paywall. */
  onInsufficientCredits?: (info: CreditRefusal) => void;
}

export interface CreditRefusal {
  required: number;
  balance: number;
  /** On a plan already — offer a top-up rather than the plan catalog. */
  subscribed: boolean;
}

function parseInsufficientCredits(
  status: number,
  body: string
): CreditRefusal | null {
  if (status !== 402) return null;
  try {
    const parsed = JSON.parse(body) as {
      code?: string;
      required?: number;
      balance?: number;
      subscribed?: boolean;
    };
    if (parsed?.code !== 'insufficient_credits') return null;
    return {
      required: parsed.required ?? 0,
      balance: parsed.balance ?? 0,
      subscribed: parsed.subscribed === true,
    };
  } catch {
    return null;
  }
}

/**
 * Start a turn and stream it into the session's transcript. Safe to call for
 * several sessions at once; a session that's already streaming is ignored.
 */
export async function startRun({
  sessionId,
  text,
  attachments = [],
  settings = {},
  onAccepted,
  onSettled,
  onInsufficientCredits,
}: StartRunOptions): Promise<void> {
  const content = buildAgentMessage(text, attachments);
  if (!content || isRunning(sessionId)) return;

  const controller = new AbortController();
  const existing = getEntry(sessionId);
  runs.set(sessionId, {
    messages: [
      ...(existing?.messages ?? []),
      { id: newId('u'), role: 'user', content },
    ],
    streaming: true,
    controller,
  });
  emit(sessionId);
  emitRunning();

  const handleEvent = (evt: AgentEvent) => {
    switch (evt.type) {
      case 'content': {
        const delta = String(evt.data?.content ?? '');
        if (!delta) return;
        updateMessages(sessionId, (msgs) => reduceContent(msgs, delta));
        break;
      }
      case 'tool_call': {
        const call: ToolCall = {
          id: String(evt.data?.id ?? newId('t')),
          name: String(evt.data?.name ?? ''),
          arguments: String(evt.data?.arguments ?? '{}'),
          metadata: (evt.data?.metadata ?? undefined) as ToolCall['metadata'],
        };
        updateMessages(sessionId, (msgs) => reduceToolCall(msgs, call));
        break;
      }
      case 'tool_result': {
        const id = String(evt.data?.id ?? '');
        const result = String(evt.data?.result ?? '');
        if (!id) return;
        const metadata = (evt.data?.metadata ??
          undefined) as ToolCall['metadata'];
        updateMessages(sessionId, (msgs) => {
          let next = reduceToolResult(msgs, id, result, metadata);
          const toolError = parseToolError(result);
          if (toolError)
            next = reduceContent(next, `\n\n[error] ${toolError}\n\n`);
          return next;
        });
        break;
      }
      case 'error': {
        const message = String(evt.data?.message ?? 'unknown error');
        updateMessages(sessionId, (msgs) =>
          reduceContent(msgs, `\n\n[error] ${message}\n\n`)
        );
        break;
      }
      case 'done':
        break;
    }
  };

  try {
    const res = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: content, settings }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      // Out of credits isn't an error to read — it's a paywall. Drop the
      // optimistic user bubble and let the caller open the upgrade dialog.
      const refusal = parseInsufficientCredits(res.status, errText);
      if (refusal) {
        updateMessages(sessionId, (msgs) => msgs.slice(0, -1));
        onInsufficientCredits?.(refusal);
        return;
      }
      updateMessages(sessionId, (msgs) =>
        reduceContent(msgs, `\n\n[error] ${errText || res.statusText}\n\n`)
      );
      return;
    }

    onAccepted?.();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(chunk, { stream: true });

      let eventEnd: number;
      while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, eventEnd);
        buffer = buffer.slice(eventEnd + 2);
        const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (!payload) continue;
        try {
          handleEvent(JSON.parse(payload) as AgentEvent);
        } catch {
          // ignore malformed event
        }
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      updateMessages(sessionId, (msgs) =>
        reduceContent(msgs, `\n\n[error] ${(err as Error).message}\n\n`)
      );
    }
  } finally {
    update(sessionId, { streaming: false, controller: null });
    emitRunning();
    onSettled?.();
  }
}
