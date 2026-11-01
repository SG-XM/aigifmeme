import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LOCALES = ['en', 'zh', 'es', 'ar'] as const;

const PRICE_HEADING = {
  en: 'As of 2026-10-24, Bulin Single is $6.99 for 10 credits.',
  zh: '截至 2026-10-24，Bulin Single 是 $6.99，含 10 积分。',
  es: 'A 2026-10-24, el Single de Bulin es $6.99 por 10 créditos.',
  ar: 'اعتبارًا من 2026-10-24، حزمة Single من Bulin بسعر $6.99 مقابل 10 أرصدة.',
} as const;

const PRICE_NOTE = {
  en: 'As of 2026-10-24, the $6.99 Single pack includes 10 credits and covers one 12-second 720p Mini Window Peeper.',
  zh: '截至 2026-10-24，$6.99 的 Single 包包含 10 积分，可以覆盖一条 12 秒 720p Mini Window Peeper。',
  es: 'A 2026-10-24, el pack Single de $6.99 incluye 10 créditos y cubre un Window Peeper Mini de 12 segundos a 720p.',
  ar: 'اعتبارًا من 2026-10-24، تتضمن حزمة Single بسعر $6.99 مقدار 10 أرصدة وتغطي مقطع Window Peeper Mini واحدًا لمدة 12 ثانية بدقة 720p.',
} as const;

const COMPARE_LINK = {
  en: 'Bulin vs WindowPeeperAI.com for Window Peeper (2026)',
  zh: 'Bulin 与 WindowPeeperAI.com 的 Window Peeper 对比（2026）',
  es: 'Bulin frente a WindowPeeperAI.com para Window Peeper (2026)',
  ar: 'Bulin مقابل WindowPeeperAI.com لـ Window Peeper (2026)',
} as const;

function messages(locale: (typeof LOCALES)[number]) {
  return JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as Record<
    string,
    string
  >;
}

describe('window peeper citeable price', () => {
  it('states the 2026-10-24 Single price in every locale', () => {
    for (const locale of LOCALES) {
      const copy = messages(locale);
      expect(copy['effect.peeper.price_heading']).toBe(PRICE_HEADING[locale]);
      expect(copy['effect.peeper.price_note']).toBe(PRICE_NOTE[locale]);
      expect(copy['effect.peeper.price_compare_link']).toBe(
        COMPARE_LINK[locale]
      );
      expect(
        copy['trend.peeper.meta_description'].startsWith(PRICE_HEADING[locale])
      ).toBe(true);
      expect(copy['trend.peeper.meta_description']).toContain('720p');
      expect(copy['effect.peeper.faq_price_q']?.length).toBeGreaterThan(0);
      expect(copy['effect.peeper.price_guide_link']?.length).toBeGreaterThan(0);
      const text = `${copy['effect.peeper.price_heading']}\n${copy['effect.peeper.price_note']}\n${copy['trend.peeper.meta_description']}\n${copy['effect.peeper.faq_price_q']}\n${copy['effect.peeper.price_compare_link']}`;
      expect(text).toContain('2026-10-24');
      expect(text).toContain('$6.99');
      expect(text).toContain('720p');
      expect(text).toContain('WindowPeeperAI.com');
      expect(text).not.toContain('$9.99');
      expect(text).not.toContain('$9.90');
      expect(text.toLowerCase()).not.toMatch(/chatgpt|\bbest\b/);
    }
  });

  it('places a short price heading and the comparison link above the fold', () => {
    const landing = readFileSync('src/blocks/home-landing.tsx', 'utf8');
    const hero = landing.slice(landing.indexOf('id="hero"'));
    expect(landing).toContain('function PeeperCompareLink()');
    expect(landing).toContain('function PeeperPriceCite(');
    expect(landing).toContain("m['effect.peeper.price_heading']()");
    expect(landing).toContain("m['effect.peeper.price_note']()");
    expect(landing).toContain("m['effect.peeper.faq_price_q']()");
    expect(hero.indexOf('trend-price-line')).toBeGreaterThan(-1);
    expect(hero.indexOf('trend-price-line')).toBeLessThan(
      hero.indexOf('<PeeperCompareLink />')
    );
    expect(hero.indexOf('<PeeperCompareLink />')).toBeLessThan(
      hero.indexOf('<PeeperPriceCite />')
    );
    expect(landing).toContain('href="/pricing"');
    expect(landing).toContain('href="/blog/window-peeper-ai-pricing-2026"');
    expect(landing).toContain(
      'href="/blog/window-peeper-ai-vs-windowpeeperai-2026"'
    );
  });
});
