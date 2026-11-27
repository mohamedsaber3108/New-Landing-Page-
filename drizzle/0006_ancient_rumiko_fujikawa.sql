CREATE TABLE `staff_backup_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE INDEX `staff_backup_codes_user_idx` ON `staff_backup_codes` (`user_id`);--> statement-breakpoint
ALTER TABLE `staff_sessions` ADD `stage` text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE `staff_sessions` ADD `mfa_verified_at` text;--> statement-breakpoint
ALTER TABLE `staff_users` ADD `mfa_secret_enc` text;--> statement-breakpoint
ALTER TABLE `staff_users` ADD `mfa_enabled_at` text;--> statement-breakpoint
ALTER TABLE `staff_users` ADD `mfa_last_step` integer DEFAULT 0 NOT NULL;