type BulinMessageFn = (
  inputs?: Record<string, unknown>,
  options?: { locale?: string }
) => string;

type BulinMessagePreloadLink = {
  rel: 'modulepreload';
  href: string;
  'data-bulin-msg': 'shell' | 'rest';
};

declare module 'virtual:bulin-shell-keys' {
  export const shellKeys: Set<string>;
}

declare module 'virtual:bulin-msg-urls' {
  export const messageChunkUrls: Record<string, string>;
}

declare module 'virtual:bulin-msg-preloads' {
  export function messagePreloadLinks(
    locale: string,
    pathname: string
  ): BulinMessagePreloadLink[];
}

declare module 'virtual:bulin-msg-en-shell' {
  export const messages: Record<string, BulinMessageFn>;
}
declare module 'virtual:bulin-msg-en-rest' {
  export const messages: Record<string, BulinMessageFn>;
}
declare module 'virtual:bulin-msg-zh-shell' {
  export const messages: Record<string, BulinMessageFn>;
}
declare module 'virtual:bulin-msg-zh-rest' {
  export const messages: Record<string, BulinMessageFn>;
}
declare module 'virtual:bulin-msg-es-shell' {
  export const messages: Record<string, BulinMessageFn>;
}
declare module 'virtual:bulin-msg-es-rest' {
  export const messages: Record<string, BulinMessageFn>;
}
declare module 'virtual:bulin-msg-ar-shell' {
  export const messages: Record<string, BulinMessageFn>;
}
declare module 'virtual:bulin-msg-ar-rest' {
  export const messages: Record<string, BulinMessageFn>;
}
