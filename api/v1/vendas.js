// api/v1/vendas.js — API publica de LEITURA de vendas, por empresa.
// Autenticada por chave de API (Authorization: Bearer <chave>), uma por
// empresa, gerada no console admin (super_admin). So leitura: nunca aceita
// escrita. Documentada em /api-docs.html (OpenAPI em /openapi.yaml).
//
// A chave nunca e guardada em texto puro (tabela api_keys so tem o hash
// sha256) -- mesmo padrao de senha. Comparar hash, nunca o valor cru.

import { createHash } from 'node:crypto';

function sha256Hex(texto) {
  return createHash('sha256').update(String(texto), 'utf8').digest('hex');
}

// Rate limit em memoria por instancia, por CHAVE de API (nao por IP -- um
// integrador legitimo pode estar atras de NAT compartilhado com outros).
const RATE_MAP = new Map();
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit(key) {
  const now = Date.now();
  const entry = RATE_MAP.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count += 1;
  }
  RATE_MAP.set(key, entry);
  if (RATE_MAP.size > 2000) {
    for (const [k, v] of RATE_MAP.entries()) {
      if (now - v.windowStart > RATE_WINDOW_MS) RATE_MAP.delete(k);
    }
  }
  return entry.count <= RATE_MAX;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const CAMPOS_PUBLICOS = [
  'id', 'id_externo', 'num_pedido', 'produto', 'qtd', 'dt_emissao', 'dt_saida',
  'valor', 'vendedor', 'cliente', 'ano', 'mes', 'grupo', 'grupo_produto',
  'marca', 'familia', 'uf', 'cidade', 'setor', 'tipo_mercado'
];

async function autenticar(req, env) {
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  const chave = m ? m[1].trim() : '';
  if (!chave) return { erro: 'Chave de API ausente. Use "Authorization: Bearer <chave>".', status: 401 };
  if (!checkRateLimit(sha256Hex(chave))) return { erro: 'Muitas requisicoes. Aguarde um minuto.', status: 429 };

  const hash = sha256Hex(chave);
  const resp = await fetch(
    env.supaUrl + '/rest/v1/api_keys?chave_hash=eq.' + encodeURIComponent(hash) + '&ativo=eq.true&select=id,empresa_id',
    { headers: { apikey: env.serviceKey, Authorization: 'Bearer ' + env.serviceKey } }
  );
  if (!resp.ok) return { erro: 'Falha ao validar chave.', status: 502 };
  const linhas = await resp.json();
  if (!Array.isArray(linhas) || !linhas.length) return { erro: 'Chave de API invalida ou revogada.', status: 401 };

  const registro = linhas[0];
  // Marca uso (sem travar a resposta nisso).
  fetch(env.supaUrl + '/rest/v1/api_keys?id=eq.' + registro.id, {
    method: 'PATCH',
    headers: { apikey: env.serviceKey, Authorization: 'Bearer ' + env.serviceKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ ultimo_uso_em: new Date().toISOString() })
  }).catch(() => {});

  return { empresaId: registro.empresa_id };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Metodo nao permitido. Use GET.' });

  const env = {
    supaUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  if (!env.supaUrl || !env.serviceKey) {
    return res.status(500).json({ erro: 'Variaveis seguras do Supabase nao configuradas na Vercel.' });
  }

  const auth = await autenticar(req, env);
  if (auth.erro) return res.status(auth.status).json({ erro: auth.erro });

  const q = req.query || {};
  const limite = Math.min(Math.max(parseInt(q.limite, 10) || 100, 1), 500);
  const pagina = Math.max(parseInt(q.pagina, 10) || 1, 1);
  const offset = (pagina - 1) * limite;

  let filtroData = '';
  if (q.data_inicio) {
    if (!DATA_RE.test(q.data_inicio)) return res.status(400).json({ erro: 'data_inicio invalida. Use AAAA-MM-DD.' });
    filtroData += '&dt_saida=gte.' + q.data_inicio;
  }
  if (q.data_fim) {
    if (!DATA_RE.test(q.data_fim)) return res.status(400).json({ erro: 'data_fim invalida. Use AAAA-MM-DD.' });
    filtroData += '&dt_saida=lte.' + q.data_fim;
  }

  const select = CAMPOS_PUBLICOS.join(',');
  const url = env.supaUrl + '/rest/v1/vendas?empresa_id=eq.' + encodeURIComponent(auth.empresaId)
    + filtroData + '&select=' + select + '&order=dt_saida.desc,id.asc'
    + '&limit=' + limite + '&offset=' + offset;

  try {
    const resp = await fetch(url, {
      headers: {
        apikey: env.serviceKey,
        Authorization: 'Bearer ' + env.serviceKey,
        Prefer: 'count=exact'
      }
    });
    if (!resp.ok) {
      const texto = await resp.text().catch(() => '');
      console.error('[api/v1/vendas] erro Supabase:', resp.status, texto.slice(0, 300));
      return res.status(502).json({ erro: 'Falha ao consultar vendas.' });
    }
    const dados = await resp.json();
    const contentRange = resp.headers.get('content-range') || '';
    const total = contentRange.includes('/') ? parseInt(contentRange.split('/')[1], 10) || dados.length : dados.length;

    return res.status(200).json({ dados, pagina, limite, total });
  } catch (e) {
    console.error('[api/v1/vendas]', e && e.message);
    return res.status(500).json({ erro: 'Erro interno ao consultar vendas.' });
  }
};
