import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { getLocale, localizeUrl, type Locale } from '@/paraglide/runtime.js';

const STATIC_PAGES: { path: string; title: string; description: string }[] = [
  { path: '', title: 'Home', description: 'Landing page' },
  {
    path: '/ai-video',
    title: 'AI Video',
    description: 'Prepared photo-to-video scenes',
  },
  {
    path: '/window-peeper',
    title: 'Window Peeper',
    description: 'Night-window scene from one photo',
  },
  {
    path: '/im-so-sorry',
    title: "i'm so sorry photo trend",
    description: 'Photo carousel from one picture. Not a video.',
  },
  { path: '/pricing', title: 'Pricing', description: 'Pricing plans' },
  { path: '/blog', title: 'Blog', description: 'Blog posts and articles' },
];

function pagesFor(locale: string) {
  if (locale === 'zh') {
    return [
      { path: '', title: '首页', description: '主页' },
      {
        path: '/ai-video',
        title: 'AI 视频',
        description: '准备好的照片转视频场景',
      },
      {
        path: '/window-peeper',
        title: 'Window Peeper',
        description: '一张照片的夜窗场景',
      },
      {
        path: '/im-so-sorry',
        title: "i'm so sorry photo trend",
        description: '一张照片做成的照片轮播，不是视频。',
      },
      { path: '/pricing', title: '价格', description: '价格方案' },
      { path: '/blog', title: '博客', description: '文章与指南' },
    ];
  }
  if (locale === 'es') {
    return [
      { path: '', title: 'Inicio', description: 'Página principal' },
      {
        path: '/ai-video',
        title: 'Video con IA',
        description: 'Escenas preparadas de foto a video',
      },
      {
        path: '/window-peeper',
        title: 'Window Peeper',
        description: 'Escena de ventana nocturna a partir de una foto',
      },
      {
        path: '/im-so-sorry',
        title: "i'm so sorry photo trend",
        description:
          'Carrusel de fotos a partir de una imagen. No es un video.',
      },
      { path: '/pricing', title: 'Precios', description: 'Planes y precios' },
      { path: '/blog', title: 'Blog', description: 'Artículos y guías' },
    ];
  }
  if (locale === 'ar') {
    return [
      { path: '', title: 'الرئيسية', description: 'الصفحة الرئيسية' },
      {
        path: '/ai-video',
        title: 'فيديو بالذكاء الاصطناعي',
        description: 'مشاهد جاهزة من صورة إلى فيديو',
      },
      {
        path: '/window-peeper',
        title: 'Window Peeper',
        description: 'مشهد النافذة الليلية من صورة واحدة',
      },
      {
        path: '/im-so-sorry',
        title: "i'm so sorry photo trend",
        description: 'عرض صور من صورة واحدة. ليس فيديو.',
      },
      { path: '/pricing', title: 'الأسعار', description: 'الخطط والأسعار' },
      { path: '/blog', title: 'المدونة', description: 'مقالات وأدلة' },
    ];
  }
  return STATIC_PAGES;
}

function label(locale: string, kind: 'pages' | 'posts' | 'description') {
  const copy = {
    zh: { pages: '## 页面', posts: '## 博客文章', description: '简介' },
    es: {
      pages: '## Páginas',
      posts: '## Artículos del blog',
      description: 'Descripción',
    },
    ar: {
      pages: '## الصفحات',
      posts: '## مقالات المدونة',
      description: 'الوصف',
    },
    en: {
      pages: '## Pages',
      posts: '## Blog Posts',
      description: 'Description',
    },
  } as const;
  const language =
    locale === 'zh' || locale === 'es' || locale === 'ar' ? locale : 'en';
  return copy[language][kind];
}

export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => {
        const { app_url, app_name } = envConfigs;
        const locale = getLocale() as Locale;
        const appDescription = m['home.meta_description']({}, { locale });
        const pages = pagesFor(locale);

        const lines: string[] = [
          `# ${app_name}`,
          '',
          `> ${appDescription}`,
          '',
          label(locale, 'pages'),
          '',
          ...pages.map(
            (p) =>
              `- [${p.title}](${localizeUrl(`${app_url}${p.path || '/'}`, { locale }).href}): ${p.description}`
          ),
        ];

        try {
          const { listPublishedArticles, findPublishedBySlug } =
            await import('@/modules/posts/service');
          const rows = await listPublishedArticles({ locale });
          if (rows.length > 0) {
            lines.push('', label(locale, 'posts'), '');
            for (const post of rows) {
              lines.push(`### ${post.title}`, '');
              lines.push(
                `URL: ${localizeUrl(`${app_url}/blog/${post.slug}`, { locale }).href}`
              );
              if (post.description) {
                lines.push(
                  `${label(locale, 'description')}: ${post.description}`
                );
              }
              lines.push('');
              const detail = await findPublishedBySlug(post.slug, locale);
              if (detail?.content) lines.push(detail.content, '');
              lines.push('---', '');
            }
          }
        } catch {
          // Database unreachable — pages above still describe the site.
        }

        lines.push('');

        return new Response(lines.join('\n'), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      },
    },
  },
});
