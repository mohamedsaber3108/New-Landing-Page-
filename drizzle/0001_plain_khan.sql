CREATE TABLE `idempotency_keys` (
	`key` text NOT NULL,
	`scope` text NOT NULL,
	`actor` text DEFAULT 'anonymous' NOT NULL,
	`request_hash` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`response_status` integer,
	`response_body` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`scope`, `actor`, `key`)
);
--> statement-breakpoint
CREATE INDEX `idempotency_expires_at_idx` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`aggregate_ref` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`delivered_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_event_id_uq` ON `outbox_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `outbox_status_next_idx` ON `outbox_events` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `outbox_event_type_idx` ON `outbox_events` (`event_type`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_enquiries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`kind` text DEFAULT 'general' NOT NULL,
	`product` text,
	`organization` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`message` text NOT NULL,
	`marketing_opt_in` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
-- NOTE: the v0 `enquiries` table had neither `reference`, `organization`, nor
-- `marketing_opt_in`. Copy only the columns that existed in v0 and backfill the
-- new NOT NULL `reference` with a deterministic placeholder so the rebuild
-- succeeds on a populated database. Fresh (empty) databases copy zero rows.
INSERT INTO `__new_enquiries`("id", "reference", "user_id", "name", "email", "kind", "product", "locale", "message", "status", "created_at") SELECT "id", 'USAM-LEGACY-' || "id", "user_id", "name", "email", "kind", "product", "locale", "message", "status", "created_at" FROM `enquiries`;--> statement-breakpoint
DROP TABLE `enquiries`;--> statement-breakpoint
ALTER TABLE `__new_enquiries` RENAME TO `enquiries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `enquiries_reference_uq` ON `enquiries` (`reference`);--> statement-breakpoint
CREATE INDEX `enquiries_created_at_idx` ON `enquiries` (`created_at`);--> statement-breakpoint
CREATE INDEX `enquiries_user_id_idx` ON `enquiries` (`user_id`);--> statement-breakpoint
CREATE INDEX `enquiries_status_idx` ON `enquiries` (`status`);