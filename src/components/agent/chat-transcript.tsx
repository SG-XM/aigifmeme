import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Film,
  FolderOpen,
  Loader2,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import {
  splitAttachedImages,
  type Message,
  type ToolCall,
  type ToolGroupMessage,
} from '@/lib/agent-chat';
import {
  isDisplayableMediaUrl,
  isVideoUrl,
  mediaNameFromUrl,
} from '@/lib/media';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { usePreviewPane } from '@/components/agent/preview-pane-context';

/**
 * The chat transcript — message bubbles, tool activity rows and generated
 * clips. Shared by the live session page and the admin-only /share view, so
 * both render a conversation identically.
 */
export interface InlineMedia {
  alt: string;
  src: string;
}

function splitDataImages(
  s: string
): Array<
  { type: 'text'; text: string } | { type: 'image'; alt: string; src: string }
> {
  const out: Array<
    { type: 'text'; text: string } | { type: 'image'; alt: string; src: string }
  > = [];
  const headerRe =
    /!\[([^\]]*?)\]\s*\(\s*<?\s*(data:image\/[a-z0-9.+-]+;base64,)/gi;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(s)) !== null) {
    const alt = match[1];
    const dataPrefix = match[2];
    let cursor = match.index + match[0].length;
    while (cursor < s.length && /[A-Za-z0-9+/=\s]/.test(s[cursor])) cursor++;
    const rawBody = s.slice(match.index + match[0].length, cursor);
    const body = rawBody.replace(/\s+/g, '');
    if (!body) continue;
    const src = dataPrefix + body;
    let after = cursor;
    while (after < s.length && /[\s>]/.test(s[after])) after++;
    if (s[after] === ')') after++;
    if (match.index > lastIdx) {
      out.push({ type: 'text', text: s.slice(lastIdx, match.index) });
    }
    out.push({ type: 'image', alt, src });
    lastIdx = after;
    headerRe.lastIndex = after;
  }
  if (lastIdx < s.length) out.push({ type: 'text', text: s.slice(lastIdx) });
  return out;
}

// Pull media URLs out of a tool-result payload. The agent's text reply does
// not always re-mention what it just made, so the clip is surfaced from the
// result itself and attached to the next bubble.
function extractToolResultFiles(result: string): InlineMedia[] {
  const seen = new Set<string>();
  const files: InlineMedia[] = [];

  try {
    const payload = JSON.parse(result);
    if (!Array.isArray(payload?.files)) return files;
    for (const file of payload.files) {
      if (typeof file !== 'string' || !isDisplayableMediaUrl(file)) continue;
      if (seen.has(file)) continue;
      seen.add(file);
      files.push({ alt: file.split('/').pop() || '', src: file });
    }
  } catch {
    // A result that isn't JSON carries no files.
  }
  return files;
}

// react-markdown's defaultUrlTransform drops `data:` URLs. Allow image
// data URLs through so any markdown image we didn't already extract via
// splitDataImages can still render.
function agentUrlTransform(url: string, key: string): string {
  if (key === 'src' && url.startsWith('data:image/')) return url;
  return defaultUrlTransform(url);
}

/**
 * The media in a conversation: the stills the user uploaded, plus the clips
 * the tools produced — the latter belong on the *next* agent reply so they
 * read as part of the assistant's answer.
 * `surfacedSrcs` lets that bubble suppress duplicate inline copies the model
 * may have re-embedded; `previewImages` feeds the preview pane.
 */
export function useTranscriptImages(messages: Message[], sessionId: string) {
  return useMemo(() => {
    const attached = new Map<string, InlineMedia[]>();
    const surfaced = new Set<string>();
    const preview = new Map<string, InlineMedia>();
    let pending: InlineMedia[] = [];
    for (const msg of messages) {
      // What the user sent counts too — the strip in the preview pane is the
      // whole conversation's reference media in the order it appeared.
      if (msg.role === 'user') {
        const references = splitAttachedImages(msg.content);
        for (const src of [...references.images, ...references.videos]) {
          if (!preview.has(src)) preview.set(src, { alt: '', src });
        }
        continue;
      }
      if (msg.role === 'tool-group') {
        for (const tc of msg.tools) {
          if (!tc.result) continue;
          for (const p of splitDataImages(tc.result)) {
            if (p.type === 'image') pending.push({ alt: p.alt, src: p.src });
          }
          for (const img of extractToolResultFiles(tc.result)) {
            pending.push(img);
          }
        }
        continue;
      }
      if (msg.role === 'agent' && pending.length > 0) {
        attached.set(msg.id, pending);
        for (const img of pending) {
          surfaced.add(img.src);
          preview.set(img.src, img);
        }
        pending = [];
      }
    }
    return {
      attachedImages: attached,
      surfacedSrcs: surfaced,
      previewImages: Array.from(preview.values()).map((img) => ({
        ...img,
        alt: img.alt || mediaNameFromUrl(img.src),
      })),
    };
  }, [messages, sessionId]);
}

