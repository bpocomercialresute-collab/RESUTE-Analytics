function _getAllowedOrigins() {
  return process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
}

function setCorsHeaders(req, res) {
  const allowed = _getAllowedOrigins();
  const origin = req.headers.origin || '';
  // Quando ALLOWED_ORIGINS vazio (dev/preview): reflete o origin recebido
  // Quando configurado: só reflete se origin estiver na lista — NUNCA wildcard
  const corsOrigin = allowed.length === 0 ? origin : (allowed.includes(origin) ? origin : '');
  if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
}

function isOriginAllowed(req) {
  const allowed = _getAllowedOrigins();
  if (!allowed.length) return true;
  const origin = req.headers.origin || '';
  // Comparação exata — sem startsWith para evitar bypass de subdomínio
  return allowed.includes(origin);
}

const ALLOWED_SUPABASE_PATHS = [
  '/rest/v1/vendas',
  '/rest/v1/usuarios',
  '/rest/v1/empresas',
  '/rest/v1/api_config',
  '/rest/v1/sync_log',
  '/rest/v1/admin_audit_log',
  '/rest/v1/relatorios_cache',
  '/rest/v1/clientes_cad',
  '/rest/v1/produtos',
  '/rest/v1/representantes',
  '/rest/v1/grupos',
  '/rest/v1/empresa_modulos',
  '/rest/v1/empresa_filiais',
  '/functions/v1/sync-visual-saef'
];

// Tabelas do modulo financeiro. O prefixo fin_ e o allowlist: qualquer tabela
// fora desse padrao continua recusada. Toda leitura exige filtro por empresa_id.
const FIN_TABLE_REGEX = /^\/rest\/v1\/fin_[a-z0-9_]{1,60}$/;

function isFinanceiroPath(pathname) {
  return FIN_TABLE_REGEX.test(pathname);
}

const ALLOWED_VISUAL_PATHS = [
  '/login',
  '/logonsaef/logincore',
  '/logonsaef/login4',
  '/logonsaef/AuthorizationForUse',
  '/relacaovendaitem',
  '/clientes',
  '/cliente',
  '/relacaocliente',
  '/cadastrocliente',
  '/cadastroclienteparceiro',
  '/produtos',
  '/produto',
  '/relacaoproduto',
  '/cadastroproduto',
  '/cadastrovendedor',
  '/representantes',
  '/vendedores',
  '/vendedor',
  '/relacaorepresentante'
];

const VISUAL_CADASTRO_PATHS = new Set([
  '/cadastrocliente',
  '/cadastroclienteparceiro',
  '/cadastroproduto',
  '/cadastrovendedor'
]);

const VISUAL_LOGIN_TOKEN_CACHE = new Map();
const VISUAL_AUTH_CACHE = new Map();
const CACHE_MAX_SIZE = 200;

const RATE_LIMIT_MAP = new Map();
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(key) {
  const now = Date.now();
  const entry = RATE_LIMIT_MAP.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count += 1;
  }
  RATE_LIMIT_MAP.set(key, entry);
  if (RATE_LIMIT_MAP.size > 2000) {
    for (const [k, v] of RATE_LIMIT_MAP.entries()) {
      if (now - v.windowStart > RATE_LIMIT_WINDOW_MS) RATE_LIMIT_MAP.delete(k);
    }
  }
  return entry.count <= RATE_LIMIT_MAX;
}

function cacheSet(map, key, value) {
  if (map.size >= CACHE_MAX_SIZE) {
    map.delete(map.keys().next().value);
  }
  map.set(key, value);
}

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

function sanitizeApiConfigResponse(text) {
  if (!text) return text;
  try {
    const payload = JSON.parse(text);
    const secretFields = new Set([
      'api_key',
      'api_pass',
      'api_password',
      'client_secret',
      'secret',
      'token',
      'access_token',
      'refresh_token'
    ]);
    const sanitize = (item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      return Object.fromEntries(
        Object.entries(item).filter(([key]) => !secretFields.has(String(key).toLowerCase()))
      );
    };
    return JSON.stringify(Array.isArray(payload) ? payload.map(sanitize) : sanitize(payload));
  } catch (error) {
    return text;
  }
}

