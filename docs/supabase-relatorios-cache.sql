-- RESUTE Analytics - camada de snapshots de relatorios
-- Rode este SQL no Supabase (SQL Editor) antes de publicar o fluxo de cache.

create table if not exists public.relatorios_cache (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null,
  cache_key text not null,
  periodo_inicio date,
  periodo_fim date,
  origem text,
  versao text not null default 'dashboard-v1',
  total_registros integer not null default 0,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, tipo, cache_key)
);

create index if not exists relatorios_cache_empresa_tipo_idx
  on public.relatorios_cache (empresa_id, tipo, atualizado_em desc);

create index if not exists relatorios_cache_dados_gin_idx
  on public.relatorios_cache using gin (dados);

alter table public.relatorios_cache enable row level security;

drop policy if exists "relatorios_cache_super_admin_all" on public.relatorios_cache;
create policy "relatorios_cache_super_admin_all"
  on public.relatorios_cache
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "relatorios_cache_cliente_select_empresa" on public.relatorios_cache;
create policy "relatorios_cache_cliente_select_empresa"
  on public.relatorios_cache
  for select
  using (empresa_id = any(public.get_user_empresa_ids()));

drop trigger if exists set_updated_at_relatorios_cache on public.relatorios_cache;
create trigger set_updated_at_relatorios_cache
  before update on public.relatorios_cache
  for each row
  execute function public.set_updated_at();

notify pgrst, 'reload schema';
