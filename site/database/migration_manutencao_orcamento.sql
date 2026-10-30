-- Orcamento e pagamento da Manutencao (30/10/2026).
--
-- 1) catalogo_obra: catalogo de referencia de materiais e servicos (SINAPI da
--    Caixa, por estado e mes). O responsavel escolhe a categoria (ex.: Eletrica)
--    e o sistema lista os itens daquela categoria, com unidade e preco de
--    referencia. Tambem aceita itens digitados a mao (fonte = 'manual').
-- 2) manutencao_orcamento_itens: itens do orcamento de um ticket, em dois
--    grupos: 'material' (o que vai ser comprado) e 'servico' (reforma/mao de
--    obra: m2, linear, diaria...). O valor unitario e o que o responsavel
--    definiu depois de cotar com fornecedores.
-- 3) manutencao_pagamento_linhas + colunas em manutencoes: depois de aprovado,
--    como o servico sera pago (quem arca, quem paga o fornecedor, caucao,
--    boleto, parcelas...).

CREATE TABLE IF NOT EXISTS catalogo_obra (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte         TEXT NOT NULL DEFAULT 'SINAPI',
  grupo         TEXT NOT NULL CHECK (grupo IN ('material', 'servico')),
  codigo        TEXT NOT NULL,
  categoria     TEXT NOT NULL,
  classe_origem TEXT,
  descricao     TEXT NOT NULL,
  unidade       TEXT NOT NULL,
  preco_ref     NUMERIC(14,2),
  uf            TEXT NOT NULL DEFAULT 'RO',
  referencia    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fonte, grupo, codigo, uf)
);
CREATE INDEX IF NOT EXISTS idx_catalogo_obra_grupo_categoria ON catalogo_obra (grupo, categoria);

CREATE TABLE IF NOT EXISTS manutencao_orcamento_itens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manutencao_id  UUID NOT NULL REFERENCES manutencoes(id) ON DELETE CASCADE,
  grupo          TEXT NOT NULL CHECK (grupo IN ('material', 'servico')),
  categoria      TEXT,
  descricao      TEXT NOT NULL,
  unidade        TEXT NOT NULL,
  quantidade     NUMERIC(14,3) NOT NULL DEFAULT 1,
  valor_unitario NUMERIC(14,2) NOT NULL DEFAULT 0,
  fornecedor     TEXT,
  catalogo_id    UUID REFERENCES catalogo_obra(id) ON DELETE SET NULL,
  preco_ref      NUMERIC(14,2),
  ordem          SMALLINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manut_orcamento_manutencao ON manutencao_orcamento_itens (manutencao_id);

ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS pagamento_quem_arca TEXT;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS pagamento_quem_paga TEXT;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS pagamento_obs TEXT;

CREATE TABLE IF NOT EXISTS manutencao_pagamento_linhas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manutencao_id UUID NOT NULL REFERENCES manutencoes(id) ON DELETE CASCADE,
  descricao     TEXT NOT NULL,
  forma         TEXT NOT NULL,
  valor         NUMERIC(14,2) NOT NULL DEFAULT 0,
  vencimento    DATE,
  pago_em       DATE,
  ordem         SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manut_pagamento_manutencao ON manutencao_pagamento_linhas (manutencao_id);
