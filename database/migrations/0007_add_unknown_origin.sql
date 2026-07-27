ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_origin_check;
ALTER TABLE leads ADD CONSTRAINT leads_origin_check
  CHECK (origin IN ('Google Ads', 'Meta Ads', 'Orgânico', 'Recomendação', 'Não identificado'));
