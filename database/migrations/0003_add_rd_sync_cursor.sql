-- A sincronização com o RD é deliberadamente paginada. O cursor fica no banco
-- para que uma pausa, atualização de página ou nova sessão continue do ponto
-- seguro em que a importação anterior parou.
CREATE TABLE IF NOT EXISTS rd_sync_cursor (
  account_identifier text PRIMARY KEY DEFAULT 'primary',
  segmentation_id text,
  next_page integer NOT NULL DEFAULT 1 CHECK (next_page >= 1),
  total_rows integer,
  imported_count integer NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  status text NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'running', 'completed', 'failed')),
  last_error text,
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
