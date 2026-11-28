CREATE TABLE `admin_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` integer,
	`role` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`before_json` text,
	`after_json` text,
	`reason` text,
	`result` text NOT NULL,
	`ip_hash` text,
	`request_id` text,
	`prev_hash` text NOT NULL,
	`hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_audit_prev_hash_uq` ON `admin_audit` (`prev_hash`);--> statement-breakpoint
CREATE INDEX `admin_audit_ts_idx` ON `admin_audit` (`ts`);--> statement-breakpoint
CREATE INDEX `admin_audit_action_idx` ON `admin_audit` (`action`);