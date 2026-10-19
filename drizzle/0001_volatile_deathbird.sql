CREATE TABLE `contact_index` (
	`email` text PRIMARY KEY NOT NULL,
	`company_domain` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contact_index_domain` ON `contact_index` (`company_domain`);--> statement-breakpoint
CREATE TABLE `contact_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`source_url` text,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`fingerprint` text NOT NULL,
	`observed_at` text NOT NULL,
	`evidence` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contact_sources_email` ON `contact_sources` (`email`);--> statement-breakpoint
CREATE TABLE `source_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	`report` text NOT NULL
);
