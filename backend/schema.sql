-- ===========================================================================
--  AI Reel Editor - MySQL schema
--  Target: XAMPP MySQL/MariaDB (default 3306, this machine uses 3307)
--
--  Import with phpMyAdmin:
--    1. Open phpMyAdmin -> Import tab -> choose this file -> Go
--    2. Or from a terminal:
--       mysql -u root -P 3307 < schema.sql
--
--  The script creates the database if it does not exist.
-- ===========================================================================

CREATE DATABASE IF NOT EXISTS `ai_video_editor`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ai_video_editor`;

-- ---------------------------------------------------------------- users ----
CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT           NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(120)  NOT NULL,
  `email`         VARCHAR(190)  NOT NULL,
  `password_hash` VARCHAR(255)  NOT NULL,
  `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------- projects ----
CREATE TABLE IF NOT EXISTS `projects` (
  `id`                INT           NOT NULL AUTO_INCREMENT,
  `user_id`           INT           NOT NULL,
  `original_filename` VARCHAR(255)  NOT NULL,
  `video_path`        VARCHAR(600)  NOT NULL,
  `duration`          FLOAT         NOT NULL DEFAULT 0,
  `width`             INT           NOT NULL DEFAULT 0,
  `height`            INT           NOT NULL DEFAULT 0,
  `fps`               FLOAT         NOT NULL DEFAULT 0,
  `trim_start`        FLOAT         NOT NULL DEFAULT 0,
  `trim_end`          FLOAT         NOT NULL DEFAULT 0,
  `burn_subtitles`    TINYINT(1)    NOT NULL DEFAULT 0,
  `status`            VARCHAR(32)   NOT NULL DEFAULT 'uploaded',
  `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_projects_user` (`user_id`),
  KEY `ix_projects_status` (`status`),
  CONSTRAINT `fk_projects_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------ subtitles ----
CREATE TABLE IF NOT EXISTS `subtitles` (
  `id`         INT    NOT NULL AUTO_INCREMENT,
  `project_id` INT    NOT NULL,
  `start_time` FLOAT  NOT NULL DEFAULT 0,
  `end_time`   FLOAT  NOT NULL DEFAULT 0,
  `text`       TEXT   NOT NULL,
  `words_json` LONGTEXT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_subtitles_project` (`project_id`),
  CONSTRAINT `fk_subtitles_project` FOREIGN KEY (`project_id`)
    REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------ templates ----
CREATE TABLE IF NOT EXISTS `templates` (
  `id`            INT          NOT NULL AUTO_INCREMENT,
  `number`        INT          NOT NULL,
  `fx`            VARCHAR(64)  NOT NULL,
  `name`          VARCHAR(120) NOT NULL,
  `category`      VARCHAR(64)  NOT NULL,
  `description`   TEXT         NOT NULL,
  `options_json`  LONGTEXT     NOT NULL,
  `needs_images`  TINYINT(1)   NOT NULL DEFAULT 0,
  `thumbnail_url` VARCHAR(300) NOT NULL DEFAULT '',
  `enabled`       TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_templates_number` (`number`),
  UNIQUE KEY `uq_templates_fx` (`fx`),
  KEY `ix_templates_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------- project_effects ----
CREATE TABLE IF NOT EXISTS `project_effects` (
  `id`           INT     NOT NULL AUTO_INCREMENT,
  `project_id`   INT     NOT NULL,
  `template_id`  INT     NOT NULL,
  `start_time`   FLOAT   NOT NULL DEFAULT 0,
  `end_time`     FLOAT   NOT NULL DEFAULT 0,
  `options_json` LONGTEXT NOT NULL,
  `order_index`  INT     NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_effect_order` (`project_id`, `order_index`),
  KEY `ix_effects_project` (`project_id`),
  CONSTRAINT `fk_effects_project` FOREIGN KEY (`project_id`)
    REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_effects_template` FOREIGN KEY (`template_id`)
    REFERENCES `templates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------- render_jobs ----
CREATE TABLE IF NOT EXISTS `render_jobs` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `project_id`     INT          NOT NULL,
  `progress`       INT          NOT NULL DEFAULT 0,
  `stage`          VARCHAR(64)  NOT NULL DEFAULT 'queued',
  `status`         VARCHAR(32)  NOT NULL DEFAULT 'queued',
  `output_path`    VARCHAR(600) NULL,
  `error`          LONGTEXT     NULL,
  `queue_position` INT          NOT NULL DEFAULT 0,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at`    DATETIME     NULL,
  PRIMARY KEY (`id`),
  KEY `ix_jobs_project` (`project_id`),
  KEY `ix_jobs_status` (`status`),
  CONSTRAINT `fk_jobs_project` FOREIGN KEY (`project_id`)
    REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
