import { mediaTypeForAttachment, type PendingAttachment } from '@/lib/agent';
import type { AgentComposerSettings } from '@/lib/agent-settings';

/**
 * The chat transcript's data model: message shapes, the reducers that fold
 * streamed agent events into them, and the replay of persisted rows. Shared
 * by the chat page (rendering) and the run store (streaming), so a live turn
 * and a reloaded one produce identical transcripts.
 */

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  metadata?: { sandbox?: boolean } & Record<string, unknown>;
}

export interface UserMessage {
  id: string;
  role: 'user';
  content: string;
}

export interface AgentMessage {
  id: string;
  role: 'agent';
  content: string;
}

export interface ToolGroupMessage {
  id: string;
  role: 'tool-group';
  content: string;
  tools: ToolCall[];
}

export type Message = UserMessage | AgentMessage | ToolGroupMessage;

export interface AgentEvent {
  type: 'content' | 'tool_call' | 'tool_result' | 'error' | 'done';
  data?: Record<string, unknown>;
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function buildAgentMessage(
  text: string,
  attachments: PendingAttachment[]
) {
  const uploaded = attachments.filter(
    (item) => item.status === 'uploaded' && item.url
  );
  const base =
    text.trim() ||
    'Please create a video using the attached media and choose the most appropriate role for each item.';
  if (uploaded.length === 0) return base;

  const counts = { image: 0, audio: 0, video: 0 };
  const media = uploaded
    .map((item) => {
      const type = mediaTypeForAttachment(item);
      counts[type] += 1;
      return `- ${type} ${counts[type]}: ${item.url}`;
    })
    .join('\n');

  return `${base}\n\n${ATTACHED_MEDIA_HEADING}\n${media}`;
}

export const ATTACHED_MEDIA_HEADING = 'Attached media:';
// Legacy headings remain readable so old conversations still render cleanly.
export const ATTACHED_IMAGES_HEADING = 'Attached images:';
export const ATTACHED_FRAMES_HEADING = 'Attached frames:';
export const ATTACHED_REFERENCE_IMAGES_HEADING = 'Attached reference images:';
export const ATTACHED_AUDIO_HEADING = 'Attached reference audio:';
export const ATTACHED_VIDEOS_HEADING = 'Attached videos:';

/**
 * The agent needs the attachment URLs inline in the message text (that's how
 * it learns which image to edit), but the transcript shouldn't show a wall of
 * URLs — so split the trailing block back out and render it as thumbnails.
 */
export function splitAttachedImages(content: string): {
  text: string;
  images: string[];
  audios: string[];
  videos: string[];
} {
  const headings = [
    ATTACHED_MEDIA_HEADING,
    ATTACHED_IMAGES_HEADING,
    ATTACHED_FRAMES_HEADING,
    ATTACHED_REFERENCE_IMAGES_HEADING,
    ATTACHED_AUDIO_HEADING,
    ATTACHED_VIDEOS_HEADING,
  ] as const;
  const starts = headings
    .map((heading) => content.lastIndexOf(`\n\n${heading}\n`))
    .filter((index) => index >= 0);
  if (starts.length === 0) {
    return { text: content, images: [], audios: [], videos: [] };
  }

  const at = Math.min(...starts);
  const block = content.slice(at + 2);
  const images: string[] = [];
  const audios: string[] = [];
  const videos: string[] = [];
  let section: 'media' | 'image' | 'audio' | 'video' | null = null;
  for (const line of block.split('\n')) {
    if (line === ATTACHED_MEDIA_HEADING) {
      section = 'media';
      continue;
    }
    if (
      line === ATTACHED_IMAGES_HEADING ||
      line === ATTACHED_FRAMES_HEADING ||
      line === ATTACHED_REFERENCE_IMAGES_HEADING
    ) {
      section = 'image';
      continue;
    }
    if (line === ATTACHED_AUDIO_HEADING) {
      section = 'audio';
      continue;
    }
    if (line === ATTACHED_VIDEOS_HEADING) {
      section = 'video';
      continue;
    }
    if (!line) continue;
    const match = line.match(
      /^- (image|audio|video|first frame|last frame|reference image|reference audio|reference video)(?: \d+)?: (\S+)$/
    );
    if (!match || !section) {
      return { text: content, images: [], audios: [], videos: [] };
    }
    const lineType = match[1].includes('audio')
      ? 'audio'
      : match[1].includes('video')
        ? 'video'
        : 'image';
    const mediaType = section === 'media' ? lineType : section;
    (mediaType === 'image'
      ? images
      : mediaType === 'audio'
        ? audios
        : videos
    ).push(match[2]);
  }
  if (images.length === 0 && audios.length === 0 && videos.length === 0) {
    return { text: content, images: [], audios: [], videos: [] };
  }
  return { text: content.slice(0, at), images, audios, videos };
}

// Pull `![alt](data:image/...;base64,...)` out of arbitrary text.
// Real-world LLM/tool output wraps base64 with whitespace, sometimes
// drops the closing `)`, and can split `]` and `(` across lines — so
// we hand-scan the body instead of trusting a strict regex.

export function reduceContent(msgs: Message[], delta: string): Message[] {
  const last = msgs[msgs.length - 1];
  // Tool-group already has tool calls → content begins a NEW round.
  if (last?.role === 'tool-group' && last.tools.length > 0) {
    return [...msgs, { id: newId('a'), role: 'agent', content: delta }];
  }
  if (!last || last.role === 'user') {
    return [...msgs, { id: newId('a'), role: 'agent', content: delta }];
  }
  if (last.role === 'agent') {
    return [...msgs.slice(0, -1), { ...last, content: last.content + delta }];
  }
  // tool-group with no tools yet (shouldn't really happen, but be safe)
  return [...msgs.slice(0, -1), { ...last, content: last.content + delta }];
}

export function reduceToolCall(msgs: Message[], call: ToolCall): Message[] {
  const last = msgs[msgs.length - 1];
  // Pending agent message (its content was the "thinking" preamble) becomes a tool-group.
  if (last?.role === 'agent') {
    return [
      ...msgs.slice(0, -1),
      {
        id: newId('tg'),
        role: 'tool-group',
        content: last.content,
        tools: [call],
      },
    ];
  }
  if (last?.role === 'tool-group') {
    return [...msgs.slice(0, -1), { ...last, tools: [...last.tools, call] }];
  }
  return [
    ...msgs,
    { id: newId('tg'), role: 'tool-group', content: '', tools: [call] },
  ];
}

// Persisted message shape returned by GET /api/agent/chat/$sessionId.
// Mirrors `StoredPart` in src/modules/chats/service.ts.

export type StoredTextPart = { type: 'text'; text: string };
export type StoredToolCallPart = {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: string;
  result?: string;
  metadata?: ToolCall['metadata'];
};
export type StoredPart = StoredTextPart | StoredToolCallPart;

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: StoredPart[];
  createdAt: string;
}

