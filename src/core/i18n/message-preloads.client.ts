type MessagePreloadLink = {
  rel: 'modulepreload';
  href: string;
  'data-bulin-msg': 'shell' | 'rest';
};

export function messagePreloadLinks(
  _locale: string,
  _pathname: string
): MessagePreloadLink[] {
  if (typeof document === 'undefined') return [];
  const links: MessagePreloadLink[] = [];
  for (const node of document.querySelectorAll('link[data-bulin-msg]')) {
    const kind = node.getAttribute('data-bulin-msg');
    const href = node.getAttribute('href');
    if ((kind !== 'shell' && kind !== 'rest') || !href) continue;
    links.push({ rel: 'modulepreload', href, 'data-bulin-msg': kind });
  }
  return links;
}
