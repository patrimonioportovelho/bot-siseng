-- Disparo de e-mail em massa (Documentos) — 03/11/2026.
--
-- Cada disparo guarda a mensagem pronta (html) e a lista de destinatarios com o
-- resultado de cada envio. O envio roda em lotes (resumivel): se o limite diario
-- do Resend acabar, o disparo fica "pausado" e continua depois do ponto onde parou.
--   status do disparo:        enviando | concluido | pausado
--   status do destinatario:   pendente | enviado | falhou
--   tipo do destinatario:     parceiro | cliente
CREATE TABLE IF NOT EXISTS disparos_email (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assunto        TEXT NOT NULL,
  remetente_nome TEXT NOT NULL DEFAULT 'SisEng',
  responder_para TEXT,
  html           TEXT NOT NULL,
  imagem_url     TEXT,
  link_url       TEXT,
  filtros        JSONB,
  total          INTEGER NOT NULL DEFAULT 0,
  enviados       INTEGER NOT NULL DEFAULT 0,
  falhas         INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'enviando',
  motivo_pausa   TEXT,
  criado_por     UUID REFERENCES parceiros(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_disparos_email_created ON disparos_email (created_at DESC);

CREATE TABLE IF NOT EXISTS disparos_email_destinatarios (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disparo_id UUID NOT NULL REFERENCES disparos_email(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL,
  nome       TEXT,
  email      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pendente',
  erro       TEXT,
  enviado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_disparos_email_dest_status ON disparos_email_destinatarios (disparo_id, status);

-- Guardam e-mails de clientes: sem acesso direto pela API publica do Supabase
-- (o sistema le e grava pelo servidor, que ignora o RLS).
ALTER TABLE disparos_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE disparos_email_destinatarios ENABLE ROW LEVEL SECURITY;
