// api/precache.js — gera o snapshot de relatorios_cache server-side
// Chamado automaticamente após cada sync de API para que o cliente
// entre no dashboard já com os dados prontos, sem gerar no browser.

const SLIM_FIELDS = [
  'id_externo', 'num_pedido', 'produto', 'qtd',
  'dt_emissao', 'dt_saida', 'valor', 'vendedor', 'industria',
  'cliente', 'grupo', 'grupo_produto', 'marca', 'familia',
  'uf', 'cidade', 'ano', 'mes'
];

function slimVenda(v) {
  const out = {};
  SLIM_FIELDS.forEach(k => {
    if (v[k] !== undefined && v[k] !== null && v[k] !== '') out[k] = v[k];
  });
  return out;
}

async function fetchAllVendas(supaUrl, serviceKey, empresaId) {
  // PostgREST aplica max-rows=1000 mesmo com Range header — paginar em loop.
  const PAGE = 1000;
  const baseUrl = `${supaUrl}/rest/v1/vendas?empresa_id=eq.${encodeURIComponent(empresaId)}&origem=eq.api&select=${SLIM_FIELDS.join(',')}&order=dt_saida.asc`;
  const all = [];
  let from = 0;

  while (true) {
    const resp = await fetch(baseUrl, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Range': `${from}-${from + PAGE - 1}`,
        'Range-Unit': 'items',
        'Prefer': 'count=none'
      }
    });

    if (!resp.ok && resp.status !== 206) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break; // última página
    from += PAGE;
  }

  return all;
}

async function getAppUser(sessionToken, supaUrl, anonKey, serviceKey) {
  if (!sessionToken) return null;
  const authResp = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { 'apikey': anonKey, 'Authorization': `Bearer ${sessionToken}` }
  });
  if (!authResp.ok) return null;
  const authUser = await authResp.json();
  const email = String(authUser.email || '').trim().toLowerCase();
  if (!email) return null;
  const userResp = await fetch(
    `${supaUrl}/rest/v1/usuarios?email=ilike.${encodeURIComponent(email)}&select=papel`,
    { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
  );
  if (!userResp.ok) return null;
  const users = await userResp.json();
  return Array.isArray(users) && users.length ? users[0] : null;
}

function setCorsHeaders(req, res) {
  const allowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const origin = req.headers.origin || '';
  const corsOrigin = allowed.length === 0 ? origin : (allowed.includes(origin) ? origin : '');
  if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Metodo nao permitido' });

  const supaUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ erro: 'Variaveis do Supabase nao configuradas.' });
  }

  const sessionToken = req.headers['x-session-token'] || '';
  const appUser = await getAppUser(sessionToken, supaUrl, anonKey, serviceKey).catch(() => null);
  if (!appUser) return res.status(401).json({ erro: 'Sessao invalida.' });
  if (appUser.papel !== 'super_admin') return res.status(403).json({ erro: 'Apenas super_admin pode gerar cache.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const empresaId = body && body.empresa_id;
  if (!empresaId) return res.status(400).json({ erro: 'empresa_id obrigatorio.' });

  try {
    const vendas = await fetchAllVendas(supaUrl, serviceKey, empresaId);
    const slim = vendas.map(slimVenda);

    const cacheBody = {
      empresa_id: empresaId,
      tipo: 'dashboard_cliente',
      cache_key: 'latest:api',
      origem: 'api',
      versao: 'dashboard-v1',
      total_registros: slim.length,
      dados: {
        vendas: slim,
        origem: 'api',
        total_registros: slim.length,
        gerado_em: new Date().toISOString()
      },
      atualizado_em: new Date().toISOString()
    };

    const saveResp = await fetch(`${supaUrl}/rest/v1/relatorios_cache`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(cacheBody)
    });

    if (!saveResp.ok) {
      const errText = await saveResp.text().catch(() => '');
      const tabelaInexistente = /relatorios_cache/i.test(errText) && /does not exist|PGRST/i.test(errText);
      if (tabelaInexistente) {
        return res.status(200).json({
          ok: false,
          total_registros: 0,
          aviso: 'Tabela relatorios_cache nao existe. Execute o SQL em docs/supabase-relatorios-cache.sql no Supabase.'
        });
      }
      return res.status(500).json({ erro: `Falha ao salvar cache: HTTP ${saveResp.status}` });
    }

    return res.status(200).json({ ok: true, total_registros: slim.length });
  } catch (e) {
    console.error('[precache]', e.message);
    return res.status(500).json({ erro: e.message });
  }
}
