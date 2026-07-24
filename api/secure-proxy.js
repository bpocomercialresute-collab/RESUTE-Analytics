const ALLOWED_SUPABASE_PATHS = [
  '/rest/v1/vendas',
  '/rest/v1/usuarios',
  '/rest/v1/empresas',
  '/rest/v1/api_config',
  '/rest/v1/sync_log',
  '/rest/v1/admin_audit_log',
  '/rest/v1/clientes_cad',
  '/rest/v1/produtos',
  '/rest/v1/representantes',
  '/rest/v1/grupos',
  '/functions/v1/sync-visual-saef'
];

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
  VISUAL_LOGIN_TOKEN_CACHE.set(cacheKey, { expiresAt, value });
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

  if (targetUrl.pathname === '/rest/v1/api_config' || targetUrl.pathname === '/rest/v1/sync_log') {
    if (appUser.papel !== 'super_admin') {
      throw new Error('Apenas super_admin pode acessar esta rota.');
    }
    return;
  }

  if (
    targetUrl.pathname === '/rest/v1/clientes_cad' ||
    targetUrl.pathname === '/rest/v1/produtos' ||
    targetUrl.pathname === '/rest/v1/representantes'
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
    VISUAL_AUTH_CACHE.set(cacheKey, {
      expiresAt: Date.now() + 1000 * 60 * 10,
      value
    });
  }

  return value;
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
      return res.status(cadastroAuth.status || 500).json({
        erro: cadastroAuth.message || 'Falha ao autenticar na API Visual Saef para os cadastros.',
        detalhe: cadastroAuth.text || null
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
  try {
    await fetch(`${env.supaUrl}/rest/v1/admin_audit_log`, {
      method: 'POST',
      headers: {
        ...adminActionHeaders(env, 'application/json'),
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    // Audit is optional until docs/supabase-admin-audit.sql is reviewed and run.
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

    const companyUpdate = await fetch(
      `${env.supaUrl}/rest/v1/empresas?id=eq.${encodeURIComponent(companyId)}`,
      {
        method: 'PATCH',
        headers: {
          ...adminActionHeaders(env, 'application/json'),
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ ativo: false })
      }
    );
    await adminActionReadJson(companyUpdate);

    const integrationUpdate = await fetch(
      `${env.supaUrl}/rest/v1/api_config?empresa_id=eq.${encodeURIComponent(companyId)}`,
      {
        method: 'PATCH',
        headers: {
          ...adminActionHeaders(env, 'application/json'),
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ ativo: false })
      }
    );
    await adminActionReadJson(integrationUpdate);

    const userUpdate = await fetch(
      `${env.supaUrl}/rest/v1/usuarios?empresa_id=eq.${encodeURIComponent(companyId)}`,
      {
        method: 'PATCH',
        headers: {
          ...adminActionHeaders(env, 'application/json'),
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ ativo: false })
      }
    );
    await adminActionReadJson(userUpdate);

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
  if (action === 'admin-company-archive') {
    return handleAdminCompanyArchive(res, appUser, payload, env);
  }
  if (action === 'admin-integration-test') {
    return handleAdminIntegrationTest(res, env, appUser, payload);
  }
  return res.status(400).json({ erro: 'Acao administrativa invalida.' });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token, x-visual-codigo-empresa');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Metodo nao permitido' });

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

  const { action, payload, url, method, headers, body } = req.body || {};
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
        return res.status(500).json({ erro: 'Credenciais da API externa nao configuradas na Vercel.' });
      }
      return await proxyVisualSaef(req, res, targetUrl, httpMethod, incomingHeaders, env);
    }

    return res.status(403).json({ erro: 'Origem nao permitida.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
