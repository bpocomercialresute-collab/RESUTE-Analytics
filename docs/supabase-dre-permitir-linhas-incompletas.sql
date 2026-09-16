-- RESUTE DRE: preservar no banco linhas que ainda nao estao completas.
-- Execute uma vez no SQL Editor do projeto Supabase de producao.
-- Os relatorios continuam filtrando por DT_VENC e VALOR no codigo; esta
-- alteracao apenas impede que a colagem seja descartada no armazenamento.

alter table public.fin_dre_lancamentos
  alter column conta drop not null,
  alter column valor drop not null,
  alter column dt_caixa drop not null;
