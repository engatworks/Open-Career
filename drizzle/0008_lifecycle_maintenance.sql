CREATE TABLE `tenant_maintenance` (
  `tenant_id` text PRIMARY KEY NOT NULL REFERENCES `tenant_accounts`(`id`) ON DELETE CASCADE,
  `last_orphan_scan_at` text,
  `last_orphan_cursor` text,
  `last_orphan_deleted` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `tenant_maintenance_scan` ON `tenant_maintenance` (`last_orphan_scan_at`);
