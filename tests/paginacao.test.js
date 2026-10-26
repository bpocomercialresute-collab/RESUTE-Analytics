const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// Extrai uma função real do arquivo (mesmo método de commercial-data.test.js)
// e a executa num sandbox com fetch/mock controlados.
function extrairFuncao(source, name) {
  const match = source.match(new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\('));
  assert.ok(match, `funcao ${name} nao encontrada`);
  const start = match.index;
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`funcao ${name} incompleta`);
}

function carregar(arquivo, nome, contexto) {
  const source = fs.readFileSync(path.join(root, arquivo), 'utf8');
  const ctx = Object.assign({ console, Object, Promise, setTimeout, Math, Number, String }, contexto);
  vm.createContext(ctx);
  vm.runInContext(extrairFuncao(source, nome), ctx);
  return ctx[nome];
}

// Servidor falso de tabela com N linhas, paginado por Range (inclusive).
function servidorRange(total) {
  const pedidos = [];
  const dados = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const fetchFalso = async (_url, opts) => {
    const range = opts.headers.Range;
    const [ini, fim] = range.split('-').map(Number);
    pedidos.push(range);
    const fatia = dados.slice(ini, fim + 1);
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => fatia };
  };
  return { fetchFalso, pedidos };
}

test('repFetchAll: percorre todas as paginas e para quando a pagina vem menor', async () => {
  const srv = servidorRange(2500);
  const repFetchAll = carregar('js/relatrep.js', 'repFetchAll', {
    repProxyFetch: async (url, metodo, headers) => {
      const r = await srv.fetchFalso(url, { headers });
      return r;
    }
  });
  const linhas = await repFetchAll('/rest/v1/clientes_cad');
  assert.equal(linhas.length, 2500);
  assert.deepEqual(srv.pedidos, ['0-999', '1000-1999', '2000-2999']);
});

test('repFetchAll: para quando a pagina vem vazia (total exato de multiplo do tamanho)', async () => {
  const srv = servidorRange(2000);
  const repFetchAll = carregar('js/relatrep.js', 'repFetchAll', {
    repProxyFetch: async (url, m, headers) => srv.fetchFalso(url, { headers })
  });
  const linhas = await repFetchAll('/rest/v1/clientes_cad');
  assert.equal(linhas.length, 2000);
  assert.equal(srv.pedidos.length, 3);
});

test('repFetchAll: erro HTTP no meio vira excecao explicita com contagem', async () => {
  let chamada = 0;
  const repFetchAll = carregar('js/relatrep.js', 'repFetchAll', {
    repProxyFetch: async () => {
      chamada += 1;
      if (chamada === 1) return { ok: true, status: 200, json: async () => Array.from({ length: 1000 }, (_, i) => ({ i })) };
      return { ok: false, status: 500, json: async () => ({}) };
    }
  });
  await assert.rejects(() => repFetchAll('/rest/v1/x'), (e) => /HTTP 500/.test(e.message) && /apos 1000 registros/.test(e.message));
});

test('adminConsoleFetchAll: pagina com offset e para na pagina curta', async () => {
  const chamadas = [];
  const dados = Array.from({ length: 1200 }, (_, i) => ({ id: i }));
  const adminConsoleFetchAll = carregar('js/admin-console.js', 'adminConsoleFetchAll', {
    adminConsoleFetch: async (path) => {
      chamadas.push(path);
      const limit = Number(/limit=(\d+)/.exec(path)[1]);
      const offset = Number(/offset=(\d+)/.exec(path)[1]);
      return { data: dados.slice(offset, offset + limit) };
    }
  });
  const r = await adminConsoleFetchAll('/rest/v1/empresas?select=*', 500, 20);
  assert.equal(r.data.length, 1200);
  assert.equal(r.truncated, false);
  assert.equal(chamadas.length, 3);
  assert.match(chamadas[1], /offset=500/);
});

test('adminConsoleFetchAll: estourar maxPages sinaliza truncated (nao finge que esta completo)', async () => {
  const adminConsoleFetchAll = carregar('js/admin-console.js', 'adminConsoleFetchAll', {
    adminConsoleFetch: async () => ({ data: Array.from({ length: 500 }, (_, i) => ({ i })) })
  });
  const r = await adminConsoleFetchAll('/rest/v1/sync_log', 500, 3);
  assert.equal(r.data.length, 1500);
  assert.equal(r.truncated, true);
});

test('_fetchAll: pagina com Range ate o fim e devolve tudo', async () => {
  const srv = servidorRange(2500);
  const _fetchAll = carregar('js/auth.js', '_fetchAll', {
    fetch: srv.fetchFalso,
    toast: undefined,
    dcStatus: undefined
  });
  const linhas = await _fetchAll('/rest/v1/vendas', {});
  assert.equal(linhas.length, 2500);
  assert.deepEqual(srv.pedidos, ['0-999', '1000-1999', '2000-2999']);
});

test('_fetchAll: HTTP de erro vira excecao com contagem parcial', async () => {
  let chamada = 0;
  const _fetchAll = carregar('js/auth.js', '_fetchAll', {
    fetch: async () => {
      chamada += 1;
      if (chamada === 1) return { ok: true, status: 200, json: async () => Array.from({ length: 1000 }, (_, i) => ({ i })) };
      return { ok: false, status: 503, json: async () => ({}) };
    }
  });
  await assert.rejects(() => _fetchAll('/rest/v1/vendas', {}), (e) => /HTTP 503/.test(e.message) && /1\.000 registros/.test(e.message));
});
