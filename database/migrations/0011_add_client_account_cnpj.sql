ALTER TABLE client_accounts
  ADD COLUMN IF NOT EXISTS cnpj varchar(14) NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_accounts_cnpj_format'
  ) THEN
    ALTER TABLE client_accounts
      ADD CONSTRAINT client_accounts_cnpj_format
      CHECK (cnpj = '' OR cnpj ~ '^[0-9]{14}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_accounts_profile_url_required'
  ) THEN
    ALTER TABLE client_accounts
      ADD CONSTRAINT client_accounts_profile_url_required
      CHECK (profile_url ~* '^https?://[^[:space:]]+$') NOT VALID;
  END IF;
END
$$;
