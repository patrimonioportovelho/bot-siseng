-- Data do cadastro em transacoes (Compra e Venda e Locacao, com e sem
-- administracao) -- pedido do usuario em 02/10/2026.
--
-- Ate aqui a unica data da transacao era data_assinatura, digitada pelo
-- corretor (portal) ou pelo administrativo no momento do cadastro -- ou seja,
-- era uma data "prevista" que nao necessariamente era a da assinatura de
-- verdade. Agora:
--   * data_cadastro: dia em que a transacao entrou no sistema. OBRIGATORIA
--     (NOT NULL + default = hoje em Porto Velho) e gravada sempre pelo
--     servidor -- ninguem digita.
--   * data_assinatura: continua existindo (e continua sendo o parametro dos
--     dashboards/metas/ranking), mas passa a ser preenchida SO pelo
--     administrativo depois que o contrato e assinado. Transacao nova nasce
--     com ela vazia (a coluna ja era nullable, nada a alterar nela).
--
-- Backfill: cadastros que ja existem recebem o dia de created_at (fuso de
-- Porto Velho). As 263 transacoes importadas da planilha legada tem
-- created_at = dia da importacao (04/07/2026) -- essa passa a ser a data de
-- cadastro delas no sistema; as datas de assinatura (2020-2026) NAO mudam.
--
-- Migracao ADITIVA e reversivel: DROP COLUMN data_cadastro desfaz tudo.

alter table transacoes add column if not exists data_cadastro date;

update transacoes
   set data_cadastro = (created_at at time zone 'America/Porto_Velho')::date
 where data_cadastro is null;

alter table transacoes alter column data_cadastro set default ((now() at time zone 'America/Porto_Velho')::date);
alter table transacoes alter column data_cadastro set not null;
