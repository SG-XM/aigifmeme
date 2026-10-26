CREATE TABLE `ab_visitor` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`variant` text NOT NULL,
	`assigned_at` integer NOT NULL,
	`first_exposed_at` integer,
	`photo_selected_at` integer,
	`login_prompt_at` integer,
	`submitted_at` integer,
	`authenticated_at` integer,
	`generated_at` integer,
	`user_id` text,
	`participant_id` text,
	FOREIGN KEY (`experiment_id`) REFERENCES `ab_experiment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`participant_id`) REFERENCES `ab_participant`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ab_visitor_experiment_cookie` ON `ab_visitor` (`experiment_id`,`visitor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ab_visitor_participant` ON `ab_visitor` (`participant_id`);