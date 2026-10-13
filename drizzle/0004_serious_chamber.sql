CREATE TABLE `consent_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text DEFAULT 'granted' NOT NULL,
	`policy_version` text,
	`policy_type` text,
	`platform` text DEFAULT 'master' NOT NULL,
	`actor` text DEFAULT 'anonymous' NOT NULL,
	`subject_ref` text,
	`method` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`detail` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consent_events_type_idx` ON `consent_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `consent_events_actor_idx` ON `consent_events` (`actor`);--> statement-breakpoint
CREATE INDEX `consent_events_subject_idx` ON `consent_events` (`subject_ref`);--> statement-breakpoint
CREATE INDEX `consent_events_created_at_idx` ON `consent_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `policy_publications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`policy_type` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`version` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`material_change` integer DEFAULT false NOT NULL,
	`effective_at` text,
	`content` text NOT NULL,
	`published_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `policy_pub_type_locale_idx` ON `policy_publications` (`policy_type`,`locale`);--> statement-breakpoint
CREATE INDEX `policy_pub_status_idx` ON `policy_publications` (`status`);--> statement-breakpoint
CREATE TABLE `privacy_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`request_type` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`identity_verified` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`related_reference` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`message` text,
	`user_id` text,
	`assigned_to` text,
	`staff_note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `privacy_requests_reference_uq` ON `privacy_requests` (`reference`);--> statement-breakpoint
CREATE INDEX `privacy_requests_status_idx` ON `privacy_requests` (`status`);--> statement-breakpoint
CREATE INDEX `privacy_requests_created_at_idx` ON `privacy_requests` (`created_at`);