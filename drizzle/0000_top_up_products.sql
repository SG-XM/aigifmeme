CREATE TABLE `credit_top_up_product` (
	`product_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price_in_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`credits` integer NOT NULL,
	`credits_valid_days` integer DEFAULT 365 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_credit_topup_enabled_sort` ON `credit_top_up_product` (`enabled`,`sort`);
--> statement-breakpoint
INSERT INTO `credit_top_up_product` (`product_id`, `name`, `description`, `price_in_cents`, `currency`, `credits`, `credits_valid_days`, `enabled`, `sort`) VALUES
	('credits_10', '10 USD Credits', '$10 credit top-up', 1000, 'usd', 2000, 365, true, 10),
	('credits_50', '50 USD Credits', '$50 credit top-up', 5000, 'usd', 11000, 365, true, 20),
	('credits_100', '100 USD Credits', '$100 credit top-up', 10000, 'usd', 24000, 365, true, 30);
