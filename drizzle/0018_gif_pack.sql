CREATE TABLE `gif_pack_theme` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `version` integer NOT NULL,
  `name_en` text NOT NULL,
  `name_zh` text NOT NULL,
  `background_color` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX `gif_pack_theme_slug_version` ON `gif_pack_theme` (`slug`, `version`);

CREATE TABLE `gif_pack_motion` (
  `id` text PRIMARY KEY NOT NULL,
  `theme_id` text NOT NULL,
  `position` integer NOT NULL,
  `intent` text NOT NULL,
  `caption_en` text NOT NULL,
  `caption_zh` text NOT NULL
);
CREATE UNIQUE INDEX `gif_pack_motion_theme_pos` ON `gif_pack_motion` (`theme_id`, `position`);

CREATE TABLE `gif_pack` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `day_key` text NOT NULL,
  `theme_id` text NOT NULL,
  `theme_version` integer NOT NULL,
  `style` text NOT NULL,
  `motion_mode` text NOT NULL,
  `background` text NOT NULL,
  `language` text NOT NULL,
  `status` text NOT NULL,
  `phase` text NOT NULL,
  `user_regens` integer DEFAULT 0 NOT NULL,
  `anchor_attempts` integer DEFAULT 0 NOT NULL,
  `error_code` text,
  `error_message` text,
  `lock_token` text,
  `heartbeat_at` integer,
  `created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
  `updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
  `deleted_at` integer
);
CREATE UNIQUE INDEX `gif_pack_user_idempotency` ON `gif_pack` (`user_id`, `idempotency_key`);
CREATE UNIQUE INDEX `gif_pack_user_day` ON `gif_pack` (`user_id`, `day_key`);
CREATE INDEX `gif_pack_status_heartbeat` ON `gif_pack` (`status`, `heartbeat_at`);

CREATE TABLE `gif_pack_sticker` (
  `id` text PRIMARY KEY NOT NULL,
  `pack_id` text NOT NULL,
  `position` integer NOT NULL,
  `intent` text NOT NULL,
  `caption` text NOT NULL,
  `status` text NOT NULL,
  `system_attempts` integer DEFAULT 0 NOT NULL,
  `error_code` text,
  `error_message` text
);
CREATE UNIQUE INDEX `gif_pack_sticker_pack_pos` ON `gif_pack_sticker` (`pack_id`, `position`);

CREATE TABLE `gif_pack_file` (
  `id` text PRIMARY KEY NOT NULL,
  `pack_id` text NOT NULL,
  `sticker_id` text,
  `kind` text NOT NULL,
  `storage_key` text NOT NULL,
  `content_type` text NOT NULL,
  `byte_size` integer DEFAULT 0 NOT NULL,
  `frame_count` integer,
  `created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX `gif_pack_file_pack` ON `gif_pack_file` (`pack_id`, `kind`);

CREATE TABLE `gif_pack_upload` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `original_key` text NOT NULL,
  `crop_key` text NOT NULL,
  `width` integer NOT NULL,
  `height` integer NOT NULL,
  `pack_id` text,
  `created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);

CREATE TABLE `gif_pack_blob` (
  `storage_key` text PRIMARY KEY NOT NULL,
  `content_type` text NOT NULL,
  `bytes` text NOT NULL
);

CREATE TABLE `gif_pack_demo` (
  `id` text PRIMARY KEY NOT NULL,
  `reference_id` text NOT NULL,
  `theme_slug` text NOT NULL,
  `title` text NOT NULL,
  `asset_status` text NOT NULL,
  `note` text NOT NULL
);
CREATE UNIQUE INDEX `gif_pack_demo_ref_theme` ON `gif_pack_demo` (`reference_id`, `theme_slug`);
