-- CRM do cliente (etiqueta do Kanban de Clientes) — 23/11/2026.
--
-- Regra de ouro: todo contato termina com a PRÓXIMA ATIVIDADE agendada. A atividade nasce dentro de "Contatos e notas"
-- (clientes_atividades), aparece na Agenda do administrativo e do corretor e, atrasada, no sino.
--   clientes_atividades: o que fazer com o cliente e quando (ligar, WhatsApp, visita...).
--   crm_clientes: estado do relacionamento (1 linha por cliente, criada quando preciso): temperatura, opt-out (LGPD),
--     telefone inválido e canais para achar o cliente (Instagram, Facebook) com a fonte do dado.
-- Tabelas separadas, sem mexer em "clientes". RLS ligado e sem política: acesso só pelo servidor (Prisma).

CREATE TABLE IF NOT EXISTS clientes_atividades (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  contato_id     UUID REFERENCES clientes_contatos(id) ON DELETE SET NULL,
  tipo           TEXT NOT NULL,
  titulo         TEXT NOT NULL,
  data           DATE NOT NULL,
  hora           TEXT,
  responsavel_id UUID REFERENCES parceiros(id) ON DELETE SET NULL,
  feito          BOOLEAN NOT NULL DEFAULT FALSE,
  feito_em       TIMESTAMPTZ,
  feito_por      UUID,
  origem         TEXT NOT NULL DEFAULT 'manual',
  criado_por     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clientes_atividades_cliente_idx ON clientes_atividades (cliente_id, feito, data);
CREATE INDEX IF NOT EXISTS clientes_atividades_pendentes_idx ON clientes_atividades (data) WHERE NOT feito;
CREATE INDEX IF NOT EXISTS clientes_atividades_responsavel_idx ON clientes_atividades (responsavel_id, data) WHERE NOT feito;

CREATE TABLE IF NOT EXISTS crm_clientes (
  cliente_id        UUID PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  temperatura       TEXT CHECK (temperatura IN ('quente', 'morno', 'frio', 'nao_quer')),
  opt_out           BOOLEAN NOT NULL DEFAULT FALSE,
  opt_out_em        TIMESTAMPTZ,
  opt_out_motivo    TEXT,
  telefone_invalido BOOLEAN NOT NULL DEFAULT FALSE,
  instagram         TEXT,
  facebook          TEXT,
  fonte_dado        TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID
);
CREATE INDEX IF NOT EXISTS crm_clientes_opt_out_idx ON crm_clientes (cliente_id) WHERE opt_out;

ALTER TABLE clientes_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_clientes ENABLE ROW LEVEL SECURITY;
