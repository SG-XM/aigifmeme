const SHELL_ONLY_PATHS = new Set(['/', '/zh', '/es', '/ar']);

/** Homepage URLs whose first paint only needs the shell message catalog. */
export function isMessagesShellOnlyPath(pathname: string): boolean {
  const bare = pathname.split('?')[0]?.split('#')[0] ?? '/';
  const path = bare.length > 1 ? bare.replace(/\/+$/, '') : bare;
  return SHELL_ONLY_PATHS.has(path || '/');
}
