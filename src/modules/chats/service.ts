import { and, asc, count, desc, eq, isNull, like, lt, or } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  aiTask,
  chat,
  chatMessage,
  user,
  type Chat,
  type ChatMessage,
} from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { isDisplayableMediaUrl } from '@/lib/media';

// Stored payload shape for `chat.parts` and `chat_message.parts` (JSON text).
// `text` carries plain content, `tool_call` carries a single tool invocation
// with its result/metadata. A user message has one `text` part. A final
// assistant reply has one `text` part. A tool-group is an assistant message
// whose parts mix an optional preamble text part with one or more tool_call
// parts.
export type StoredPart =
  | { type: 'text'; text: string }
  | {
      type: 'tool_call';
      id: string;
      name: string;
      arguments: string;
      result?: string;
      metadata?: Record<string, unknown>;
    };

export const CHAT_STATUS_ACTIVE = 'active';
export const CHAT_STATUS_DELETED = 'deleted';

const DEFAULT_MODEL = 'default';
const DEFAULT_PROVIDER = 'open-agent-sdk';

function encodeParts(parts: StoredPart[]): string {
  return JSON.stringify(parts);
}

function decodeParts(raw: string | null): StoredPart[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredPart[]) : [];
  } catch {
    return [];
  }
}

/** First non-empty text part — used as a preview snippet for the chat list. */
function firstText(parts: StoredPart[]): string {
  for (const p of parts) {
    if (p.type === 'text' && p.text.trim()) return p.text.trim();
  }
  return '';
}

/**
 * The composer appends uploaded reference URLs to the message so the agent
 * can act on them (see `buildAgentMessage`). They're machine plumbing — drop
 * them from anything a human reads, like the chat title or list preview.
 */
function withoutAttachedImages(s: string): string {
  const starts = [
    s.indexOf('\n\nAttached media:\n'),
    s.indexOf('\n\nAttached images:\n'),
    s.indexOf('\n\nAttached frames:\n'),
    s.indexOf('\n\nAttached reference images:\n'),
    s.indexOf('\n\nAttached reference audio:\n'),
    s.indexOf('\n\nAttached videos:\n'),
  ].filter((index) => index >= 0);
  return starts.length === 0 ? s : s.slice(0, Math.min(...starts));
}

/** Truncate to a sensible preview length without splitting graphemes too aggressively. */
function snippet(s: string, max = 80): string {
  const trimmed = s.replace(/\s+/g, ' ').trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max - 1) + '…';
}

/**
 * Look up a chat by id, scoped to the owning user. Returns undefined if the
 * row is missing or belongs to someone else (we never want to leak across
 * users — callers should treat undefined as "create a new chat").
 */
export async function findChat(
  chatId: string,
  userId: string
): Promise<Chat | undefined> {
  const [row] = await db()
    .select()
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);
  return row;
}

interface EnsureChatParams {
  chatId: string;
  userId: string;
  // First user message — used to seed the title when creating a fresh chat.
  seedMessage?: string;
}

/**
 * Get-or-create a chat row. Idempotent: if a chat with this id exists we
 * return it untouched. If we create one, we seed the title from the first
 * user message (truncated) so the sidebar has something usable until the
 * user renames the session.
 */
export async function ensureChat(params: EnsureChatParams): Promise<Chat> {
  const existing = await findChat(params.chatId, params.userId);
  if (existing) return existing;

  const title =
    snippet(withoutAttachedImages(params.seedMessage ?? ''), 60) || 'New Chat';
  const [row] = await db()
    .insert(chat)
    .values({
      id: params.chatId,
      userId: params.userId,
      status: CHAT_STATUS_ACTIVE,
      model: DEFAULT_MODEL,
      provider: DEFAULT_PROVIDER,
      title,
      parts: encodeParts([]),
    })
    .returning();
  return row;
}

interface AppendMessageParams {
  chatId: string;
  userId: string;
  role: 'user' | 'assistant';
  parts: StoredPart[];
}

