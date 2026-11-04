-- Controle de ponto do administrativo — 04/11/2026.
--
-- Quem tem acesso administrativo (Administrativo, Financeiro ou Recrutador, e nao
-- e Diretor) tem o tempo de uso do sistema registrado como um ponto:
--   ponto_config:     jornada de cada pessoa (padrao: seg a sex, 08h-18h, almoco
--                     12h-14h, teto de 40h por semana). Horarios em "HH:MM", hora
--                     de Porto Velho.
--   ponto_sessoes:    cada periodo de uso (inicio, ultimo sinal de vida, fim). So conta
--                     o tempo de uso real: o tempo ocioso nao entra. Nunca se apaga:
--                     um periodo errado e "anulado" com justificativa.
--   ponto_liberacoes: pedidos de hora extra / uso fora do expediente e a decisao da
--                     diretoria (minutos aprovados, validade, quanto ja foi usado).
CREATE TABLE IF NOT EXISTS ponto_config (
  parceiro_id       UUID PRIMARY KEY REFERENCES parceiros(id) ON DELETE CASCADE,
  ativo             BOOLEAN NOT NULL DEFAULT true,
  carga_semanal_min INTEGER NOT NULL DEFAULT 2400,
  entrada           TEXT NOT NULL DEFAULT '08:00',
  saida             TEXT NOT NULL DEFAULT '18:00',
  almoco_inicio     TEXT NOT NULL DEFAULT '12:00',
  almoco_fim        TEXT NOT NULL DEFAULT '14:00',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES parceiros(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ponto_sessoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id   UUID NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  inicio        TIMESTAMPTZ NOT NULL,
  ultimo_sinal  TIMESTAMPTZ NOT NULL,
  fim           TIMESTAMPTZ,
  motivo_fim    TEXT,
  segundos_extra INTEGER NOT NULL DEFAULT 0,
  origem        TEXT NOT NULL DEFAULT 'auto',
  anulada       BOOLEAN NOT NULL DEFAULT false,
  justificativa TEXT,
  ajustado_por  UUID REFERENCES parceiros(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ponto_sessoes_parceiro_inicio ON ponto_sessoes (parceiro_id, inicio DESC);
CREATE INDEX IF NOT EXISTS idx_ponto_sessoes_abertas ON ponto_sessoes (parceiro_id) WHERE fim IS NULL;

CREATE TABLE IF NOT EXISTS ponto_liberacoes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id        UUID NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  motivo             TEXT NOT NULL,
  minutos_solicitados INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pendente',
  minutos_aprovados  INTEGER,
  usado_seg          INTEGER NOT NULL DEFAULT 0,
  valida_ate         TIMESTAMPTZ,
  decidido_por       UUID REFERENCES parceiros(id) ON DELETE SET NULL,
  decidido_em        TIMESTAMPTZ,
  observacao_decisao TEXT,
  solicitado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ponto_liberacoes_parceiro ON ponto_liberacoes (parceiro_id, solicitado_em DESC);
CREATE INDEX IF NOT EXISTS idx_ponto_liberacoes_status ON ponto_liberacoes (status);

ALTER TABLE ponto_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponto_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponto_liberacoes ENABLE ROW LEVEL SECURITY;
