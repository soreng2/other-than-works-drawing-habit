ALTER TABLE `students` ADD `auth_provider` text DEFAULT 'chatgpt' NOT NULL;
--> statement-breakpoint
ALTER TABLE `students` ADD `auth_email` text DEFAULT '' NOT NULL;
