// api/sync.js — Vercel Serverless Function
// Dispara a sincronização incremental com a API da empresa

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const { empresa_id } = req.body;
  if (!empresa_id) return res.status(400).json({ erro: 'empresa_id obrigatório' });

  const SUPA_URL      = process.env.SUPABASE_URL;
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
  const EDGE_SYNC_URL = `${SUPA_URL}/functions/v1/sync-visual-saef`;

  try {
    const resp = await fetch(EDGE_SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`
      },
      body: JSON.stringify({ empresa_id })
    });
    const data = await resp.json();
    return res.status(resp.ok ? 200 : 500).json(data);
  } catch (e) {
    return res.status(500).json({ erro: 'Erro ao sincronizar: ' + e.message });
  }
}