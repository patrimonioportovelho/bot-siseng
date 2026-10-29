-- Módulo Recrutamento (kanban de acompanhamento de recrutados e corretores).
-- 29/10/2026. Uma linha de acompanhamento por parceiro (Recrutados, Corretor
-- Estagiário, Corretor e quem saiu), histórico de contatos e responsável
-- padrão de cada etapa. Nada de parceiros é alterado.

create table if not exists recrutamento (
  parceiro_id          uuid primary key references parceiros(id) on delete cascade,
  etapa                text not null default 'Lead',
  etapa_atualizada_em  timestamptz not null default now(),
  responsavel_id       uuid references parceiros(id),
  proxima_acao_data    date,
  proxima_acao_texto   text,
  reuniao1_data        date,
  reuniao1_status      text,
  reuniao1_notas       text,
  reuniao2_data        date,
  reuniao2_status      text,
  reuniao2_notas       text,
  interesse            text,
  tti_status           text,
  creci_status         text,
  inicio_treinamento   date,
  treinamentos         jsonb not null default '{}'::jsonb,
  notas                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_recrutamento_responsavel on recrutamento(responsavel_id);
create index if not exists idx_recrutamento_proxima_acao on recrutamento(proxima_acao_data);

create table if not exists recrutamento_atividades (
  id                uuid primary key default gen_random_uuid(),
  parceiro_id       uuid not null references parceiros(id) on delete cascade,
  tipo              text not null,
  resultado         text,
  nota              text,
  data              timestamptz not null default now(),
  por_parceiro_id   uuid references parceiros(id),
  created_at        timestamptz not null default now()
);
create index if not exists idx_recrutamento_atividades_parceiro on recrutamento_atividades(parceiro_id, data desc);

create table if not exists recrutamento_etapas (
  etapa           text primary key,
  responsavel_id  uuid references parceiros(id),
  updated_at      timestamptz not null default now()
);
