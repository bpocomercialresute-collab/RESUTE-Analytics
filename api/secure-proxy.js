const ALLOWED_SUPABASE_PATHS = [
  '/rest/v1/vendas',
  '/rest/v1/usuarios',
  '/rest/v1/empresas',
  '/rest/v1/api_config',
  '/rest/v1/sync_log',
  '/rest/v1/clientes_api',
  '/rest/v1/produtos_api',
  '/rest/v1/representantes_api',
  '/functions/v1/sync-visual-saef'
];

const ALLOWED_VISUAL_PATHS = [
  '/login',
  '/relacaovendaitem',
  '/clientes',
  '/cliente',
  '/relacaocliente',
  '/cadastrocliente',
  '/produtos',
  '/produto',
  '/relacaoproduto',
  '/cadastroproduto',
  '/representantes',
  '/vendedores',
  '/vendedor',
  '/relacaorepresentante'
];

function getSessionEmpresaIds(appUser) {
  if (Array.isArray(appUser.empresa_ids)) return appUser.empresa_ids;
  if (typeof appUser.empresa_ids === 'string' && appUser.empresa_ids) {
    try {
      const parsed = JSON.parse(appUser.empresa_ids);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return appUser.empresa_id ? [appUser.empresa_id] : [];
}

function extractEmpresaIdsFromUrl(url) {
  const values = [];
  const direct = url.searchParams.get('empresa_id');
  if (direct && direct.startsWith('eq.')) values.push(decodeURIComponent(direct.slice(3)));
  return values.filter(Boolean);
}

function extractEmpresaIdsFromBody(body) {
  if (!body) return [];
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => item && item.empresa_id).filter(Boolean);
    }
    return parsed && parsed.empresa_id ? [parsed.empresa_id] : [];
  } catch (e) {
    return [];
  }
}

function canAccessEmpresa(appUser, empresaId) {
  if (!empresaId) return false;
  if (appUser.papel === 'super_admin') return true;
  return getSessionEmpresaIds(appUser).includes(empresaId);
}

function normalizeHeaders(inputHeaders) {
  const out = {};
  Object.entries(inputHeaders || {}).forEach(([key, value]) => {
    if (value == null) return;
    out[String(key).toLowerCase()] = String(value);
  });
  return out;
}

async function getAppUser(sessionToken, supaUrl, anonKey) {
  const authResp = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${sessionToken}`
    }
  });

  if (!authResp.ok) return null;
  const authUser = await authResp.json();
  const email = String(authUser.email || '').toLowerCase();
  if (!email) return null;

  const userResp = await fetch(
    `${supaUrl}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}&select=*`,
    {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${sessionToken}`
      }
    }
  );

  if (!userResp.ok) return null;
  const users = await userResp.json();
  const appUser = Array.isArray(users) && users.length ? users[0] : null;
  if (!appUser) return null;

  appUser.email = email;
  appUser.empresa_ids = getSessionEmpresaIds(appUser);
  return appUser;
}

function assertAuthorized(appUser, targetUrl, method, body) {
  const isWrite = method !== 'GET' && method !== 'HEAD';

  if (targetUrl.pathname === '/rest/v1/vendas') {
    const empresaIds = [
      ...extractEmpresaIdsFromUrl(targetUrl),
      ...extractEmpresaIdsFromBody(body)
    ];

    if (!empresaIds.length) {
      throw new Error('Empresa obrigatoria para consultar vendas.');
    }

    if (!empresaIds.every((empresaId) => canAccessEmpresa(appUser, empresaId))) {
      throw new Error('Acesso negado para esta empresa.');
    }

    if (isWrite && appUser.papel !== 'super_admin') {
      throw new Error('Apenas super_admin pode alterar vendas.');
    }
    return;
  }

  if (targetUrl.pathname === '/rest/v1/usuarios') {
    if (isWrite) {
      throw new Error('Alteracao de usuarios nao permitida.');
    }
    const emailFilter = targetUrl.searchParams.get('email') || '';
    const expected = `eq.${appUser.email}`;
    if (emailFilter && emailFilter !== expected && appUser.papel !== 'super_admin') {
      throw new Error('Acesso negado a este usuario.');
    }
    return;
  }

  if (targetUrl.pathname === '/rest/v1/empresas') {
    if (appUser.papel !== 'super_admin') {
      throw new Error('Apenas super_admin pode acessar empresas.');
    }
    return;
  }

  if (targetUrl.pathname === '/rest/v1/api_config' || targetUrl.pathname === '/rest/v1/sync_log') {
    if (appUser.papel !== 'super_admin') {
      throw new Error('Apenas super_admin pode acessar esta rota.');
    }
    return;
  }

  if (
    targetUrl.pathname === '/rest/v1/clientes_api' ||
    targetUrl.pathname === '/rest/v1/produtos_api' ||
    targetUrl.pathname === '/rest/v1/representantes_api'
  ) {
    if (appUser.papel !== 'super_admin') {
      throw new Error('Apenas super_admin pode acessar cadastros sincronizados.');
    }
    return;
  }

  if (targetUrl.pathname === '/functions/v1/sync-visual-saef') {
    if (appUser.papel !== 'super_admin') {
      throw new Error('Apenas super_admin pode sincronizar.');
    }
    return;
  }

  throw new Error('Rota nao permitida.');
}

