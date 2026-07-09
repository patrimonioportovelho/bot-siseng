-- Migração: Contrato de Gestão (Captação Exclusiva) + módulo "Gestões" dentro
-- de Atividades. Rodar no SQL Editor do Supabase, depois rodar localmente:
--   cd site/app-web
--   npx prisma generate
--
-- Tudo usa "IF NOT EXISTS" — pode rodar de novo sem erro caso precise.

-- 1) Nacionalidade no cadastro de Cliente (novo campo pedido pro contrato de
--    gestão; clientes antigos ficam NULL e o sistema continua inferindo
--    brasileiro/brasileira pelo campo "sexo" como já fazia).
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nacionalidade TEXT;

-- 2) Campos novos na tabela gestoes (já existia, sem uso na tela ainda):
--    coluna = etapa do quadro Kanban de Gestões;
--    chave_posse/chave_com/chave_atualizado_em = mesmo controle de posse de
--    chave já usado em Manutenção;
--    excluido = soft-delete, mesmo padrão do resto do sistema;
--    data_assinatura = data de assinatura do contrato de gestão;
--    prazo_gestao_dias = prazo de exclusividade EM DIAS (o texto do contrato
--    fala em dias, não em meses — por isso um campo novo, sem mexer no
--    prazo_gestao_meses antigo que pode já ter dado legado importado);
--    criado_no_portal = marca as gestões que nasceram do fluxo novo do
--    corretor (Elaboração de Contrato de Gestão), pra diferenciar de
--    eventuais registros legados importados.
ALTER TABLE gestoes ADD COLUMN IF NOT EXISTS coluna TEXT NOT NULL DEFAULT 'captacao_exclusiva';
ALTER TABLE gestoes ADD COLUMN IF NOT EXISTS chave_posse TEXT NOT NULL DEFAULT 'imobiliaria';
ALTER TABLE gestoes ADD COLUMN IF NOT EXISTS chave_com TEXT;
ALTER TABLE gestoes ADD COLUMN IF NOT EXISTS chave_atualizado_em TIMESTAMPTZ;
ALTER TABLE gestoes ADD COLUMN IF NOT EXISTS excluido BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gestoes ADD COLUMN IF NOT EXISTS data_assinatura DATE;
ALTER TABLE gestoes ADD COLUMN IF NOT EXISTS prazo_gestao_dias SMALLINT;
ALTER TABLE gestoes ADD COLUMN IF NOT EXISTS criado_no_portal BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_gestoes_coluna ON gestoes(coluna);

-- 3) Tabelas filhas de Gestão — mesmíssima estrutura de manutencao_atividades/
--    manutencao_checklist_itens/manutencao_notas, só que ligadas a "gestoes"
--    em vez de "manutencoes". É o que alimenta o quadro, o calendário e o
--    painel de Gestões (compartilhando calendário/painel com Manutenção).
CREATE TABLE IF NOT EXISTS gestao_checklist_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gestao_id UUID NOT NULL REFERENCES gestoes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  ordem SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gestao_checklist_gestao ON gestao_checklist_itens(gestao_id);

CREATE TABLE IF NOT EXISTS gestao_atividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gestao_id UUID NOT NULL REFERENCES gestoes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  data DATE NOT NULL,
  feito BOOLEAN NOT NULL DEFAULT FALSE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gestao_atividades_gestao ON gestao_atividades(gestao_id);
CREATE INDEX IF NOT EXISTS idx_gestao_atividades_data ON gestao_atividades(data);

CREATE TABLE IF NOT EXISTS gestao_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gestao_id UUID NOT NULL REFERENCES gestoes(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gestao_notas_gestao ON gestao_notas(gestao_id);
