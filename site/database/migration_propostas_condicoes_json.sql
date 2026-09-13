-- Guarda a lista de condições de pagamento digitada no formulário de
-- Proposta de Compra e Venda, não só o texto já achatado em
-- `forma_pagamento`. Motivo: a tela de edição (13/09/2026) reaproveita o
-- mesmo construtor "+ Adicionar condição" da criação, e ele precisa
-- reabrir as mesmas linhas que o corretor digitou — sem isso só dava pra
-- reabrir um texto solto, sem estrutura.
--
-- NULL em propostas criadas antes desta coluna existir — pra essas, editar
-- sem tocar nas condições preserva o `forma_pagamento` já salvo (ver
-- atualizarPropostaAction em app/portal/proposta/actions.ts).
--
-- Migração ADITIVA e reversível: em caso de problema, o DROP COLUMN reverte.

alter table propostas add column if not exists condicoes_json jsonb;
