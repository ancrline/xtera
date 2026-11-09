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

-- Only the SHA-256 of the emailed token is stored, never the token itself.
CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id);

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
  file_path   VARCHAR(255) NULL,
  mime_type   VARCHAR(50) NULL,
  data        BYTEA NULL,
  caption     VARCHAR(255) NOT NULL DEFAULT '',
  uploaded_by VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  pair_no     INTEGER NULL
);
-- Upgrade for databases created before photos were stored in the database.
ALTER TABLE job_images ADD COLUMN IF NOT EXISTS mime_type VARCHAR(50) NULL;
ALTER TABLE job_images ADD COLUMN IF NOT EXISTS data BYTEA NULL;
ALTER TABLE job_images ALTER COLUMN file_path DROP NOT NULL;
-- Before/after photos are grouped into numbered pairs per job (one photo per slot).
ALTER TABLE job_images ADD COLUMN IF NOT EXISTS pair_no INTEGER NULL;
UPDATE job_images i
SET pair_no = r.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY job_id, kind ORDER BY created_at, id) AS rn
  FROM job_images
) r
WHERE i.id = r.id AND i.pair_no IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_images_pair_slot ON job_images (job_id, pair_no, kind);
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
-- Generate a hash with: npm run hash -- "NewPassword"

-- No users are seeded. Create the first admin manually (never commit a password):
--   1. cd backend && npm run hash -- "YourPassword"
--   2. Run in psql (single quotes, interactive session so $ is not expanded):
--      INSERT INTO users (name, email, password_hash, role)
--      VALUES ('Bill Usman', 'infoxtera@gmail.com', '<paste hash>', 'admin')
--      ON CONFLICT (email) DO NOTHING;
