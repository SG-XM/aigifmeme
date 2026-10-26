import { shellKeys } from 'virtual:bulin-shell-keys';

import { getLocale } from '@/paraglide/runtime.js';

type MessageFn = (
  inputs?: Record<string, unknown>,
  options?: { locale?: string }
) => string;

type CatalogModule = { messages: Record<string, MessageFn> };

const shells = new Map<string, Record<string, MessageFn>>();
const rests = new Map<string, Record<string, MessageFn>>();
const shellLoads = new Map<string, Promise<void>>();
const restLoads = new Map<string, Promise<void>>();

const loaders = {
  en: {
    shell: () => import('virtual:bulin-msg-en-shell') as Promise<CatalogModule>,
    rest: () => import('virtual:bulin-msg-en-rest') as Promise<CatalogModule>,
  },
  zh: {
    shell: () => import('virtual:bulin-msg-zh-shell') as Promise<CatalogModule>,
    rest: () => import('virtual:bulin-msg-zh-rest') as Promise<CatalogModule>,
  },
  es: {
    shell: () => import('virtual:bulin-msg-es-shell') as Promise<CatalogModule>,
    rest: () => import('virtual:bulin-msg-es-rest') as Promise<CatalogModule>,
  },
  ar: {
    shell: () => import('virtual:bulin-msg-ar-shell') as Promise<CatalogModule>,
    rest: () => import('virtual:bulin-msg-ar-rest') as Promise<CatalogModule>,
  },
} as const;

type CatalogLocale = keyof typeof loaders;

function isCatalogLocale(locale: string): locale is CatalogLocale {
  return Object.prototype.hasOwnProperty.call(loaders, locale);
}

function loadCatalog(locale: string, kind: 'shell' | 'rest'): Promise<void> {
  if (!isCatalogLocale(locale)) {
    return Promise.reject(new Error(`Unknown message locale: ${locale}`));
  }
  const target = kind === 'shell' ? shells : rests;
  const inflight = kind === 'shell' ? shellLoads : restLoads;
  if (target.has(locale)) return Promise.resolve();
  const pending = inflight.get(locale);
  if (pending) return pending;
  const next = loaders[locale][kind]().then((mod) => {
    target.set(locale, mod.messages);
  });
  inflight.set(locale, next);
  return next;
}

export function ensureShell(locale: string): Promise<void> {
  return loadCatalog(locale, 'shell');
}

export function ensureRest(locale: string): Promise<void> {
  return loadCatalog(locale, 'rest');
}

/** Load the active request locale before SSR renders any copy. */
export async function ensureRequestMessages(): Promise<void> {
  const locale = getLocale();
  await Promise.all([ensureShell(locale), ensureRest(locale)]);
}

export function readMessage(
  key: string,
  inputs?: Record<string, unknown>,
  options?: { locale?: string }
): string {
  const locale = options?.locale || getLocale();
  const fn = shells.get(locale)?.[key] ?? rests.get(locale)?.[key];
  if (fn) return fn(inputs ?? {}, options);

  const missing = () =>
    new Error(`Message catalog not ready for ${locale} (${key})`);

  if (shellKeys.has(key)) {
    if (!shells.has(locale)) {
      if (import.meta.env.SSR) throw missing();
      throw ensureShell(locale);
    }
    throw new Error(`Missing shell message ${locale}:${key}`);
  }

  if (!rests.has(locale)) {
    if (import.meta.env.SSR) throw missing();
    throw ensureRest(locale);
  }
  return key;
}
