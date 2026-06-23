// api/login.js — Vercel Serverless Function
// Autentica o usuário sem expor credenciais no browser

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Email e senha obrigatórios' });

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    // Autentica no Supabase Auth
    const authResp = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ email, password: senha })
    });
    const authData = await authResp.json();
    if (!authResp.ok || !authData.access_token) {
      return res.status(401).json({ erro: 'Email ou senha incorretos.' });
    }

    // Busca dados do usuário
    const userResp = await fetch(
      `${SUPA_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}&select=*,empresas(id,nome,slug)`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${authData.access_token}` } }
    );
    const users = await userResp.json();
    if (!users || !users.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    const u = users[0];
    return res.status(200).json({
      token:        authData.access_token,
      nome:         u.nome,
      email:        u.email,
      papel:        u.papel,
      empresa_id:   u.empresa_id || null,
      empresa_nome: u.empresas?.nome || 'RESUTE',
      empresa_slug: u.empresas?.slug || null
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro interno: ' + e.message });
  }
}