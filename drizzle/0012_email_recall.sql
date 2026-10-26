CREATE TABLE `email_recall` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email_key` text NOT NULL,
	`recipient_email` text NOT NULL,
	`locale` text NOT NULL,
	`kind` text NOT NULL,
	`product_id` text NOT NULL,
	`payment_provider` text,
	`original_order_no` text,
	`triggered_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`claim_token` text,
	`attempted_at` integer,
	`sent_at` integer,
	`resend_id` text,
	`last_error` text,
	`unsubscribed_at` integer,
	`clicked_at` integer,
	`checkout_generation` integer DEFAULT 0 NOT NULL,
	`checkout_lock_token` text,
	`checkout_locked_at` integer,
	`checkout_url` text,
	`last_checkout_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_recall_user_id_unique` ON `email_recall` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_recall_email_key_unique` ON `email_recall` (`email_key`);--> statement-breakpoint
CREATE INDEX `idx_email_recall_status_created` ON `email_recall` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_email_recall_resend` ON `email_recall` (`resend_id`);--> statement-breakpoint
CREATE TABLE `email_recall_suppression` (
	`email_key` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `order` ADD `checkout_source` text DEFAULT 'site' NOT NULL;--> statement-breakpoint
ALTER TABLE `order` ADD `recall_id` text;