// api/empresas.js — Lista empresas com API configurada (super_admin)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ erro: 'Token obrigatório' });

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    // Busca empresas com API configurada
    const r = await fetch(
      `${SUPA_URL}/rest/v1/api_config?select=empresa_id,sistema,empresas(nome,slug,exibir_origem)&ativo=eq.true`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${token}` } }
    );
    const data = await r.json();

    const empresas = (data || [])
      .filter(d => d.empresas && String(d.empresas.exibir_origem || '').toLowerCase() === 'api')
      .map(d => ({
        empresa_id: d.empresa_id,
        nome:       d.empresas.nome,
        slug:       d.empresas.slug,
        sistema:    d.sistema
      }));

    return res.status(200).json({ empresas });
  } catch(e) {
    return res.status(500).json({ erro: e.message });
  }
}
