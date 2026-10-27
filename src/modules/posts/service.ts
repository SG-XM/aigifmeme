import {
  and,
  count,
  desc,
  eq,
  like,
  notInArray,
  or,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/core/db';
import { post } from '@/config/db/schema';
import { isRetiredBlogSlug, RETIRED_BLOG_SLUGS } from '@/lib/gone-paths';
import { getUuid } from '@/lib/hash';
import { scrubPublicPostCopy } from '@/lib/public-post-copy';
import { formatTagList, parseTagList } from '@/lib/related-posts';

import {
  blankToNull,
  isPostLocale,
  postContentLocale,
  postLocales,
  postText,
  type PostLocale,
  type PostTextFields,
} from './locale';

export type { PostLocale };

export enum PostType {
  ARTICLE = 'article',
  PAGE = 'page',
  LOG = 'log',
}

export enum PostStatus {
  PUBLISHED = 'published',
  PENDING = 'pending',
  DRAFT = 'draft',
  ARCHIVED = 'archived',
}

type NewPost = typeof post.$inferInsert;

export type PublishedArticle = {
  id: string;
  slug: string;
  title: string;
  description: string;
  image?: string;
  authorName?: string;
  authorImage?: string;
  createdAt: Date;
  tags: string[];
  /** Set when the caller is matching keywords against the article body. */
  content?: string;
  /** Locales whose title and body are stored, not filled in from English. */
  locales: PostLocale[];
  /** Locale whose title and body were actually used. */
  contentLocale: PostLocale;
};

export type PublishedArticleDetail = PublishedArticle & {
  content: string;
};

const LOCALE_COLUMNS = {
  title: post.title,
  description: post.description,
  content: post.content,
  titleZh: post.titleZh,
  descriptionZh: post.descriptionZh,
  contentZh: post.contentZh,
  titleEs: post.titleEs,
  descriptionEs: post.descriptionEs,
  contentEs: post.contentEs,
  titleAr: post.titleAr,
  descriptionAr: post.descriptionAr,
  contentAr: post.contentAr,
};

function asLocale(locale?: string): PostLocale {
  return locale && isPostLocale(locale) ? locale : 'en';
}

/** Public article lists skip retired campaign posts even if a row is still published. */
function hideRetiredPosts(extra?: SQL) {
  return and(extra, notInArray(post.slug, [...RETIRED_BLOG_SLUGS]));
}

function present(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text ? value! : undefined;
}

export async function list(params: {
  type?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const { type, status, search, page = 1, pageSize = 10 } = params;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [];
  if (type) conditions.push(eq(post.type, type));
  if (status) conditions.push(eq(post.status, status));
  if (search) {
    conditions.push(
      or(like(post.title, `%${search}%`), like(post.slug, `%${search}%`))!
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db()
    .select({ count: count() })
    .from(post)
    .where(where);
  const total = totalResult.count;

  const items = await db()
    .select({
      id: post.id,
      slug: post.slug,
      type: post.type,
      title: post.title,
      description: post.description,
      titleZh: post.titleZh,
      descriptionZh: post.descriptionZh,
      titleEs: post.titleEs,
      descriptionEs: post.descriptionEs,
      titleAr: post.titleAr,
      descriptionAr: post.descriptionAr,
      image: post.image,
      categories: post.categories,
      tags: post.tags,
      authorName: post.authorName,
      status: post.status,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    })
    .from(post)
    .where(where)
    .orderBy(desc(post.updatedAt), desc(post.createdAt))
    .limit(pageSize)
    .offset(offset);

  return { items, total };
}

type ArticleRow = PostTextFields & {
  id: string;
  slug: string;
  image: string | null;
  authorName: string | null;
  authorImage: string | null;
  tags: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toTextFields(row: {
  title: string | null;
  description: string | null;
  content?: string | null;
  titleZh: string | null;
  descriptionZh: string | null;
  contentZh?: string | null;
  titleEs: string | null;
  descriptionEs: string | null;
  contentEs?: string | null;
  titleAr: string | null;
  descriptionAr: string | null;
  contentAr?: string | null;
}): PostTextFields {
  return {
    title: row.title,
    description: row.description,
    content: row.content ?? null,
    titleZh: row.titleZh,
    descriptionZh: row.descriptionZh,
    contentZh: row.contentZh ?? null,
    titleEs: row.titleEs,
    descriptionEs: row.descriptionEs,
    contentEs: row.contentEs ?? null,
    titleAr: row.titleAr,
    descriptionAr: row.descriptionAr,
    contentAr: row.contentAr ?? null,
  };
}

export async function listPublishedArticles(
  params: {
    limit?: number | null;
    locale?: string;
    includeContent?: boolean;
  } = {}
): Promise<PublishedArticle[]> {
  const { limit = 100 } = params;
  const locale = asLocale(params.locale);
  const query = db()
    .select({
      id: post.id,
      slug: post.slug,
      ...LOCALE_COLUMNS,
      image: post.image,
      authorName: post.authorName,
      authorImage: post.authorImage,
      tags: post.tags,
      createdAt: post.createdAt,
    })
    .from(post)
    .where(
      hideRetiredPosts(
        and(
          eq(post.type, PostType.ARTICLE),
          eq(post.status, PostStatus.PUBLISHED)
        )
      )
    )
    .orderBy(desc(post.createdAt));
  const rows = (
    limit === null ? await query : await query.limit(limit)
  ) as ArticleRow[];
  return rows
    .filter((row) => !isRetiredBlogSlug(row.slug))
    .map((row) => {
      const fields = toTextFields(row);
      return {
        id: row.id,
        slug: row.slug,
        title: postText(fields, locale, 'title') || row.slug,
        description: scrubPublicPostCopy(
          postText(fields, locale, 'description')
        ),
        image: present(row.image),
        authorName: present(row.authorName),
        authorImage: present(row.authorImage),
        tags: parseTagList(row.tags),
        createdAt: row.createdAt,
        locales: postLocales(fields),
        contentLocale: postContentLocale(fields, locale),
        ...(params.includeContent
          ? {
              content: scrubPublicPostCopy(postText(fields, locale, 'content')),
            }
          : {}),
      };
    });
}

/** All public article URLs for the sitemap, without the blog-list limit. */
export async function listPublishedArticleSitemapEntries() {
  const rows = await db()
    .select({
      slug: post.slug,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      ...LOCALE_COLUMNS,
    })
    .from(post)
    .where(
      hideRetiredPosts(
        and(
          eq(post.type, PostType.ARTICLE),
          eq(post.status, PostStatus.PUBLISHED)
        )
      )
    )
    .orderBy(desc(post.createdAt));
  return (rows as ArticleRow[])
    .filter((row) => !isRetiredBlogSlug(row.slug))
    .map((row) => ({
      slug: row.slug,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      locales: postLocales(toTextFields(row)),
    }));
}

export async function findPublishedBySlug(
  slug: string,
  locale: string = 'en'
): Promise<PublishedArticleDetail | undefined> {
  if (isRetiredBlogSlug(slug)) return undefined;
  const requested = asLocale(locale);
  const [row] = await db()
    .select()
    .from(post)
    .where(
      and(
        eq(post.slug, slug.toLowerCase()),
        eq(post.status, PostStatus.PUBLISHED)
      )
    )
    .limit(1);
  if (!row) return undefined;
  const fields = toTextFields(row);
  return {
    id: row.id,
    slug: row.slug,
    title: postText(fields, requested, 'title') || row.slug,
    description: scrubPublicPostCopy(
      postText(fields, requested, 'description')
    ),
    content: scrubPublicPostCopy(postText(fields, requested, 'content')),
    image: present(row.image),
    authorName: present(row.authorName),
    authorImage: present(row.authorImage),
    tags: parseTagList(row.tags),
    createdAt: row.createdAt,
    locales: postLocales(fields),
    contentLocale: postContentLocale(fields, requested),
  };
}

export async function getById(id: string) {
  const [result] = await db()
    .select()
    .from(post)
    .where(eq(post.id, id))
    .limit(1);
  return result;
}

const OPTIONAL_TEXT = [
  'titleZh',
  'descriptionZh',
  'contentZh',
  'titleEs',
  'descriptionEs',
  'contentEs',
  'titleAr',
  'descriptionAr',
  'contentAr',
] as const;

export async function create(data: {
  userId: string;
  slug: string;
  title: string;
  description?: string;
  titleZh?: string;
  descriptionZh?: string;
  titleEs?: string;
  descriptionEs?: string;
  titleAr?: string;
  descriptionAr?: string;
  image?: string;
  content?: string;
  contentZh?: string;
  contentEs?: string;
  contentAr?: string;
  categories?: string;
  tags?: string;
  authorName?: string;
  status?: string;
}) {
  const newPost: NewPost = {
    id: getUuid(),
    userId: data.userId,
    slug: data.slug.toLowerCase(),
    type: PostType.ARTICLE,
    title: data.title,
    description: data.description || '',
    titleZh: blankToNull(data.titleZh),
    descriptionZh: blankToNull(data.descriptionZh),
    titleEs: blankToNull(data.titleEs),
    descriptionEs: blankToNull(data.descriptionEs),
    titleAr: blankToNull(data.titleAr),
    descriptionAr: blankToNull(data.descriptionAr),
    image: data.image || '',
    content: data.content || '',
    contentZh: blankToNull(data.contentZh),
    contentEs: blankToNull(data.contentEs),
    contentAr: blankToNull(data.contentAr),
    categories: data.categories || '',
    tags: formatTagList(parseTagList(data.tags)),
    authorName: data.authorName || '',
    status: data.status || PostStatus.DRAFT,
  };
  const [result] = await db().insert(post).values(newPost).returning();
  return result;
}

export async function update(
  id: string,
  data: {
    slug?: string;
    title?: string;
    description?: string;
    titleZh?: string | null;
    descriptionZh?: string | null;
    titleEs?: string | null;
    descriptionEs?: string | null;
    titleAr?: string | null;
    descriptionAr?: string | null;
    image?: string;
    content?: string;
    contentZh?: string | null;
    contentEs?: string | null;
    contentAr?: string | null;
    categories?: string;
    tags?: string;
    authorName?: string;
    status?: string;
  }
) {
  const updateData: Record<string, unknown> = { ...data };
  if (typeof updateData.tags === 'string') {
    updateData.tags = formatTagList(parseTagList(updateData.tags));
  }
  if (typeof updateData.slug === 'string') {
    updateData.slug = updateData.slug.toLowerCase();
  }
  for (const key of OPTIONAL_TEXT) {
    if (updateData[key] === undefined) {
      delete updateData[key];
      continue;
    }
    updateData[key] = blankToNull(updateData[key] as string | null);
  }
  const [result] = await db()
    .update(post)
    .set(updateData)
    .where(eq(post.id, id))
    .returning();
  return result;
}

export async function remove(id: string) {
  await db()
    .update(post)
    .set({ status: PostStatus.ARCHIVED })
    .where(eq(post.id, id));
}
