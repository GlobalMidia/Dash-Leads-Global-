ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_leadgen_id text;

CREATE UNIQUE INDEX IF NOT EXISTS leads_meta_leadgen_id_unique
  ON leads (meta_leadgen_id)
  WHERE meta_leadgen_id IS NOT NULL;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_type_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_type_check
  CHECK (source_type IN ('rd', 'csv', 'manual', 'meta'));

CREATE INDEX IF NOT EXISTS meta_lead_webhook_events_unprocessed_idx
  ON meta_lead_webhook_events (received_at ASC)
  WHERE processed_at IS NULL AND processing_error IS NULL;
