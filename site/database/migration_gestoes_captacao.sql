-- Ficha de captacao (imoveis sem gestao/exclusividade) no quadro de Gestoes — 12/11/2026.
--
-- A ficha de captacao entra na mesma tabela e no mesmo quadro das gestoes ("Quadro - Gestoes / Captacoes"):
--   gestoes.tipo:  'gestao' (contrato de gestao, com exclusividade) | 'captacao' (ficha, sem exclusividade)
--   gestoes.ficha: o que o corretor marcou na ficha (padrao, localizacao, piso, lazer, infraestrutura...),
--                  usado para gerar o .docx e mostrar na ficha do imovel.
-- Cliente vai para Clientes (e para o Kanban de Clientes) e o imovel para Imoveis, como no contrato de gestao.
ALTER TABLE gestoes ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'gestao';
ALTER TABLE gestoes ADD COLUMN IF NOT EXISTS ficha JSONB;
CREATE INDEX IF NOT EXISTS idx_gestoes_tipo ON gestoes (tipo);
