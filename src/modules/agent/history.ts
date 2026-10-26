import type { NormalizedMessageParam } from '@codeany/open-agent-sdk';

import { getChatWithMessages, type StoredPart } from '@/modules/chats/service';

/**
 * Rebuild the agent's conversation history from the chat rows.
 *
 * The SDK can persist sessions to disk, but the database already holds every
 * turn — and a Worker has no disk anyway. So each turn starts by replaying
 * what's stored here, which also means the history survives restarts and is
 * identical across instances.
 *
 * The stored shape (text + tool_call parts with their results) maps onto the
 * SDK's normalized blocks: a tool call becomes a `tool_use` block on the
 * assistant message plus a `tool_result` block on a following user message,
 * which is the layout every provider expects.
 */
export async function loadAgentHistory(
  chatId: string,
  userId: string
): Promise<NormalizedMessageParam[]> {
  const chat = await getChatWithMessages(chatId, userId);
  if (!chat) return [];
  return mapRowsToHistory(chat.messages);
}

/**
 * The mapping itself, split from the database read so it can be exercised
 * directly — getting this wrong produces a conversation the provider rejects,
 * or worse, silently accepts with the tool results detached from their calls.
 */
export function mapRowsToHistory(
  rows: Array<{ role: 'user' | 'assistant'; parts: StoredPart[] }>
): NormalizedMessageParam[] {
  const history: NormalizedMessageParam[] = [];

  for (const row of rows) {
    if (row.role === 'user') {
      const text = textOf(row.parts);
      if (text) history.push({ role: 'user', content: text });
      continue;
    }

    const assistant: NormalizedMessageParam['content'] = [];
    const results: NormalizedMessageParam['content'] = [];

    for (const part of row.parts) {
      if (part.type === 'text') {
        if (part.text.trim()) assistant.push({ type: 'text', text: part.text });
        continue;
      }
      assistant.push({
        type: 'tool_use',
        id: part.id,
        name: part.name,
        input: parseArguments(part.arguments),
      });
      // A tool call the model never got an answer for would leave the
      // conversation malformed, so unfinished calls report as much.
      results.push({
        type: 'tool_result',
        tool_use_id: part.id,
        content: part.result ?? 'No result recorded.',
        ...(part.result ? {} : { is_error: true }),
      });
    }

    if (assistant.length > 0)
      history.push({ role: 'assistant', content: assistant });
    if (results.length > 0) history.push({ role: 'user', content: results });
  }

  return history;
}

function textOf(parts: StoredPart[]): string {
  return parts
    .filter(
      (part): part is Extract<StoredPart, { type: 'text' }> =>
        part.type === 'text'
    )
    .map((part) => part.text)
    .join('')
    .trim();
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
