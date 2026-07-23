CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_uuid text NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  origin text NOT NULL DEFAULT 'RD Station',
  entered_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'attended', 'qualified', 'disqualified', 'closed')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_entered_at_idx ON leads (entered_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
CREATE INDEX IF NOT EXISTS leads_origin_idx ON leads (origin);