function getVisualCodigoEmpresa(incomingHeaders, body, appUser) {
  const candidates = [
    incomingHeaders && incomingHeaders['x-visual-codigo-empresa'],
    incomingHeaders && incomingHeaders['x-visual-company-code'],
    body && body.visual_codigo_empresa,
    body && body.empresa_codigo,
    body && body.empresa_id,
    body && body.codigo_empresa,
    body && body.codigoCliente,
    appUser && appUser.visual_codigo_empresa,
    appUser && appUser.empresa_codigo,
    appUser && appUser.empresa_id,
    appUser && appUser.codigo_empresa,
    appUser && appUser.codigo_cliente_id,
    appUser && appUser.codigo_cliente
  ];

  for (const value of candidates) {
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function isVisualCadastroPath(pathname) {
  return VISUAL_CADASTRO_PATHS.has(pathname);
}

function readJwtExpiry(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    if (!payload || !payload.exp) return null;
    return Number(payload.exp) * 1000;
  } catch (e) {
    return null;
  }
}

async function getVisualLoginToken(env, clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      status: 500,
      message: 'Credenciais da API Visual Saef nao configuradas para o login de cadastro.'
    };
  }

  const cacheKey = `${clientId}:${clientSecret}`;
  const cached = VISUAL_LOGIN_TOKEN_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const upstream = await fetch(
    `${env.visualUrl}/login?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }
  );

  const text = await upstream.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (e) {
    payload = null;
  }

  const token = payload && typeof payload.token === 'string'
    ? payload.token
    : (typeof text === 'string' ? text.trim() : '');
  if (!upstream.ok || !token) {
    return {
      ok: false,
      status: upstream.status || 500,
      text,
      payload,
      message: 'Nao foi possivel autenticar na API Visual Saef para o fluxo de cadastros.'
    };
  }

  const expiresAt = Math.max(
    Date.now() + 1000 * 60 * 20,
    (readJwtExpiry(token) || (Date.now() + 1000 * 60 * 30)) - 1000 * 30
  );
  const value = { ok: true, token, payload, text, status: upstream.status };
  cacheSet(VISUAL_LOGIN_TOKEN_CACHE, cacheKey, { expiresAt, value });
  return value;
}

async function getAppUser(sessionToken, supaUrl, anonKey, serviceKey) {
  const authResp = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${sessionToken}`
    }
  });

  if (!authResp.ok) return null;
  const authUser = await authResp.json();
  const email = String(authUser.email || '').trim().toLowerCase();
  if (!email) return null;

  const roleWeight = { super_admin: 3, admin: 2, gestor: 1, cliente: 0 };
  const userResp = await fetch(
    `${supaUrl}/rest/v1/usuarios?email=ilike.${encodeURIComponent(email)}&select=*`,
    {
      headers: {
        'apikey': serviceKey || anonKey,
        'Authorization': `Bearer ${serviceKey || sessionToken}`
      }
    }
  );

  if (!userResp.ok) return null;
  const users = await userResp.json();
  const appUser = Array.isArray(users) && users.length
    ? users.slice().sort((a, b) => {
        const aRole = roleWeight[String(a?.papel || '').toLowerCase()] ?? -1;
        const bRole = roleWeight[String(b?.papel || '').toLowerCase()] ?? -1;
        if (bRole !== aRole) return bRole - aRole;
        const aEmpresa = a?.empresa_id ? 1 : 0;
        const bEmpresa = b?.empresa_id ? 1 : 0;
        return bEmpresa - aEmpresa;
      })[0]
    : null;
  if (!appUser) return null;
  if (appUser.ativo === false) return null;

  appUser.email = email;
  appUser.empresa_ids = getSessionEmpresaIds(appUser);

  // Estende empresa_ids com filiais do grupo — permite que clientes acessem
  // vendas/cadastros das empresas filiais sem precisar de regra extra por rota.
  appUser.empresa_ids_own = [...appUser.empresa_ids]; // IDs próprias, sem filiais
  if (appUser.empresa_ids.length && appUser.papel !== 'super_admin') {
    try {
      const inFilter = appUser.empresa_ids.map(id => encodeURIComponent(id)).join(',');
      const filiaisResp = await fetch(
        `${supaUrl}/rest/v1/empresa_filiais?empresa_pai_id=in.(${inFilter})&ativo=eq.true&select=empresa_filial_id`,
        { headers: { 'apikey': serviceKey || anonKey, 'Authorization': `Bearer ${serviceKey || sessionToken}` } }
      );
      if (filiaisResp.ok) {
        const filiaisData = await filiaisResp.json();
        if (Array.isArray(filiaisData) && filiaisData.length) {
          const filialIds = filiaisData.map(f => f.empresa_filial_id).filter(Boolean);
          const allIds = Array.from(new Set([...appUser.empresa_ids, ...filialIds]));
          appUser.empresa_ids = allIds;
          appUser.empresa_filial_ids = filialIds;
        }
      }
    } catch (e) {
      // falha silenciosa — acesso continua com empresa_ids original
    }
  }

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
    // Clientes podem ler dados da sua própria empresa (exibir_origem)
    if (appUser.papel !== 'super_admin') {
      if (isWrite) {
        throw new Error('Apenas super_admin pode alterar empresas.');
      }
      // Verifica se está filtrando pela empresa do cliente
      var filtroId = targetUrl.searchParams.get('id') || '';
      if (filtroId.startsWith('eq.')) {
        var idFiltrado = filtroId.slice(3);
        if (!canAccessEmpresa(appUser, idFiltrado)) {
          throw new Error('Acesso negado a esta empresa.');
        }
      } else {
        throw new Error('Filtro de empresa obrigatorio.');
      }
    }
    return;
  }

  if (targetUrl.pathname === '/rest/v1/admin_audit_log') {
    if (appUser.papel !== 'super_admin') {
      throw new Error('Apenas super_admin pode acessar esta rota.');
    }
    if (isWrite) {
      throw new Error('Registros de auditoria nao podem ser alterados pelo navegador.');
    }
    return;
  }

  if (targetUrl.pathname === '/rest/v1/relatorios_cache') {
    const empresaIdsCache = [
      ...extractEmpresaIdsFromUrl(targetUrl),
      ...extractEmpresaIdsFromBody(body)
    ];

    if (!empresaIdsCache.length) {
      throw new Error('Empresa obrigatoria para consultar snapshots.');
    }

    if (!empresaIdsCache.every((empresaId) => canAccessEmpresa(appUser, empresaId))) {
      throw new Error('Acesso negado para esta empresa.');
    }

    if (isWrite && appUser.papel !== 'super_admin') {
      throw new Error('Apenas super_admin pode alterar snapshots.');
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
    targetUrl.pathname === '/rest/v1/clientes_cad' ||
    targetUrl.pathname === '/rest/v1/produtos' ||
    targetUrl.pathname === '/rest/v1/representantes' ||
    targetUrl.pathname === '/rest/v1/grupos'
  ) {
    // Clientes podem ler cadastros da sua empresa
    if (appUser.papel !== 'super_admin') {
      if (isWrite) {
        throw new Error('Apenas super_admin pode alterar cadastros.');
      }
      var empresaIds2 = extractEmpresaIdsFromUrl(targetUrl);
      if (!empresaIds2.length || !empresaIds2.every(function(id) { return canAccessEmpresa(appUser, id); })) {
        throw new Error('Filtro de empresa obrigatorio.');
      }
    }
    return;
  }

  if (targetUrl.pathname === '/rest/v1/empresa_filiais') {
    if (appUser.papel !== 'super_admin') {
      // Cliente pode apenas ler filiais da sua própria empresa pai (não de filiais)
      if (isWrite) {
        throw new Error('Apenas super_admin pode alterar grupos de empresas.');
      }
      const paiFilter = targetUrl.searchParams.get('empresa_pai_id') || '';
      if (paiFilter.startsWith('eq.')) {
        const paiId = decodeURIComponent(paiFilter.slice(3));
        const ownIds = appUser.empresa_ids_own || getSessionEmpresaIds(appUser);
        if (!ownIds.includes(paiId)) {
          throw new Error('Acesso negado a este grupo de empresas.');
        }
      } else {
        throw new Error('Filtro empresa_pai_id obrigatorio para empresa_filiais.');
      }
    }
    return;
  }

  if (targetUrl.pathname === '/rest/v1/empresa_modulos') {
    // Escrita nunca vem do navegador — so pela acao admin-module-toggle,
    // que roda no servidor com service role.
    if (isWrite) {
      throw new Error('Contratos de modulo nao podem ser alterados pelo navegador.');
    }
    if (appUser.papel !== 'super_admin') {
      const empresaIdsMod = extractEmpresaIdsFromUrl(targetUrl);
      if (!empresaIdsMod.length || !empresaIdsMod.every(function(id) { return canAccessEmpresa(appUser, id); })) {
        throw new Error('Filtro de empresa obrigatorio.');
      }
    }
    return;
  }

  if (isFinanceiroPath(targetUrl.pathname)) {
    const empresaIdsFin = [
      ...extractEmpresaIdsFromUrl(targetUrl),
      ...extractEmpresaIdsFromBody(body)
    ];
    if (!empresaIdsFin.length) {
      throw new Error('Empresa obrigatoria para consultar dados financeiros.');
    }
    if (!empresaIdsFin.every((empresaId) => canAccessEmpresa(appUser, empresaId))) {
      throw new Error('Acesso negado para esta empresa.');
    }
    if (isWrite && appUser.papel !== 'super_admin') {
      throw new Error('Apenas super_admin pode alterar dados financeiros.');
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
  if (!ALLOWED_SUPABASE_PATHS.includes(targetUrl.pathname) && !isFinanceiroPath(targetUrl.pathname)) {
    return res.status(403).json({ erro: 'Rota do Supabase nao permitida.' });
  }

  const sessionToken = req.headers['x-session-token']
    || String(incomingHeaders['authorization'] || '').replace(/^Bearer\s+/i, '');
  const appUser = await getAppUser(sessionToken, env.supaUrl, env.anonKey, env.serviceKey);
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

  let text = await upstream.text();
  if (
    upstream.ok &&
    method === 'GET' &&
    targetUrl.pathname === '/rest/v1/api_config'
  ) {
    text = sanitizeApiConfigResponse(text);
  }
  const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
  const contentRange = upstream.headers.get('content-range');

  if (upstream.ok && method !== 'GET' && method !== 'HEAD') {
    if (targetUrl.pathname === '/rest/v1/empresas') {
      let safeBody = {};
      try { safeBody = body ? JSON.parse(body) : {}; } catch (error) {}
      const entityId = String(targetUrl.searchParams.get('id') || '').replace(/^eq\./, '') || null;
      await writeAdminAudit(env, appUser, {
        action: method === 'POST' ? 'criar_empresa' : 'atualizar_empresa',
        entity: 'empresa',
        entityId,
        empresaId: entityId,
        summary: `${method === 'POST' ? 'Empresa criada' : 'Empresa atualizada'}: ${safeBody.nome || entityId || 'registro'}`,
        metadata: {
          metodo: method,
          origem: safeBody.exibir_origem || null,
          ativo: typeof safeBody.ativo === 'boolean' ? safeBody.ativo : null
        }
      });
    }
    if (targetUrl.pathname === '/rest/v1/api_config') {
      let safeConfig = {};
      try { safeConfig = body ? JSON.parse(body) : {}; } catch (error) {}
      const empresaId = String(targetUrl.searchParams.get('empresa_id') || '').replace(/^eq\./, '')
        || safeConfig.empresa_id
        || null;
      await writeAdminAudit(env, appUser, {
        action: method === 'POST' ? 'criar_integracao' : 'atualizar_integracao',
        entity: 'integracao',
        entityId: empresaId,
        empresaId,
        summary: `${method === 'POST' ? 'Integracao criada' : 'Configuracao de integracao atualizada'} para ${safeConfig.sistema || 'API'}`,
        metadata: {
          metodo: method,
          sistema: safeConfig.sistema || null,
          ativo: typeof safeConfig.ativo === 'boolean' ? safeConfig.ativo : null
        }
      });
    }
  }

  res.status(upstream.status);
  res.setHeader('Content-Type', contentType);
  if (contentRange) res.setHeader('content-range', contentRange);
  return res.send(text);
}

async function ensureVisualSaefAuthorization(env, visualToken, codigoEmpresa) {
  if (!codigoEmpresa) {
    return {
      ok: false,
      status: 400,
      message: 'Codigo da empresa Visual nao configurado.'
    };
  }

  const cacheKey = `${visualToken || ''}:${codigoEmpresa}`;
  const cached = VISUAL_AUTH_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const upstream = await fetch(
    `${env.visualUrl}/logonsaef/AuthorizationForUse?CodigoEmpresa=${encodeURIComponent(codigoEmpresa)}`,
    {
      method: 'GET',
      headers: {
        'Authorization': visualToken || '',
        'Accept': 'text/plain'
      }
    }
  );

  const text = await upstream.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (e) {
    payload = null;
  }

  const blockedByFlag = payload && Number(payload.usoDoSistema) === 1;
  const blockedByDate = payload && payload.dataBloqueio;
  const usable = upstream.ok && !blockedByFlag && !blockedByDate;
  const value = {
    ok: usable,
    status: usable ? upstream.status : 403,
    payload,
    text,
    message: usable
      ? ''
      : (payload && payload.dataBloqueio
        ? `Empresa bloqueada pela API Visual Saef em ${payload.dataBloqueio}.`
        : 'API Visual Saef nao liberou o uso para esta empresa.')
  };

  if (usable) {
    cacheSet(VISUAL_AUTH_CACHE, cacheKey, {
      expiresAt: Date.now() + 1000 * 60 * 10,
      value
    });
  }

  return value;
}

async function proxyExternalGeneric(req, res, targetUrl, method, incomingHeaders, body, empresaId, env) {
  const sessionToken = req.headers['x-session-token']
    || String(incomingHeaders['authorization'] || '').replace(/^Bearer\s+/i, '');
  const appUser = await getAppUser(sessionToken, env.supaUrl, env.anonKey, env.serviceKey);
  if (!appUser) return res.status(401).json({ erro: 'Sessao invalida.' });
  if (appUser.papel !== 'super_admin') {
    return res.status(403).json({ erro: 'Apenas super_admin pode acessar APIs externas.' });
  }
  if (!empresaId) return res.status(400).json({ erro: 'empresa_id obrigatorio para proxying externo.' });

  // Busca api_url autorizada para esta empresa
  const cfgResp = await fetch(
    `${env.supaUrl}/rest/v1/api_config?empresa_id=eq.${encodeURIComponent(empresaId)}&ativo=eq.true&select=api_url,sistema&limit=1`,
    { headers: { 'apikey': env.serviceKey, 'Authorization': `Bearer ${env.serviceKey}` } }
  );
  const cfgData = cfgResp.ok ? await cfgResp.json() : [];
  const authorizedUrl = cfgData && cfgData[0] && cfgData[0].api_url ? cfgData[0].api_url.replace(/\/$/, '') : null;
  if (!authorizedUrl) {
    return res.status(403).json({ erro: 'Nenhuma API configurada e ativa para esta empresa.' });
  }
  if (!targetUrl.href.startsWith(authorizedUrl + '/') && targetUrl.href !== authorizedUrl) {
    return res.status(403).json({ erro: 'URL nao autorizada para esta empresa.' });
  }

  const forwardHeaders = {
    'Accept': incomingHeaders['accept'] || 'application/json'
  };
  if (incomingHeaders['authorization']) forwardHeaders['Authorization'] = incomingHeaders['authorization'];
  if (incomingHeaders['x-visual-codigo-empresa']) forwardHeaders['x-visual-codigo-empresa'] = incomingHeaders['x-visual-codigo-empresa'];
  if (incomingHeaders['content-type']) forwardHeaders['Content-Type'] = incomingHeaders['content-type'];

  const upstream = await fetch(targetUrl.href, {
    method,
    headers: forwardHeaders,
    ...(body && method !== 'GET' && method !== 'HEAD' ? { body } : {})
  });
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
  return res.send(text);
}

async function proxyVisualSaef(req, res, targetUrl, method, incomingHeaders, env) {
  const sessionToken = req.headers['x-session-token']
    || String(incomingHeaders['authorization'] || '').replace(/^Bearer\s+/i, '');
  const appUser = await getAppUser(sessionToken, env.supaUrl, env.anonKey, env.serviceKey);
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
  } else if (isVisualCadastroPath(targetUrl.pathname)) {
    const cadastroAuth = await getVisualLoginToken(
      env,
      env.visualCadastroClientId || env.visualClientId,
      env.visualCadastroClientSecret || env.visualClientSecret
    );

    if (!cadastroAuth.ok || !cadastroAuth.token) {
      console.error('[proxy] Visual Saef auth falhou:', cadastroAuth.status, String(cadastroAuth.text || '').slice(0, 200));
      return res.status(cadastroAuth.status || 500).json({
        erro: cadastroAuth.message || 'Falha ao autenticar na API Visual Saef para os cadastros.'
      });
    }

    upstream = await fetch(`${env.visualUrl}${targetUrl.pathname}${targetUrl.search}`, {
      method,
      headers: {
        'Authorization': `Bearer ${cadastroAuth.token}`,
        'Accept': incomingHeaders['accept'] || 'application/json',
        ...(incomingHeaders['x-visual-codigo-empresa'] ? { 'x-visual-codigo-empresa': incomingHeaders['x-visual-codigo-empresa'] } : {})
      }
    });
  } else {
    upstream = await fetch(`${env.visualUrl}${targetUrl.pathname}${targetUrl.search}`, {
      method,
      headers: {
        'Authorization': incomingHeaders['authorization'] || '',
        'Accept': incomingHeaders['accept'] || 'application/json',
        ...(incomingHeaders['x-visual-codigo-empresa'] ? { 'x-visual-codigo-empresa': incomingHeaders['x-visual-codigo-empresa'] } : {})
      }
    });
  }

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
  return res.send(text);
}

function adminActionHeaders(env, contentType) {
  return {
    'apikey': env.serviceKey,
    'Authorization': `Bearer ${env.serviceKey}`,
    ...(contentType ? { 'Content-Type': contentType } : {})
  };
}

async function writeAdminAudit(env, appUser, event) {
  if (!env || !appUser || !event) return;
  const payload = {
    ator_id: appUser.id || null,
    ator_email: String(appUser.email || 'super_admin'),
    acao: String(event.action || 'alteracao'),
    entidade: String(event.entity || 'administracao'),
    entidade_id: event.entityId ? String(event.entityId) : null,
    empresa_id: event.empresaId || null,
    resumo: String(event.summary || 'Acao administrativa executada'),
    metadados: event.metadata && typeof event.metadata === 'object' ? event.metadata : {}
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${env.supaUrl}/rest/v1/admin_audit_log`, {
        method: 'POST',
        headers: {
          ...adminActionHeaders(env, 'application/json'),
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
      if (r.ok || r.status < 500) return;
    } catch (error) {
      if (attempt === 1) console.error('[audit] Falha definitiva ao registrar:', event.action, error && error.message);
    }
  }
}

async function adminActionReadJson(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = text;
  }
  if (!response.ok) {
    const message = data && (data.msg || data.message || data.error_description || data.erro);
    throw new Error(message || `HTTP ${response.status}`);
  }
  return data;
}

function normalizeAdminUserPayload(payload) {
  const input = payload || {};
  const email = String(input.email || '').trim().toLowerCase();
  const nome = String(input.nome || '').trim();
  const papel = String(input.papel || 'cliente').trim().toLowerCase();
  const password = String(input.password || '');
  const empresaId = input.empresa_id ? String(input.empresa_id).trim() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe um e-mail valido.');
  }
  if (!nome) throw new Error('Informe o nome do usuario.');
  if (!['super_admin', 'admin', 'cliente'].includes(papel)) {
    throw new Error('Nivel de acesso invalido.');
  }
  if (papel !== 'super_admin' && !empresaId) {
    throw new Error('Admin e cliente precisam estar vinculados a uma empresa.');
  }
  if (password && password.length < 8) {
    throw new Error('A senha deve ter pelo menos 8 caracteres.');
  }

  return {
    id: input.id ? String(input.id) : null,
    email,
    nome,
    papel,
    password,
    empresa_id: papel === 'super_admin' ? null : empresaId,
    ativo: input.ativo !== false
  };
}

async function handleAdminUserCreate(res, appUser, payload, env) {
  const user = normalizeAdminUserPayload(payload);
  if (!user.password) throw new Error('Informe uma senha temporaria.');

  const authResponse = await fetch(`${env.supaUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminActionHeaders(env, 'application/json'),
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { nome: user.nome, papel: user.papel }
    })
  });
  const authPayload = await adminActionReadJson(authResponse);
  const authUser = authPayload && authPayload.user ? authPayload.user : authPayload;
  if (!authUser || !authUser.id) {
    throw new Error('Supabase Auth nao retornou o identificador do usuario.');
  }

  try {
    const profileResponse = await fetch(`${env.supaUrl}/rest/v1/usuarios`, {
      method: 'POST',
      headers: {
        ...adminActionHeaders(env, 'application/json'),
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        id: authUser.id,
        email: user.email,
        nome: user.nome,
        papel: user.papel,
        empresa_id: user.empresa_id,
        ativo: user.ativo
      })
    });
    const profile = await adminActionReadJson(profileResponse);
    await writeAdminAudit(env, appUser, {
      action: 'criar_usuario',
      entity: 'usuario',
      entityId: authUser.id,
      empresaId: user.empresa_id,
      summary: `Usuario ${user.email} criado com papel ${user.papel}`,
      metadata: { papel: user.papel, ativo: user.ativo }
    });
    return res.status(201).json({
      ok: true,
      usuario: Array.isArray(profile) ? profile[0] : profile
    });
  } catch (error) {
    // Compensates a failed profile insert so Auth and public.usuarios stay aligned.
    await fetch(`${env.supaUrl}/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, {
      method: 'DELETE',
      headers: adminActionHeaders(env)
    }).catch(() => null);
    throw error;
  }
}

async function handleAdminUserUpdate(res, appUser, payload, env) {
  const user = normalizeAdminUserPayload(payload);
  if (!user.id) throw new Error('Usuario nao informado.');

  const currentResponse = await fetch(
    `${env.supaUrl}/rest/v1/usuarios?id=eq.${encodeURIComponent(user.id)}&select=id,email,nome,papel,empresa_id,ativo`,
    { headers: adminActionHeaders(env) }
  );
  const currentRows = await adminActionReadJson(currentResponse);
  const current = Array.isArray(currentRows) ? currentRows[0] : null;
  if (!current) throw new Error('Usuario nao encontrado.');

  const removesSuperAdmin = current.papel === 'super_admin'
    && (user.papel !== 'super_admin' || user.ativo === false);
  if (String(current.id) === String(appUser.id) && removesSuperAdmin) {
    throw new Error('Voce nao pode remover o proprio acesso de super_admin.');
  }
  if (removesSuperAdmin) {
    const adminsResponse = await fetch(
      `${env.supaUrl}/rest/v1/usuarios?papel=eq.super_admin&ativo=eq.true&select=id`,
      { headers: adminActionHeaders(env) }
    );
    const admins = await adminActionReadJson(adminsResponse);
    if (!Array.isArray(admins) || admins.length <= 1) {
      throw new Error('O ultimo super_admin ativo nao pode ser desativado ou rebaixado.');
    }
  }

  const authChanges = {};
  if (user.email !== String(current.email || '').toLowerCase()) {
    authChanges.email = user.email;
    authChanges.email_confirm = true;
  }
  if (user.password) authChanges.password = user.password;
  if (Object.keys(authChanges).length) {
    const authResponse = await fetch(
      `${env.supaUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
      {
        method: 'PUT',
        headers: adminActionHeaders(env, 'application/json'),
        body: JSON.stringify(authChanges)
      }
    );
    await adminActionReadJson(authResponse);
  }

  const profileResponse = await fetch(
    `${env.supaUrl}/rest/v1/usuarios?id=eq.${encodeURIComponent(user.id)}`,
    {
      method: 'PATCH',
      headers: {
        ...adminActionHeaders(env, 'application/json'),
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        email: user.email,
        nome: user.nome,
        papel: user.papel,
        empresa_id: user.empresa_id,
        ativo: user.ativo
      })
    }
  );
  const profile = await adminActionReadJson(profileResponse);
  await writeAdminAudit(env, appUser, {
    action: 'atualizar_usuario',
    entity: 'usuario',
    entityId: user.id,
    empresaId: user.empresa_id,
    summary: `Usuario ${user.email} atualizado`,
    metadata: {
      papel_anterior: current.papel,
      papel_atual: user.papel,
      ativo_anterior: current.ativo,
      ativo_atual: user.ativo
    }
  });
  return res.status(200).json({
    ok: true,
    usuario: Array.isArray(profile) ? profile[0] : profile
  });
}

