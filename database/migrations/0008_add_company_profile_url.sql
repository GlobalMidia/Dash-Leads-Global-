ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS company_profile_url text NOT NULL DEFAULT '';
