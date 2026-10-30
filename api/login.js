import { createHash } from 'node:crypto';

// Identificador nao reversivel do usuario para logs (nao expoe o email).
function loginIdentificador(email) {
  return createHash('sha256').update(String(email || '').toLowerCase()).digest('hex').slice(0, 8);
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (e) { return {}; }
  }
  return body;
}

// Modulos SaaS conhecidos, em ordem de prioridade (define o modulo_padrao).
const MODULOS_PRIORIDADE = ['comercial', 'financeiro'];

/**
 * Modulos contratados e vigentes da empresa.
 * Um modulo esta ativo quando ativo = true E (expira_em null OU expira_em > agora).
 *
 * Nunca lanca: qualquer falha (tabela inexistente, rede, resposta invalida)
 * cai no fallback ['comercial'] para nao quebrar logins existentes.
 * Retorna null quando a empresa nao tem nenhuma linha cadastrada — o chamador
 * distingue "sem contrato registrado" (fallback) de "contratos todos vencidos"
 * (acesso negado).
 */
async function buscarModulosEmpresa(supaUrl, serviceKey, empresaId) {
  if (!empresaId) return null;
  try {
    const resp = await fetch(
      `${supaUrl}/rest/v1/empresa_modulos?empresa_id=eq.${encodeURIComponent(empresaId)}&select=modulo,ativo,expira_em`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    );
    if (!resp.ok) {
      console.warn('[LOGIN] empresa_modulos indisponivel (HTTP ' + resp.status + ') — fallback comercial.');
      return null;
    }
    const rows = await resp.json();
    if (!Array.isArray(rows) || !rows.length) return null;

    const agora = Date.now();
    const ativos = rows
      .filter((row) => row && row.ativo === true)
      .filter((row) => !row.expira_em || new Date(row.expira_em).getTime() > agora)
      .map((row) => String(row.modulo || '').toLowerCase())
      .filter((slug) => MODULOS_PRIORIDADE.includes(slug));

    return MODULOS_PRIORIDADE.filter((slug) => ativos.includes(slug));
  } catch (e) {
    console.warn('[LOGIN] Falha ao ler empresa_modulos:', e.message, '— fallback comercial.');
    return null;
  }
}

// Mesma logica de api/secure-proxy.js (mantenha as duas em sincronia --
// Vercel nao permite import compartilhado aqui sem complicar o teste que
// carrega este arquivo como script isolado). Quando ALLOWED_ORIGINS nao
// esta configurado, o fallback e "mesma origem" (Origin bate com o Host da
// requisicao) em vez de refletir qualquer Origin de volta -- esse endpoint
// lida com senha e emite token de sessao, entao o CORS aberto por omissao
// que existia antes era mais grave aqui do que em qualquer outra rota.
function _getAllowedOrigins() {
  return process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
}

function _origemBateComHost(req) {
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  if (!origin || !host) return false;
  return origin === 'https://' + host || origin === 'http://' + host;
}

function setCorsHeaders(req, res) {
  const allowed = _getAllowedOrigins();
  const origin = req.headers.origin || '';
  const corsOrigin = allowed.length
    ? (allowed.includes(origin) ? origin : '')
    : (_origemBateComHost(req) ? origin : '');
  if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
}

function isOriginAllowed(req) {
  const allowed = _getAllowedOrigins();
  if (allowed.length) {
    const origin = req.headers.origin || '';
    return allowed.includes(origin);
  }
  return _origemBateComHost(req);
}

// Limite de tentativas por email+IP, em memoria: vale por instancia da Vercel,
// igual ao rate limit do secure-proxy. Nao e global.
const LOGIN_FALHAS = new Map();
const LOGIN_MAX_FALHAS = 5;
const LOGIN_JANELA_MS = 15 * 60 * 1000;
const LOGIN_BLOQUEIO_MS = 15 * 60 * 1000;

function loginChave(email, ip) {
  return String(email || '').toLowerCase() + '|' + ip;
}

function loginBloqueado(chave, now = Date.now()) {
  const e = LOGIN_FALHAS.get(chave);
  if (!e || !e.bloqueadoAte) return false;
  if (now < e.bloqueadoAte) return true;
  LOGIN_FALHAS.delete(chave);
  return false;
}

function loginRegistrarFalha(chave, now = Date.now()) {
  let e = LOGIN_FALHAS.get(chave);
  if (!e || now - e.inicio > LOGIN_JANELA_MS) e = { inicio: now, falhas: 0, bloqueadoAte: 0 };
  e.falhas += 1;
  if (e.falhas >= LOGIN_MAX_FALHAS) e.bloqueadoAte = now + LOGIN_BLOQUEIO_MS;
  LOGIN_FALHAS.set(chave, e);
  if (LOGIN_FALHAS.size > 5000) {
    for (const [k, v] of LOGIN_FALHAS.entries()) {
      if (now - v.inicio > LOGIN_JANELA_MS && (!v.bloqueadoAte || now >= v.bloqueadoAte)) LOGIN_FALHAS.delete(k);
    }
  }
}

function loginLimpar(chave) {
  LOGIN_FALHAS.delete(chave);
}

