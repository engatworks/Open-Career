CREATE TABLE `company_inventory` (
	`domain` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`industry` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`provider` text NOT NULL,
	`source_url` text NOT NULL,
	`attribution` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
