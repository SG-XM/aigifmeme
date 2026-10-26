CREATE TABLE `credit_redeem_code` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`credits` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`sent_to_email` text,
	`sent_at` integer,
	`send_reserved_at` integer,
	`send_reservation_id` text,
	`invalidated_at` integer,
	`redeemed_at` integer,
	`redeemed_email` text,
	`redeemed_user_id` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`redeemed_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_redeem_code_code_unique` ON `credit_redeem_code` (`code`);--> statement-breakpoint
CREATE INDEX `idx_credit_redeem_status` ON `credit_redeem_code` (`invalidated_at`,`redeemed_at`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_credit_redeem_sent` ON `credit_redeem_code` (`sent_at`,`sent_to_email`);