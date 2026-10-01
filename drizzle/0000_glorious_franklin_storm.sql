CREATE TABLE `enquiries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`kind` text DEFAULT 'general' NOT NULL,
	`product` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `enquiries_created_at_idx` ON `enquiries` (`created_at`);--> statement-breakpoint
CREATE INDEX `enquiries_user_id_idx` ON `enquiries` (`user_id`);--> statement-breakpoint
CREATE INDEX `enquiries_status_idx` ON `enquiries` (`status`);--> statement-breakpoint
CREATE TABLE `guide_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`intent` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`accepted` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `guide_signals_intent_idx` ON `guide_signals` (`intent`);--> statement-breakpoint
CREATE INDEX `guide_signals_created_at_idx` ON `guide_signals` (`created_at`);