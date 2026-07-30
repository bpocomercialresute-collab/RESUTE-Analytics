-- =============================================================================
-- RESUTE — Contratos de modulo por empresa (SaaS multi-modulo)
-- =============================================================================
-- Script idempotente e nao destrutivo. Revise antes de rodar no SQL Editor.
--
-- Regra de negocio (fonte unica de verdade):
--   um modulo esta ATIVO para a empresa quando
--       ativo = true  E  (expira_em is null  OU  expira_em > now())
--
-- O login continua funcionando mesmo sem esta tabela: api/login.js cai no
-- fallback ['comercial'] quando a consulta falha.
-- =============================================================================

create table if not exists public.empresa_modulos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  modulo text not null check (modulo in ('comercial', 'financeiro')),
  ativo boolean not null default true,
  contratado_em timestamptz not null default now(),
  expira_em timestamptz null,
  criado_por text null,
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, modulo)
);

create index if not exists empresa_modulos_empresa_ativo_idx
  on public.empresa_modulos (empresa_id)
  where ativo = true;

create index if not exists empresa_modulos_modulo_idx
  on public.empresa_modulos (modulo, ativo);

alter table public.empresa_modulos enable row level security;

-- Leitura: usuario ativo da propria empresa, ou super_admin ativo.
drop policy if exists "empresa_modulos_select" on public.empresa_modulos;
create policy "empresa_modulos_select"
  on public.empresa_modulos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.usuarios u
      where u.id = auth.uid()
        and u.ativo = true
        and (
          u.papel = 'super_admin'
          or u.empresa_id = public.empresa_modulos.empresa_id
        )
    )
  );

-- insert / update / delete NAO sao expostos ao browser.
-- A escrita acontece no backend da Vercel (api/secure-proxy.js, acao
-- 'admin-module-toggle') com service role, apos validar a sessao super_admin.

comment on table public.empresa_modulos is
  'Contratos de modulo por empresa. Desativar um modulo nunca apaga dados: marque ativo=false ou defina expira_em.';

-- =============================================================================
-- SEED — preserva o comportamento atual
-- =============================================================================
-- Toda empresa que ja existe hoje passa a ter o modulo comercial contratado.
-- Sem isso, clientes existentes perderiam acesso ao painel comercial.

insert into public.empresa_modulos (empresa_id, modulo, ativo, criado_por)
select e.id, 'comercial', true, 'seed:supabase-modulos.sql'
from public.empresas e
on conflict (empresa_id, modulo) do nothing;

-- =============================================================================
-- CONFERENCIA (opcional — rode depois para validar)
-- =============================================================================
-- select e.nome, m.modulo, m.ativo, m.expira_em
-- from public.empresas e
-- left join public.empresa_modulos m on m.empresa_id = e.id
-- order by e.nome, m.modulo;
