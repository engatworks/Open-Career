CREATE TABLE `tenant_identities` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL REFERENCES `tenant_accounts`(`id`) ON DELETE CASCADE,
  `issuer` text NOT NULL,
  `subject` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_identities_external` ON `tenant_identities` (`issuer`,`subject`);
--> statement-breakpoint
CREATE INDEX `tenant_identities_owner` ON `tenant_identities` (`tenant_id`);
