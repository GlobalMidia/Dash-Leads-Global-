-- Converte o cursor de páginas de 2 para o tamanho máximo aceito pelo RD.
ALTER TABLE rd_sync_cursor
  ALTER COLUMN page_size SET DEFAULT 125;

UPDATE rd_sync_cursor
SET
  next_page = FLOOR(((next_page - 1) * page_size)::numeric / 125)::integer + 1,
  page_size = 125,
  updated_at = NOW()
WHERE page_size <> 125;
