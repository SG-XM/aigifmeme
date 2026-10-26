import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  loadCompiledMessages,
  renderCatalog,
} from '@/core/i18n/compile-catalogs';
import { collectShellMessageKeys } from '@/core/i18n/shell-graph';
import { isMessagesShellOnlyPath } from '@/core/i18n/shell-path';

const root = path.resolve(import.meta.dirname, '../../..');

function ensureParaglide() {
  const dir = path.join(root, 'src/paraglide/messages');
  if (!existsSync(dir)) {
    execSync('pnpm i18n:compile', { cwd: root, stdio: 'inherit' });
  }
  return dir;
}

describe('homepage message shell', () => {
  it('treats locale homepages as shell-only', () => {
    expect(isMessagesShellOnlyPath('/')).toBe(true);
    expect(isMessagesShellOnlyPath('/zh')).toBe(true);
    expect(isMessagesShellOnlyPath('/es/')).toBe(true);
    expect(isMessagesShellOnlyPath('/ar?utm=1')).toBe(true);
    expect(isMessagesShellOnlyPath('/pricing')).toBe(false);
    expect(isMessagesShellOnlyPath('/zh/pricing')).toBe(false);
  });

  it('keeps first-paint copy and defers other surfaces', () => {
    const keys = collectShellMessageKeys(root);
    for (const key of [
      'recast.bulin.summary',
      'home.meta_title',
      'create.title',
      'landing.pricing.title',
      'common.support.open_label',
      'settings.credits.credits',
      'common.video.mute',
      'common.not_found.message',
    ]) {
      expect(keys.has(key), key).toBe(true);
    }
    for (const key of [
      'admin.users.credits_granted',
      'settings.billing.title',
      'common.pricing.choose_payment',
      'video.clone.prompts.woman',
      'announce.effects.title_before',
      'common.support.title',
      'duo_upgrade.headline',
      'retention.title',
    ]) {
      expect(keys.has(key), key).toBe(false);
    }
  });

  it('builds one locale shell without the other catalogs', () => {
    const compiled = loadCompiledMessages(ensureParaglide());
    const shellKeys = [...collectShellMessageKeys(root)];
    const restKeys = [...compiled.keys()].filter(
      (key) => !shellKeys.includes(key)
    );
    const enShell = renderCatalog('en', shellKeys, compiled);
    const enRest = renderCatalog('en', restKeys, compiled);
    const zhShell = renderCatalog('zh', shellKeys, compiled);

    expect(enShell).toContain(
      'Uptown Funk AI Video Generator | One Photo, You Lead the Crew'
    );
    expect(enShell).not.toContain('免费 Bulin 47 AI 视频生成器');
    expect(enShell).not.toContain('一张照片，站到舞团最前面');
    expect(enShell).not.toContain('Credits granted');
    expect(enShell).not.toContain('const zh_');
    expect(zhShell).toContain('Uptown Funk AI 视频生成器｜一张照片，你带舞团');
    expect(enRest).toContain('Credits granted');
    expect(enShell.length).toBeLessThan(enRest.length);
    expect(shellKeys.length).toBeGreaterThan(50);
    expect(shellKeys.length).toBeLessThan(compiled.size / 2);
  });
});
