CREATE TABLE `ab_experiment` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`scene` text NOT NULL,
	`product_scope` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`active_scene` text,
	`b_percent` integer DEFAULT 50 NOT NULL,
	`window_days` integer DEFAULT 7 NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`stopped_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ab_experiment_key_unique` ON `ab_experiment` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ab_experiment_active_scene_unique` ON `ab_experiment` (`active_scene`);--> statement-breakpoint
CREATE TABLE `ab_participant` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`variant` text NOT NULL,
	`assigned_at` integer NOT NULL,
	`first_exposed_at` integer,
	FOREIGN KEY (`experiment_id`) REFERENCES `ab_experiment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ab_participant_experiment_user` ON `ab_participant` (`experiment_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_ab_participant_experiment_variant` ON `ab_participant` (`experiment_id`,`variant`);--> statement-breakpoint
ALTER TABLE `order` ADD `ab_participant_id` text REFERENCES ab_participant(id);--> statement-breakpoint
ALTER TABLE `order` ADD `is_test` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `order` ADD `payment_confirmed_at` integer;--> statement-breakpoint
CREATE INDEX `idx_order_ab_participant` ON `order` (`ab_participant_id`);