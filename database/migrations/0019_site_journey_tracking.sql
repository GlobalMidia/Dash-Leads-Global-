ALTER TABLE leads ADD COLUMN IF NOT EXISTS site_submission_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_temperature text;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_temperature_check;
ALTER TABLE leads ADD CONSTRAINT leads_temperature_check
  CHECK (lead_temperature IS NULL OR lead_temperature IN ('cold', 'warm', 'hot'));

CREATE UNIQUE INDEX IF NOT EXISTS leads_site_submission_id_unique
  ON leads (site_submission_id)
  WHERE site_submission_id IS NOT NULL;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_type_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_type_check
  CHECK (source_type IN ('rd', 'csv', 'manual', 'meta', 'site'));

CREATE TABLE IF NOT EXISTS site_visitors (
  visitor_id uuid PRIMARY KEY,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  first_attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  landing_page text NOT NULL DEFAULT '',
  last_page text NOT NULL DEFAULT '',
  project_unit text NOT NULL DEFAULT 'unidentified'
    CHECK (project_unit IN ('global', 'pme', 'other', 'unidentified'))
);

CREATE TABLE IF NOT EXISTS site_sessions (
  session_id uuid PRIMARY KEY,
  visitor_id uuid NOT NULL REFERENCES site_visitors(visitor_id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT '',
  medium text NOT NULL DEFAULT '',
  campaign text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  term text NOT NULL DEFAULT '',
  gclid text NOT NULL DEFAULT '',
  fbclid text NOT NULL DEFAULT '',
  referrer text NOT NULL DEFAULT '',
  landing_page text NOT NULL DEFAULT '',
  project_unit text NOT NULL DEFAULT 'unidentified'
    CHECK (project_unit IN ('global', 'pme', 'other', 'unidentified'))
);

CREATE INDEX IF NOT EXISTS site_sessions_visitor_idx
  ON site_sessions (visitor_id, started_at DESC);

CREATE TABLE IF NOT EXISTS site_tracking_events (
  event_id uuid PRIMARY KEY,
  visitor_id uuid NOT NULL REFERENCES site_visitors(visitor_id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES site_sessions(session_id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  event_name text NOT NULL CHECK (event_name IN (
    'page_view', 'engagement_30', 'engagement_60', 'scroll_50', 'scroll_90',
    'cta_click', 'whatsapp_click', 'form_view', 'form_start', 'form_submit',
    'video_start', 'video_progress_50', 'video_complete'
  )),
  occurred_at timestamptz NOT NULL,
  page_url text NOT NULL DEFAULT '',
  page_title text NOT NULL DEFAULT '',
  referrer text NOT NULL DEFAULT '',
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_tracking_events_lead_idx
  ON site_tracking_events (lead_id, occurred_at DESC)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS site_tracking_events_visitor_idx
  ON site_tracking_events (visitor_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS site_tracking_events_session_idx
  ON site_tracking_events (session_id, occurred_at DESC);
