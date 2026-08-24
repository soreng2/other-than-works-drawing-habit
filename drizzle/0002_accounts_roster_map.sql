ALTER TABLE `profiles` ADD `nickname` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `presence` ADD `mode` text DEFAULT 'idle' NOT NULL;
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`nickname` text DEFAULT '' NOT NULL,
	`auth_user_hash` text UNIQUE,
	`profile_id` text UNIQUE,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_students_normalized_name` ON `students` (`normalized_name`);
