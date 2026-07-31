-- =============================================================================
-- RESUTE — Modulo DRE: schema fin_dre_*
-- =============================================================================
-- Script idempotente e nao destrutivo. Revise antes de rodar no SQL Editor.
--
-- Duas tabelas, mesma logica do PROCV da ferramenta original:
--   fin_dre_plano_contas — uma linha por conta (cod, conta, grupo, fv, di).
--                          'conta' e a chave do PROCV: o motor casa cada
--                          lancamento com o plano pelo nome da conta.
--   fin_dre_lancamentos  — livro-razao. 'conta' precisa bater com o nome
--                          cadastrado no plano, senao vira #N/A no DRE.
--
-- O prefixo fin_ e o allowlist do proxy (FIN_TABLE_REGEX em
-- api/secure-proxy.js) — tabela fora desse padrao e recusada. Toda leitura
-- pelo navegador exige filtro empresa_id=eq.<id>, e so super_admin grava.
-- =============================================================================

create table if not exists public.fin_dre_plano_contas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,

  cod text not null,
  conta text not null,
  grupo text not null,

  -- Fixo/Variavel e Direto/Indireto sao independentes; '' = nao marcado.
  -- O motor (dre_engine.js) trata qualquer valor fora de F/V ou D/I como
  -- "nao marcado" e conta isso num alerta — nao ha necessidade de bloquear
  -- aqui alem de restringir os valores validos.
  fv text not null default '' check (fv in ('', 'F', 'V')),
  di text not null default '' check (di in ('', 'D', 'I')),

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- PROCV do motor casa por nome da conta: duas linhas com o mesmo nome na
  -- mesma empresa tornam o resultado ambiguo.
  unique (empresa_id, conta)
);

create index if not exists fin_dre_plano_contas_empresa_idx
  on public.fin_dre_plano_contas (empresa_id);

alter table public.fin_dre_plano_contas enable row level security;

drop policy if exists "fin_dre_plano_contas_select" on public.fin_dre_plano_contas;
create policy "fin_dre_plano_contas_select"
  on public.fin_dre_plano_contas
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
          or u.empresa_id = public.fin_dre_plano_contas.empresa_id
        )
    )
  );

comment on table public.fin_dre_plano_contas is
  'Plano de contas do DRE por empresa. Chave do PROCV do motor e o nome em conta, nao o cod.';

-- =============================================================================

create table if not exists public.fin_dre_lancamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,

  conta text not null,           -- precisa bater com fin_dre_plano_contas.conta
  valor numeric(14,2) not null,

  dt_caixa date not null,        -- define ano/mes da coluna no BD_DRE
  dt_venc date null,
  dt_pag date null,              -- presente = status 'PG' no motor; ausente = 'N'

  parceiro text null,
  documento text null,
  banco text null,
  forma text null,

  origem text not null default 'manual' check (origem in ('manual', 'api')),

  criado_em timestamptz not null default now(),
  criado_por text null
);

create index if not exists fin_dre_lancamentos_empresa_conta_idx
  on public.fin_dre_lancamentos (empresa_id, conta);

create index if not exists fin_dre_lancamentos_empresa_caixa_idx
  on public.fin_dre_lancamentos (empresa_id, dt_caixa desc);

alter table public.fin_dre_lancamentos enable row level security;

drop policy if exists "fin_dre_lancamentos_select" on public.fin_dre_lancamentos;
create policy "fin_dre_lancamentos_select"
  on public.fin_dre_lancamentos
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
          or u.empresa_id = public.fin_dre_lancamentos.empresa_id
        )
    )
  );

-- insert / update / delete NAO sao expostos ao browser por RLS, nas duas
-- tabelas. A escrita passa pelo backend da Vercel (api/secure-proxy.js), que
-- valida a sessao e so aceita gravacao de super_admin, sempre com service role.

comment on table public.fin_dre_lancamentos is
  'Livro-razao do DRE por empresa. status nao e armazenado: o motor deriva PG/N de dt_pag.';

-- =============================================================================
-- CONFERENCIA (opcional)
-- =============================================================================
-- select e.nome, count(*) as contas
-- from public.fin_dre_plano_contas p
-- join public.empresas e on e.id = p.empresa_id
-- group by e.nome order by e.nome;
--
-- select e.nome, count(*) as lancamentos, sum(l.valor) as total
-- from public.fin_dre_lancamentos l
-- join public.empresas e on e.id = l.empresa_id
-- group by e.nome order by e.nome;
--
-- Lancamentos com conta fora do plano (aparecem como #N/A no DRE):
-- select l.empresa_id, l.conta, count(*)
-- from public.fin_dre_lancamentos l
-- where not exists (
--   select 1 from public.fin_dre_plano_contas p
--   where p.empresa_id = l.empresa_id and lower(p.conta) = lower(l.conta)
-- )
-- group by l.empresa_id, l.conta;
