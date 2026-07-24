-- A primeira sincronização já trouxe os 500 contatos mais recentes. Inicia a
-- fila seguinte próximo desse ponto, sem passar novamente vários minutos só
-- atualizando registros que já estão no painel.
INSERT INTO rd_sync_cursor (
  account_identifier, next_page, imported_count, status, started_at, updated_at
)
SELECT
  'primary',
  GREATEST(1, FLOOR(COUNT(*) / 60.0)::integer + 1),
  COUNT(*)::integer,
  'running',
  NOW(),
  NOW()
FROM leads
WHERE source_type = 'rd'
HAVING COUNT(*) > 0
ON CONFLICT (account_identifier) DO NOTHING;
