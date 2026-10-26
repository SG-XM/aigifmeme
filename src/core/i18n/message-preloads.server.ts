import { messageChunkUrls } from 'virtual:bulin-msg-urls';

import { isMessagesShellOnlyPath } from '@/core/i18n/shell-path';

type MessagePreloadLink = {
  rel: 'modulepreload';
  href: string;
  'data-bulin-msg': 'shell' | 'rest';
};

export function messagePreloadLinks(
  locale: string,
  pathname: string
): MessagePreloadLink[] {
  const links: MessagePreloadLink[] = [];
  const shell = messageChunkUrls[`${locale}/shell`];
  if (shell) {
    links.push({
      rel: 'modulepreload',
      href: shell,
      'data-bulin-msg': 'shell',
    });
  }
  if (!isMessagesShellOnlyPath(pathname)) {
    const rest = messageChunkUrls[`${locale}/rest`];
    if (rest) {
      links.push({
        rel: 'modulepreload',
        href: rest,
        'data-bulin-msg': 'rest',
      });
    }
  }
  return links;
}
