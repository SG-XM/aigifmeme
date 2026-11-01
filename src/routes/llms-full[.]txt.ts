import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { isGonePath, isRetiredBlogSlug } from '@/lib/gone-paths';
import { m } from '@/paraglide/messages.js';
import { getLocale, localizeUrl, type Locale } from '@/paraglide/runtime.js';

const STATIC_PAGES: { path: string; title: string; description: string }[] = [
  {
    path: '',
    title: 'Metadata Remover',
    description: 'Remove metadata from PDF, DOC, DOCX, Excel, and CSV files.',
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
        description: '清除 PDF、DOC、DOCX、Excel 和 CSV 的元数据。',
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
        description: 'Quita metadatos de PDF, DOC, DOCX, Excel y CSV.',
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
        description: 'إزالة البيانات الوصفية من PDF وDOC وDOCX وExcel وCSV.',
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
        const pages = pagesFor(locale).filter(
          (page) => !isGonePath(page.path || '/')
        );

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
          const rows = (await listPublishedArticles({ locale })).filter(
            (row) => !isRetiredBlogSlug(row.slug)
          );
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
