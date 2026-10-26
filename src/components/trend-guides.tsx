import { ArrowUpRight } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { formatPostDate, type BlogPost } from '@/content/posts';

type TrendGuidesProps = {
  posts: BlogPost[];
  eyebrow: string;
  title: string;
  description: string;
  readLabel: string;
  viewAllLabel: string;
  locale: string;
};

/** Published article summaries are supplied by the page's server loader. */
export function TrendGuides({
  posts,
  eyebrow,
  title,
  description,
  readLabel,
  viewAllLabel,
  locale,
}: TrendGuidesProps) {
  if (posts.length === 0) return null;
  return (
    <section id="guides" className="trend-section trend-guides">
      <div className="trend-container">
        <div className="trend-section-heading" data-reveal>
          <p className="trend-eyebrow">{eyebrow}</p>
          <h2 className="trend-section-title">{title}</h2>
          <p className="trend-section-description">{description}</p>
        </div>
        <div className="trend-guide-grid">
          {posts.map((post) => (
            <article key={post.slug} className="trend-guide-card" data-reveal>
              <time dateTime={post.createdAt}>
                {formatPostDate(post.createdAt, locale)}
              </time>
              <h3>
                <Link href={`/blog/${encodeURIComponent(post.slug)}`}>
                  {post.title}
                </Link>
              </h3>
              <p>{post.description}</p>
              <Link
                href={`/blog/${encodeURIComponent(post.slug)}`}
                className="trend-guide-link"
              >
                {readLabel}
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
        <Link href="/blog" className="trend-guide-all">
          {viewAllLabel}
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
