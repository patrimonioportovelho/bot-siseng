-- CRM do cliente, parte 2: roteiro de atendimento guiado — 27/11/2026.
--   crm_atendimentos: cada execução do roteiro (quem fez, segmento, caminho, respostas e desfecho). Fica "em_andamento"
--     enquanto está pausado (um por cliente) e vira "concluido" ou "cancelado". É o histórico consultável.
--   crm_clientes.indicado_por_cliente_id: quem indicou este cliente.
-- Para desfazer: DROP TABLE crm_atendimentos; ALTER TABLE crm_clientes DROP COLUMN indicado_por_cliente_id;

CREATE TABLE IF NOT EXISTS crm_atendimentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  segmento        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluido', 'cancelado')),
  versao_roteiro  INTEGER NOT NULL DEFAULT 1,
  caminho         JSONB NOT NULL DEFAULT '["C1"]',
  respostas       JSONB NOT NULL DEFAULT '{}',
  desfecho        TEXT,
  temperatura     TEXT,
  resumo          TEXT,
  por_parceiro_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_atendimentos_um_aberto ON crm_atendimentos (cliente_id) WHERE status = 'em_andamento';
CREATE INDEX IF NOT EXISTS crm_atendimentos_cliente_idx ON crm_atendimentos (cliente_id, created_at DESC);

ALTER TABLE crm_clientes ADD COLUMN IF NOT EXISTS indicado_por_cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL;

ALTER TABLE crm_atendimentos ENABLE ROW LEVEL SECURITY;