export function ChatTranscript({
  messages,
  streaming,
  sessionId,
  attachedImages,
  surfacedSrcs,
}: {
  messages: Message[];
  streaming?: boolean;
  sessionId: string;
  attachedImages: Map<string, InlineMedia[]>;
  surfacedSrcs: Set<string>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-3">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center pt-10 text-center">
          <p className="text-muted-foreground text-sm">
            {m['agent.chat.empty']()}
          </p>
        </div>
      ) : (
        messages.map((msg) => (
          <MessageBlock
            key={msg.id}
            message={msg}
            attachedImages={attachedImages.get(msg.id)}
            surfacedSrcs={surfacedSrcs}
            sessionId={sessionId}
          />
        ))
      )}
      {streaming && (
        <p className="text-muted-foreground text-xs">
          {m['agent.chat.thinking']()}
        </p>
      )}
    </div>
  );
}

function MessageBlock({
  message,
  attachedImages,
  surfacedSrcs,
  sessionId,
}: {
  message: Message;
  attachedImages?: InlineMedia[];
  surfacedSrcs: Set<string>;
  sessionId: string;
}) {
  if (message.role === 'user') return <UserBubble content={message.content} />;
  if (message.role === 'tool-group') {
    return (
      <ToolGroupBlock
        msg={message}
        surfacedSrcs={surfacedSrcs}
        sessionId={sessionId}
      />
    );
  }
  return (
    <AgentBubble
      content={message.content}
      attachedImages={attachedImages}
      surfacedSrcs={surfacedSrcs}
      sessionId={sessionId}
    />
  );
}

