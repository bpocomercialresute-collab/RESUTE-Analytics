// api/precache.js — gera o snapshot de relatorios_cache server-side via RPC.
// A RPC gerar_cache_dashboard agrega os dados dentro do Postgres e faz upsert
// em relatorios_cache sem transferir nenhuma linha pelo Vercel.

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
    // Chama RPC que agrega dados dentro do Postgres e faz upsert em relatorios_cache.
    // Nenhum dado de vendas trafega pelo Vercel — só o resultado { ok, total_registros }.
    const rpcResp = await fetch(`${supaUrl}/rest/v1/rpc/gerar_cache_dashboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ p_empresa_id: empresaId })
    });

    const rpcText = await rpcResp.text().catch(() => '');

    if (!rpcResp.ok) {
      const funcaoInexistente = /gerar_cache_dashboard/i.test(rpcText) && /does not exist|PGRST/i.test(rpcText);
      if (funcaoInexistente) {
        return res.status(200).json({
          ok: false,
          total_registros: 0,
          aviso: 'Execute o SQL em docs/supabase-gerar-cache-dashboard.sql no Supabase para habilitar o cache.'
        });
      }
      return res.status(500).json({ erro: `Falha na RPC: HTTP ${rpcResp.status} — ${rpcText.slice(0, 200)}` });
    }

    let rpcData;
    try { rpcData = JSON.parse(rpcText); } catch (_) { rpcData = {}; }

    return res.status(200).json({ ok: true, total_registros: rpcData.total_registros || 0 });
  } catch (e) {
    console.error('[precache]', e.message);
    return res.status(500).json({ erro: e.message });
  }
}
