-- Quadro (Kanban) de Clientes — 05/11/2026.
--
-- A etapa de cada cliente no quadro e CALCULADA na hora a partir do que ja existe
-- (vinculos com imoveis, contratos, propostas, avaliacoes), entao nao ha coluna de
-- etapa. So o que e decisao manual do administrativo fica gravado:
--   clientes.atendimento_desde / atendimento_por: cliente marcado "Em atendimento"
--                                                 (arrastar de Leads para Em atendimento).
--   clientes_contatos: contatos registrados pelo gerador de WhatsApp e notas da etiqueta.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS atendimento_desde TIMESTAMPTZ;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS atendimento_por UUID REFERENCES parceiros(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS clientes_contatos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL,
  resultado       TEXT,
  nota            TEXT,
  data            TIMESTAMPTZ NOT NULL DEFAULT now(),
  por_parceiro_id UUID REFERENCES parceiros(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clientes_contatos_cliente ON clientes_contatos (cliente_id, data DESC);
ALTER TABLE clientes_contatos ENABLE ROW LEVEL SECURITY;
