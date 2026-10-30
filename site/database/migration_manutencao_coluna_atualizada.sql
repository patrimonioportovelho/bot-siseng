-- Quadro de Manutencao (30/10/2026): relogio da coluna.
--
-- coluna_atualizada_em marca quando o ticket entrou na coluna atual (mesmo
-- mecanismo de marketing_ordens.coluna_atualizada_em). E o que permite o card
-- mostrar "parado ha N dias" e o quadro destacar o que passou da meta da
-- etapa. Atualizado so ao MOVER o card, nunca ao editar a ficha.
-- Tickets que ja existem comecam com a data da ultima atualizacao.
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS coluna_atualizada_em TIMESTAMPTZ;
UPDATE manutencoes SET coluna_atualizada_em = updated_at WHERE coluna_atualizada_em IS NULL;
