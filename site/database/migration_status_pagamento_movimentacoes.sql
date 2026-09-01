-- Status de pagamento em 3 etapas para movimentacoes (Financeiro)
-- ------------------------------------------------------------------
-- Antes: movimentacoes so tinha `pago` (true/false). Um colaborador marcava
-- pago e a conta sumia do "em aberto" -- mas quem paga de fato e um dos socios,
-- que precisa ver a conta como "conferida, pronta pra pagar, ainda nao paga".
-- O sinal "o dinheiro ja entrou, falta repassar" so existia como calculo em
-- tempo real ("Pendente - recebido", azul), nao dava pra filtrar direito.
--
-- Agora: status_pagamento = 'Pendente' -> 'Conferido' -> 'Pago'.
-- `pago` continua existindo como ESPELHO (pago = status_pagamento = 'Pago'),
-- pra todo o resto do sistema (dashboard, portal, ranking) seguir funcionando
-- sem alteracao.
--
-- conferido_por_parceiro_id / pago_por_parceiro_id: NULL = feito pelo sistema
-- (auto-conferir quando o Recebimento de origem cai); preenchido = feito por
-- uma pessoa.
--
-- Migracao ADITIVA e reversivel: em caso de problema, os 4 ALTER ... DROP COLUMN
-- e o DROP CONSTRAINT revertem tudo.

alter table movimentacoes add column status_pagamento text not null default 'Pendente';
alter table movimentacoes add column conferido_em timestamptz;
alter table movimentacoes add column conferido_por_parceiro_id uuid;
alter table movimentacoes add column pago_por_parceiro_id uuid;

alter table movimentacoes add constraint movimentacoes_status_pagamento_check
  check (status_pagamento in ('Pendente', 'Conferido', 'Pago'));

-- Backfill 1: tudo que ja estava pago vira 'Pago'.
update movimentacoes set status_pagamento = 'Pago' where pago = true;

-- Backfill 2: repasse de honorario (Despesa) ainda nao pago, cujo Recebimento
-- de origem ja foi recebido -> 'Conferido' automatico (mesmo criterio do antigo
-- "Pendente - recebido" calculado).
update movimentacoes d
set status_pagamento = 'Conferido'
from pagamentos p
join movimentacoes r on r.id = p.recebimento_id
where d.pagamento_id = p.id
  and d.tipo = 'Despesa'
  and d.pago = false
  and r.pago = true;

-- Backfill 3: sincroniza pagamentos.status que estava parado em 'Pendente'.
-- pago_direto = vendedor pagou o corretor por fora, ja recebido na pratica.
update pagamentos set status = 'Pago' where pago_direto = true and status <> 'Pago';

-- Backfill 4: repasses cuja Despesa ja foi paga -> pagamentos.status = 'Pago'.
update pagamentos p
set status = 'Pago'
from movimentacoes d
where d.pagamento_id = p.id
  and d.pago = true
  and p.status <> 'Pago';

-- Rollback (se precisar):
-- alter table movimentacoes drop constraint movimentacoes_status_pagamento_check;
-- alter table movimentacoes drop column status_pagamento;
-- alter table movimentacoes drop column conferido_em;
-- alter table movimentacoes drop column conferido_por_parceiro_id;
-- alter table movimentacoes drop column pago_por_parceiro_id;
