-- Recrutamento v2 (29/10/2026): adaptação ao "Processo de Recrutamento e
-- Treinamento de Corretores — RE/MAX Engimob" (Josi, atualizado em 02/10/2026).
-- Turmas quinzenais (9 Passos + específicos, regra dos 100%, acolhida em até
-- 30 dias), canal de origem, motivo de desistência, diagnóstico da 1ª reunião,
-- aprovação do broker, cadência de follow-up e datas-chave dos indicadores.

create table if not exists recrutamento_turmas (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  inicio           date not null,
  passos_inicio    date,
  passos_fim       date,
  especificos_a    date,
  especificos_b    date,
  acolhida         date,
  observacao       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists uq_recrutamento_turmas_nome on recrutamento_turmas(nome);

alter table recrutamento add column if not exists canal text;
alter table recrutamento add column if not exists motivo_desistencia text;
alter table recrutamento add column if not exists motivo_obs text;
alter table recrutamento add column if not exists turma_id uuid references recrutamento_turmas(id);
alter table recrutamento add column if not exists aprovacao_broker_em date;
alter table recrutamento add column if not exists contrato_assinado_em date;
alter table recrutamento add column if not exists acolhida_em date;
alter table recrutamento add column if not exists diagnostico jsonb not null default '{}'::jsonb;
alter table recrutamento add column if not exists followups jsonb not null default '{}'::jsonb;
create index if not exists idx_recrutamento_turma on recrutamento(turma_id);

insert into recrutamento_turmas (nome, inicio, passos_inicio, passos_fim, especificos_a, especificos_b, acolhida, observacao) values
 ('Out/26 · 1ª quinzena', '2026-10-05', '2026-10-06', '2026-10-09', '2026-10-13', '2026-10-15', '2026-10-19', null),
 ('Out/26 · 2ª quinzena', '2026-10-19', '2026-10-20', '2026-10-23', '2026-10-27', '2026-10-29', '2026-11-03', 'Finados na segunda: acolhida na terça de manhã'),
 ('Nov/26 · 1ª quinzena', '2026-11-02', '2026-11-03', '2026-11-06', '2026-11-10', '2026-11-12', '2026-11-16', 'Encontro 1 na terça à tarde, depois da acolhida'),
 ('Nov/26 · 2ª quinzena', '2026-11-16', '2026-11-17', '2026-11-19', '2026-11-24', '2026-11-26', '2026-12-07', 'Consciência Negra (20/11): encontros 1 e 2 na terça, manhã e tarde'),
 ('Dez/26 · 1ª quinzena', '2026-12-07', '2026-12-08', '2026-12-11', '2026-12-15', '2026-12-17', '2026-12-21', null),
 ('Dez/26 · 2ª quinzena', '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-29', '2026-12-30', '2027-01-05', 'Natal: encontros em 22 e 23/12, manhã e tarde; específicos B em 30/12'),
 ('Jan/27 · 1ª quinzena', '2027-01-04', '2027-01-05', '2027-01-08', '2027-01-12', '2027-01-14', '2027-01-18', 'Criação do Estado de RO (04/01): acolhida na terça de manhã'),
 ('Jan/27 · 2ª quinzena', '2027-01-18', '2027-01-19', '2027-01-22', '2027-01-26', '2027-01-28', '2027-02-01', null),
 ('Fev/27 · 1ª quinzena', '2027-02-01', '2027-02-02', '2027-02-05', '2027-02-10', '2027-02-11', '2027-02-22', 'Carnaval (09/02): específicos A em 10/02'),
 ('Fev/27 · 2ª quinzena', '2027-02-22', '2027-02-23', '2027-02-26', '2027-03-02', '2027-03-04', '2027-03-22', 'Acolhida junto com a turma seguinte'),
 ('Mar/27 · 1ª quinzena', '2027-03-01', '2027-03-02', '2027-03-05', '2027-03-09', '2027-03-11', '2027-03-22', null),
 ('Mar/27 · 2ª quinzena', '2027-03-22', '2027-03-23', '2027-03-25', '2027-03-30', '2027-04-01', '2027-04-05', 'Sexta-feira Santa (26/03): encontros 1 e 2 na terça, manhã e tarde')
on conflict (nome) do nothing;

-- Canal de origem dos recrutados já importados da planilha (pela observação gravada na importação).
update recrutamento r set canal = 'Tráfego pago'
from parceiros p
where p.id = r.parceiro_id and r.canal is null and p.funcao = 'Recrutados' and p.obs_funcao like '%Anúncio Meta%';
update recrutamento r set canal = 'Indicação'
from parceiros p
where p.id = r.parceiro_id and r.canal is null and p.funcao = 'Recrutados'
  and (p.obs_funcao like '%] Indicação%' or p.obs_funcao ilike '%canal: indica%');
update recrutamento r set canal = 'Prospecção ativa'
from parceiros p
where p.id = r.parceiro_id and r.canal is null and p.funcao = 'Recrutados' and p.obs_funcao like '%Redes sociais%';
