ALTER TABLE `work_sessions` ADD `gallery_hidden` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_work_sessions_gallery_visible` ON `work_sessions` (`gallery_hidden`,`completed_at`);
