-- =============================================================================
-- RESUTE — Modulo Financeiro: schema fin_*
-- =============================================================================
-- Script idempotente e nao destrutivo. Revise antes de rodar no SQL Editor.
--
-- Uma tabela unica cobre contas a receber e a pagar: o que separa e a coluna
-- `tipo` (receita/despesa). Evita duas tabelas gemeas e simplifica fluxo de
-- caixa e resultado, que leem tudo junto.
--
-- O prefixo fin_ nao e cosmetico: e ele que o allowlist do proxy usa
-- (FIN_TABLE_REGEX em api/secure-proxy.js). Tabela sem o prefixo e recusada.
-- Toda leitura pelo navegador exige filtro empresa_id=eq.<id>.
-- =============================================================================

create table if not exists public.fin_lancamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,

  tipo text not null check (tipo in ('receita', 'despesa')),
  descricao text null,
  parceiro text null,            -- cliente (receita) ou fornecedor (despesa)
  documento text null,           -- NF, boleto, contrato
  categoria text null,

  valor numeric(14,2) not null,
  data_competencia date not null,
  data_vencimento date null,
  data_pagamento date null,

  status text not null default 'previsto'
    check (status in ('previsto', 'pago', 'cancelado')),

  -- 'manual' hoje. Reservado para 'api' quando houver integracao contabil.
  origem text not null default 'manual' check (origem in ('manual', 'api')),

  criado_em timestamptz not null default now(),
  criado_por text null
);

create index if not exists fin_lancamentos_empresa_competencia_idx
  on public.fin_lancamentos (empresa_id, data_competencia desc);

create index if not exists fin_lancamentos_empresa_vencimento_idx
  on public.fin_lancamentos (empresa_id, data_vencimento);

create index if not exists fin_lancamentos_empresa_status_idx
  on public.fin_lancamentos (empresa_id, tipo, status);

alter table public.fin_lancamentos enable row level security;

-- Leitura: usuario ativo da propria empresa, ou super_admin ativo.
drop policy if exists "fin_lancamentos_select" on public.fin_lancamentos;
create policy "fin_lancamentos_select"
  on public.fin_lancamentos
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
          or u.empresa_id = public.fin_lancamentos.empresa_id
        )
    )
  );

-- insert / update / delete NAO sao expostos ao browser por RLS.
-- A escrita passa pelo backend da Vercel (api/secure-proxy.js), que valida a
-- sessao e so aceita gravacao de super_admin, sempre com service role.

comment on table public.fin_lancamentos is
  'Lancamentos financeiros por empresa. tipo=receita alimenta contas a receber; tipo=despesa, contas a pagar. Status vencido e derivado (previsto + data_vencimento no passado), nao armazenado.';

-- =============================================================================
-- CONFERENCIA (opcional)
-- =============================================================================
-- select e.nome, l.tipo, l.status, count(*), sum(l.valor)
-- from public.fin_lancamentos l
-- join public.empresas e on e.id = l.empresa_id
-- group by e.nome, l.tipo, l.status
-- order by e.nome, l.tipo, l.status;
