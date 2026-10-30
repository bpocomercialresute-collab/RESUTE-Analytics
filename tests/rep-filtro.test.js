const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8') + '\n'
  + fs.readFileSync(path.join(root, 'js/relatrep.js'), 'utf8');

function g(row, key) {
  const i = window_IDX()[key];
  return (i >= 0 && row[i] !== undefined) ? String(row[i]).trim() : '';
}
let CTX_ATUAL = null;
function window_IDX() { return CTX_ATUAL.IDX; }

function carregar() {
  const ctx = {
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
    },
    console,
    g,
    setTimeout,
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    SUPA_URL: 'https://x.test',
    SESSION: { papel: 'admin', empresa_id: 'EMP1' },
    EMPRESA_ATIVA: { empresa_id: 'EMP1' },
  };
  ctx.window = ctx;
  ctx.BD_DATA = { headers: [], rows: [], count: 0 };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  ctx.IDX = { vendedor: 1, produto: 2, cliente: 3, grupo: 4, marca: 5, ano: 6, mes: 7, valor: 8, qtd: 9 };
  // Isola o teste do pipeline de renderizacao dos 7 relatorios (repMix,
  // repPositiv etc, disparados por repUpdateAll a cada mudanca de filtro) --
  // aqui o alvo e so a logica do filtro em si, nao a renderizacao das abas.
  ctx.repUpdateAll = function () {};
  CTX_ATUAL = ctx;
  return ctx;
}

function linha(ctx, campos) {
  const r = [];
  Object.keys(campos).forEach((k) => { r[ctx.IDX[k]] = campos[k]; });
  return r;
}

test('repFilter: sem nenhum filtro, repDataRows devolve tudo', () => {
  const ctx = carregar();
  ctx.BD_DATA.rows = [
    linha(ctx, { vendedor: 'JOAO', produto: 'A', cliente: 'CLI1', grupo: 'G1', marca: 'M1' }),
    linha(ctx, { vendedor: 'MARIA', produto: 'B', cliente: 'CLI2', grupo: 'G2', marca: 'M2' }),
  ];
  assert.equal(ctx.repDataRows().length, 2);
});

test('repFilter: REP_FILTER agora e array em todo campo (nao so produto)', () => {
  const ctx = carregar();
  assert.ok(Array.isArray(ctx.REP_FILTER.vendedor));
  assert.ok(Array.isArray(ctx.REP_FILTER.cliente));
  assert.ok(Array.isArray(ctx.REP_FILTER.grupo));
  assert.ok(Array.isArray(ctx.REP_FILTER.marca));
  assert.ok(Array.isArray(ctx.REP_FILTER.produto));
});

test('repFilter: aplicar filtro de vendedor restringe repDataRows e repGetVendedores', () => {
  const ctx = carregar();
  ctx.BD_DATA.rows = [
    linha(ctx, { vendedor: 'JOAO', produto: 'A', cliente: 'CLI1', grupo: 'G1', marca: 'M1' }),
    linha(ctx, { vendedor: 'MARIA', produto: 'B', cliente: 'CLI2', grupo: 'G2', marca: 'M2' }),
  ];
  ctx.REP_FILTER.vendedor = ['JOAO'];
  assert.equal(ctx.repDataRows().length, 1);
  assert.deepEqual(Array.from(ctx.repGetVendedores()), ['JOAO']);
});

test('repFilter: dropdown de um campo so lista valores que ainda existem com os outros filtros ja aplicados', () => {
  const ctx = carregar();
  ctx.BD_DATA.rows = [
    linha(ctx, { vendedor: 'JOAO', produto: 'VASSOURA', cliente: 'CLI1', grupo: 'VASSOURAS', marca: 'M1' }),
    linha(ctx, { vendedor: 'JOAO', produto: 'CABO', cliente: 'CLI1', grupo: 'CABOS', marca: 'M1' }),
    linha(ctx, { vendedor: 'MARIA', produto: 'CABO', cliente: 'CLI2', grupo: 'CABOS', marca: 'M2' }),
  ];
  ctx.REP_FILTER.vendedor = ['JOAO'];
  assert.deepEqual(Array.from(ctx.repOpcoesDisponiveis('produto')).sort(), ['CABO', 'VASSOURA'].sort());

  ctx.REP_FILTER.grupo = ['VASSOURAS'];
  assert.deepEqual(Array.from(ctx.repOpcoesDisponiveis('produto')), ['VASSOURA']);
});

test('repFilter: abrir, marcar todos (respeitando busca) e aplicar atualiza REP_FILTER', () => {
  const ctx = carregar();
  ctx.BD_DATA.rows = [
    linha(ctx, { vendedor: 'JOAO', produto: 'VASSOURA S10' }),
    linha(ctx, { vendedor: 'JOAO', produto: 'VASSOURA S10 COLOR' }),
    linha(ctx, { vendedor: 'JOAO', produto: 'CABO 1,10' }),
  ];
  ctx.repAbrirMultiDropdown('produto');
  ctx.repBuscarMultiItem('produto', 'vassoura');
  ctx.repSelecionarTodosMulti('produto');
  ctx.repAplicarMultiDropdown('produto');
  assert.deepEqual(Array.from(ctx.REP_FILTER.produto).sort(), ['VASSOURA S10', 'VASSOURA S10 COLOR'].sort());
  assert.equal(ctx.repMultiState('produto').open, false);
});

test('repFilter: limpar filtros zera todos os campos (array vazio) e fecha estado dos dropdowns', () => {
  const ctx = carregar();
  ctx.REP_FILTER.vendedor = ['JOAO'];
  ctx.repMultiState('vendedor').open = true;
  ctx.repLimparFiltros();
  Object.keys(ctx.REP_FILTER).forEach((campo) => {
    assert.deepEqual(Array.from(ctx.REP_FILTER[campo]), []);
  });
  assert.equal(ctx.repMultiState('vendedor').open, false);
});
