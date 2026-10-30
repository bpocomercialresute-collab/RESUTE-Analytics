const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/relatrep.js'), 'utf8');

function g(row, key) {
  const i = (typeof window !== 'undefined' && window.IDX) ? window.IDX[key] : undefined;
  return (i >= 0 && row[i] !== undefined) ? String(row[i]).trim() : '';
}

function fakeLocalStorage() {
  const dados = new Map();
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => { dados.set(k, String(v)); },
    removeItem: (k) => { dados.delete(k); },
  };
}

function carregar(empresaId, storageCompartilhado) {
  const ctx = {
    document: { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; } },
    console,
    g,
    setTimeout,
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    SUPA_URL: 'https://x.test',
    localStorage: storageCompartilhado || fakeLocalStorage(),
    prompt: () => null,
    confirm: () => true,
    SESSION: { papel: 'admin', empresa_id: empresaId || 'EMP1' },
    EMPRESA_ATIVA: empresaId ? { empresa_id: empresaId } : null,
  };
  ctx.window = ctx;
  ctx.BD_DATA = { headers: [], rows: [], count: 0 };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  ctx.IDX = { vendedor: 1, produto: 2, cliente: 3, grupo: 4, marca: 5, ano: 6, mes: 7, valor: 8, qtd: 9 };
  // Isola do pipeline de renderizacao dos 7 relatorios -- aqui o alvo e so a
  // logica do preset em si.
  ctx.repUpdateAll = function () {};
  return ctx;
}

test('rep-presets: salvar grava a combinacao atual de REP_FILTER com nome', () => {
  const ctx = carregar('EMP1');
  ctx.REP_FILTER.vendedor = ['JOAO'];
  ctx.prompt = () => 'Minha analise';
  ctx.repPresetsSalvarAtual();
  const lista = ctx.repPresetsCarregar();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].nome, 'Minha analise');
  assert.deepEqual(Array.from(lista[0].filtro.vendedor), ['JOAO']);
});

test('rep-presets: aplicar restaura REP_FILTER exatamente como foi salvo', () => {
  const ctx = carregar('EMP1');
  ctx.REP_FILTER.produto = ['VASSOURA S10'];
  ctx.REP_FILTER.grupo = ['VASSOURAS'];
  ctx.prompt = () => 'Vassouras';
  ctx.repPresetsSalvarAtual();

  ctx.REP_FILTER = { vendedor: [], produto: [], cliente: [], grupo: [], marca: [] };
  ctx.repPresetsAplicar('Vassouras');
  assert.deepEqual(Array.from(ctx.REP_FILTER.produto), ['VASSOURA S10']);
  assert.deepEqual(Array.from(ctx.REP_FILTER.grupo), ['VASSOURAS']);
  assert.deepEqual(Array.from(ctx.REP_FILTER.vendedor), []);
});

test('rep-presets: apagar remove da lista', () => {
  const ctx = carregar('EMP1');
  ctx.prompt = () => 'Pra apagar';
  ctx.repPresetsSalvarAtual();
  assert.equal(ctx.repPresetsCarregar().length, 1);
  ctx.repPresetsApagar('Pra apagar');
  assert.equal(ctx.repPresetsCarregar().length, 0);
});

test('rep-presets: nome vazio ou cancelado nao salva nada', () => {
  const ctx = carregar('EMP1');
  ctx.prompt = () => null;
  ctx.repPresetsSalvarAtual();
  ctx.prompt = () => '   ';
  ctx.repPresetsSalvarAtual();
  assert.equal(ctx.repPresetsCarregar().length, 0);
});

test('rep-presets: lista e separada por empresa ativa (mesma chave de storage, empresas diferentes)', () => {
  const storage = fakeLocalStorage();
  const ctxA = carregar('EMP_A', storage);
  ctxA.prompt = () => 'So da empresa A';
  ctxA.repPresetsSalvarAtual();

  const ctxB = carregar('EMP_B', storage);
  assert.equal(ctxB.repPresetsCarregar().length, 0, 'empresa B nao deve ver preset salvo pela empresa A');
});

test('rep-presets e presets de Produtos (bd.js) usam namespaces de storage diferentes', () => {
  const ctx = carregar('EMP1');
  assert.notEqual(ctx.repPresetsChave(), 'resute_rel_presets_EMP1');
  assert.equal(ctx.repPresetsChave(), 'resute_rep_presets_EMP1');
});
