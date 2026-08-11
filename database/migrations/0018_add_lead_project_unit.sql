ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS project_unit text NOT NULL DEFAULT 'unidentified';

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_project_unit_check;
ALTER TABLE leads ADD CONSTRAINT leads_project_unit_check
  CHECK (project_unit IN ('global', 'pme', 'other', 'unidentified'));

CREATE INDEX IF NOT EXISTS leads_project_unit_idx ON leads (project_unit);
