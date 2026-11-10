const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');

function criarRes() {
  const res = {
    _status: 200,
    _json: null,
    _headers: {},
    _ended: false,
    status(code) { this._status = code; return this; },
    json(obj) { this._json = obj; return this; },
    setHeader(k, v) { this._headers[k] = v; return this; },
    end() { this._ended = true; return this; }
  };
  return res;
}

// api/v1/vendas.js e ESM (import/export). Carrega como script comum,
// removendo import/export, injeta fetch mockado via contexto.
function carregarHandler(fetchMock) {
  const src = fs.readFileSync(path.join(root, 'api/v1/vendas.js'), 'utf8')
    .replace(/^import \{ createHash \} from 'node:crypto';/m, '')
    .replace(/^export default /m, 'globalThis.__handler = ');
  const context = {
    createHash: crypto.createHash,
    fetch: fetchMock,
    console,
    Map,
    process: { env: { SUPABASE_URL: 'https://x.test', SUPABASE_SERVICE_ROLE_KEY: 'svc-key' } },
    encodeURIComponent,
    parseInt,
    Math,
    Date,
    JSON,
    Array
  };
  vm.createContext(context);
  vm.runInContext(src, context);
  return context.__handler;
}

function reqBase(overrides) {
  return Object.assign({ method: 'GET', headers: {}, query: {} }, overrides);
}

test('OPTIONS responde 204 com CORS aberto, sem autenticar', async () => {
  const handler = carregarHandler(async () => { throw new Error('nao deveria chamar fetch'); });
  const res = criarRes();
  await handler(reqBase({ method: 'OPTIONS' }), res);
  assert.equal(res._status, 204);
  assert.equal(res._headers['Access-Control-Allow-Origin'], '*');
});

test('metodo diferente de GET/OPTIONS e rejeitado', async () => {
  const handler = carregarHandler(async () => { throw new Error('nao deveria chamar fetch'); });
  const res = criarRes();
  await handler(reqBase({ method: 'POST' }), res);
  assert.equal(res._status, 405);
});

test('sem chave de API (Authorization ausente) retorna 401, sem chamar o banco', async () => {
  const handler = carregarHandler(async () => { throw new Error('nao deveria chamar fetch'); });
  const res = criarRes();
  await handler(reqBase({ headers: {} }), res);
  assert.equal(res._status, 401);
  assert.match(res._json.erro, /Chave de API ausente/);
});

test('chave invalida (nao encontrada no banco) retorna 401', async () => {
  const handler = carregarHandler(async (url) => {
    if (String(url).includes('/rest/v1/api_keys')) {
      return { ok: true, json: async () => [] };
    }
    throw new Error('nao deveria consultar vendas sem chave valida');
  });
  const res = criarRes();
  await handler(reqBase({ headers: { authorization: 'Bearer chave-errada' } }), res);
  assert.equal(res._status, 401);
  assert.match(res._json.erro, /invalida ou revogada/);
});

test('chave valida: consulta vendas da empresa certa e devolve dados/total', async () => {
  const chamadas = [];
  const handler = carregarHandler(async (url, opts) => {
    chamadas.push(String(url));
    if (String(url).includes('/rest/v1/api_keys?')) {
      return { ok: true, json: async () => [{ id: 'key-1', empresa_id: 'empresa-A' }] };
    }
    if (String(url).includes('/rest/v1/api_keys?id=eq.key-1')) {
      return { ok: true, json: async () => ({}) }; // PATCH de ultimo_uso_em
    }
    if (String(url).includes('/rest/v1/vendas')) {
      return {
        ok: true,
        json: async () => [{ id: '1', produto: 'Cadeira', valor: 100 }],
        headers: { get: (h) => (h === 'content-range' ? '0-0/1' : null) }
      };
    }
    throw new Error('URL inesperada: ' + url);
  });
  const res = criarRes();
  await handler(reqBase({ headers: { authorization: 'Bearer chave-boa' } }), res);
  assert.equal(res._status, 200);
  assert.equal(res._json.total, 1);
  assert.equal(res._json.dados.length, 1);
  assert.ok(chamadas.some((c) => c.includes('empresa_id=eq.empresa-A')), 'deveria filtrar por empresa_id da chave');
});

test('data_inicio mal formatada retorna 400 antes de consultar vendas', async () => {
  const handler = carregarHandler(async (url) => {
    if (String(url).includes('/rest/v1/api_keys?chave')) {
      return { ok: true, json: async () => [{ id: 'key-1', empresa_id: 'empresa-A' }] };
    }
    if (String(url).includes('/rest/v1/api_keys?id=eq.')) return { ok: true, json: async () => ({}) };
    throw new Error('nao deveria consultar vendas com data invalida');
  });
  const res = criarRes();
  await handler(reqBase({ headers: { authorization: 'Bearer chave-boa' }, query: { data_inicio: '01/01/2026' } }), res);
  assert.equal(res._status, 400);
});

test('limite e capado em 500 mesmo se pedir mais', async () => {
  let limiteUsado = null;
  const handler = carregarHandler(async (url) => {
    if (String(url).includes('/rest/v1/api_keys?chave')) {
      return { ok: true, json: async () => [{ id: 'key-1', empresa_id: 'empresa-A' }] };
    }
    if (String(url).includes('/rest/v1/api_keys?id=eq.')) return { ok: true, json: async () => ({}) };
    if (String(url).includes('/rest/v1/vendas')) {
      const m = /limit=(\d+)/.exec(String(url));
      limiteUsado = m ? parseInt(m[1], 10) : null;
      return { ok: true, json: async () => [], headers: { get: () => '0-0/0' } };
    }
    throw new Error('URL inesperada');
  });
  const res = criarRes();
  await handler(reqBase({ headers: { authorization: 'Bearer chave-boa' }, query: { limite: '99999' } }), res);
  assert.equal(limiteUsado, 500);
});
