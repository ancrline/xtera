-- XTERA Job Reports schema (MySQL 8+)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  id           TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  company_name VARCHAR(190) NOT NULL,
  email        VARCHAR(190) NOT NULL,
  phone        VARCHAR(60) NOT NULL,
  website      VARCHAR(190) NOT NULL DEFAULT ''
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS work_types (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label      VARCHAR(120) NOT NULL UNIQUE,
  active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS terms_versions (
  version    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  text       MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS jobs (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_number       VARCHAR(20) NOT NULL UNIQUE,
  client_name      VARCHAR(190) NOT NULL,
  client_email     VARCHAR(190) NOT NULL,
  client_phone     VARCHAR(60) NOT NULL,
  property_address VARCHAR(255) NOT NULL,
  work_type        VARCHAR(120) NOT NULL,
  description      TEXT,
  status           ENUM('Draft','Awaiting acceptance','Accepted','In progress','Completed') NOT NULL DEFAULT 'Draft',
  token            CHAR(48) NOT NULL UNIQUE,
  terms_sent_at    DATETIME NULL,
  terms_version    INT UNSIGNED NULL,
  accepted_by      VARCHAR(190) NULL,
  accepted_at      DATETIME NULL,
  accepted_terms_version INT UNSIGNED NULL,
  created_by       VARCHAR(120) NOT NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_jobs_status (status),
  INDEX idx_jobs_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_notes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id     INT UNSIGNED NOT NULL,
  author     VARCHAR(120) NOT NULL,
  text       TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  INDEX idx_notes_job (job_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_images (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id      INT UNSIGNED NOT NULL,
  kind        ENUM('before','after') NOT NULL,
  file_path   VARCHAR(255) NOT NULL,
  caption     VARCHAR(255) NOT NULL DEFAULT '',
  uploaded_by VARCHAR(120) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  INDEX idx_images_job (job_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_history (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id     INT UNSIGNED NOT NULL,
  event      VARCHAR(255) NOT NULL,
  actor      VARCHAR(190) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  INDEX idx_history_job (job_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_log (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id     INT UNSIGNED NOT NULL,
  recipient  VARCHAR(190) NOT NULL,
  subject    VARCHAR(255) NOT NULL,
  link       VARCHAR(255) NOT NULL,
  sent_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  success    TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO settings (id, company_name, email, phone, website) VALUES
  (1, 'XTERA Exterior Cleaning', 'infoxtera@gmail.com', '0800326002', 'xtera.co.nz')
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO work_types (label) VALUES
  ('House Wash'),
  ('Roof Wash'),
  ('Window Cleaning'),
  ('Gutter Cleaning'),
  ('Driveway Cleaning'),
  ('Fence Cleaning'),
  ('Building Wash'),
  ('Commercial Wash')
ON DUPLICATE KEY UPDATE label = label;

-- Password format used by the Node API:
-- pbkdf2$<iterations>$<salt_hex>$<hash_hex>
-- default demo password for both accounts is "ChangeMe123!"
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Admin User', 'admin@xtera.co.nz', 'pbkdf2$120000$6d2b8d60f4e2c12af4cd17e1b9c53fa2$4e1f2c70d8d731557664e672b83cf82ed63b54a1dc36b36527c2376d50a77b96', 'admin'),
  ('Sam Tradie', 'staff@xtera.co.nz', 'pbkdf2$120000$59a67f5c893e1640dcae27f7729358ec$e10c05ef915165ebac3bde73cc50d5178b9ec7dd45d4f0ceae5c775f1e05d979', 'staff')
ON DUPLICATE KEY UPDATE email = email;
