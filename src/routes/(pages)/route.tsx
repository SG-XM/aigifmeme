import { createFileRoute, Outlet } from '@tanstack/react-router';
import { MDXProvider } from '@mdx-js/react';
import { ArrowLeft } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { mdxComponents } from '@/components/mdx-components';
import { getBlogPostsFn } from '@/content/posts/server';

export const Route = createFileRoute('/(pages)')({
  loader: async () => {
    const locale = getLocale();
    return { posts: await getBlogPostsFn({ data: { locale } }) };
  },
  component: PagesLayout,
});

function PagesLayout() {
  const { posts } = Route.useLoaderData();

  return (
    <div className="filemeta-site bg-background flex min-h-screen flex-col">
      <Header brandMark="filemeta" />
      <div className="flex-1">
        <div className="mx-auto max-w-3xl px-6 pt-8 md:px-8">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="size-4" />
            {m['common.pages.back_to_home']()}
          </Link>
        </div>
        <div className="mx-auto max-w-3xl px-6 pt-6 pb-12 md:px-8 md:pt-8 md:pb-16">
          <div className="filemeta-article border-border bg-card rounded-2xl border p-6 md:p-10">
            <MDXProvider components={mdxComponents}>
              <Outlet />
            </MDXProvider>
          </div>
        </div>
      </div>
      <Footer posts={posts} />
    </div>
  );
}
