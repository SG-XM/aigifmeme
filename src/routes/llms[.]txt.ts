import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { isGonePath, isRetiredBlogSlug } from '@/lib/gone-paths';
import { isHiddenPublicPath } from '@/lib/public-page-visibility';
import { getSiteNameFn } from '@/lib/site-name-server';
import { m } from '@/paraglide/messages.js';
import { getLocale, localizeUrl, type Locale } from '@/paraglide/runtime.js';

const STATIC_PAGES: { path: string; title: string; description: string }[] = [
  {
    path: '',
    title: 'Metadata Remover',
    description:
      'Remove metadata from PDF, DOCX, XLSX, CSV, JPEG, PNG, WebP, and GIF files.',
  },
  { path: '/pricing', title: 'Pricing', description: 'Pricing plans' },
  { path: '/blog', title: 'Blog', description: 'Blog posts and articles' },
];

function pagesFor(locale: string) {
  if (locale === 'zh') {
    return [
      {
        path: '',
        title: 'Metadata Remover',
        description:
          '清除 PDF、DOCX、XLSX、CSV、JPEG、PNG、WebP 和 GIF 的元数据。',
      },
      { path: '/pricing', title: '价格', description: '价格方案' },
      { path: '/blog', title: '博客', description: '文章与指南' },
    ];
  }
  if (locale === 'es') {
    return [
      {
        path: '',
        title: 'Metadata Remover',
        description:
          'Quita metadatos de PDF, DOCX, XLSX, CSV, JPEG, PNG, WebP y GIF.',
      },
      { path: '/pricing', title: 'Precios', description: 'Planes y precios' },
      { path: '/blog', title: 'Blog', description: 'Artículos y guías' },
    ];
  }
  if (locale === 'ar') {
    return [
      {
        path: '',
        title: 'Metadata Remover',
        description:
          'إزالة البيانات الوصفية من PDF وDOCX وXLSX وCSV وJPEG وPNG وWebP وGIF.',
      },
      { path: '/pricing', title: 'الأسعار', description: 'الخطط والأسعار' },
      { path: '/blog', title: 'المدونة', description: 'مقالات وأدلة' },
    ];
  }
  return STATIC_PAGES;
}

function postsHeading(locale: string) {
  if (locale === 'zh') return '## 博客文章';
  if (locale === 'es') return '## Artículos del blog';
  if (locale === 'ar') return '## مقالات المدونة';
  return '## Blog Posts';
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
            path: '/pdf-metadata-remover',
            title: m['pdf.title']({}, { locale }),
            description: m['pdf.meta_description']({}, { locale }),
          },
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

        let posts: { slug: string; title: string; description: string }[] = [];
        try {
          const { listPublishedArticles } =
            await import('@/modules/posts/service');
          const rows = await listPublishedArticles({ locale });
          posts = rows
            .filter((row) => !isRetiredBlogSlug(row.slug))
            .map((row) => ({
              slug: row.slug,
              title: row.title,
              description: row.description,
            }));
        } catch {
          posts = [];
        }

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

        if (posts.length > 0) {
          lines.push('', postsHeading(locale), '');
          for (const post of posts) {
            lines.push(
              `- [${post.title}](${localizeUrl(`${app_url}/blog/${post.slug}`, { locale }).href}): ${post.description}`
            );
          }
        }

        lines.push('');

        return new Response(lines.join('\n'), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      },
    },
  },
});
