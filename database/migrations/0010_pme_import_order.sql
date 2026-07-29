CREATE TABLE IF NOT EXISTS pme_import_batch_order (
  application_user_id uuid NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  import_batch_id uuid NOT NULL REFERENCES pme_import_batches(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_user_id, import_batch_id)
);

CREATE INDEX IF NOT EXISTS pme_import_batch_order_user_position_idx
  ON pme_import_batch_order (application_user_id, position);
