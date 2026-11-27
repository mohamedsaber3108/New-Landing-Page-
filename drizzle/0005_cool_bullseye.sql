CREATE TABLE `staff_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`ip_hash` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX `staff_sessions_user_idx` ON `staff_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `staff_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`disabled_at` text,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`locked_until` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_users_email_uq` ON `staff_users` (`email`);