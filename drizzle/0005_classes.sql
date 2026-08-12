CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code_hash` text NOT NULL,
	`code_display` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `students` ADD `class_id` text REFERENCES `classes`(`id`);
--> statement-breakpoint
CREATE INDEX `idx_students_class_id` ON `students` (`class_id`);
