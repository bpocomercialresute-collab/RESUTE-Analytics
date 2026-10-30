const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
const proxySource = fs.readFileSync(path.join(root, 'api/secure-proxy.js'), 'utf8');

function extrair(src, nome) {
  const m = src.match(new RegExp('(async\\s+)?function\\s+' + nome + '\\s*\\('));
  assert.ok(m, `funcao ${nome} nao encontrada`);
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') depth -= 1;
    if (depth === 0) return src.slice(m.index, i + 1);
  }
  throw new Error(`funcao ${nome} incompleta`);
}

function extrairVar(src, nome) {
  const m = src.match(new RegExp('var\\s+' + nome + '\\s*=\\s*[^;]+;'));
  assert.ok(m, `variavel ${nome} nao encontrada`);
  return m[0];
}

// Le o limite real do corpo aceito pelo proxy direto do codigo que o aplica,
// em vez de duplicar o numero aqui -- foi exatamente essa duplicacao (4,0 MB
// no calculo do snapshot vs 2 MB real no proxy) que ficou desalinhada antes.
function limiteRealProxy() {
  const m = proxySource.match(/contentLength\s*>\s*([^)]+)\)/);
  assert.ok(m, 'checagem de contentLength nao encontrada em secure-proxy.js');
  return Function('return (' + m[1] + ')')();
}
const LIMITE_PROXY_REAL = limiteRealProxy();

function carregar(extra) {
  const ctx = Object.assign({ console: { info() {}, warn() {}, log() {} }, Math, JSON, Array, Number, String }, extra || {});
  vm.createContext(ctx);
  const bloco = source.slice(source.indexOf('var _DC_SLIM_FIELDS'), source.indexOf('function _dcSlimVenda'));
  vm.runInContext(bloco, ctx);
  vm.runInContext(extrair(source, '_dcSlimVenda'), ctx);
  vm.runInContext(extrairVar(source, '_DC_SNAPSHOT_MAX_ENVELOPE_BYTES'), ctx);
  vm.runInContext(extrairVar(source, '_DC_SNAPSHOT_FATOR_ENVELOPE'), ctx);
  vm.runInContext(extrair(source, '_dcSnapshotCabe'), ctx);
  vm.runInContext(extrair(source, '_dcDividirSlimEmPedacos'), ctx);
  vm.runInContext(extrair(source, 'dcSalvarSnapshotCliente'), ctx);
  return ctx;
}

function vendas(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1, empresa_id: 'e', origem: 'api', id_externo: 'api_' + String(i).padStart(8, '0'),
    num_pedido: 'P' + String(Math.floor(i / 3)).padStart(7, '0'), produto: 'Produto linha ' + (i % 800) + ' modelo especial',
    qtd: 1 + (i % 20), dt_emissao: '2026-03-05', dt_saida: '2026-03-05', valor: 100 + (i % 900) + 0.55,
    vendedor: 'Vendedor ' + (i % 40), industria: 'Industria 1', cliente: 'Cliente Comercial ' + (i % 2000) + ' Ltda',
    ano: 2026, mes: '3', grupo: 'Grupo ' + (i % 25), grupo_produto: 'Grupo ' + (i % 25), marca: 'Marca ' + (i % 30),
    familia: 'Familia ' + (i % 40), uf: 'SP', cidade: 'Cidade ' + (i % 120)
  }));
}

// Mesmo calculo do que o proxy recebe: corpo do save dentro do envelope {url,method,headers,body}.
function bytesEnvelope(lista, ctx) {
  const slim = lista.map(ctx._dcSlimVenda);
  const corpo = JSON.stringify({ empresa_id: 'x', tipo: 'dashboard_cliente', dados: { vendas: slim } });
  return Buffer.byteLength(JSON.stringify({ url: 'https://x/rest/v1/relatorios_cache', method: 'POST', headers: {}, body: corpo }));
}

test('snapshot: lista pequena cabe e continua sendo salva', async () => {
  let chamadas = 0;
  const ctx = carregar({ window: { ReportCache: { cacheKey: () => 'k', save: async () => { chamadas += 1; return true; } } } });
  const lista = vendas(2000);
  assert.equal(ctx._dcSnapshotCabe(lista), true);
  assert.equal(await ctx.dcSalvarSnapshotCliente('e1', 'api', lista), true);
  assert.equal(chamadas, 1);
});

test('snapshot: lista grande demais pra uma linha e dividida em pedacos, cada um dentro do limite real do proxy', async () => {
  let baseRecebida = null;
  let pedacosRecebidos = null;
  const ctx = carregar({
    window: {
      ReportCache: {
        cacheKey: () => 'k',
        save: async () => true,
        saveChunked: async (base, pedacos) => { baseRecebida = base; pedacosRecebidos = pedacos; return true; }
      }
    }
  });
  const lista = vendas(30000);
  assert.equal(ctx._dcSnapshotCabe(lista), false);
  assert.equal(await ctx.dcSalvarSnapshotCliente('e1', 'api', lista), true);
  assert.ok(pedacosRecebidos && pedacosRecebidos.length > 1, 'deveria dividir em mais de um pedaco');

  pedacosRecebidos.forEach((pedaco) => {
    const corpo = JSON.stringify({ empresa_id: 'x', tipo: 'dashboard_cliente_parte', dados: { vendas: pedaco } });
    const bytes = Buffer.byteLength(JSON.stringify({ url: 'https://x/rest/v1/relatorios_cache', method: 'POST', headers: {}, body: corpo }));
    assert.ok(bytes < LIMITE_PROXY_REAL, `pedaco de ${pedaco.length} linhas (${bytes} bytes) excede o limite real de ${LIMITE_PROXY_REAL}`);
  });

  const totalReconstruido = pedacosRecebidos.reduce((s, p) => s + p.length, 0);
  assert.equal(totalReconstruido, lista.length, 'juntando os pedacos tem que bater com o total original');
  assert.equal(baseRecebida.total_registros, lista.length);
});

test('snapshot: a estimativa por amostra concorda com o tamanho real do envelope (margem de 15%)', () => {
  const ctx = carregar({ window: {} });
  const codigo = ctx._DC_SNAPSHOT_MAX_ENVELOPE_BYTES;
  [2000, 5000, 9000, 12000, 30000].forEach((n) => {
    const lista = vendas(n);
    const real = bytesEnvelope(lista, ctx);
    const cabe = ctx._dcSnapshotCabe(lista);
    // Limite do calculo (folga abaixo do limite real do proxy); 15% de margem
    // pra cobrir o erro da estimativa por amostra pra mais ou pra menos.
    if (real < codigo * 0.85) assert.equal(cabe, true, `${n} linhas (${real} bytes) deveriam caber`);
    if (real > codigo * 1.15) assert.equal(cabe, false, `${n} linhas (${real} bytes) nao deveriam caber`);
  });
});

test('snapshot: nunca aprova algo que passe do limite real do proxy', () => {
  const ctx = carregar({ window: {} });
  for (let n = 1000; n <= 40000; n += 1000) {
    const lista = vendas(n);
    if (ctx._dcSnapshotCabe(lista)) {
      assert.ok(bytesEnvelope(lista, ctx) < LIMITE_PROXY_REAL, `${n} linhas aprovadas mas excedem o limite real de ${LIMITE_PROXY_REAL} bytes`);
    }
  }
});

test('snapshot: lista vazia ou invalida nao quebra', () => {
  const ctx = carregar({ window: {} });
  assert.equal(ctx._dcSnapshotCabe([]), true);
  assert.equal(ctx._dcSnapshotCabe(null), true);
});
