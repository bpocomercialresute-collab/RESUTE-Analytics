-- Colar no SQL Editor do Supabase e executar.
-- Cria a função gerar_cache_dashboard usada por api/precache.js.
-- A função agrega as vendas dentro do Postgres e faz upsert em relatorios_cache
-- sem transferir dados pelo Vercel — resolve o timeout de 60s.

CREATE OR REPLACE FUNCTION gerar_cache_dashboard(p_empresa_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total  bigint;
  v_dados  jsonb;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM vendas
  WHERE empresa_id = p_empresa_id AND origem = 'api';

  SELECT jsonb_build_object(
    'origem',          'api',
    'total_registros', v_total,
    'gerado_em',       to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'vendas',          COALESCE(
      jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id_externo',    id_externo,
          'num_pedido',    num_pedido,
          'produto',       produto,
          'qtd',           qtd,
          'dt_emissao',    dt_emissao,
          'dt_saida',      dt_saida,
          'valor',         valor,
          'vendedor',      vendedor,
          'industria',     industria,
          'cliente',       cliente,
          'grupo',         grupo,
          'grupo_produto', grupo_produto,
          'marca',         marca,
          'familia',       familia,
          'uf',            uf,
          'cidade',        cidade,
          'ano',           ano,
          'mes',           mes
        ))
      ),
      '[]'::jsonb
    )
  ) INTO v_dados
  FROM vendas
  WHERE empresa_id = p_empresa_id AND origem = 'api';

  INSERT INTO relatorios_cache
    (empresa_id, tipo, cache_key, origem, versao, total_registros, dados, atualizado_em)
  VALUES
    (p_empresa_id, 'dashboard_cliente', 'latest:api', 'api', 'dashboard-v1', v_total, v_dados, now())
  ON CONFLICT (empresa_id, tipo, cache_key)
  DO UPDATE SET
    total_registros = EXCLUDED.total_registros,
    dados           = EXCLUDED.dados,
    versao          = EXCLUDED.versao,
    atualizado_em   = EXCLUDED.atualizado_em;

  RETURN json_build_object('ok', true, 'total_registros', v_total);
END;
$$;

-- Permitir que o service_role chame a função
GRANT EXECUTE ON FUNCTION gerar_cache_dashboard(uuid) TO service_role;
