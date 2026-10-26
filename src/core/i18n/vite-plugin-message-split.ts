import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

import {
  loadCompiledMessages,
  MESSAGE_LOCALES,
  renderCatalog,
} from './compile-catalogs';
import { collectShellMessageKeys } from './shell-graph';

const CATALOG_ID = /^virtual:bulin-msg-(en|zh|es|ar)-(shell|rest)$/;
const RESOLVED_CATALOG = /^\0bulin-msg-(en|zh|es|ar)-(shell|rest)$/;

const PROXY_SOURCE = `import { readMessage } from '@/core/i18n/message-runtime';

const binders = new Map();
function bind(key) {
  let fn = binders.get(key);
  if (!fn) {
    fn = (inputs, options) => readMessage(key, inputs, options);
    binders.set(key, fn);
  }
  return fn;
}
export const m = new Proxy({}, {
  get(_target, prop) {
    if (typeof prop !== 'string' || prop === 'then') return undefined;
    return bind(prop);
  },
});
`;

interface CatalogBuild {
  stamp: string;
  shellKeys: string[];
  sources: Record<string, string>;
}

let catalogBuild: CatalogBuild | null = null;

function manifestPath(root: string) {
  return path.join(root, 'node_modules/.vite/bulin-message-chunks.json');
}

function isMessagesEntry(id: string) {
  const clean = id.split('?')[0] ?? id;
  return clean.endsWith(`${path.sep}paraglide${path.sep}messages.js`);
}

function buildCatalogs(root: string): CatalogBuild {
  const enJson = path.join(root, 'messages/en.json');
  const messagesDir = path.join(root, 'src/paraglide/messages');
  if (!existsSync(messagesDir)) {
    throw new Error(
      'Paraglide messages are missing. Run pnpm i18n:compile before dev or build.'
    );
  }
  const stamp = `${statSync(enJson).mtimeMs}:${statSync(messagesDir).mtimeMs}`;
  if (catalogBuild?.stamp === stamp) return catalogBuild;

  const shellKeys = [...collectShellMessageKeys(root)].sort();
  const compiled = loadCompiledMessages(messagesDir);
  const missing = shellKeys.filter((key) => !compiled.has(key));
  if (missing.length) {
    throw new Error(
      `Shell messages missing from paraglide output: ${missing.slice(0, 12).join(', ')}`
    );
  }
  const shellSet = new Set(shellKeys);
  const restKeys = [...compiled.keys()].filter((key) => !shellSet.has(key));
  const sources: Record<string, string> = {};
  for (const locale of MESSAGE_LOCALES) {
    sources[`${locale}-shell`] = renderCatalog(locale, shellKeys, compiled);
    sources[`${locale}-rest`] = renderCatalog(locale, restKeys, compiled);
  }
  catalogBuild = { stamp, shellKeys, sources };
  return catalogBuild;
}

function joinBase(base: string, fileName: string) {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${fileName}`;
}

export function messageSplitPlugin(): Plugin {
  let root = process.cwd();
  let base = '/';

  return {
    name: 'bulin-message-split',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      base = config.base || '/';
    },
    resolveId(id) {
      if (id === 'virtual:bulin-msg-preloads') {
        const client = this.environment?.name === 'client';
        return path.resolve(
          root,
          client
            ? 'src/core/i18n/message-preloads.client.ts'
            : 'src/core/i18n/message-preloads.server.ts'
        );
      }
      if (
        id === 'virtual:bulin-shell-keys' ||
        id === 'virtual:bulin-msg-urls' ||
        CATALOG_ID.test(id)
      ) {
        return `\0${id.slice('virtual:'.length)}`;
      }
      return null;
    },
    load(id) {
      const clean = id.split('?')[0] ?? id;
      if (isMessagesEntry(clean)) return PROXY_SOURCE;
      if (clean === '\0bulin-shell-keys') {
        const data = buildCatalogs(root);
        return `export const shellKeys = new Set(${JSON.stringify(data.shellKeys)});\n`;
      }
      const catalog = RESOLVED_CATALOG.exec(clean);
      if (catalog) {
        const data = buildCatalogs(root);
        const source = data.sources[`${catalog[1]}-${catalog[2]}`];
        if (!source) {
          throw new Error(`Unknown message catalog ${clean}`);
        }
        return source;
      }
      if (clean === '\0bulin-msg-urls') {
        const file = manifestPath(root);
        const json = existsSync(file) ? readFileSync(file, 'utf8') : '{}';
        return `export const messageChunkUrls = ${json};\n`;
      }
      return null;
    },
    generateBundle(_options, bundle) {
      if (this.environment?.name !== 'client') return;
      const urls: Record<string, string> = {};
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue;
        const ids = [item.facadeModuleId, ...(item.moduleIds ?? [])].filter(
          (value): value is string => Boolean(value)
        );
        for (const modId of ids) {
          const match = modId.match(/bulin-msg-(en|zh|es|ar)-(shell|rest)/);
          if (!match) continue;
          urls[`${match[1]}/${match[2]}`] = joinBase(base, item.fileName);
        }
      }
      const file = manifestPath(root);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(urls));
      if (Object.keys(urls).length !== 8) {
        this.warn(
          `bulin message chunks recorded ${Object.keys(urls).length}/8`
        );
      }
    },
    handleHotUpdate(ctx) {
      const file = ctx.file.split('\\').join('/');
      if (
        !file.includes('/messages/') &&
        !file.includes('/paraglide/messages')
      ) {
        return;
      }
      catalogBuild = null;
      const modules = [];
      for (const mod of ctx.server.moduleGraph.idToModuleMap.values()) {
        if (
          mod.id?.includes('bulin-msg') ||
          mod.id?.includes('bulin-shell-keys') ||
          mod.id?.includes('paraglide/messages.js')
        ) {
          modules.push(mod);
        }
      }
      return modules;
    },
  };
}