async function handleAdminUserDelete(res, appUser, payload, env) {
  const userId = payload && payload.id ? String(payload.id).trim() : null;
  if (!userId) throw new Error('Usuario nao informado.');
  if (String(userId) === String(appUser.id)) {
    throw new Error('Voce nao pode excluir o proprio perfil.');
  }

  const currentResponse = await fetch(
    `${env.supaUrl}/rest/v1/usuarios?id=eq.${encodeURIComponent(userId)}&select=id,email,nome,papel,empresa_id,ativo&limit=1`,
    { headers: adminActionHeaders(env) }
  );
  const currentRows = await adminActionReadJson(currentResponse);
  const current = Array.isArray(currentRows) ? currentRows[0] : null;
  if (!current) throw new Error('Usuario nao encontrado.');

  if (current.papel === 'super_admin') {
    const adminsResponse = await fetch(
      `${env.supaUrl}/rest/v1/usuarios?papel=eq.super_admin&ativo=eq.true&select=id`,
      { headers: adminActionHeaders(env) }
    );
    const admins = await adminActionReadJson(adminsResponse);
    if (!Array.isArray(admins) || admins.length <= 1) {
      throw new Error('O ultimo super_admin nao pode ser excluido.');
    }
  }

  const authResponse = await fetch(
    `${env.supaUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE', headers: adminActionHeaders(env) }
  );
  if (!authResponse.ok && authResponse.status !== 404) {
    const errText = await authResponse.text();
    let errMsg = 'HTTP ' + authResponse.status;
    try { const j = JSON.parse(errText); errMsg = j.msg || j.message || j.error_description || errMsg; } catch (e) {}
    throw new Error('Falha ao excluir autenticacao: ' + errMsg);
  }

  await fetch(
    `${env.supaUrl}/rest/v1/usuarios?id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      headers: { ...adminActionHeaders(env), 'Prefer': 'return=minimal' }
    }
  );

  await writeAdminAudit(env, appUser, {
    action: 'excluir_usuario',
    entity: 'usuario',
    entityId: userId,
    empresaId: current.empresa_id,
    summary: `Usuario ${current.email} excluido permanentemente`,
    metadata: { papel: current.papel, nome: current.nome }
  });

  return res.status(200).json({ ok: true, mensagem: 'Usuario excluido com sucesso.' });
}

