-- A primeira sincronização usou a segmentação histórica inteira do RD Station.
-- Esses registros foram criados somente no banco local do dashboard e são removidos
-- antes de aplicar o recorte limitado da sincronização.
DELETE FROM leads
WHERE source_type = 'rd';
