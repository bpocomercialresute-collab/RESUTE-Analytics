-- Optional, non-destructive audit structure for the RESUTE super_admin panel.
-- Review this script in Supabase before running it. The application remains
-- functional without this table; persistent administrative audit requires it.

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  ator_id uuid null references auth.users(id) on delete set null,
  ator_email text not null,
  acao text not null,
  entidade text not null,
  entidade_id text null,
  empresa_id uuid null references public.empresas(id) on delete set null,
  resumo text not null,
  metadados jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_log_criado_em_idx
  on public.admin_audit_log (criado_em desc);

create index if not exists admin_audit_log_empresa_id_idx
  on public.admin_audit_log (empresa_id, criado_em desc);

create index if not exists admin_audit_log_acao_idx
  on public.admin_audit_log (acao, criado_em desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists "admin_audit_super_admin_select" on public.admin_audit_log;
create policy "admin_audit_super_admin_select"
  on public.admin_audit_log
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.usuarios u
      where u.id = auth.uid()
        and u.papel = 'super_admin'
        and u.ativo = true
    )
  );

-- Inserts are intentionally not exposed to browser roles. The Vercel backend
-- writes with the service role after validating the super_admin session.
comment on table public.admin_audit_log is
  'Administrative audit. Never store passwords, tokens, client secrets or service-role keys.';