async function handleAdminCompanyDelete(res, appUser, payload, env) {
  const companyId = payload && payload.id ? String(payload.id).trim() : null;
  if (!companyId || !/^[a-zA-Z0-9-]{8,80}$/.test(companyId)) {
    throw new Error('Empresa nao informada ou ID invalido.');
  }

  const companyResponse = await fetch(
    `${env.supaUrl}/rest/v1/empresas?id=eq.${encodeURIComponent(companyId)}&select=id,nome,slug&limit=1`,
    { headers: adminActionHeaders(env) }
  );
  const companyRows = await adminActionReadJson(companyResponse);
  const company = Array.isArray(companyRows) ? companyRows[0] : null;
  if (!company) throw new Error('Empresa nao encontrada.');

  // Load company users to delete from Auth
  const usersResponse = await fetch(
    `${env.supaUrl}/rest/v1/usuarios?empresa_id=eq.${encodeURIComponent(companyId)}&select=id,email`,
    { headers: adminActionHeaders(env) }
  );
  const companyUsers = await adminActionReadJson(usersResponse);

  // Delete operational tables and config in parallel (errors tolerated)
  const deleteHeaders = { ...adminActionHeaders(env), 'Prefer': 'return=minimal' };
  await Promise.all([
    ...['vendas', 'clientes_cad', 'produtos', 'representantes', 'grupos'].map(table =>
      fetch(`${env.supaUrl}/rest/v1/${table}?empresa_id=eq.${encodeURIComponent(companyId)}`,
        { method: 'DELETE', headers: deleteHeaders }).catch(() => null)
    ),
    fetch(`${env.supaUrl}/rest/v1/api_config?empresa_id=eq.${encodeURIComponent(companyId)}`,
      { method: 'DELETE', headers: deleteHeaders }).catch(() => null),
    fetch(`${env.supaUrl}/rest/v1/sync_log?empresa_id=eq.${encodeURIComponent(companyId)}`,
      { method: 'DELETE', headers: deleteHeaders }).catch(() => null)
  ]);

  // Delete user Auth records in parallel
  if (Array.isArray(companyUsers)) {
    await Promise.all(
      companyUsers.filter(u => u.id).map(u =>
        fetch(`${env.supaUrl}/auth/v1/admin/users/${encodeURIComponent(u.id)}`,
          { method: 'DELETE', headers: adminActionHeaders(env) }).catch(() => null)
      )
    );
  }
  await fetch(
    `${env.supaUrl}/rest/v1/usuarios?empresa_id=eq.${encodeURIComponent(companyId)}`,
    { method: 'DELETE', headers: { ...adminActionHeaders(env), 'Prefer': 'return=minimal' } }
  ).catch(() => null);

  // Delete the company itself
  const deleteResp = await fetch(
    `${env.supaUrl}/rest/v1/empresas?id=eq.${encodeURIComponent(companyId)}`,
    { method: 'DELETE', headers: { ...adminActionHeaders(env), 'Prefer': 'return=minimal' } }
  );
  if (!deleteResp.ok) {
    const t = await deleteResp.text();
    let msg = 'HTTP ' + deleteResp.status;
    try { const j = JSON.parse(t); msg = j.msg || j.message || j.error_description || msg; } catch (e) {}
    throw new Error('Falha ao excluir empresa: ' + msg);
  }

  await writeAdminAudit(env, appUser, {
    action: 'excluir_empresa',
    entity: 'empresa',
    entityId: companyId,
    empresaId: companyId,
    summary: `Empresa ${company.nome || companyId} excluida permanentemente`,
    metadata: { usuarios_removidos: Array.isArray(companyUsers) ? companyUsers.length : 0 }
  });

  return res.status(200).json({
    ok: true,
    mensagem: 'Empresa e todos os dados vinculados foram excluidos.'
  });
}

