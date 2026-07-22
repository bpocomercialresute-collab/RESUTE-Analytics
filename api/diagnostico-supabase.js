import dns from 'node:dns/promises';

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

function mask(value) {
  if (!value) return null;
  if (value.length <= 12) return value[0] + '...' + value[value.length - 1];
  return value.slice(0, 6) + '...' + value.slice(-6);
}

function maskUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol + '//' + mask(url.hostname);
  } catch (e) {
    return 'URL invalida';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Metodo nao permitido' });

  const supaUrl = cleanBaseUrl(envFirst(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL']) || DEFAULT_SUPABASE_URL);
  const anonKey = envFirst(['SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']);
  const serviceKey = envFirst(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE', 'SUPABASE_SECRET_KEY']);

  let dnsStatus = 'nao_testado';
  let dnsErro = null;
  try {
    const hostname = new URL(supaUrl).hostname;
    const result = await dns.lookup(hostname);
    dnsStatus = result && result.address ? 'ok' : 'sem_endereco';
  } catch (e) {
    dnsStatus = 'falhou';
    dnsErro = e && (e.code || e.message) ? String(e.code || e.message) : 'erro desconhecido';
  }

  return res.status(200).json({
    supabase_url_configurada: !!supaUrl,
    supabase_url_mascarada: maskUrl(supaUrl),
    supabase_url_formato_ok: /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supaUrl),
    supabase_anon_key_configurada: !!anonKey,
    supabase_service_role_key_configurada: !!serviceKey,
    dns_status: dnsStatus,
    dns_erro: dnsErro
  });
}
