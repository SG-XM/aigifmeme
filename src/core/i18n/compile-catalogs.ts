import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const MESSAGE_LOCALES = ['en', 'zh', 'es', 'ar'] as const;
export type MessageLocale = (typeof MESSAGE_LOCALES)[number];

const LOCALE_FN = /const (en|zh|es|ar)_[A-Za-z0-9_]+ =/g;
const EXPORT_KEY = /export\s*\{\s*[A-Za-z0-9_]+\s+as\s+(['"])([^'"]+)\1\s*\}/;

export interface CompiledMessage {
  key: string;
  locales: Record<MessageLocale, string>;
}

function matchBraces(source: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < source.length) {
    const char = source[i]!;
    if (char === '"' || char === "'" || char === '`') {
      i = skipString(source, i);
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  throw new Error('Unbalanced braces in compiled message');
}

function skipString(source: string, start: number): number {
  const quote = source[start]!;
  let i = start + 1;
  if (quote === '`') {
    while (i < source.length) {
      if (source[i] === '\\') {
        i += 2;
        continue;
      }
      if (source[i] === '`') return i + 1;
      if (source[i] === '$' && source[i + 1] === '{') {
        i = matchBraces(source, i + 1);
        continue;
      }
      i += 1;
    }
  } else {
    while (i < source.length) {
      if (source[i] === '\\') {
        i += 2;
        continue;
      }
      if (source[i] === quote) return i + 1;
      i += 1;
    }
  }
  throw new Error('Unterminated string in compiled message');
}

export function parseMessageModule(
  source: string,
  filename = 'message.js'
): CompiledMessage {
  const exported = EXPORT_KEY.exec(source);
  if (!exported?.[2]) {
    throw new Error(`No message export in ${filename}`);
  }
  const locales = {} as Record<MessageLocale, string>;
  for (const match of source.matchAll(LOCALE_FN)) {
    const locale = match[1] as MessageLocale;
    const commentEnd = source.indexOf('*/', match.index);
    const searchFrom = commentEnd === -1 ? match.index : commentEnd + 2;
    const arrow = source.indexOf('=>', searchFrom);
    if (arrow === -1) {
      throw new Error(`No arrow function for ${locale} in ${filename}`);
    }
    let bodyAt = arrow + 2;
    while (
      source[bodyAt] === ' ' ||
      source[bodyAt] === '\n' ||
      source[bodyAt] === '\t' ||
      source[bodyAt] === '\r'
    ) {
      bodyAt += 1;
    }
    if (source[bodyAt] !== '{') {
      throw new Error(`Expected block body for ${locale} in ${filename}`);
    }
    const head = source.slice(searchFrom, arrow);
    const groups = [...head.matchAll(/\(([^)]*)\)/g)];
    const params = groups.length
      ? `(${groups[groups.length - 1]![1]!.trim()})`
      : '()';
    const end = matchBraces(source, bodyAt);
    locales[locale] = `${params} => ${source.slice(bodyAt, end)}`;
  }
  for (const locale of MESSAGE_LOCALES) {
    if (!locales[locale]) {
      throw new Error(`Missing ${locale} function in ${filename}`);
    }
  }
  return { key: exported[2], locales };
}

export function loadCompiledMessages(
  messagesDir: string
): Map<string, CompiledMessage> {
  const compiled = new Map<string, CompiledMessage>();
  for (const name of readdirSync(messagesDir)) {
    if (!name.endsWith('.js') || name === '_index.js') continue;
    const filename = path.join(messagesDir, name);
    const message = parseMessageModule(readFileSync(filename, 'utf8'), name);
    if (compiled.has(message.key)) {
      throw new Error(`Duplicate compiled message ${message.key}`);
    }
    compiled.set(message.key, message);
  }
  return compiled;
}

export function renderCatalog(
  locale: MessageLocale,
  keys: string[],
  compiled: Map<string, CompiledMessage>
): string {
  const lines = [...keys].sort().map((key) => {
    const message = compiled.get(key);
    if (!message) throw new Error(`Missing compiled message ${key}`);
    return `  ${JSON.stringify(key)}: ${message.locales[locale]},`;
  });
  return `export const messages = {\n${lines.join('\n')}\n};\n`;
}
