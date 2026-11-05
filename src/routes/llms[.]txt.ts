import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { isGonePath } from '@/lib/gone-paths';
import { isHiddenPublicPath } from '@/lib/public-page-visibility';
import { getSiteNameFn } from '@/lib/site-name-server';
import { m } from '@/paraglide/messages.js';
import { getLocale, localizeUrl, type Locale } from '@/paraglide/runtime.js';

const STATIC_PAGES: { path: string; title: string; description: string }[] = [
  {
    path: '',
    title: 'AI meme sticker GIF generator',
    description:
      'Generate AI meme stickers and animated GIF memes from ideas and prompts.',
  },
  {
    path: '/pricing',
    title: 'Pricing',
    description: 'Credits for sticker and GIF generations',
  },
];

function pagesFor(locale: string) {
  if (locale === 'zh') {
    return [
      {
        path: '',
        title: 'AI meme 贴纸 GIF 生成器',
        description: '用一句话生成 AI meme 贴纸和会动的 GIF 梗图。',
      },
      {
        path: '/pricing',
        title: '价格',
        description: '贴纸和 GIF 生成所用的积分',
      },
    ];
  }
  if (locale === 'es') {
    return [
      {
        path: '',
        title: 'Generador de stickers y GIF de memes con IA',
        description:
          'Genera stickers de memes y GIF animados a partir de una idea.',
      },
      {
        path: '/pricing',
        title: 'Precios',
        description: 'Créditos para stickers y GIF',
      },
    ];
  }
  if (locale === 'ar') {
    return [
      {
        path: '',
        title: 'مولّد ملصقات وGIF للميم بالذكاء الاصطناعي',
        description: 'أنشئ ملصقات ميم وGIF متحركة من فكرة أو وصف.',
      },
      {
        path: '/pricing',
        title: 'الأسعار',
        description: 'أرصدة لتوليد الملصقات وGIF',
      },
    ];
  }
  return STATIC_PAGES;
}

function pagesHeading(locale: string) {
  if (locale === 'zh') return '## 页面';
  if (locale === 'es') return '## Páginas';
  if (locale === 'ar') return '## الصفحات';
  return '## Pages';
}

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () => {
        const { app_url } = envConfigs;
        const app_name = await getSiteNameFn();
        const locale = getLocale() as Locale;
        const appDescription = m['home.meta_description']({}, { locale });
        const pages = [
          ...pagesFor(locale),
          {
            path: '/about',
            title: m['home.about_link']({}, { locale }),
            description: '',
          },
          {
            path: '/contact',
            title: m['home.contact_link']({}, { locale }),
            description: '',
          },
        ].filter(
          (page) =>
            !isGonePath(page.path || '/') &&
            !isHiddenPublicPath(page.path || '/')
        );

        const lines: string[] = [
          `# ${app_name}`,
          '',
          `> ${appDescription}`,
          '',
          pagesHeading(locale),
          '',
          ...pages.map(
            (p) =>
              `- [${p.title}](${localizeUrl(`${app_url}${p.path || '/'}`, { locale }).href}): ${p.description}`
          ),
        ];

        lines.push('');

        return new Response(lines.join('\n'), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      },
    },
  },
});
