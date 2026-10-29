-- Auto-atualização do agente-ponte de laboratório.
--
-- Motivo: hoje atualizar o agente exige alguém conectar por AnyDesk no
-- computador do laboratório e rodar um .bat. Não escala e atrapalha a clínica.
-- Com isto o agente pergunta no próprio heartbeat se há versão nova, baixa,
-- confere o hash, troca e se reinicia sozinho — fora de qualquer transmissão.
--
-- `lab_agent_releases` é um canal GLOBAL (não tem clinic_id de propósito: o
-- binário do agente é o mesmo para todas as clínicas). Por isso fica com RLS
-- ligado e NENHUMA policy — só o service role (rotas /api/lab/*) enxerga.

create table if not exists lab_agent_releases (
  id          uuid primary key default gen_random_uuid(),
  version     text not null unique,
  sha256      text not null,
  source      text not null,                       -- conteúdo de agent.mjs (~12 kB)
  notes       text,
  is_current  boolean not null default false,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table lab_agent_releases enable row level security;

-- Só uma versão corrente por vez.
create unique index if not exists lab_agent_releases_one_current
  on lab_agent_releases ((is_current)) where is_current;

create index if not exists lab_agent_releases_created_idx
  on lab_agent_releases (created_at desc);

-- Controle por agente: dá para segurar uma clínica numa versão ou desligar a
-- atualização automática sem mexer nas outras.
alter table lab_agents add column if not exists auto_update     boolean not null default true;
alter table lab_agents add column if not exists agent_version   text;
alter table lab_agents add column if not exists pinned_version  text;
alter table lab_agents add column if not exists last_update_at  timestamptz;
alter table lab_agents add column if not exists last_update_error text;

comment on column lab_agents.auto_update is
  'Quando false, o agente desta clínica ignora novas versões (atualização manual).';
comment on column lab_agents.pinned_version is
  'Prende o agente numa versão específica. Null = segue a release corrente.';
comment on column lab_agents.agent_version is
  'Versão que o agente informou no último heartbeat.';
