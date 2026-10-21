CREATE TABLE `tenant_boards` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL REFERENCES `tenant_accounts`(`id`) ON DELETE CASCADE,
  `provider` text NOT NULL,
  `board` text NOT NULL,
  `region` text DEFAULT 'global' NOT NULL,
  `label` text NOT NULL,
  `source_url` text NOT NULL,
  `created_at` text NOT NULL,
  `last_attempt_at` text,
  `last_success_at` text,
  `last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_boards_unique` ON `tenant_boards` (`tenant_id`,`provider`,`board`,`region`);
--> statement-breakpoint
CREATE INDEX `tenant_boards_recent` ON `tenant_boards` (`tenant_id`,`last_success_at`);
--> statement-breakpoint
CREATE TABLE `tenant_job_sightings` (
  `tenant_id` text NOT NULL REFERENCES `tenant_accounts`(`id`) ON DELETE CASCADE,
  `board_id` text NOT NULL REFERENCES `tenant_boards`(`id`) ON DELETE CASCADE,
  `job_key` text NOT NULL,
  `title` text NOT NULL,
  `location` text DEFAULT '' NOT NULL,
  `apply_url` text NOT NULL,
  `first_seen_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  `status` text NOT NULL DEFAULT 'known',
  PRIMARY KEY(`tenant_id`,`job_key`),
  CONSTRAINT `tenant_job_status_check` CHECK (`status` IN ('new','known','seen'))
);
--> statement-breakpoint
CREATE INDEX `tenant_jobs_by_board` ON `tenant_job_sightings` (`tenant_id`,`board_id`,`first_seen_at`);
--> statement-breakpoint
CREATE INDEX `tenant_jobs_by_status` ON `tenant_job_sightings` (`tenant_id`,`status`,`first_seen_at`);
