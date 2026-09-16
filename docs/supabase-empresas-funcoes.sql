-- Controle fino de funcoes por empresa (ex.: esconder "Relatorio de
-- Representantes" so pra uma empresa especifica), separado do controle
-- de modulo inteiro que ja existe em empresa_modulos (Comercial/Financeiro/DRE).
--
-- Guarda um objeto JSON tipo {"rel_produtos": false, "rel_representantes": false}.
-- Chave ausente = funcao LIGADA (compatibilidade com empresa que ja existe e
-- nunca teve essa coluna). Chave com valor false = funcao escondida pra essa
-- empresa, em todo lugar que ela aparece (relatorio do cliente e atalho do
-- admin da empresa).
--
-- Rode uma vez no SQL editor do Supabase.

alter table public.empresas
  add column if not exists funcoes jsonb not null default '{}'::jsonb;
