CREATE TABLE IF NOT EXISTS pme_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_hash text NOT NULL UNIQUE,
  imported_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  imported_by_email citext,
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  imported_rows integer NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  ignored_rows integer NOT NULL DEFAULT 0 CHECK (ignored_rows >= 0),
  source_sheets jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pme_reactivation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES pme_import_batches(id) ON DELETE CASCADE,
  source_sheet text NOT NULL,
  source_row integer NOT NULL CHECK (source_row > 0),
  category text NOT NULL DEFAULT 'PME',
  company_name text NOT NULL,
  normalized_company text NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  historic_status text NOT NULL DEFAULT '',
  historic_value numeric(14, 2),
  recorded_at date,
  contact_at date,
  displayed_at date,
  notes text NOT NULL DEFAULT '',
  source_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_batch_id, source_sheet, source_row)
);

CREATE INDEX IF NOT EXISTS pme_reactivation_company_idx
  ON pme_reactivation_records (normalized_company, contact_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS pme_reactivation_category_idx
  ON pme_reactivation_records (category, contact_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS pme_reactivation_import_batch_idx
  ON pme_reactivation_records (import_batch_id);