export interface ChatHistoryData {
  chat?: { id: string; title: string; updatedAt: string } | null;
  messages?: StoredMessage[];
  run?: { active: boolean };
}

export interface InitialTurnPayload {
  prompt?: string;
  settings?: AgentComposerSettings;
  /** Media already uploaded or selected by the landing composer. */
  attachments?: PendingAttachment[];
}

// Reconstruct UI Messages from persisted chat_message rows. The rules match
// the live reducers above so a replayed conversation looks identical to one
// that streamed in. Tool-group rows are detected by the presence of any
// `tool_call` part — text-only assistant rows become AgentMessages.
export function storedToMessages(stored: StoredMessage[]): Message[] {
  const out: Message[] = [];
  for (const msg of stored) {
    if (msg.role === 'user') {
      const text = msg.parts
        .filter((p): p is StoredTextPart => p.type === 'text')
        .map((p) => p.text)
        .join('');
      out.push({ id: msg.id, role: 'user', content: text });
      continue;
    }
    const toolParts = msg.parts.filter(
      (p): p is StoredToolCallPart => p.type === 'tool_call'
    );
    const textPrefix = msg.parts
      .filter((p): p is StoredTextPart => p.type === 'text')
      .map((p) => p.text)
      .join('');
    if (toolParts.length === 0) {
      out.push({ id: msg.id, role: 'agent', content: textPrefix });
    } else {
      out.push({
        id: msg.id,
        role: 'tool-group',
        content: textPrefix,
        tools: toolParts.map((p) => ({
          id: p.id,
          name: p.name,
          arguments: p.arguments,
          result: p.result,
          metadata: p.metadata,
        })),
      });
    }
  }
  return out;
}

export function reduceToolResult(
  msgs: Message[],
  id: string,
  result: string,
  metadata?: ToolCall['metadata']
): Message[] {
  // Walk backwards — the result belongs to the most recent tool-group that has this id.
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i];
    if (msg.role !== 'tool-group') continue;
    const idx = msg.tools.findIndex((t) => t.id === id);
    if (idx < 0) continue;
    const updatedTools = [...msg.tools];
    const prev = updatedTools[idx];
    updatedTools[idx] = {
      ...prev,
      result,
      metadata: metadata ?? prev.metadata,
    };
    const updated: ToolGroupMessage = { ...msg, tools: updatedTools };
    return [...msgs.slice(0, i), updated, ...msgs.slice(i + 1)];
  }
  return msgs;
}

export function parseToolError(result: string): string | null {
  const trimmed = result.trim();
  if (!trimmed) return null;
  try {
    const data = JSON.parse(trimmed) as unknown;
    if (
      data &&
      typeof data === 'object' &&
      'status' in data &&
      (data as { status?: unknown }).status === 'error'
    ) {
      const message = (data as { message?: unknown }).message;
      return typeof message === 'string' && message.trim()
        ? message.trim()
        : 'Tool failed';
    }
  } catch {
    // Tool implementations sometimes return plain text errors.
  }
  return trimmed.startsWith('Error:') ? trimmed : null;
}