/**
 * Append a single chat_message row. We `touch` the chat's updatedAt by
 * issuing a no-op update so the chat list stays sorted by recent activity
 * even when the message itself is the only thing that changed.
 */
export async function appendMessage(
  params: AppendMessageParams
): Promise<ChatMessage> {
  const id = `m-${getUuid()}`;
  const [row] = await db()
    .insert(chatMessage)
    .values({
      id,
      chatId: params.chatId,
      userId: params.userId,
      status: CHAT_STATUS_ACTIVE,
      role: params.role,
      parts: encodeParts(params.parts),
      model: DEFAULT_MODEL,
      provider: DEFAULT_PROVIDER,
    })
    .returning();

  await db()
    .update(chat)
    .set({ updatedAt: new Date() })
    .where(and(eq(chat.id, params.chatId), eq(chat.userId, params.userId)));

  return row;
}

/**
 * Resolve unfinished tool rows when a chat run is stopped outside the
 * original SSE request (for example after a refresh or dropped connection).
 */
export async function cancelPendingToolCalls(
  chatId: string,
  userId: string
): Promise<number> {
  const rows = await db()
    .select()
    .from(chatMessage)
    .where(
      and(
        eq(chatMessage.chatId, chatId),
        eq(chatMessage.userId, userId),
        eq(chatMessage.status, CHAT_STATUS_ACTIVE),
        eq(chatMessage.role, 'assistant')
      )
    );

  const canceledResult = JSON.stringify({
    status: 'canceled',
    message: 'Generation stopped by the user.',
  });
  let count = 0;

  for (const row of rows) {
    const parts = decodeParts(row.parts);
    let changed = false;
    const next = parts.map((part) => {
      if (part.type !== 'tool_call' || part.result !== undefined) return part;
      changed = true;
      count += 1;
      return { ...part, result: canceledResult };
    });
    if (!changed) continue;

    await db()
      .update(chatMessage)
      .set({ parts: encodeParts(next) })
      .where(and(eq(chatMessage.id, row.id), eq(chatMessage.userId, userId)));
  }

  if (count > 0) {
    await db()
      .update(chat)
      .set({ updatedAt: new Date() })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
  }
  return count;
}

export interface ChatListItem {
  id: string;
  title: string;
  preview: string;
  updatedAt: Date;
}