async function handleAdminCompanyArchive(res, appUser, payload, env) {
  const companyIds = Array.from(new Set(
    (Array.isArray(payload && payload.company_ids) ? payload.company_ids : [])
      .map((value) => String(value || '').trim())
      .filter((value) => /^[a-zA-Z0-9-]{8,80}$/.test(value))
  )).slice(0, 20);
  if (!companyIds.length) throw new Error('Nenhuma empresa valida foi informada.');

  const archived = [];
  for (const companyId of companyIds) {
    const companyResponse = await fetch(
      `${env.supaUrl}/rest/v1/empresas?id=eq.${encodeURIComponent(companyId)}&select=id,nome,slug,ativo&limit=1`,
      { headers: adminActionHeaders(env) }
    );
    const companyRows = await adminActionReadJson(companyResponse);
    const company = Array.isArray(companyRows) ? companyRows[0] : null;
    if (!company) continue;

    const patchHeaders = { ...adminActionHeaders(env, 'application/json'), 'Prefer': 'return=minimal' };
    const inactiveBody = JSON.stringify({ ativo: false });
    const [companyUpdate, integrationUpdate, userUpdate] = await Promise.all([
      fetch(`${env.supaUrl}/rest/v1/empresas?id=eq.${encodeURIComponent(companyId)}`,
        { method: 'PATCH', headers: patchHeaders, body: inactiveBody }),
      fetch(`${env.supaUrl}/rest/v1/api_config?empresa_id=eq.${encodeURIComponent(companyId)}`,
        { method: 'PATCH', headers: patchHeaders, body: inactiveBody }),
      fetch(`${env.supaUrl}/rest/v1/usuarios?empresa_id=eq.${encodeURIComponent(companyId)}`,
        { method: 'PATCH', headers: patchHeaders, body: inactiveBody })
    ]);
    await Promise.all([
      adminActionReadJson(companyUpdate),
      adminActionReadJson(integrationUpdate),
      adminActionReadJson(userUpdate)
    ]);

    archived.push({ id: companyId, nome: company.nome || company.slug || companyId });
    await writeAdminAudit(env, appUser, {
      action: 'arquivar_empresa',
      entity: 'empresa',
      entityId: companyId,
      empresaId: companyId,
      summary: `Empresa arquivada: ${company.nome || company.slug || companyId}`,
      metadata: {
        integracao_desativada: true,
        acessos_desativados: true
      }
    });
  }

  return res.status(200).json({
    ok: true,
    empresas: archived,
    mensagem: archived.length
      ? `${archived.length} empresa(s) arquivada(s) e acessos bloqueados.`
      : 'Nenhuma empresa precisou ser arquivada.'
  });
}

