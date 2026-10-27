const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');

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

function carregar(extra) {
  const ctx = Object.assign({ console: { info() {}, warn() {}, log() {} }, Math, JSON, Array, Number, String }, extra || {});
  vm.createContext(ctx);
  const bloco = source.slice(source.indexOf('var _DC_SLIM_FIELDS'), source.indexOf('function _dcSlimVenda'));
  vm.runInContext(bloco, ctx);
  vm.runInContext(extrair(source, '_dcSlimVenda'), ctx);
  vm.runInContext('var _DC_SNAPSHOT_MAX_ENVELOPE_BYTES = 4000000; var _DC_SNAPSHOT_FATOR_ENVELOPE = 1.17;', ctx);
  vm.runInContext(extrair(source, '_dcSnapshotCabe'), ctx);
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

test('snapshot: lista grande NAO e enviada (o proxy responderia 413) e nada pesado e montado', async () => {
  let chamadas = 0;
  const ctx = carregar({ window: { ReportCache: { cacheKey: () => 'k', save: async () => { chamadas += 1; return true; } } } });
  const lista = vendas(30000);
  assert.equal(ctx._dcSnapshotCabe(lista), false);
  assert.equal(await ctx.dcSalvarSnapshotCliente('e1', 'api', lista), false);
  assert.equal(chamadas, 0, 'nao deve nem chamar o save');
});

test('snapshot: a estimativa por amostra concorda com o tamanho real do envelope (margem de 15%)', () => {
  const ctx = carregar({ window: {} });
  [2000, 5000, 9000, 12000, 30000].forEach((n) => {
    const lista = vendas(n);
    const real = bytesEnvelope(lista, ctx);
    const cabe = ctx._dcSnapshotCabe(lista);
    // O limite real da plataforma e ~4,5 MB; usamos 4,0 MB de folga.
    if (real < 3.4e6) assert.equal(cabe, true, `${n} linhas (${real} bytes) deveriam caber`);
    if (real > 4.6e6) assert.equal(cabe, false, `${n} linhas (${real} bytes) nao deveriam caber`);
  });
});

test('snapshot: nunca aprova algo que passe de 4,5 MB reais', () => {
  const ctx = carregar({ window: {} });
  for (let n = 1000; n <= 40000; n += 1000) {
    const lista = vendas(n);
    if (ctx._dcSnapshotCabe(lista)) {
      assert.ok(bytesEnvelope(lista, ctx) < 4.5 * 1024 * 1024, `${n} linhas aprovadas mas excedem 4,5 MB`);
    }
  }
});

test('snapshot: lista vazia ou invalida nao quebra', () => {
  const ctx = carregar({ window: {} });
  assert.equal(ctx._dcSnapshotCabe([]), true);
  assert.equal(ctx._dcSnapshotCabe(null), true);
});