export interface AdminChatListItem {
  id: string;
  title: string;
  /** Newest image the chat produced, for the list thumbnail. */
  cover: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GeneratedImageItem {
  id: string;
  src: string;
  name: string;
  alt: string;
  chatId: string;
  chatTitle: string;
  createdAt: Date;
  /** The model that produced it, when the stored tool result named one. */
  model?: string;
}

/**
 * Active chats for a user, newest first. The preview is the first text part
 * of the most recent message — we read it on-demand here rather than
 * denormalising onto `chat` so renames and edits don't require backfilling.
 * That's one extra query per row, which is why the page size is bounded.
 */
export async function listChats(
  userId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<{ items: ChatListItem[]; total: number }> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const where = and(
    eq(chat.userId, userId),
    eq(chat.status, CHAT_STATUS_ACTIVE)
  );

  const [{ value: total }] = await db()
    .select({ value: count() })
    .from(chat)
    .where(where);

  const chats = await db()
    .select()
    .from(chat)
    .where(where)
    .orderBy(desc(chat.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  if (chats.length === 0) return { items: [], total };

  const items: ChatListItem[] = [];
  for (const c of chats) {
    const [latest] = await db()
      .select()
      .from(chatMessage)
      .where(
        and(
          eq(chatMessage.chatId, c.id),
          eq(chatMessage.status, CHAT_STATUS_ACTIVE)
        )
      )
      .orderBy(desc(chatMessage.createdAt))
      .limit(1);

    const previewSource = latest
      ? withoutAttachedImages(firstText(decodeParts(latest.parts)))
      : c.title;
    items.push({
      id: c.id,
      title: c.title || 'New Chat',
      preview: snippet(previewSource, 60),
      updatedAt: c.updatedAt,
    });
  }
  return { items, total };
}

function fileNameFromUrl(src: string) {
  try {
    const url = new URL(src, 'https://uptown.local');
    const path = url.searchParams.get('path') || url.pathname;
    return decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
  } catch {
    return (
      src
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/[?#].*$/, '') || ''
    );
  }
}

/** The model named in a tool result, if it recorded one. */
function extractModelFromResult(
  result: string | undefined
): string | undefined {
  if (!result) return undefined;
  try {
    const payload = JSON.parse(result) as { model?: unknown };
    return typeof payload?.model === 'string' && payload.model
      ? payload.model
      : undefined;
  } catch {
    return undefined;
  }
}

function extractGeneratedImagesFromResult(
  result: string | undefined
): string[] {
  if (!result) return [];

  const seen = new Set<string>();
  const images: string[] = [];
  const push = (src: string) => {
    if (!isDisplayableMediaUrl(src)) return;
    if (seen.has(src)) return;
    seen.add(src);
    images.push(src);
  };

  try {
    const payload = JSON.parse(result) as unknown;
    if (payload && typeof payload === 'object') {
      const files = (payload as { files?: unknown }).files;
      if (Array.isArray(files)) {
        for (const file of files) {
          if (typeof file === 'string') push(file);
        }
        if (images.length > 0) return images;
      }
    }
  } catch {
    // A tool result that isn't JSON has no files to report.
  }

  return images;
}

export interface GeneratedImagePage {
  items: GeneratedImageItem[];
  /** Pass back as `cursor` to continue; absent when the end is reached. */
  nextCursor?: string;
}

/**
 * One page of the user's generated media, newest first.
 *
 * Files live inside message payloads rather than a table of their own, so
 * the page is taken over *messages* and the media they carry are flattened
 * out — a message with three clips contributes three. Page sizes therefore
 * wobble a little, which is why this is a "load more" cursor rather than
 * numbered pages.
 *
 * The cursor is the last message's timestamp and id: an id tiebreak keeps
 * messages written in the same millisecond from being skipped or repeated.
 */
export async function listGeneratedImages(
  userId: string,
  options: { limit?: number; cursor?: string } = {}
): Promise<GeneratedImagePage> {
  const messageLimit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const cursor = parseImageCursor(options.cursor);

  const messageRows = await db()
    .select({
      id: chatMessage.id,
      parts: chatMessage.parts,
      createdAt: chatMessage.createdAt,
      chatId: chat.id,
      chatTitle: chat.title,
    })
    .from(chatMessage)
    .innerJoin(chat, eq(chat.id, chatMessage.chatId))
    .where(
      and(
        eq(chat.userId, userId),
        eq(chat.status, CHAT_STATUS_ACTIVE),
        eq(chatMessage.status, CHAT_STATUS_ACTIVE),
        // Only tool results carry generated media; this runs in SQL so pages of
        // plain conversation don't come back empty.
        like(chatMessage.parts, '%"tool_call"%'),
        ...(cursor
          ? [
              or(
                lt(chatMessage.createdAt, cursor.createdAt),
                and(
                  eq(chatMessage.createdAt, cursor.createdAt),
                  lt(chatMessage.id, cursor.id)
                )
              )!,
            ]
          : [])
      )
    )
    .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
    .limit(messageLimit);

  const createRows = await db()
    .select()
    .from(aiTask)
    .where(
      and(
        eq(aiTask.userId, userId),
        eq(aiTask.status, 'success'),
        eq(aiTask.mediaType, 'video'),
        isNull(aiTask.deletedAt),
        like(aiTask.options, '%"source":"create"%'),
        cursor
          ? or(
              lt(aiTask.createdAt, cursor.createdAt),
              and(
                eq(aiTask.createdAt, cursor.createdAt),
                lt(aiTask.id, cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(aiTask.createdAt), desc(aiTask.id))
    .limit(messageLimit);
  const rows = [
    ...messageRows,
    ...createRows.map((task: typeof aiTask.$inferSelect) => ({
      id: task.id,
      createdAt: task.createdAt,
      chatId: '',
      chatTitle: task.prompt,
      parts: JSON.stringify([
        {
          type: 'tool_call',
          id: task.id,
          name: 'create_video',
          arguments: '{}',
          result: task.taskResult,
        },
      ]),
    })),
  ]
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
    )
    .slice(0, messageLimit);

  const items: GeneratedImageItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const part of decodeParts(row.parts)) {
      if (part.type !== 'tool_call') continue;
      const model = extractModelFromResult(part.result);
      for (const src of extractGeneratedImagesFromResult(part.result)) {
        const dedupeKey = `${row.chatId}:${src}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const name = fileNameFromUrl(src) || 'clip';
        items.push({
          id: `${row.id}:${items.length}`,
          src,
          name,
          alt: name,
          chatId: row.chatId,
          chatTitle: row.chatTitle || 'New Chat',
          createdAt: row.createdAt,
          model,
        });
      }
    }
  }

  // A full page of messages means there may be more, even when none of them
  // turned out to carry an image.
  const last = rows[rows.length - 1];
  return {
    items,
    nextCursor:
      rows.length === messageLimit && last
        ? `${last.createdAt.getTime()}:${last.id}`
        : undefined,
  };
}

function parseImageCursor(
  cursor: string | undefined
): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const separator = cursor.indexOf(':');
  if (separator <= 0) return null;
  const millis = Number(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (!Number.isFinite(millis) || !id) return null;
  return { createdAt: new Date(millis), id };
}

export interface ChatWithMessages {
  chat: Chat;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    parts: StoredPart[];
    createdAt: Date;
  }>;
}

/**
 * Full session detail for replaying a chat in the UI. Returns undefined when
 * the chat doesn't exist for this user — callers should treat that as "fresh
 * session that hasn't been persisted yet" and start from an empty state.
 */
export async function getChatWithMessages(
  chatId: string,
  userId: string
): Promise<ChatWithMessages | undefined> {
  const c = await findChat(chatId, userId);
  if (!c || c.status !== CHAT_STATUS_ACTIVE) return undefined;

  const rows: ChatMessage[] = await db()
    .select()
    .from(chatMessage)
    .where(
      and(
        eq(chatMessage.chatId, chatId),
        eq(chatMessage.status, CHAT_STATUS_ACTIVE)
      )
    )
    .orderBy(asc(chatMessage.createdAt));

  return {
    chat: c,
    messages: rows.map((r) => ({
      id: r.id,
      role: r.role === 'user' ? 'user' : 'assistant',
      parts: decodeParts(r.parts),
      createdAt: r.createdAt,
    })),
  };
}

/**
 * Every user's chats, newest first — the admin console's content view.
 * Unlike `listChats` this is not scoped to one owner, so callers must have
 * checked the admin permission first.
 */
export async function listAllChats(
  options: { page?: number; pageSize?: number; search?: string } = {}
): Promise<{ items: AdminChatListItem[]; total: number }> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const term = options.search?.trim();
  const where = term
    ? and(eq(chat.status, CHAT_STATUS_ACTIVE), like(chat.title, `%${term}%`))
    : eq(chat.status, CHAT_STATUS_ACTIVE);

  const [{ value: total }] = await db()
    .select({ value: count() })
    .from(chat)
    .where(where);

  const rows = await db()
    .select({
      id: chat.id,
      title: chat.title,
      userId: chat.userId,
      updatedAt: chat.updatedAt,
      createdAt: chat.createdAt,
      userName: user.name,
      userEmail: user.email,
      userAvatar: user.image,
    })
    .from(chat)
    .leftJoin(user, eq(chat.userId, user.id))
    .where(where)
    .orderBy(desc(chat.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // One thumbnail per row: the newest tool result that carried an image.
  const covers = new Map<string, string>();
  await Promise.all(
    rows.map(async (row: (typeof rows)[number]) => {
      const [message] = await db()
        .select({ parts: chatMessage.parts })
        .from(chatMessage)
        .where(
          and(
            eq(chatMessage.chatId, row.id),
            eq(chatMessage.status, CHAT_STATUS_ACTIVE),
            like(chatMessage.parts, '%"tool_call"%')
          )
        )
        .orderBy(desc(chatMessage.createdAt))
        .limit(1);
      if (!message) return;
      for (const part of decodeParts(message.parts)) {
        if (part.type !== 'tool_call') continue;
        const [src] = extractGeneratedImagesFromResult(part.result);
        if (src) {
          covers.set(row.id, src);
          return;
        }
      }
    })
  );

  return {
    items: rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      title: row.title || 'New Chat',
      cover: covers.get(row.id) || '',
      userId: row.userId,
      userName: row.userName || '',
      userEmail: row.userEmail || '',
      userAvatar: row.userAvatar || '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    total,
  };
}

/** Any chat with its messages, owner included. Admin-only, like the above. */
export async function getChatForAdmin(
  chatId: string
): Promise<(ChatWithMessages & { owner: string }) | undefined> {
  const [row] = await db()
    .select({ chat, userName: user.name, userEmail: user.email })
    .from(chat)
    .leftJoin(user, eq(chat.userId, user.id))
    .where(eq(chat.id, chatId))
    .limit(1);
  if (!row || row.chat.status !== CHAT_STATUS_ACTIVE) return undefined;

  const rows: ChatMessage[] = await db()
    .select()
    .from(chatMessage)
    .where(
      and(
        eq(chatMessage.chatId, chatId),
        eq(chatMessage.status, CHAT_STATUS_ACTIVE)
      )
    )
    .orderBy(asc(chatMessage.createdAt));

  return {
    chat: row.chat,
    owner: row.userName || row.userEmail || row.chat.userId,
    messages: rows.map((r) => ({
      id: r.id,
      role: r.role === 'user' ? ('user' as const) : ('assistant' as const),
      parts: decodeParts(r.parts),
      createdAt: r.createdAt,
    })),
  };
}

export type ChatVisibility = 'private' | 'public';

/** Flip a chat between owner-only and "anyone with the link". Owner-scoped. */
export async function setChatVisibility(
  chatId: string,
  userId: string,
  visibility: ChatVisibility
): Promise<void> {
  await db()
    .update(chat)
    .set({ visibility, updatedAt: new Date() })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}

/**
 * A chat plus its messages, without scoping to an owner — the /share route
 * decides who may see it (public to anyone, private to the owner or an admin).
 */
export async function getChatForShare(
  chatId: string
): Promise<(ChatWithMessages & { owner: string }) | undefined> {
  return getChatForAdmin(chatId);
}

export async function renameChat(
  chatId: string,
  userId: string,
  title: string
): Promise<void> {
  const trimmed = title.trim().slice(0, 200);
  if (!trimmed) return;
  await db()
    .update(chat)
    .set({ title: trimmed, updatedAt: new Date() })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}

/**
 * Soft-delete a chat (and cascade to its messages) by flipping `status`.
 * We don't physically delete so we can recover or audit later if needed.
 */
export async function deleteChat(
  chatId: string,
  userId: string
): Promise<void> {
  const now = new Date();
  await db()
    .update(chat)
    .set({ status: CHAT_STATUS_DELETED, updatedAt: now })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
  await db()
    .update(chatMessage)
    .set({ status: CHAT_STATUS_DELETED, updatedAt: now })
    .where(and(eq(chatMessage.chatId, chatId), eq(chatMessage.userId, userId)));
}