async function handleAdminIntegrationTest(res, env, appUser, payload) {
  const empresaId = payload && payload.empresa_id ? String(payload.empresa_id) : null;
  if (empresaId) {
    const configResponse = await fetch(
      `${env.supaUrl}/rest/v1/api_config?empresa_id=eq.${encodeURIComponent(empresaId)}&select=empresa_id,sistema,api_url,ativo&limit=1`,
      { headers: adminActionHeaders(env) }
    );
    const configs = await adminActionReadJson(configResponse);
    const config = Array.isArray(configs) ? configs[0] : null;
    if (!config) throw new Error('Integracao nao cadastrada para esta empresa.');
    if (config.ativo === false) throw new Error('A integracao desta empresa esta inativa.');
  }
  const auth = await getVisualLoginToken(
    env,
    env.visualCadastroClientId || env.visualClientId,
    env.visualCadastroClientSecret || env.visualClientSecret
  );
  if (!auth.ok || !auth.token) {
    await writeAdminAudit(env, appUser, {
      action: 'testar_integracao',
      entity: 'integracao',
      entityId: empresaId,
      empresaId,
      summary: 'Teste da Visual Saef falhou',
      metadata: { status: auth.status || 502 }
    });
    return res.status(auth.status || 502).json({
      erro: auth.message || 'Nao foi possivel autenticar na Visual Saef.'
    });
  }
  await writeAdminAudit(env, appUser, {
    action: 'testar_integracao',
    entity: 'integracao',
    entityId: empresaId,
    empresaId,
    summary: 'Teste da Visual Saef concluido com sucesso',
    metadata: { status: 200 }
  });
  return res.status(200).json({
    ok: true,
    mensagem: 'Supabase e autenticacao da Visual Saef responderam corretamente.'
  });
}

