CREATE TABLE `request_limits` (
  `bucket` text PRIMARY KEY NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `request_limits_expiry` ON `request_limits` (`expires_at`);