function UserBubble({ content }: { content: string }) {
  const { openMedia } = usePreviewPane();
  const { text, images, audios, videos } = useMemo(
    () => splitAttachedImages(content),
    [content]
  );
  const media = [...images, ...videos];
  return (
    <div className="flex min-w-0 flex-col items-end gap-1.5 overflow-hidden">
      {media.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {media.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() =>
                openMedia({
                  src,
                  alt: `${isVideoUrl(src) ? 'video' : 'image'} ${i + 1}`,
                })
              }
              className="border-border bg-background overflow-hidden rounded-md border"
            >
              {isVideoUrl(src) ? (
                <video
                  src={src}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-40 w-auto max-w-full object-cover"
                />
              ) : (
                <img
                  src={src}
                  alt={`image ${i + 1}`}
                  loading="lazy"
                  className="max-h-40 w-auto max-w-full object-contain"
                />
              )}
            </button>
          ))}
        </div>
      )}
      {audios.length > 0 && (
        <div className="border-border bg-background flex max-w-[85%] flex-col gap-1.5 rounded-lg border p-2">
          {audios.map((src, index) => (
            <audio
              key={`${src}-${index}`}
              src={src}
              controls
              preload="metadata"
              className="h-9 max-w-full"
            />
          ))}
        </div>
      )}
      {text && (
        <div className="bg-accent text-accent-foreground max-w-[85%] min-w-0 overflow-hidden rounded-lg rounded-br-sm px-3 py-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}

function AgentBubble({
  content,
  attachedImages,
  surfacedSrcs,
  sessionId,
}: {
  content: string;
  attachedImages?: InlineMedia[];
  surfacedSrcs: Set<string>;
  sessionId: string;
}) {
  const hasAttached = !!attachedImages && attachedImages.length > 0;
  if (!content && !hasAttached) return null;
  return (
    <div className="flex min-w-0 justify-start overflow-hidden">
      <div className="max-w-full min-w-0 flex-1 overflow-hidden">
        {hasAttached && (
          <div className="mb-2 flex min-w-0 flex-wrap gap-2 overflow-hidden">
            {attachedImages!.map((img, i) => (
              <AgentMedia
                key={i}
                src={img.src}
                alt={img.alt}
                loading="lazy"
                className="border-border max-h-60 w-auto max-w-full rounded-md border object-contain"
              />
            ))}
          </div>
        )}
        {content && (
          <MarkdownContent
            content={content}
            suppressInlineImages={hasAttached}
            surfacedSrcs={surfacedSrcs}
            sessionId={sessionId}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Turn a raw tool call into the one-line "activity" summary shown in the
 * transcript: an icon plus a human sentence ("Ran npm test", "Read logo.png").
 * Unknown tools fall back to the tool name and a flattened argument list.
 */
function toolPresentation(
  tc: ToolCall,
  running: boolean
): { icon: LucideIcon; label: string } {
  const resultStatus = (() => {
    if (!tc.result) return '';
    try {
      const status = JSON.parse(tc.result)?.status;
      return typeof status === 'string' ? status : '';
    } catch {
      return '';
    }
  })();
  const canceled = resultStatus === 'canceled';
  const failed = resultStatus === 'error';
  const interrupted = resultStatus === 'interrupted';
  const args = (() => {
    try {
      const parsed = JSON.parse(tc.arguments);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  })();
  const str = (...keys: string[]) => {
    for (const key of keys) {
      const value = args[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };
  const name = tc.name.toLowerCase();

  // Rendering is the slow step — minutes, not seconds — so the label tracks
  // progress instead of claiming the work is already done.
  if (name.includes('generate_video'))
    return {
      icon: Sparkles,
      label: canceled
        ? m['agent.chat.generation_stopped']()
        : interrupted
          ? m['agent.chat.generation_interrupted']()
          : failed
            ? m['agent.chat.generation_failed']()
            : running
              ? m['agent.chat.tool_generating_video']()
              : m['agent.chat.tool_generated_video'](),
    };
  if (name.includes('animate_image'))
    return {
      icon: Film,
      label: canceled
        ? m['agent.chat.generation_stopped']()
        : interrupted
          ? m['agent.chat.generation_interrupted']()
          : failed
            ? m['agent.chat.generation_failed']()
            : running
              ? m['agent.chat.tool_animating_image']()
              : m['agent.chat.tool_animated_image'](),
    };
  if (name.includes('bash') || name.includes('shell') || name.includes('exec'))
    return {
      icon: Terminal,
      label: m['agent.chat.tool_ran']({
        target: str('command', 'cmd', 'script') || tc.name,
      }),
    };
  if (name.includes('glob') || name.includes('grep') || name.includes('search'))
    return {
      icon: Search,
      label: m['agent.chat.tool_searched']({
        target: str('pattern', 'query', 'q', 'path') || tc.name,
      }),
    };
  if (name.includes('write') || name.includes('edit') || name.includes('patch'))
    return {
      icon: PenLine,
      label: m['agent.chat.tool_wrote']({
        target: str('path', 'file_path', 'filename') || tc.name,
      }),
    };
  if (name.includes('read') || name.includes('view') || name.includes('cat'))
    return {
      icon: FileText,
      label: m['agent.chat.tool_read']({
        target: str('path', 'file_path', 'filename') || tc.name,
      }),
    };
  if (name.includes('list') || name.includes('ls'))
    return {
      icon: FolderOpen,
      label: m['agent.chat.tool_listed']({
        target: str('path', 'dir', 'directory') || '.',
      }),
    };
  if (name.includes('video') || name.includes('clip'))
    return { icon: Film, label: tc.name };

  const rest = Object.values(args)
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .join(', ');
  return { icon: Wrench, label: rest ? `${tc.name} · ${rest}` : tc.name };
}

/**
 * Tool activity renders as quiet one-line rows in the transcript flow (no
 * card), each expandable to its raw input/output.
 */
function ToolGroupBlock({
  msg,
  surfacedSrcs,
  sessionId,
}: {
  msg: ToolGroupMessage;
  surfacedSrcs: Set<string>;
  sessionId: string;
}) {
  const [expandedTool, setExpandedTool] = useState<Record<string, boolean>>({});

  function toggleTool(id: string) {
    setExpandedTool((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="flex min-w-0 justify-start overflow-hidden">
      <div className="w-full min-w-0 space-y-1.5 overflow-hidden">
        {msg.content && (
          <div className="min-w-0 overflow-hidden">
            <MarkdownContent
              content={msg.content}
              surfacedSrcs={surfacedSrcs}
              sessionId={sessionId}
            />
          </div>
        )}

        {msg.tools.map((tc) => {
          const isExpanded = !!expandedTool[tc.id];
          const running = tc.result === undefined;
          const { icon: Icon, label } = toolPresentation(tc, running);
          return (
            <div key={tc.id} className="min-w-0">
              <button
                type="button"
                onClick={() => toggleTool(tc.id)}
                className="text-muted-foreground hover:text-foreground group flex w-full items-center gap-2 py-0.5 text-left text-sm"
              >
                {running ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                ) : (
                  <Icon className="size-4 shrink-0 opacity-70" />
                )}
                <span className="truncate">{label}</span>
                {tc.metadata?.sandbox && (
                  <span
                    title={m['agent.chat.sandbox_hint']()}
                    className="shrink-0 text-emerald-600 dark:text-emerald-400"
                  >
                    <ShieldCheck className="size-3.5" />
                  </span>
                )}
                {isExpanded ? (
                  <ChevronDown className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
                )}
              </button>

              {isExpanded && (
                <div className="border-border mt-1 mb-2 ml-2 space-y-2 border-l pl-4">
                  <div>
                    <p className="text-muted-foreground mb-1 text-[10px] font-medium uppercase">
                      {m['agent.chat.input']()}
                    </p>
                    <pre className="bg-muted/50 max-h-40 overflow-x-hidden rounded-lg p-2 font-mono text-xs break-all whitespace-pre-wrap">
                      {(() => {
                        try {
                          return JSON.stringify(
                            JSON.parse(tc.arguments),
                            null,
                            2
                          );
                        } catch {
                          return tc.arguments;
                        }
                      })()}
                    </pre>
                  </div>
                  {tc.result != null ? (
                    <div>
                      <p className="text-muted-foreground mb-1 text-[10px] font-medium uppercase">
                        {m['agent.chat.output']()}
                      </p>
                      <pre className="bg-muted/50 max-h-60 overflow-x-hidden rounded-lg p-2 font-mono text-xs break-all whitespace-pre-wrap">
                        {tc.result.length > 2000
                          ? tc.result.slice(0, 2000) + '…'
                          : tc.result}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-muted-foreground/70 text-xs italic">
                      {m['agent.chat.executing']()}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarkdownContent({
  content,
  suppressInlineImages = false,
  surfacedSrcs,
  sessionId,
}: {
  content: string;
  suppressInlineImages?: boolean;
  surfacedSrcs?: Set<string>;
  sessionId: string;
}) {
  // Pull `data:image` markdown out before passing to ReactMarkdown — long
  // base64 bodies and stray newlines around `]/(` regularly trip up the
  // parser, and we already render them as native <img>.
  const parts = useMemo(() => splitDataImages(content), [content]);

  return (
    <div className="text-foreground min-w-0 space-y-3 overflow-hidden text-sm leading-relaxed break-words [&_p]:m-0 [&_p+p]:mt-3">
      {parts.map((p, i) => {
        if (p.type === 'image') {
          const src = p.src;
          if (suppressInlineImages) return null;
          if (surfacedSrcs?.has(src)) return null;
          return (
            <AgentMedia
              key={i}
              src={src}
              alt={p.alt}
              loading="lazy"
              className="border-border my-2 max-h-60 w-auto max-w-full rounded-md border object-contain"
            />
          );
        }
        if (!p.text) return null;
        return (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm, remarkBreaks]}
            urlTransform={(url, key) => agentUrlTransform(url, key)}
            components={{
              img: ({ src, alt }) => {
                const url = src as string;
                // Already surfaced as an attached image on this bubble
                // (or a sibling) — don't render a duplicate inline.
                if (surfacedSrcs?.has(url)) return null;
                if (suppressInlineImages) return null;
                return (
                  <AgentMedia
                    src={url}
                    alt={alt || ''}
                    loading="lazy"
                    className={cn(
                      'border-border my-2 max-h-60 w-auto max-w-full rounded-md border object-contain'
                    )}
                  />
                );
              },
              a: ({ href, children }) => (
                <a
                  href={href as string}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {children}
                </a>
              ),
              code: ({ children }) => (
                <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">
                  {children}
                </code>
              ),
            }}
          >
            {p.text}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}

/**
 * One piece of media in the transcript. A still is a button that opens the
 * preview pane; a clip plays in place, because wrapping a player in a button
 * would make every press of ▶ also throw the pane open. The clip gets its own
 * corner control for that instead.
 */
function AgentMedia({
  src,
  alt,
  className,
  loading,
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
}) {
  const { openMedia } = usePreviewPane();
  const open = () =>
    openMedia({ src, alt, name: mediaNameFromUrl(src) || alt });

  if (isVideoUrl(src)) {
    return (
      <div className="group relative block max-w-full overflow-hidden rounded-md">
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          aria-label={alt || undefined}
          className={className}
        />
        <button
          type="button"
          onClick={open}
          title={m['agent.preview.open_video']()}
          className="absolute top-3 right-3 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          {m['agent.preview.open_video']()}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="group relative block max-w-full cursor-zoom-in overflow-hidden rounded-md text-left"
      title={m['agent.preview.open_image']()}
    >
      <img src={src} alt={alt} loading={loading} className={className} />
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
        {m['agent.preview.open_image']()}
      </span>
    </button>
  );
}
