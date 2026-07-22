function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (e) { return {}; }
  }
  return body;
}

const DEFAULT_SUPABASE_URL = 'https://glfzevdsmmdvrwhplzkc.supabase.co';

function cleanEnv(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function cleanBaseUrl(value) {
  return cleanEnv(value).replace(/\/+$/, '');
}

function envFirst(names) {
  for (const name of names) {
    const value = cleanEnv(process.env[name]);
    if (value) return value;
  }
  return '';
}

function maskUrl(value) {
  try {
    const host = new URL(value).host;
    return host.length > 10 ? host.slice(0, 6) + '...' + host.slice(-12) : host;
  } catch (e) {
    return 'URL invalida';
  }
}

async function readJsonSafe(resp) {
  const text = await resp.text();
  try { return text ? JSON.parse(text) : {}; } catch (e) { return { raw: text }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Metodo nao permitido' });

  const payload = parseBody(req.body);
  const email = typeof payload.email === 'string' ? payload.email.trim() : payload.email;
  const senha = payload.senha || payload.password;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Email e senha sao obrigatorios.' });
  }

  const supaUrl = cleanBaseUrl(envFirst(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL']) || DEFAULT_SUPABASE_URL);
  const anonKey = envFirst(['SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']);
  const serviceKey = envFirst(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE', 'SUPABASE_SECRET_KEY']);

  if (!supaUrl || !anonKey || !serviceKey) {
    const faltando = [];
    if (!supaUrl) faltando.push('SUPABASE_URL');
    if (!anonKey) faltando.push('SUPABASE_ANON_KEY');
    if (!serviceKey) faltando.push('SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ erro: 'Variaveis do Supabase ausentes na Vercel Production: ' + faltando.join(', ') + '.' });
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supaUrl)) {
    return res.status(500).json({ erro: 'SUPABASE_URL invalida na Vercel. Use somente https://SEU-PROJETO.supabase.co, sem aspas e sem barra no final.' });
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

    const authData = await readJsonSafe(authResp);
    if (!authResp.ok || !authData.access_token) {
      return res.status(401).json({ erro: authData.error_description || 'Email ou senha incorretos.' });
    }

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

    const users = await readJsonSafe(userResp);
    if (!userResp.ok) {
      return res.status(500).json({ erro: 'Falha ao consultar tabela usuarios no Supabase. Verifique RLS, SERVICE_ROLE_KEY e schema public.' });
    }
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

    if (!user) {
      return res.status(403).json({
        erro: 'Usuário autenticado, mas sem cadastro válido na tabela usuarios. Verifique email e papel do acesso no painel.'
      });
    }

    var empresaRelacion = Array.isArray(user.empresas) ? (user.empresas[0] || {}) : (user.empresas || {});
    var empresaIds = null;
    if (user.empresa_ids) {
      try { empresaIds = JSON.parse(user.empresa_ids); } catch (e) { empresaIds = null; }
    }

    return res.status(200).json({
      token: authData.access_token,
      access_token: authData.access_token,
      nome: user.nome || email,
      email: emailNormalizado,
      papel: user.papel || 'cliente',
      empresa_id: user.empresa_id || null,
      empresa_ids: empresaIds || (user.empresa_id ? [user.empresa_id] : null),
      empresa_nome: empresaRelacion.nome || user.empresa_nome || 'RESUTE',
      empresa_slug: empresaRelacion.slug || null,
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
    const msg = e && e.message ? e.message : 'erro desconhecido';
    if (String(msg).toLowerCase().includes('fetch failed')) {
      return res.status(500).json({
        erro: 'Falha ao conectar no Supabase pela Vercel usando ' + maskUrl(supaUrl) + '. Confira se o projeto Supabase esta ativo e se SUPABASE_URL esta correta em Production.'
      });
    }
    return res.status(500).json({ erro: 'Erro interno: ' + msg });
  }
}
