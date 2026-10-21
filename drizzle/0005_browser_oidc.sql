CREATE TABLE `login_transactions` (
  `state_hash` text PRIMARY KEY NOT NULL,
  `code_verifier` text NOT NULL,
  `nonce` text NOT NULL,
  `expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_transactions_expiry` ON `login_transactions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `browser_sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL REFERENCES `tenant_accounts`(`id`) ON DELETE CASCADE,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `browser_sessions_tenant` ON `browser_sessions` (`tenant_id`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `browser_sessions_expiry` ON `browser_sessions` (`expires_at`);
