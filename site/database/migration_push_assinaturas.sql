-- Avisos na tela (Web Push) — 30/10/2026.
--
-- Cada navegador que o usuario ativa vira uma linha: endpoint + chaves que o
-- navegador entrega (p256dh/auth). modulos = de quais areas a pessoa quer
-- receber aviso de movimentacao. A pessoa que fez a movimentacao nao recebe o
-- proprio aviso.
CREATE TABLE IF NOT EXISTS push_assinaturas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id UUID NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  modulos     TEXT[] NOT NULL DEFAULT ARRAY['financiamento','recrutamento','manutencao','gestao','marketing','portal'],
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_assinaturas_parceiro ON push_assinaturas (parceiro_id);