const MODULOS_VALIDOS = ['comercial', 'financeiro'];

/**
 * Liga/desliga o contrato de um modulo para uma empresa.
 * Desligar NUNCA apaga dado: apenas marca ativo = false.
 */
async function handleAdminModuleToggle(res, appUser, payload, env) {
  const input = payload || {};
  const empresaId = String(input.empresa_id || '').trim();
  const modulo = String(input.modulo || '').trim().toLowerCase();
  const ativo = input.ativo === true;

  if (!/^[a-zA-Z0-9-]{8,80}$/.test(empresaId)) {
    throw new Error('Empresa invalida.');
  }
  if (!MODULOS_VALIDOS.includes(modulo)) {
    throw new Error('Modulo invalido.');
  }

  let expiraEm = null;
  if (input.expira_em) {
    const parsed = new Date(String(input.expira_em));
    if (Number.isNaN(parsed.getTime())) throw new Error('Data de expiracao invalida.');
    expiraEm = parsed.toISOString();
  }

  const companyResponse = await fetch(
    `${env.supaUrl}/rest/v1/empresas?id=eq.${encodeURIComponent(empresaId)}&select=id,nome,slug&limit=1`,
    { headers: adminActionHeaders(env) }
  );
  const companyRows = await adminActionReadJson(companyResponse);
  const company = Array.isArray(companyRows) ? companyRows[0] : null;
  if (!company) throw new Error('Empresa nao encontrada.');

  const upsertResponse = await fetch(
    `${env.supaUrl}/rest/v1/empresa_modulos?on_conflict=empresa_id,modulo`,
    {
      method: 'POST',
      headers: {
        ...adminActionHeaders(env, 'application/json'),
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        empresa_id: empresaId,
        modulo: modulo,
        ativo: ativo,
        expira_em: expiraEm,
        criado_por: String(appUser.email || 'super_admin'),
        atualizado_em: new Date().toISOString()
      })
    }
  );
  const saved = await adminActionReadJson(upsertResponse);

  await writeAdminAudit(env, appUser, {
    action: ativo ? 'modulo.ativado' : 'modulo.desativado',
    entity: 'empresa_modulos',
    entityId: empresaId,
    empresaId,
    summary: `Modulo ${modulo} ${ativo ? 'ativado' : 'desativado'} para ${company.nome || company.slug || empresaId}`,
    metadata: { modulo, ativo, expira_em: expiraEm }
  });

  return res.status(200).json({
    ok: true,
    registro: Array.isArray(saved) ? saved[0] : saved,
    mensagem: `Modulo ${modulo} ${ativo ? 'ativado' : 'desativado'} para ${company.nome || empresaId}.`
  });
}

// Planos comerciais = combinacao de modulos. E assim que o super_admin decide
// o que cada empresa enxerga, sem precisar ligar modulo por modulo.
const PLANOS = {
  comercial:  ['comercial'],
  financeiro: ['financeiro'],
  completo:   ['comercial', 'financeiro'],
  nenhum:     []
};

/**
 * Aplica um plano inteiro a uma empresa numa unica operacao.
 * Modulos fora do plano ficam ativo = false — nunca sao apagados, entao o
 * historico de contratacao e o expira_em anterior continuam no banco.
 */
