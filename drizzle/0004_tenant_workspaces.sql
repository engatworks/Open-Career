CREATE TABLE `tenant_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text,
  `display_name` text,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  CONSTRAINT `tenant_accounts_status_check` CHECK (`status` IN ('active','deleting'))
);
--> statement-breakpoint
CREATE TABLE `tenant_profiles` (
  `tenant_id` text PRIMARY KEY NOT NULL REFERENCES `tenant_accounts`(`id`) ON DELETE CASCADE,
  `data` text NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tenant_documents` (
  `tenant_id` text NOT NULL REFERENCES `tenant_accounts`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL,
  `storage_key` text NOT NULL,
  `sha256` text NOT NULL,
  `byte_length` integer NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY(`tenant_id`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `tenant_contacts` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL REFERENCES `tenant_accounts`(`id`) ON DELETE CASCADE,
  `email` text NOT NULL,
  `name` text DEFAULT '' NOT NULL,
  `company` text DEFAULT '' NOT NULL,
  `role` text DEFAULT '' NOT NULL,
  `source_url` text,
  `status` text DEFAULT 'unverified' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `tenant_contact_status_check` CHECK (`status` IN ('unverified','verified','suppressed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_contacts_email` ON `tenant_contacts` (`tenant_id`,`email`);
--> statement-breakpoint
CREATE INDEX `tenant_contacts_status` ON `tenant_contacts` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE TABLE `tenant_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `tenant_id` text NOT NULL REFERENCES `tenant_accounts`(`id`) ON DELETE CASCADE,
  `at` text NOT NULL,
  `kind` text NOT NULL,
  `detail` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tenant_events_owner` ON `tenant_events` (`tenant_id`,`at`);
