CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_token_hash` text NOT NULL,
	`name` text NOT NULL,
	`character_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `presence` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_presence_updated_at` ON `presence` (`updated_at`);--> statement-breakpoint
CREATE TABLE `work_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`seconds` integer NOT NULL,
	`category` text NOT NULL,
	`artwork_key` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`completed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_work_sessions_profile_completed` ON `work_sessions` (`profile_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `idx_work_sessions_completed` ON `work_sessions` (`completed_at`);
