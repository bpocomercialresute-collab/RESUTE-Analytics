// api/dados.js — Vercel Serverless Function
// Retorna os dados de vendas para geração dos relatórios

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token      = req.headers.authorization?.replace('Bearer ', '');
  const empresa_id = req.query.empresa_id;

  if (!token || !empresa_id) {
    return res.status(400).json({ erro: 'token e empresa_id obrigatórios' });
  }

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const resp = await fetch(
      `${SUPA_URL}/rest/v1/vendas?empresa_id=eq.${empresa_id}&select=*&order=dt_saida.asc&limit=50000`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${token}` } }
    );
    const vendas = await resp.json();
    return res.status(200).json({ vendas, total: vendas.length });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro ao buscar dados: ' + e.message });
  }
}