function ipCliente(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  const primeiro = xff ? String(xff).split(',')[0].trim() : '';
  return primeiro || (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Metodo nao permitido' });

  if (!isOriginAllowed(req)) {
    return res.status(403).json({ erro: 'Origem nao autorizada.' });
  }
  const xrw = req.headers['x-requested-with'] || '';
  if (xrw.toLowerCase() !== 'xmlhttprequest') {
    return res.status(403).json({ erro: 'Requisicao nao autorizada.' });
  }

  const payload = parseBody(req.body);
  const email = typeof payload.email === 'string' ? payload.email.trim() : payload.email;
  const senha = payload.senha || payload.password;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Email e senha sao obrigatorios.' });
  }

  const supaUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supaUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ erro: 'Variaveis do Supabase nao configuradas na Vercel.' });
  }

  const chaveLogin = loginChave(email, ipCliente(req));
  if (loginBloqueado(chaveLogin)) {
    return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  }

  try {
    const authResp = await fetch(`${supaUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey
      },
      body: JSON.stringify({ email, password: senha })
    });

    const authData = await authResp.json();
    if (!authResp.ok || !authData.access_token) {
      // Não expor error_description do Supabase — pode conter PII ou detalhes internos
      loginRegistrarFalha(chaveLogin);
      return res.status(401).json({ erro: 'Email ou senha incorretos.' });
    }
    loginLimpar(chaveLogin);

    const emailNormalizado = String(email).toLowerCase();
    const userResp = await fetch(
      `${supaUrl}/rest/v1/usuarios?email=ilike.${encodeURIComponent(emailNormalizado)}&select=*,empresas(*)`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );

    const users = await userResp.json();
    const roleWeight = { super_admin: 3, admin: 2, gestor: 1, cliente: 0 };
    const user = Array.isArray(users) && users.length
      ? users.slice().sort((a, b) => {
          const aRole = roleWeight[String(a?.papel || '').toLowerCase()] ?? -1;
          const bRole = roleWeight[String(b?.papel || '').toLowerCase()] ?? -1;
          if (bRole !== aRole) return bRole - aRole;
          const aEmpresa = a?.empresa_id ? 1 : 0;
          const bEmpresa = b?.empresa_id ? 1 : 0;
          return bEmpresa - aEmpresa;
        })[0]
      : null;

    // Todas as falhas pós-auth retornam 401 com mensagem genérica
    // para evitar user enumeration (não revelar se o problema é conta, papel ou empresa)
    const MSG_ACESSO_NEGADO = 'Acesso nao autorizado. Verifique suas credenciais ou contate o administrador.';

    if (!user) {
      console.warn('[LOGIN] Auth OK mas sem registro em usuarios, id=' + loginIdentificador(emailNormalizado));
      return res.status(401).json({ erro: MSG_ACESSO_NEGADO });
    }

    if (user.ativo === false) {
      console.warn('[LOGIN] Usuario inativo tentou login, id=' + loginIdentificador(emailNormalizado));
      return res.status(401).json({ erro: MSG_ACESSO_NEGADO });
    }

    var empresaRelacion = Array.isArray(user.empresas) ? (user.empresas[0] || {}) : (user.empresas || {});
    if (user.papel !== 'super_admin' && empresaRelacion.ativo === false) {
      console.warn('[LOGIN] Empresa inativa para usuario, id=' + loginIdentificador(emailNormalizado));
      return res.status(401).json({ erro: MSG_ACESSO_NEGADO });
    }

    // O registro de acesso e informativo e nao deve impedir um login valido.
    try {
      const userId = authData.user && authData.user.id ? authData.user.id : user.id;
      const userFilter = userId
        ? `id=eq.${encodeURIComponent(userId)}`
        : `email=ilike.${encodeURIComponent(emailNormalizado)}`;
      await fetch(`${supaUrl}/rest/v1/usuarios?${userFilter}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ ultimo_acesso: new Date().toISOString() })
      });
    } catch (accessError) {
      console.warn('[LOGIN] Nao foi possivel registrar ultimo_acesso:', accessError.message);
    }

    var empresaIds = null;
    if (user.empresa_ids) {
      try { empresaIds = JSON.parse(user.empresa_ids); } catch (e) { empresaIds = null; }
    }

    // ── Modulos SaaS contratados ────────────────────────────────────────────
    // O gate real de dado esta na RLS + no secure-proxy. Isto aqui so diz ao
    // frontend o que ele deve desenhar.
    let modulos;
    if (user.papel === 'super_admin') {
      modulos = MODULOS_PRIORIDADE.slice();
    } else {
      const contratados = await buscarModulosEmpresa(supaUrl, serviceKey, user.empresa_id);
      if (contratados === null) {
        // Sem registro de contrato (ou consulta indisponivel): preserva o
        // comportamento historico do sistema.
        modulos = ['comercial'];
      } else if (!contratados.length) {
        // Ha contrato cadastrado, mas nenhum modulo vigente.
        console.warn('[LOGIN] Empresa sem modulo vigente, id=' + loginIdentificador(emailNormalizado));
        return res.status(401).json({ erro: MSG_ACESSO_NEGADO });
      } else {
        modulos = contratados;
      }
    }

    return res.status(200).json({
      modulos: modulos,
      modulo_padrao: modulos[0],
      token: authData.access_token,
      access_token: authData.access_token,
      nome: user.nome || email,
      email: emailNormalizado,
      papel: user.papel || 'cliente',
      empresa_id: user.empresa_id || null,
      empresa_ids: empresaIds || (user.empresa_id ? [user.empresa_id] : null),
      empresa_nome: empresaRelacion.nome || user.empresa_nome || 'RESUTE',
      empresa_slug: empresaRelacion.slug || null,
      empresa_logo_url: empresaRelacion.logo_url || null,
      empresa_funcoes: empresaRelacion.funcoes || {},
      empresa_codigo: empresaRelacion.codigo_empresa
        || empresaRelacion.codigo_cliente
        || empresaRelacion.codigo_cliente_id
        || empresaRelacion.visual_codigo_empresa
        || empresaRelacion.visual_codigo_cliente
        || user.codigo_empresa
        || user.codigo_cliente
        || user.codigo_cliente_id
        || user.visual_codigo_empresa
        || user.visual_codigo_cliente
        || null
    });
  } catch (e) {
    console.error('[LOGIN] Erro interno:', e.message);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente.' });
  }
}
