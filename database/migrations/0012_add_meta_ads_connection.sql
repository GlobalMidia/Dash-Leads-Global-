CREATE TABLE IF NOT EXISTS meta_ads_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_identifier text NOT NULL DEFAULT 'corporate' UNIQUE,
  encrypted_access_token text NOT NULL,
  access_token_expires_at timestamptz,
  meta_user_id text,
  meta_user_name text,
  ad_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  connected_by_email citext,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_ads_connections_updated_at_idx
  ON meta_ads_connections (updated_at DESC);
