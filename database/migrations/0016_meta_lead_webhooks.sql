CREATE TABLE IF NOT EXISTS meta_lead_webhook_events (
  event_key text PRIMARY KEY,
  page_id text,
  leadgen_id text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE INDEX IF NOT EXISTS meta_lead_webhook_events_pending_idx
  ON meta_lead_webhook_events (received_at DESC) WHERE processed_at IS NULL;
