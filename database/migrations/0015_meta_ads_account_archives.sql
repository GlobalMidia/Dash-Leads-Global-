-- Arquivamento manual de contas de anúncio, sem encerrar a conexão corporativa
-- nem apagar os retratos já registrados para auditoria futura.
ALTER TABLE meta_ads_account_selections
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by_email citext;

CREATE INDEX IF NOT EXISTS meta_ads_account_selections_archived_idx
  ON meta_ads_account_selections (archived, account_name);
