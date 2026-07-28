CREATE TABLE IF NOT EXISTS client_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  profile_url text NOT NULL DEFAULT '',
  health_status text NOT NULL DEFAULT 'unassessed'
    CHECK (health_status IN ('green', 'yellow', 'red', 'unassessed')),
  active boolean NOT NULL DEFAULT true,
  nucleus text NOT NULL DEFAULT '',
  account_head text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT '',
  last_review_at timestamptz,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_accounts_active_health_idx
  ON client_accounts (active, health_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS client_health_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  review_week date NOT NULL,
  health_status text NOT NULL
    CHECK (health_status IN ('green', 'yellow', 'red')),
  satisfaction text NOT NULL DEFAULT 'unknown'
    CHECK (satisfaction IN ('satisfied', 'neutral', 'dissatisfied', 'unknown')),
  delivery_status text NOT NULL DEFAULT 'unknown'
    CHECK (delivery_status IN ('on_track', 'attention', 'late', 'unknown')),
  notes varchar(1200) NOT NULL DEFAULT '',
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_account_id, review_week)
);

CREATE TABLE IF NOT EXISTS client_pendencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  title varchar(240) NOT NULL,
  review_week date NOT NULL,
  completed_at timestamptz,
  completed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_pendencies_open_idx
  ON client_pendencies (client_account_id, review_week, created_at DESC)
  WHERE completed_at IS NULL;
