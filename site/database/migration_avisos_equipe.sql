-- Avisos da equipe (estilo MSN) — 30/10/2026.
--
-- Quando um corretor entra no portal, faz uma proposta ou cadastra algo novo, o
-- sistema grava uma linha aqui. As telas do administrativo consultam esta
-- tabela de poucos em poucos segundos e mostram um aviso no canto da tela por
-- ~10 segundos. Nao e historico: linhas com mais de 7 dias sao apagadas.
--   tipo:    login | proposta | avaliacao_cpf | avaliacao_credito | avaliacao_convertida
--            | compra_venda | locacao | administracao | gestao
--   detalhe: texto curto (cliente, id do contrato...)
--   url:     tela do administrativo para abrir ao clicar (pode ser nula)
CREATE TABLE IF NOT EXISTS avisos_equipe (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        TEXT NOT NULL,
  parceiro_id UUID REFERENCES parceiros(id) ON DELETE SET NULL,
  detalhe     TEXT,
  url         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avisos_equipe_created ON avisos_equipe (created_at DESC);
