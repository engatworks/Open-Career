CREATE TABLE `employer_aliases` (
	`alias_domain` text PRIMARY KEY NOT NULL,
	`canonical_domain` text NOT NULL,
	`source_url` text NOT NULL,
	`source_quote` text NOT NULL,
	`verified_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `employer_aliases_canonical` ON `employer_aliases` (`canonical_domain`);--> statement-breakpoint
CREATE TABLE `employer_pipeline` (
	`canonical_domain` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`campaign` text NOT NULL,
	`stage` text NOT NULL,
	`outreach_id` text,
	`research` text DEFAULT '{}' NOT NULL,
	`evidence` text DEFAULT '{}' NOT NULL,
	`verified_at` text,
	`updated_at` text NOT NULL,
	`next_action` text DEFAULT 'research' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`lease_token` text,
	`lease_until` text,
	`last_error` text,
	`error_class` text
);
--> statement-breakpoint
CREATE INDEX `pipeline_work` ON `employer_pipeline` (`campaign`,`stage`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `historical_receipts` (
	`message_id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`company_domain` text NOT NULL,
	`company` text NOT NULL,
	`email` text NOT NULL,
	`sent_at` text NOT NULL,
	`subject` text NOT NULL,
	`status` text NOT NULL,
	`campaign` text,
	`cv_sha256` text,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `historical_employer` ON `historical_receipts` (`company_domain`);--> statement-breakpoint
CREATE TABLE `provider_receipts` (
	`message_id` text PRIMARY KEY NOT NULL,
	`outreach_id` text NOT NULL,
	`thread_id` text,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_receipts_outreach_id_unique` ON `provider_receipts` (`outreach_id`);
--> statement-breakpoint
CREATE TRIGGER `pipeline_outreach_state` AFTER UPDATE OF status ON outreach BEGIN
 UPDATE employer_pipeline SET
 stage=CASE NEW.status WHEN 'queued' THEN 'QUEUE' WHEN 'sending' THEN 'SEND' WHEN 'needs_reconciliation' THEN 'RECONCILE' WHEN 'sent' THEN 'COMPLETE' WHEN 'replied' THEN 'COMPLETE' ELSE 'HELD' END,
 next_action=CASE NEW.status WHEN 'queued' THEN 'reserve_once' WHEN 'sending' THEN 'send_once_or_reconcile' WHEN 'needs_reconciliation' THEN 'inspect_provider_never_retry' WHEN 'sent' THEN 'monitor_feedback' WHEN 'replied' THEN 'review_reply' ELSE 'manual_review' END,
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE outreach_id=NEW.id;
END;
--> statement-breakpoint
-- Guard aliases and legacy outreach rows inside SQLite transactions, including concurrent workers.
CREATE TRIGGER `employer_alias_conflict` BEFORE INSERT ON employer_aliases
WHEN EXISTS(SELECT 1 FROM employer_aliases WHERE alias_domain=NEW.alias_domain AND canonical_domain<>NEW.canonical_domain)
BEGIN SELECT RAISE(ABORT,'Corporate alias conflicts with another employer'); END;
--> statement-breakpoint
CREATE TRIGGER `outreach_provider_id_insert` BEFORE INSERT ON outreach
WHEN NEW.message_id IS NOT NULL AND EXISTS(SELECT 1 FROM outreach WHERE message_id=NEW.message_id AND id<>NEW.id)
BEGIN SELECT RAISE(ABORT,'Provider receipt is already assigned'); END;
--> statement-breakpoint
CREATE TRIGGER `outreach_provider_id_update` BEFORE UPDATE OF message_id ON outreach
WHEN NEW.message_id IS NOT NULL AND EXISTS(SELECT 1 FROM outreach WHERE message_id=NEW.message_id AND id<>NEW.id)
BEGIN SELECT RAISE(ABORT,'Provider receipt is already assigned'); END;
