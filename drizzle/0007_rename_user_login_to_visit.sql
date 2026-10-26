ALTER TABLE `user` RENAME COLUMN "last_login_at" TO "last_visit_at";
UPDATE `user` SET `last_visit_at` = NULL;
