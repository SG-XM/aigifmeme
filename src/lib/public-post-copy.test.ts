import { describe, expect, it } from 'vitest';

import { scrubPublicPostCopy } from './public-post-copy';

describe('scrubPublicPostCopy', () => {
  it('rewrites English unfinished Window Peeper claims and drops the pending research line', () => {
    const input = [
      'This article describes that path for `/window-peeper-ai`. The page was still being added when these facts were checked (23 October 2026), so treat steps as the same CreateVideo pattern used on other Bulin 47 AI effect pages — not as a scored quality or speed report.',
      '',
      '- Bulin 47 AI create flow checked in product code on 23 October 2026. `/window-peeper-ai` was not yet listed in `ai-video-paths.ts` at check time.',
      '- TikTok demos linked as external references only.',
      '- ChatGPT live research: pending at publish time.',
      '',
      'Can Bulin 47 AI promise likeness or render time yet?',
      '',
      'No in this article. The page was new at fact-check time; judge your own full clip after download.',
      '',
      'The `/window-peeper-ai` page was still being added — this article is not a live quality or latency report.',
      '- Product code not yet integrated with the live page.',
    ].join('\n');

    const output = scrubPublicPostCopy(input);

    expect(output).toContain(
      'Window Peeper generation is available at [/window-peeper](/window-peeper).'
    );
    expect(output).not.toContain('/ai-video/window-peeper');
    expect(output).not.toContain('/window-peeper-ai');
    expect(output).toContain('checked in product code on 23 October 2026.');
    expect(output).toContain(
      'TikTok demos linked as external references only.'
    );
    expect(output).toContain(
      'Likeness and render time vary. Review the full clip after you download it.'
    );
    expect(output).not.toMatch(
      /pending at publish|not yet listed|still being added|not yet integrated|fact-check time/i
    );
  });

  it('rewrites the same claims in zh, es, and ar', () => {
    const output = scrubPublicPostCopy(
      [
        '事实核验日（2026-10-23）该页仍在添加，步骤按其他效果页的 CreateVideo 模式理解，不是画质或速度评分报告。',
        '当时 `ai-video-paths.ts` 尚未列入 peeper。',
        '本文不能。核验时页面仍新；请自行审完整片。',
        '- ChatGPT 实测：发布时待完成。',
        '`/window-peeper-ai` 当时仍在添加，本文不是线上画质或耗时报告。',
        '- ChatGPT 实测调研：发布时仍为待完成。',
        '`/window-peeper-ai` aún no figuraba en `ai-video-paths.ts`.',
        'El 23 oct 2026 la página aún se añadía: trata los pasos como el patrón CreateVideo de otros efectos, no como un informe de calidad o velocidad.',
        '`/window-peeper-ai` aún se estaba añadiendo: este artículo no es un informe de calidad o latencia en vivo.',
        '- ChatGPT: pendiente al publicar.',
        '- Investigación ChatGPT: pendiente al publicar.',
        '`/window-peeper-ai` لم تكن بعد في `ai-video-paths.ts`.',
        'في 23 أكتوبر 2026 كانت الصفحة ما تزال تُضاف؛ اعتبر الخطوات نمط CreateVideo لصفحات التأثير الأخرى لا تقرير جودة أو سرعة.',
        'صفحة `/window-peeper-ai` كانت ما تزال تُضاف: ليست تقرير جودة أو زمن حي.',
        '- ChatGPT: معلّق عند النشر.',
        '- بحث ChatGPT: معلّق عند النشر.',
      ].join('\n')
    );

    expect(output).toContain('Window Peeper 生成已在');
    expect(output).toContain('La generación de Window Peeper está disponible');
    expect(output).toContain('توليد Window Peeper متاح');
    expect(output).toContain('/window-peeper');
    expect(output).not.toContain('/ai-video/window-peeper');
    expect(output).not.toContain('/window-peeper-ai');
    expect(output).toContain('下载后请整段审片');
    expect(output).not.toMatch(
      /待完成|尚未列入|仍在添加|页面仍新|pendiente al publicar|aún no figuraba|aún se añadía|aún se estaba añadiendo|معلّق عند النشر|لم تكن بعد|ما تزال تُضاف/
    );
  });

  it('rewrites retired Window Peeper URLs and leaves the tag name alone', () => {
    const output = scrubPublicPostCopy(
      'Open [/ai-video/window-peeper](/ai-video/window-peeper) or `/window-peeper-ai`. Tag: window-peeper.'
    );
    expect(output).toBe(
      'Open [/window-peeper](/window-peeper) or `/window-peeper`. Tag: window-peeper.'
    );
  });

  it('keeps a real ChatGPT citation that is not an unfinished-research disclaimer', () => {
    const input =
      'The other route ChatGPT describes: do it yourself with a video model.';
    expect(scrubPublicPostCopy(input)).toBe(input);
  });
});
