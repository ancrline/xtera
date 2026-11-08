-- XTERA Job Reports schema (PostgreSQL)
-- Apply manually, it is NOT run by the deploy workflow:
--   psql "$DATABASE_URL" -f backend/db/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name VARCHAR(190) NOT NULL,
  email        VARCHAR(190) NOT NULL,
  phone        VARCHAR(60) NOT NULL,
  website      VARCHAR(190) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS work_types (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label      VARCHAR(120) NOT NULL UNIQUE,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS terms_versions (
  version    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_number       VARCHAR(20) NOT NULL UNIQUE,
  client_name      VARCHAR(190) NOT NULL,
  client_email     VARCHAR(190) NOT NULL,
  client_phone     VARCHAR(60) NOT NULL,
  property_address VARCHAR(255) NOT NULL,
  work_type        VARCHAR(120) NOT NULL,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'Draft'
                   CHECK (status IN ('Draft','Awaiting acceptance','Accepted','In progress','Completed')),
  token            CHAR(48) NOT NULL UNIQUE,
  terms_sent_at    TIMESTAMPTZ NULL,
  terms_version    INTEGER NULL,
  accepted_by      VARCHAR(190) NULL,
  accepted_at      TIMESTAMPTZ NULL,
  accepted_terms_version INTEGER NULL,
  created_by       VARCHAR(120) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs (created_at);

CREATE TABLE IF NOT EXISTS job_notes (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  author     VARCHAR(120) NOT NULL,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_job ON job_notes (job_id);

CREATE TABLE IF NOT EXISTS job_images (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('before','after')),
  file_path   VARCHAR(255) NOT NULL,
  caption     VARCHAR(255) NOT NULL DEFAULT '',
  uploaded_by VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_images_job ON job_images (job_id);

CREATE TABLE IF NOT EXISTS job_history (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  event      VARCHAR(255) NOT NULL,
  actor      VARCHAR(190) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_job ON job_history (job_id);

CREATE TABLE IF NOT EXISTS email_log (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  recipient  VARCHAR(190) NOT NULL,
  subject    VARCHAR(255) NOT NULL,
  link       VARCHAR(255) NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  success    BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO settings (id, company_name, email, phone, website) VALUES
  (1, 'XTERA Exterior Cleaning', 'infoxtera@gmail.com', '0800326002', 'xtera.co.nz')
ON CONFLICT (id) DO NOTHING;

INSERT INTO work_types (label) VALUES
  ('House Wash'),
  ('Roof Wash'),
  ('Window Cleaning'),
  ('Gutter Cleaning'),
  ('Driveway Cleaning'),
  ('Fence Cleaning'),
  ('Building Wash'),
  ('Commercial Wash')
ON CONFLICT (label) DO NOTHING;

-- Password format used by the Node API:
-- pbkdf2$<iterations>$<salt_hex>$<hash_hex>
-- Demo accounts below use the password "ChangeMe123!". Change it or delete
-- these rows before using the system for real (generate a hash: npm run hash -- "NewPassword").
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Admin User', 'admin@xtera.co.nz', 'pbkdf2$120000$6d2b8d60f4e2c12af4cd17e1b9c53fa2$4e1f2c70d8d731557664e672b83cf82ed63b54a1dc36b36527c2376d50a77b96', 'admin'),
  ('Sam Tradie', 'staff@xtera.co.nz', 'pbkdf2$120000$59a67f5c893e1640dcae27f7729358ec$e10c05ef915165ebac3bde73cc50d5178b9ec7dd45d4f0ceae5c775f1e05d979', 'staff')
ON CONFLICT (email) DO NOTHING;
