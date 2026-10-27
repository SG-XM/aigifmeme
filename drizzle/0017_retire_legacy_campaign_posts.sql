-- Unpublish leftover campaign articles. Public queries also skip these slugs.
UPDATE post
SET status = 'archived'
WHERE slug IN (
  'im-so-sorry-filter-tiktok',
  'im-so-sorry-photo-trend',
  'im-so-sorry-photo-trend-download',
  'window-peeper-ai-pricing-2026',
  'window-peeper-ai-vs-windowpeeperai-2026'
);
