-- A fila anterior usava páginas de 60 contatos. Converte o cursor existente
-- para páginas de 2 antes de mudar o ritmo, sem voltar ao início da base.
ALTER TABLE rd_sync_cursor
  ADD COLUMN IF NOT EXISTS page_size integer NOT NULL DEFAULT 60;

ALTER TABLE rd_sync_cursor
  ALTER COLUMN page_size SET DEFAULT 2;

UPDATE rd_sync_cursor
SET
  next_page = FLOOR(((next_page - 1) * page_size)::numeric / 2)::integer + 1,
  page_size = 2,
  updated_at = NOW()
WHERE page_size <> 2;
