-- CRM do cliente, parte 3: ficha de relacionamento, ganchos de conversa e edição do roteiro — 27/11/2026.
--   crm_fichas: o que o cliente compartilhou (família, profissão, lazer, estilo, preferências de contato) e as datas que
--     geram lembrete (casamento e, quando não há contrato no sistema, a compra/locação da casa). Sem dados sensíveis.
--   crm_ganchos: assuntos para a próxima conversa, com "lembrar em" opcional (que vira atividade).
--   crm_roteiro_edicoes: textos e opções do roteiro alterados pelo administrativo (o original continua no código).
-- Para desfazer: DROP TABLE crm_ganchos, crm_fichas, crm_roteiro_edicoes;

CREATE TABLE IF NOT EXISTS crm_fichas (
  cliente_id   UUID PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  dados        JSONB NOT NULL DEFAULT '{}',
  casamento_em DATE,
  casa_em      DATE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID
);

CREATE TABLE IF NOT EXISTS crm_ganchos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  texto           TEXT NOT NULL,
  lembrar_em      DATE,
  atividade_id    UUID REFERENCES clientes_atividades(id) ON DELETE SET NULL,
  por_parceiro_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_ganchos_cliente_idx ON crm_ganchos (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_ganchos_lembrar_idx ON crm_ganchos (lembrar_em) WHERE lembrar_em IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_roteiro_edicoes (
  pergunta_id TEXT PRIMARY KEY,
  dados       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID
);

ALTER TABLE crm_fichas ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_ganchos ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_roteiro_edicoes ENABLE ROW LEVEL SECURITY;