async function proxySupabase(req, res, targetUrl, method, incomingHeaders, body, env) {
  if (!ALLOWED_SUPABASE_PATHS.includes(targetUrl.pathname)) {
    return res.status(403).json({ erro: 'Rota do Supabase nao permitida.' });
  }

  const sessionToken = req.headers['x-session-token']
    || String(incomingHeaders['authorization'] || '').replace(/^Bearer\s+/i, '');
  const appUser = await getAppUser(sessionToken, env.supaUrl, env.anonKey);
  if (!appUser) {
    return res.status(401).json({ erro: 'Sessao invalida.' });
  }

  try {
    assertAuthorized(appUser, targetUrl, method, body);
  } catch (e) {
    return res.status(403).json({ erro: e.message });
  }

  const forwardHeaders = {
    'Authorization': `Bearer ${env.serviceKey}`,
    'apikey': env.serviceKey
  };

  if (incomingHeaders['content-type']) forwardHeaders['Content-Type'] = incomingHeaders['content-type'];
  if (incomingHeaders['prefer']) forwardHeaders['Prefer'] = incomingHeaders['prefer'];
  if (incomingHeaders['range']) forwardHeaders['Range'] = incomingHeaders['range'];
  if (incomingHeaders['accept']) forwardHeaders['Accept'] = incomingHeaders['accept'];

  const upstream = await fetch(`${env.supaUrl}${targetUrl.pathname}${targetUrl.search}`, {
    method,
    headers: forwardHeaders,
    body: method === 'GET' || method === 'HEAD' ? undefined : body
  });

  const text = await upstream.text();
  const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
  const contentRange = upstream.headers.get('content-range');

  res.status(upstream.status);
  res.setHeader('Content-Type', contentType);
  if (contentRange) res.setHeader('content-range', contentRange);
  return res.send(text);
}

async function proxyVisualSaef(req, res, targetUrl, method, incomingHeaders, env) {
  const sessionToken = req.headers['x-session-token']
    || String(incomingHeaders['authorization'] || '').replace(/^Bearer\s+/i, '');
  const appUser = await getAppUser(sessionToken, env.supaUrl, env.anonKey);
  if (!appUser) {
    return res.status(401).json({ erro: 'Sessao invalida.' });
  }
  if (appUser.papel !== 'super_admin') {
    return res.status(403).json({ erro: 'Apenas super_admin pode acessar a API externa.' });
  }

  if (!ALLOWED_VISUAL_PATHS.includes(targetUrl.pathname)) {
    return res.status(403).json({ erro: 'Rota externa nao permitida.' });
  }

  let upstream;
  if (targetUrl.pathname === '/login') {
    upstream = await fetch(
      `${env.visualUrl}/login?client_id=${encodeURIComponent(env.visualClientId)}&client_secret=${encodeURIComponent(env.visualClientSecret)}`,
      { method: 'GET', headers: { 'Accept': 'application/json' } }
    );
  } else {
    upstream = await fetch(`${env.visualUrl}${targetUrl.pathname}${targetUrl.search}`, {
      method,
      headers: {
        'Authorization': incomingHeaders['authorization'] || '',
        'Accept': incomingHeaders['accept'] || 'application/json'
      }
    });
  }

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
  return res.send(text);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Metodo nao permitido' });

  const env = {
    supaUrl: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    visualUrl: process.env.VISUAL_SAEF_API_URL || 'https://api-plastrio.visualsaef.com',
    visualClientId: process.env.VISUAL_SAEF_CLIENT_ID,
    visualClientSecret: process.env.VISUAL_SAEF_CLIENT_SECRET
  };

  if (!env.supaUrl || !env.anonKey || !env.serviceKey) {
    return res.status(500).json({ erro: 'Variaveis seguras do Supabase nao configuradas na Vercel.' });
  }

  const { url, method, headers, body } = req.body || {};
  if (!url) return res.status(400).json({ erro: 'URL obrigatoria.' });

  const incomingHeaders = normalizeHeaders(headers);
  const httpMethod = String(method || 'GET').toUpperCase();

  try {
    const targetUrl = new URL(url);
    const supaOrigin = new URL(env.supaUrl).origin;
    const visualOrigin = new URL(env.visualUrl).origin;

    if (targetUrl.origin === supaOrigin) {
      return await proxySupabase(req, res, targetUrl, httpMethod, incomingHeaders, body, env);
    }

    if (targetUrl.origin === visualOrigin) {
      if (!env.visualClientId || !env.visualClientSecret) {
        return res.status(500).json({ erro: 'Credenciais da API externa nao configuradas na Vercel.' });
      }
      return await proxyVisualSaef(req, res, targetUrl, httpMethod, incomingHeaders, env);
    }

    return res.status(403).json({ erro: 'Origem nao permitida.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
