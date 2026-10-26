import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Files whose copy is not part of homepage first paint. Their message keys
 * stay in the deferred catalog and the components must not call them until
 * the surface is open (under Suspense).
 */
export const DEFERRED_MESSAGE_FILES = [
  'src/components/payment-provider-modal.tsx',
  'src/components/auth-prompt.tsx',
  'src/blocks/duo-upgrade-offer.tsx',
  'src/blocks/video-retention-offer.tsx',
  'src/blocks/effects-announce.tsx',
  'src/blocks/credit-purchase-dialog.tsx',
  'src/blocks/support-widget-dialog.tsx',
] as const;

const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs'];
const SKIP_EXTENSION = /\.(css|svg|json|mdx|png|jpe?g|webp|gif|mp4|woff2?)$/;

function resolveFile(base: string): string | null {
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...SOURCE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function resolveSpecifier(fromFile: string, spec: string, srcRoot: string) {
  if (spec.startsWith('@/')) {
    return resolveFile(path.join(srcRoot, spec.slice(2)));
  }
  if (spec.startsWith('.')) {
    return resolveFile(path.resolve(path.dirname(fromFile), spec));
  }
  return null;
}

function shouldFollow(spec: string): boolean {
  if (spec.includes('paraglide/')) return false;
  if (spec.startsWith('virtual:')) return false;
  return spec.startsWith('@/') || spec.startsWith('.');
}

function specsIn(source: string): string[] {
  const fromImport =
    /\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g;
  const sideImport = /\bimport\s+['"]([^'"]+)['"]/g;
  const specs: string[] = [];
  for (const match of source.matchAll(fromImport)) {
    const statement = match[0];
    if (/^(?:import|export)\s+type\b/.test(statement)) continue;
    if (match[1]) specs.push(match[1]);
  }
  for (const match of source.matchAll(sideImport)) {
    if (match[1]) specs.push(match[1]);
  }
  return specs;
}

export function collectShellMessageKeys(root = process.cwd()): Set<string> {
  const srcRoot = path.join(root, 'src');
  const deferred = new Set(
    DEFERRED_MESSAGE_FILES.map((file) => path.resolve(root, file))
  );
  const keys = new Set<string>();
  const seen = new Set<string>();
  const queue = [
    path.join(srcRoot, 'routes/index.tsx'),
    path.join(srcRoot, 'routes/__root.tsx'),
  ];

  while (queue.length) {
    const file = queue.pop()!;
    const resolved = path.resolve(file);
    if (seen.has(resolved) || deferred.has(resolved)) continue;
    seen.add(resolved);
    if (SKIP_EXTENSION.test(resolved)) continue;
    if (!existsSync(resolved) || !statSync(resolved).isFile()) continue;

    const source = readFileSync(resolved, 'utf8');
    const messageKey = /\bm\[\s*['"]([^'"\\]+)['"]\s*\]/g;
    for (const match of source.matchAll(messageKey)) {
      if (match[1]) keys.add(match[1]);
    }
    for (const spec of specsIn(source)) {
      if (!shouldFollow(spec) || SKIP_EXTENSION.test(spec)) continue;
      const next = resolveSpecifier(resolved, spec, srcRoot);
      if (!next || deferred.has(path.resolve(next))) continue;
      queue.push(next);
    }
  }

  return keys;
}
