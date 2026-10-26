CREATE TABLE `home_demo_video` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` text NOT NULL,
	`src` text NOT NULL,
	`poster` text,
	`title` text NOT NULL,
	`title_zh` text,
	`title_ar` text,
	`title_es` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_home_demo_video_slot_sort` ON `home_demo_video` (`slot`,`enabled`,`sort`);