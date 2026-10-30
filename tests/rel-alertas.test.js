const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/bd.js'), 'utf8');

function carregar() {
  const ctx = {
    window: {},
    document: { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; } },
    console,
  };
  ctx.window.BD_DATA = { headers: [], rows: [], count: 0 };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  ctx.window.IDX = { vendedor: 1, produto: 2, cliente: 3, grupo: 4, marca: 5, ano: 6, mes: 7, valor: 8, qtd: 9, saida: 10, emissao: 11 };
  return ctx;
}

function linha(ctx, campos) {
  const r = [];
  Object.keys(campos).forEach((k) => { r[ctx.window.IDX[k]] = campos[k]; });
  return r;
}

function dataHaDias(dias) {
  const d = new Date(Date.now() - dias * 86400000);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

test('alertas clientes: flagga quem tem 2+ compras e a ultima foi ha 60+ dias', () => {
  const ctx = carregar();
  const rows = [
    linha(ctx, { cliente: 'Cliente A', saida: dataHaDias(200) }),
    linha(ctx, { cliente: 'Cliente A', saida: dataHaDias(90) }),
    linha(ctx, { cliente: 'Cliente B', saida: dataHaDias(30) }),
    linha(ctx, { cliente: 'Cliente B', saida: dataHaDias(10) }),
    linha(ctx, { cliente: 'Cliente C (so 1 compra)', saida: dataHaDias(300) }),
  ];
  const alertas = ctx.relAlertasClientesParados(rows);
  const nomes = alertas.map((a) => a.cliente);
  assert.deepEqual(Array.from(nomes), ['Cliente A'], 'so Cliente A: parado ha 90 dias e com 2+ compras');
  assert.equal(alertas[0].totalCompras, 2);
  assert.equal(alertas[0].dias >= 89 && alertas[0].dias <= 91, true);
});

test('alertas clientes: lista vazia quando ninguem parou', () => {
  const ctx = carregar();
  const rows = [
    linha(ctx, { cliente: 'Cliente A', saida: dataHaDias(10) }),
    linha(ctx, { cliente: 'Cliente A', saida: dataHaDias(5) }),
  ];
  assert.deepEqual(Array.from(ctx.relAlertasClientesParados(rows)), []);
});

function linhaProduto(ctx, produto, ano, mesIdx, valor) {
  const MES_NOME = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return linha(ctx, { produto, ano: String(ano), mes: MES_NOME[mesIdx], valor });
}

test('alertas produtos: flagga queda de 30%+ contra a media dos periodos anteriores', () => {
  const ctx = carregar();
  const rows = [
    // Produto X: 1000, 1000, 200 (queda de 80% no ultimo periodo) -> flagga
    linhaProduto(ctx, 'Produto X', 2026, 0, 1000),
    linhaProduto(ctx, 'Produto X', 2026, 1, 1000),
    linhaProduto(ctx, 'Produto X', 2026, 2, 200),
    // Produto Y: 100, 100, 100 (sem queda) -> nao flagga
    linhaProduto(ctx, 'Produto Y', 2026, 0, 100),
    linhaProduto(ctx, 'Produto Y', 2026, 1, 100),
    linhaProduto(ctx, 'Produto Y', 2026, 2, 100),
    // Produto Z: 10, 10, 1 (sempre vendeu quase nada) -> piso de ruido corta, mesmo com queda % alta
    linhaProduto(ctx, 'Produto Z', 2026, 0, 10),
    linhaProduto(ctx, 'Produto Z', 2026, 1, 10),
    linhaProduto(ctx, 'Produto Z', 2026, 2, 1),
    // Produto W: 500, 500, sumiu no ultimo periodo (sem linha nenhuma em mar/2026) -> queda de 100%
    linhaProduto(ctx, 'Produto W', 2026, 0, 500),
    linhaProduto(ctx, 'Produto W', 2026, 1, 500),
  ];
  const alertas = ctx.relAlertasProdutosQueda(rows);
  const nomes = alertas.map((a) => a.produto);
  assert.deepEqual(Array.from(nomes.sort()), ['Produto W', 'Produto X'].sort());

  const w = alertas.find((a) => a.produto === 'Produto W');
  assert.equal(w.atual, 0);
  assert.equal(w.quedaPct, 1);

  const x = alertas.find((a) => a.produto === 'Produto X');
  assert.equal(x.mediaAnterior, 1000);
  assert.equal(x.atual, 200);
  assert.ok(Math.abs(x.quedaPct - 0.8) < 1e-9);
});

test('alertas produtos: sem periodos suficientes (so 1 mes de dado) nao quebra, devolve vazio', () => {
  const ctx = carregar();
  const rows = [linhaProduto(ctx, 'Produto Unico', 2026, 0, 1000)];
  assert.deepEqual(Array.from(ctx.relAlertasProdutosQueda(rows)), []);
});

test('bdUpdateAlertas: sem elemento na pagina, nao quebra (fase de carregamento antes de abrir a aba)', () => {
  const ctx = carregar();
  ctx.window.BD_DATA.rows = [linhaProduto(ctx, 'Produto X', 2026, 0, 1000)];
  assert.doesNotThrow(() => ctx.bdUpdateAlertas());
});
