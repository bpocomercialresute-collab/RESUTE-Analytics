// api/log-error.js — recebe erro do navegador (window.onerror / unhandledrejection)
// e grava em error_log. Sem autenticacao (erro pode acontecer antes do login),
// entao tem rate limit mais apertado e cada campo e truncado/validado antes de
// gravar -- nunca confia no corpo da requisicao como veio.

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

// Rate limit em memoria por instancia (mesma limitacao documentada em
// api/secure-proxy.js) -- aqui mais apertado porque o endpoint nao exige
// sessao, e um loop de erro no cliente poderia tentar mandar centenas por
// segundo.
const RATE_MAP = new Map();
const RATE_MAX = 20;
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

function truncar(v, max) {
  const s = String(v == null ? '' : v);
  return s.length > max ? s.slice(0, max) : s;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 50 * 1024) {
    return res.status(413).json({ erro: 'Corpo excede o limite.' });
  }

  const rateLimitKey = req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'desconhecido';
  if (!checkRateLimit(rateLimitKey)) {
    // Falha silenciosa de proposito: um cliente em loop de erro nao deve
    // ganhar mais uma requisicao (e mais um log de erro) so por ter sido limitado.
    return res.status(204).end();
  }

  const supaUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !serviceKey) {
    return res.status(500).json({ erro: 'Variaveis do Supabase nao configuradas.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const mensagem = truncar(body.mensagem, 2000);
  if (!mensagem) return res.status(400).json({ erro: 'mensagem obrigatoria.' });

  const registro = {
    origem: 'cliente',
    mensagem: mensagem,
    stack: truncar(body.stack, 4000) || null,
    url: truncar(body.url, 500) || null,
    empresa_id: (typeof body.empresa_id === 'string' && UUID_RE.test(body.empresa_id)) ? body.empresa_id : null,
    user_email: truncar(body.user_email, 200) || null,
    contexto: body.contexto && typeof body.contexto === 'object' ? body.contexto : null
  };

  try {
    await fetch(`${supaUrl}/rest/v1/error_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(registro)
    });
  } catch (e) {
    // Nunca deixa uma falha de log de erro virar mais um erro pro cliente.
    console.error('[log-error] falha ao gravar:', e.message);
  }

  return res.status(204).end();
}
