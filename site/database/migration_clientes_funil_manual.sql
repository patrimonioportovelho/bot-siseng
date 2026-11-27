-- Kanban de Clientes: movimento livre — 27/11/2026.
-- Coluna escolhida à mão (arrastando o cartão). Vazia = a coluna é calculada pelo sistema. Ela deixa de valer quando
-- surge um contrato, proposta, avaliação ou gestão depois da data do movimento (ver lib/clientes/funil.ts).
-- Para desfazer: ALTER TABLE clientes DROP COLUMN funil_coluna, DROP COLUMN funil_coluna_em, DROP COLUMN funil_coluna_por;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS funil_coluna TEXT,
  ADD COLUMN IF NOT EXISTS funil_coluna_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS funil_coluna_por UUID;
