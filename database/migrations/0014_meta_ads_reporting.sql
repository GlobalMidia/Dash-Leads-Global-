-- Contas escolhidas para acompanhamento corporativo e o último retrato de
-- indicadores vindo da Marketing API. A autorização continua centralizada na
-- conexão corporativa; esta tabela não armazena tokens.
CREATE TABLE IF NOT EXISTS meta_ads_account_selections (
  account_id text PRIMARY KEY,
  account_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT '',
  account_status integer,
  selected boolean NOT NULL DEFAULT false,
  selected_by_email citext,
  selected_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_ads_account_selections_selected_idx
  ON meta_ads_account_selections (selected, account_name);

CREATE TABLE IF NOT EXISTS meta_ads_account_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL REFERENCES meta_ads_account_selections(account_id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  spend numeric(14, 2) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  reach bigint NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  campaign_count integer NOT NULL DEFAULT 0,
  campaigns jsonb NOT NULL DEFAULT '[]'::jsonb,
  sync_error text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS meta_ads_account_snapshots_recent_idx
  ON meta_ads_account_snapshots (account_id, synced_at DESC);
