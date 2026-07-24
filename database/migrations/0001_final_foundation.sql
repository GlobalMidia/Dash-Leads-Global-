CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS application_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id text NOT NULL UNIQUE,
  email citext NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES application_users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'system'
    CHECK (theme IN ('system', 'light', 'dark')),
  text_size text NOT NULL DEFAULT 'normal'
    CHECK (text_size IN ('normal', 'large', 'extra')),
  high_contrast boolean NOT NULL DEFAULT false,
  reduced_motion boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_hash text NOT NULL,
  imported_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  imported_by_email citext,
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  imported_rows integer NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  ignored_rows integer NOT NULL DEFAULT 0 CHECK (ignored_rows >= 0),
  grouped_rows integer NOT NULL DEFAULT 0 CHECK (grouped_rows >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_batches_created_at_idx
  ON import_batches (created_at DESC);

CREATE TABLE IF NOT EXISTS duplicate_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('potential', 'confirmed')),
  normalized_company text NOT NULL DEFAULT '',
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  source_import_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_uuid text UNIQUE,
  name text NOT NULL,
  company text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  normalized_email text NOT NULL DEFAULT '',
  normalized_phone text NOT NULL DEFAULT '',
  normalized_company text NOT NULL DEFAULT '',
  origin text NOT NULL DEFAULT 'Orgânico',
  entered_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes varchar(280) NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'manual',
  source_label text NOT NULL DEFAULT 'Cadastro manual',
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  duplicate_group_id uuid REFERENCES duplicate_groups(id) ON DELETE SET NULL,
  duplicate_status text
    CHECK (duplicate_status IS NULL OR duplicate_status IN ('potential', 'confirmed')),
  additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads ALTER COLUMN rd_uuid DROP NOT NULL;
ALTER TABLE leads ALTER COLUMN email SET DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS normalized_email text NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS normalized_phone text NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS normalized_company text NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_label text NOT NULL DEFAULT 'Cadastro manual';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS duplicate_group_id uuid REFERENCES duplicate_groups(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS duplicate_status text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS additional_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE leads
SET origin = 'Orgânico'
WHERE origin NOT IN ('Google Ads', 'Meta Ads', 'Orgânico', 'Recomendação');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_status_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_status_check
      CHECK (status IN ('pending', 'attended', 'qualified', 'disqualified', 'closed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_origin_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_origin_check
      CHECK (origin IN ('Google Ads', 'Meta Ads', 'Orgânico', 'Recomendação'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_source_type_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_source_type_check
      CHECK (source_type IN ('rd', 'csv', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_duplicate_status_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_duplicate_status_check
      CHECK (
        duplicate_status IS NULL OR
        duplicate_status IN ('potential', 'confirmed')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leads_entered_at_idx ON leads (entered_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
CREATE INDEX IF NOT EXISTS leads_origin_idx ON leads (origin);
CREATE INDEX IF NOT EXISTS leads_normalized_email_idx
  ON leads (normalized_email) WHERE normalized_email <> '';
CREATE INDEX IF NOT EXISTS leads_normalized_phone_idx
  ON leads (normalized_phone) WHERE normalized_phone <> '';
CREATE INDEX IF NOT EXISTS leads_normalized_company_idx
  ON leads (normalized_company) WHERE normalized_company <> '';
CREATE INDEX IF NOT EXISTS leads_duplicate_group_idx
  ON leads (duplicate_group_id) WHERE duplicate_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_import_batch_idx
  ON leads (import_batch_id) WHERE import_batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES application_users(id) ON DELETE SET NULL,
  actor_email citext,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx
  ON audit_log (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rd_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_identifier text NOT NULL DEFAULT 'primary' UNIQUE,
  encrypted_access_token text,
  encrypted_refresh_token text,
  access_token_expires_at timestamptz,
  connected_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  connected_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rd_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL
    CHECK (trigger_type IN ('manual', 'cron', 'webhook', 'initial')),
  status text NOT NULL
    CHECK (status IN ('running', 'completed', 'failed')),
  imported_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS rd_sync_runs_started_at_idx
  ON rd_sync_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS rd_webhook_events (
  event_key text PRIMARY KEY,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);
