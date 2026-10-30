-- Avaliação de crédito pelo portal do corretor (30/10/2026).
--
-- No portal, "Nova avaliação" passa a perguntar se é uma Consulta de CPF
-- (como sempre) ou uma Avaliação de crédito. A Avaliação de crédito exige o
-- cadastro completo do cliente e 3 perguntas de múltipla escolha, e já entra
-- no Financiamento em "Montagem de processo". As respostas ficam aqui para a
-- correspondente ver e editar na ficha/etiqueta.
--
-- NULL = não respondido (consultas de CPF antigas e novas).
--   credito_fgts_3_anos      true = "Sim, tem 3 anos ou mais" de FGTS (somando empregos)
--   credito_mais_compradores true = "Sim, tem" mais de um comprador/dependente na proposta
--   credito_primeiro_imovel  true = "Sim, é o primeiro" imóvel do cliente
ALTER TABLE avaliacoes ADD COLUMN IF NOT EXISTS credito_fgts_3_anos BOOLEAN;
ALTER TABLE avaliacoes ADD COLUMN IF NOT EXISTS credito_mais_compradores BOOLEAN;
ALTER TABLE avaliacoes ADD COLUMN IF NOT EXISTS credito_primeiro_imovel BOOLEAN;
