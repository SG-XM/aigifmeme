CREATE TABLE `funnel_event` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`user_id` text,
	`event_name` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_funnel_event_created` ON `funnel_event` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_funnel_event_visitor_event` ON `funnel_event` (`visitor_id`,`event_name`);--> statement-breakpoint
CREATE INDEX `idx_funnel_event_user_event` ON `funnel_event` (`user_id`,`event_name`);