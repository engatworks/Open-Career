CREATE TABLE `ats_applications` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `job_key` text NOT NULL,
  `provider` text NOT NULL,
  `board` text NOT NULL,
  `job_id` text NOT NULL,
  `title` text NOT NULL,
  `apply_url` text NOT NULL,
  `status` text DEFAULT 'discovered' NOT NULL,
  `cv_sha256` text,
  `answers_sha256` text,
  `form_sha256` text,
  `approval_at` text,
  `attempt_token` text,
  `attempted_at` text,
  `provider_reference` text,
  `confirmed_at` text,
  `last_error` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `ats_application_status` CHECK (`status` IN ('discovered','prepared','approved','submitting','submitted','needs_reconciliation','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ats_applications_tenant_job` ON `ats_applications` (`tenant_id`,`job_key`);
--> statement-breakpoint
CREATE INDEX `ats_applications_tenant_status` ON `ats_applications` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ats_applications_attempt_token` ON `ats_applications` (`attempt_token`);
