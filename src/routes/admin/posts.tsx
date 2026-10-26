import { useEffect, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { tDynamic } from '@/core/i18n/dynamic';
import { localeNames } from '@/config/locale';
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  pageQuery,
  type PageResult,
} from '@/lib/api-client';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { DataTable, type Column } from '@/components/data-table';
import { TextField } from '@/components/form-field';
import { RichTextEditor } from '@/components/rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Post {
  id: string;
  slug: string;
  type: string;
  title: string;
  titleZh: string | null;
  titleEs: string | null;
  titleAr: string | null;
  description: string | null;
  descriptionZh: string | null;
  descriptionEs: string | null;
  descriptionAr: string | null;
  image: string | null;
  categories: string | null;
  tags: string | null;
  authorName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  content?: string | null;
  contentZh?: string | null;
  contentEs?: string | null;
  contentAr?: string | null;
}

const TEXT_LOCALES = ['en', 'zh', 'es', 'ar'] as const;
type TextLocale = (typeof TEXT_LOCALES)[number];

const LOCALE_FIELDS = {
  en: { title: 'title', description: 'description', content: 'content' },
  zh: {
    title: 'titleZh',
    description: 'descriptionZh',
    content: 'contentZh',
  },
  es: {
    title: 'titleEs',
    description: 'descriptionEs',
    content: 'contentEs',
  },
  ar: {
    title: 'titleAr',
    description: 'descriptionAr',
    content: 'contentAr',
  },
} as const;

interface CategoryOption {
  id: string;
  title: string;
  slug: string;
}

const PAGE_SIZE = 20;
const TABS = ['all', 'published', 'draft'] as const;
type Tab = (typeof TABS)[number];

const postSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  titleZh: z.string(),
  titleEs: z.string(),
  titleAr: z.string(),
  description: z.string(),
  descriptionZh: z.string(),
  descriptionEs: z.string(),
  descriptionAr: z.string(),
  content: z.string(),
  contentZh: z.string(),
  contentEs: z.string(),
  contentAr: z.string(),
  categories: z.string(),
  tags: z.string(),
  authorName: z.string(),
  status: z.string(),
});
type PostForm = z.infer<typeof postSchema>;
const emptyForm: PostForm = {
  slug: '',
  title: '',
  titleZh: '',
  titleEs: '',
  titleAr: '',
  description: '',
  descriptionZh: '',
  descriptionEs: '',
  descriptionAr: '',
  content: '',
  contentZh: '',
  contentEs: '',
  contentAr: '',
  categories: '',
  tags: '',
  authorName: '',
  status: 'draft',
};

const CONTENT_KEYS = [
  'content',
  'contentZh',
  'contentEs',
  'contentAr',
] as const;

function PostsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [deletingPost, setDeletingPost] = useState<Post | null>(null);
  const [textLocale, setTextLocale] = useState<TextLocale>('en');
  const [contentReady, setContentReady] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedSearch]);

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories', 'options'],
    queryFn: () => apiGet<CategoryOption[]>('/api/admin/categories?all=true'),
  });
  const categoryOptions = categoriesQuery.data ?? [];

  const listQuery = useQuery({
    queryKey: ['admin-posts', page, tab, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (tab !== 'all') params.set('status', tab);
      if (debouncedSearch) params.set('search', debouncedSearch);
      return apiGet<PageResult<Post>>(`/api/admin/posts?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const createForm = useForm({
    defaultValues: emptyForm,
    validators: { onSubmit: postSchema },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync(value);
    },
  });

  const editForm = useForm({
    defaultValues: emptyForm,
    validators: { onSubmit: postSchema },
    onSubmit: async ({ value }) => {
      if (!editingPost) return;
      const body: Record<string, unknown> = { id: editingPost.id, ...value };
      // The list endpoint omits bodies. Skip them until the detail request
      // returns, so a fast save cannot blank stored markdown.
      if (!contentReady) {
        for (const key of CONTENT_KEYS) delete body[key];
      }
      await editMutation.mutateAsync(body);
    },
  });

  const createMutation = useMutation({
    mutationFn: (value: PostForm) => apiPost('/api/admin/posts', value),
    onSuccess: () => {
      toast.success(m['admin.posts.created']());
      setCreateOpen(false);
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPut('/api/admin/posts', body),
    onSuccess: () => {
      toast.success(m['admin.posts.updated']());
      setEditingPost(null);
      editForm.reset();
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/posts?id=${id}`),
    onSuccess: () => {
      toast.success(m['admin.posts.deleted']());
      setDeletingPost(null);
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function formFromPost(p: Post, withContent: boolean): PostForm {
    return {
      slug: p.slug,
      title: p.title || '',
      titleZh: p.titleZh || '',
      titleEs: p.titleEs || '',
      titleAr: p.titleAr || '',
      description: p.description || '',
      descriptionZh: p.descriptionZh || '',
      descriptionEs: p.descriptionEs || '',
      descriptionAr: p.descriptionAr || '',
      content: withContent ? p.content || '' : '',
      contentZh: withContent ? p.contentZh || '' : '',
      contentEs: withContent ? p.contentEs || '' : '',
      contentAr: withContent ? p.contentAr || '' : '',
      categories: p.categories || '',
      tags: p.tags || '',
      authorName: p.authorName || '',
      status: p.status,
    };
  }

  function openEdit(p: Post) {
    setTextLocale('en');
    setContentReady(false);
    editForm.reset(formFromPost(p, false));
    setEditingPost(p);
    apiGet<Post>(`/api/admin/posts?id=${p.id}`)
      .then((post) => {
        editForm.reset(formFromPost(post, true));
        setContentReady(true);
      })
      .catch(() => {});
  }

  const statusVariant = (s: string) => {
    if (s === 'published') return 'default' as const;
    if (s === 'draft') return 'secondary' as const;
    return 'outline' as const;
  };

  const columns: Column<Post>[] = [
    {
      header: m['admin.posts.title_col'](),
      cell: (p) => <span className="font-medium">{p.title}</span>,
    },
    {
      header: m['admin.posts.slug_col'](),
      cell: (p) => <span className="font-mono text-xs">{p.slug}</span>,
    },
    { header: m['admin.posts.author_col'](), cell: (p) => p.authorName || '—' },
    {
      header: m['admin.posts.status_col'](),
      cell: (p) => <Badge variant={statusVariant(p.status)}>{p.status}</Badge>,
    },
    {
      header: m['admin.posts.created_at'](),
      cell: (p) => (
        <span className="text-muted-foreground text-sm">
          {formatDateTime(p.createdAt)}
        </span>
      ),
    },
    {
      header: m['admin.posts.actions_col'](),
      className: 'w-[80px]',
      cell: (p) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => openEdit(p)}
          >
            <Pencil className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setDeletingPost(p)}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      ),
    },
  ];

  function renderFields(form: typeof createForm) {
    return (
      <div className="space-y-4 py-4">
        <form.Field name="slug">
          {(field) => (
            <TextField
              field={field}
              label={m['admin.posts.slug_field']()}
              placeholder={m['admin.posts.slug_placeholder']()}
            />
          )}
        </form.Field>
        <div className="border-border flex gap-1 overflow-x-auto border-b">
          {TEXT_LOCALES.map((locale) => (
            <button
              key={locale}
              type="button"
              onClick={() => setTextLocale(locale)}
              className={cn(
                '-mb-px border-b-2 px-3 py-1.5 text-sm font-medium whitespace-nowrap',
                textLocale === locale
                  ? 'border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              )}
            >
              {localeNames[locale]}
            </button>
          ))}
        </div>
        <form.Field name={LOCALE_FIELDS[textLocale].title}>
          {(field) => (
            <TextField
              field={field}
              label={m['admin.posts.title_field']()}
              placeholder={m['admin.posts.title_placeholder']()}
            />
          )}
        </form.Field>
        <form.Field name={LOCALE_FIELDS[textLocale].description}>
          {(field) => (
            <TextField
              field={field}
              label={m['admin.posts.description_field']()}
              placeholder={m['admin.posts.description_placeholder']()}
            />
          )}
        </form.Field>
        <form.Field name="authorName">
          {(field) => (
            <TextField
              field={field}
              label={m['admin.posts.author_field']()}
              placeholder={m['admin.posts.author_placeholder']()}
            />
          )}
        </form.Field>
        <form.Field name="categories">
          {(field) => (
            <div className="space-y-2">
              <Label>{m['admin.posts.category_field']()}</Label>
              <Select
                items={categoryOptions.map((c) => ({
                  label: c.title,
                  value: c.id,
                }))}
                value={field.state.value || ''}
                onValueChange={(v) => field.handleChange(v || '')}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={m['admin.posts.category_placeholder']()}
                  />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
        <form.Field name="tags">
          {(field) => (
            <div className="space-y-2">
              <TextField
                field={field}
                label={m['admin.posts.tags_field']()}
                placeholder={m['admin.posts.tags_placeholder']()}
              />
              <p className="text-muted-foreground text-xs">
                {m['admin.posts.tags_hint']()}
              </p>
            </div>
          )}
        </form.Field>
        <form.Field name="status">
          {(field) => (
            <div className="space-y-2">
              <Label>{m['admin.posts.status_field']()}</Label>
              <Select
                items={[
                  { label: m['admin.posts.status_draft'](), value: 'draft' },
                  {
                    label: m['admin.posts.status_published'](),
                    value: 'published',
                  },
                ]}
                value={field.state.value || 'draft'}
                onValueChange={(v) => field.handleChange(v || 'draft')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">
                    {m['admin.posts.status_draft']()}
                  </SelectItem>
                  <SelectItem value="published">
                    {m['admin.posts.status_published']()}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
        <form.Field name={LOCALE_FIELDS[textLocale].content}>
          {(field) => (
            <div className="space-y-2">
              <Label>{m['admin.posts.content_field']()}</Label>
              <RichTextEditor
                key={textLocale}
                value={field.state.value}
                onChange={(content) => field.handleChange(content)}
                placeholder={m['admin.posts.content_placeholder']()}
              />
            </div>
          )}
        </form.Field>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{m['admin.posts.title']()}</h1>
          <p className="text-muted-foreground">
            {m['admin.posts.description']()}
          </p>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (open) setTextLocale('en');
          }}
        >
          <DialogTrigger className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors">
            <Plus className="size-4" />
            {m['admin.posts.create']()}
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{m['admin.posts.create_title']()}</DialogTitle>
              <DialogDescription>
                {m['admin.posts.create_description']()}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                createForm.handleSubmit();
              }}
            >
              {renderFields(createForm)}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                >
                  {m['admin.posts.cancel']()}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {m['admin.posts.save']()}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border-border flex gap-1 overflow-x-auto overflow-y-hidden border-b">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              tab === tb
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            )}
          >
            {tDynamic(`admin.posts.tab_${tb}`)}
          </button>
        ))}
      </div>

      <Card>
        <CardContent>
          <DataTable
            columns={columns}
            data={listQuery.data?.items ?? []}
            total={listQuery.data?.total ?? 0}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            rowKey={(p) => p.id}
            emptyText={m['admin.posts.no_data']()}
            search={search}
            onSearchChange={setSearch}
            onRefresh={() => listQuery.refetch()}
            loading={listQuery.isFetching}
          />
        </CardContent>
      </Card>

      <Dialog
        open={!!editingPost}
        onOpenChange={(v) => !v && setEditingPost(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{m['admin.posts.edit_title']()}</DialogTitle>
            <DialogDescription>
              {m['admin.posts.edit_description']()}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editForm.handleSubmit();
            }}
          >
            {renderFields(editForm)}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingPost(null)}
              >
                {m['admin.posts.cancel']()}
              </Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {m['admin.posts.save']()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deletingPost}
        onOpenChange={(v) => !v && setDeletingPost(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m['admin.posts.delete_title']()}</DialogTitle>
            <DialogDescription>
              {m['admin.posts.delete_confirm']()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingPost(null)}>
              {m['admin.posts.cancel']()}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() =>
                deletingPost && deleteMutation.mutate(deletingPost.id)
              }
            >
              {m['admin.posts.confirm_delete']()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute('/admin/posts')({
  component: PostsPage,
});
