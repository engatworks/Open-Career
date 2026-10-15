CREATE TABLE `configuration` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`kind` text NOT NULL,
	`detail` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`company` text NOT NULL,
	`website` text NOT NULL,
	`status` text DEFAULT 'discovered' NOT NULL,
	`research` text DEFAULT '{}' NOT NULL,
	`reason` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_domain_unique` ON `leads` (`domain`);--> statement-breakpoint
CREATE TABLE `outreach` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`domain` text NOT NULL,
	`company` text NOT NULL,
	`packet` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` text NOT NULL,
	`profile_hash` text NOT NULL,
	`cv_hash` text NOT NULL,
	`reserved_at` text,
	`reservation_token` text,
	`sent_at` text,
	`message_id` text,
	`thread_id` text,
	`last_error` text,
	`run_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_company` ON `outreach` (`domain`) WHERE "outreach"."status" not in ('cancelled','rejected');--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_contact` ON `outreach` (`email`) WHERE "outreach"."status" not in ('cancelled','rejected');--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_token_unique` ON `outreach` (`reservation_token`);--> statement-breakpoint
CREATE INDEX `outreach_status` ON `outreach` (`status`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`heartbeat_at` text NOT NULL,
	`finished_at` text,
	`report` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_running_research` ON `runs` (`status`) WHERE "runs"."status"='running';--> statement-breakpoint
CREATE TABLE `suppression` (
	`email` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
