function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (e) { return {}; }
  }
  return body;
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

  const supaUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supaUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ erro: 'Variaveis do Supabase nao configuradas na Vercel.' });
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
      return res.status(401).json({ erro: authData.error_description || 'Email ou senha incorretos.' });
    }

    const emailNormalizado = String(email).toLowerCase();
    const userResp = await fetch(
      `${supaUrl}/rest/v1/usuarios?email=ilike.${encodeURIComponent(emailNormalizado)}&select=*`,
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

    if (!user) {
      return res.status(403).json({
        erro: 'Usuário autenticado, mas sem cadastro válido na tabela usuarios. Verifique email e papel do acesso no painel.'
      });
    }

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
      empresa_nome: user.empresa_nome || 'RESUTE'
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro interno: ' + e.message });
  }
}
