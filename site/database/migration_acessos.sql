-- Acessos (papeis) do administrativo — 01/11/2026.
-- Cada pessoa pode ter varios: diretor, financeiro, administrativo, recrutador,
-- corretor (ver lib/acessos.ts). Vazio = cadastro anterior a esta tela, que
-- continua funcionando como "administrativo" ate o Diretor configurar.
-- Quem ja tinha acesso completo vira diretor.
ALTER TABLE parceiros ADD COLUMN IF NOT EXISTS acessos TEXT[] NOT NULL DEFAULT '{}';
UPDATE parceiros SET acessos = ARRAY['diretor'] WHERE acesso_completo = true AND NOT ('diretor' = ANY(acessos));
