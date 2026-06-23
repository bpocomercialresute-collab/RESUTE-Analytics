// api/sync-log.js — Retorna o log de sincronização da empresa

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token      = req.headers.authorization?.replace('Bearer ', '');
  const empresa_id = req.query.empresa_id;
  if (!token || !empresa_id) return res.status(400).json({ erro: 'Parâmetros obrigatórios' });

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const resp = await fetch(
      `${SUPA_URL}/rest/v1/sync_log?empresa_id=eq.${empresa_id}&select=*`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${token}` } }
    );
    const data = await resp.json();
    return res.status(200).json(data[0] || {});
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}