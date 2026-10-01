CREATE TABLE `content_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_id` text NOT NULL,
	`rating` integer NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_feedback_content_idx` ON `content_feedback` (`content_id`);--> statement-breakpoint
CREATE INDEX `content_feedback_created_at_idx` ON `content_feedback` (`created_at`);