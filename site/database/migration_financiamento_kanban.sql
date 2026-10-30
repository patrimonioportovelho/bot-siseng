-- Financiamento em Kanban (30/10/2026): acompanhamento por avaliacao, atividades
-- (cada mudanca de etapa/status do andamento vira uma atividade com inicio e fim
-- pra medir tempo; conformidades e inconformidades; contatos) e responsavel
-- padrao por coluna. Nada das tabelas existentes e alterado.

create table if not exists financiamento_acompanhamento (
  avaliacao_id        uuid primary key references avaliacoes(id) on delete cascade,
  responsavel_id      uuid references parceiros(id),
  proxima_acao_data   date,
  proxima_acao_texto  text,
  checklist           jsonb not null default '{}'::jsonb,
  notas               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_fin_acomp_responsavel on financiamento_acompanhamento(responsavel_id);

create table if not exists financiamento_atividades (
  id               uuid primary key default gen_random_uuid(),
  avaliacao_id     uuid not null references avaliacoes(id) on delete cascade,
  andamento_id     uuid references andamentos(id) on delete set null,
  tipo             text not null,
  coluna           text,
  etapa            text,
  resultado        text,
  motivo           text,
  nota             text,
  inicio           timestamptz not null default now(),
  fim              timestamptz,
  estimado         boolean not null default false,
  por_parceiro_id  uuid references parceiros(id),
  created_at       timestamptz not null default now()
);
create index if not exists idx_fin_atividades_avaliacao on financiamento_atividades(avaliacao_id, inicio desc);
create index if not exists idx_fin_atividades_tipo_etapa on financiamento_atividades(tipo, etapa);

create table if not exists financiamento_etapas (
  coluna          text primary key,
  responsavel_id  uuid references parceiros(id),
  updated_at      timestamptz not null default now()
);
