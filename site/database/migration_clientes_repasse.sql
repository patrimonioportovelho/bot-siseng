-- Repasse de cliente para o corretor + avisos dirigidos — 05/11/2026.
--
-- Quando o administrativo transfere um cliente/lead para outro corretor, o cliente fica
-- "novo para o corretor" (repasse_desde) ate ele fazer o primeiro movimento na etiqueta
-- (registrar contato, nota ou complementar os dados). Enquanto isso aparece no sino e no
-- quadro dele. O aviso estilo MSN e dirigido: avisos_equipe.para_parceiro_id (nulo = aviso
-- da equipe, visto pelo administrativo; preenchido = so aquele corretor ve).
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS repasse_desde TIMESTAMPTZ;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS repasse_por UUID REFERENCES parceiros(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_repasse ON clientes (parceiro_id) WHERE repasse_desde IS NOT NULL;

ALTER TABLE avisos_equipe ADD COLUMN IF NOT EXISTS para_parceiro_id UUID REFERENCES parceiros(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_avisos_equipe_para ON avisos_equipe (para_parceiro_id, created_at DESC) WHERE para_parceiro_id IS NOT NULL;
