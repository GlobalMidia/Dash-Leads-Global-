-- Closed accounts are retained for seven days before the scheduled purge.
-- This partial index keeps the daily eligibility check small as the account base grows.
CREATE INDEX IF NOT EXISTS client_accounts_inactive_updated_idx
  ON client_accounts (updated_at ASC)
  WHERE active = false;
