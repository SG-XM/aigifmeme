CREATE TABLE `subscription_plan` (
	`product_id` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_zh` text NOT NULL,
	`description_en` text DEFAULT '' NOT NULL,
	`description_zh` text DEFAULT '' NOT NULL,
	`features_en` text DEFAULT '' NOT NULL,
	`features_zh` text DEFAULT '' NOT NULL,
	`badge_en` text DEFAULT '' NOT NULL,
	`badge_zh` text DEFAULT '' NOT NULL,
	`price_in_cents` integer NOT NULL,
	`compare_at_price_in_cents` integer,
	`currency` text DEFAULT 'usd' NOT NULL,
	`interval` text NOT NULL,
	`interval_count` integer DEFAULT 1 NOT NULL,
	`credits` integer NOT NULL,
	`credits_valid_days` integer NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_subscription_plan_enabled_sort` ON `subscription_plan` (`enabled`,`sort`);--> statement-breakpoint
INSERT INTO `subscription_plan` (`product_id`, `name_en`, `name_zh`, `description_en`, `description_zh`, `features_en`, `features_zh`, `badge_en`, `badge_zh`, `price_in_cents`, `compare_at_price_in_cents`, `currency`, `interval`, `interval_count`, `credits`, `credits_valid_days`, `featured`, `enabled`, `sort`) VALUES
  ('lite_monthly', 'Lite', 'Lite', 'For casual creators', '适合普通创作者', 'Text-to-video and image-to-video
All video models
Free download, commercial license', '文生视频与图生视频
全部视频模型
免费下载，可商用', '', '', 990, 1490, 'usd', 'month', 1, 2000, 30, false, true, 10),
  ('pro_monthly', 'Pro', 'Pro', 'For professionals', '适合专业用户', 'Text-to-video and image-to-video
All video models
Free download, commercial license', '文生视频与图生视频
全部视频模型
免费下载，可商用', 'Popular', '推荐', 1990, 2990, 'usd', 'month', 1, 4800, 30, true, true, 20),
  ('ultra_monthly', 'Ultra', 'Ultra', 'For power users', '适合重度用户', 'Text-to-video and image-to-video
All video models
Free download, commercial license', '文生视频与图生视频
全部视频模型
免费下载，可商用', '', '', 3990, 5990, 'usd', 'month', 1, 10000, 30, false, true, 30),
  ('lite_yearly', 'Lite', 'Lite', 'For casual creators', '适合普通创作者', 'Text-to-video and image-to-video
All video models
Free download, commercial license', '文生视频与图生视频
全部视频模型
免费下载，可商用', '', '', 10680, 11880, 'usd', 'year', 1, 24000, 365, false, true, 10),
  ('pro_yearly', 'Pro', 'Pro', 'For professionals', '适合专业用户', 'Text-to-video and image-to-video
All video models
Free download, commercial license', '文生视频与图生视频
全部视频模型
免费下载，可商用', '', '', 20280, 23880, 'usd', 'year', 1, 57600, 365, true, true, 20),
  ('ultra_yearly', 'Ultra', 'Ultra', 'For power users', '适合重度用户', 'Text-to-video and image-to-video
All video models
Free download, commercial license', '文生视频与图生视频
全部视频模型
免费下载，可商用', '', '', 39480, 47880, 'usd', 'year', 1, 120000, 365, false, true, 30);