async function handleAdminPlanSet(res, appUser, payload, env) {
  const input = payload || {};
  const empresaId = String(input.empresa_id || '').trim();
  const plano = String(input.plano || '').trim().toLowerCase();

  if (!/^[a-zA-Z0-9-]{8,80}$/.test(empresaId)) throw new Error('Empresa invalida.');
  if (!Object.prototype.hasOwnProperty.call(PLANOS, plano)) throw new Error('Plano invalido.');

  let expiraEm = null;
  if (input.expira_em) {
    const parsed = new Date(String(input.expira_em));
    if (Number.isNaN(parsed.getTime())) throw new Error('Data de expiracao invalida.');
    expiraEm = parsed.toISOString();
  }

  const companyResponse = await fetch(
    `${env.supaUrl}/rest/v1/empresas?id=eq.${encodeURIComponent(empresaId)}&select=id,nome,slug&limit=1`,
    { headers: adminActionHeaders(env) }
  );
  const companyRows = await adminActionReadJson(companyResponse);
  const company = Array.isArray(companyRows) ? companyRows[0] : null;
  if (!company) throw new Error('Empresa nao encontrada.');

  const agora = new Date().toISOString();
  const ativos = PLANOS[plano];
  const linhas = MODULOS_VALIDOS.map((modulo) => ({
    empresa_id: empresaId,
    modulo,
    ativo: ativos.includes(modulo),
    expira_em: ativos.includes(modulo) ? expiraEm : null,
    criado_por: String(appUser.email || 'super_admin'),
    atualizado_em: agora
  }));

  const upsertResponse = await fetch(
    `${env.supaUrl}/rest/v1/empresa_modulos?on_conflict=empresa_id,modulo`,
    {
      method: 'POST',
      headers: {
        ...adminActionHeaders(env, 'application/json'),
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(linhas)
    }
  );
  const saved = await adminActionReadJson(upsertResponse);

  await writeAdminAudit(env, appUser, {
    action: 'plano.alterado',
    entity: 'empresa_modulos',
    entityId: empresaId,
    empresaId,
    summary: `Plano definido como "${plano}" para ${company.nome || company.slug || empresaId}`,
    metadata: { plano, modulos_ativos: ativos, expira_em: expiraEm }
  });

  return res.status(200).json({
    ok: true,
    plano,
    registros: Array.isArray(saved) ? saved : [saved],
    mensagem: `Plano de ${company.nome || empresaId} atualizado para "${plano}".`
  });
}

async function handleAdminAction(req, res, action, payload, env) {
  const sessionToken = req.headers['x-session-token'] || '';
  const appUser = await getAppUser(
    sessionToken,
    env.supaUrl,
    env.anonKey,
    env.serviceKey
  );
  if (!appUser) return res.status(401).json({ erro: 'Sessao invalida.' });
  if (appUser.papel !== 'super_admin') {
    return res.status(403).json({ erro: 'Apenas super_admin pode executar esta acao.' });
  }

  if (action === 'admin-user-create') {
    return handleAdminUserCreate(res, appUser, payload, env);
  }
  if (action === 'admin-user-update') {
    return handleAdminUserUpdate(res, appUser, payload, env);
  }
  if (action === 'admin-user-delete') {
    return handleAdminUserDelete(res, appUser, payload, env);
  }
  if (action === 'admin-company-delete') {
    return handleAdminCompanyDelete(res, appUser, payload, env);
  }
  if (action === 'admin-company-archive') {
    return handleAdminCompanyArchive(res, appUser, payload, env);
  }
  if (action === 'admin-integration-test') {
    return handleAdminIntegrationTest(res, env, appUser, payload);
  }
  if (action === 'admin-plan-set') {
    return handleAdminPlanSet(res, appUser, payload, env);
  }
  if (action === 'admin-module-toggle') {
    return handleAdminModuleToggle(res, appUser, payload, env);
  }
  return res.status(400).json({ erro: 'Acao administrativa invalida.' });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token, x-visual-codigo-empresa');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Metodo nao permitido' });

  if (!isOriginAllowed(req)) {
    return res.status(403).json({ erro: 'Origem nao autorizada.' });
  }

  const xrw = req.headers['x-requested-with'] || '';
  if (xrw.toLowerCase() !== 'xmlhttprequest') {
    return res.status(403).json({ erro: 'Requisicao nao autorizada.' });
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 2 * 1024 * 1024) {
    return res.status(413).json({ erro: 'Payload excede o limite de 2MB.' });
  }

  // x-real-ip é injetado pelo Vercel/proxy — não pode ser forjado pelo cliente
  // x-session-token como chave primária garante limite por usuário autenticado
  const rateLimitKey = req.headers['x-session-token']
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  if (!checkRateLimit(rateLimitKey)) {
    return res.status(429).json({ erro: 'Muitas requisições. Aguarde um momento e tente novamente.' });
  }

  const env = {
    supaUrl: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    visualUrl: process.env.VISUAL_SAEF_API_URL || 'https://api-plastrio.visualsaef.com',
    visualClientId: process.env.VISUAL_SAEF_CLIENT_ID,
    visualClientSecret: process.env.VISUAL_SAEF_CLIENT_SECRET,
    visualCadastroClientId: process.env.VISUAL_SAEF_CADASTRO_CLIENT_ID || process.env.VISUAL_SAEF_CLIENT_ID,
    visualCadastroClientSecret: process.env.VISUAL_SAEF_CADASTRO_CLIENT_SECRET || process.env.VISUAL_SAEF_CLIENT_SECRET,
    visualCompanyCode: process.env.VISUAL_SAEF_CODIGO_EMPRESA || ''
  };

  if (!env.supaUrl || !env.anonKey || !env.serviceKey) {
    return res.status(500).json({ erro: 'Variaveis seguras do Supabase nao configuradas na Vercel.' });
  }

  const { action, payload, url, method, headers, body, empresa_id } = req.body || {};
  if (action) {
    try {
      return await handleAdminAction(req, res, String(action), payload, env);
    } catch (e) {
      return res.status(400).json({ erro: e.message });
    }
  }
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
        return res.status(500).json({ erro: 'Credenciais da API Visual Saef nao configuradas na Vercel.' });
      }
      return await proxyVisualSaef(req, res, targetUrl, httpMethod, incomingHeaders, env);
    }

    // API externa de outro sistema (Bling, Winthor, Omie, TOTVS, etc.)
    // Valida contra a api_url configurada para a empresa antes de proxiar
    return await proxyExternalGeneric(req, res, targetUrl, httpMethod, incomingHeaders, body, empresa_id || null, env);
  } catch (e) {
    console.error('[proxy] Erro interno:', e.message);
    return res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
}
