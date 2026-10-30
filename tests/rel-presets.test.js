const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/bd.js'), 'utf8');

// Fake localStorage em memoria, por teste (cada carregar() comeca vazio).
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
    window: {},
    document: { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; } },
    localStorage: storageCompartilhado || fakeLocalStorage(),
    console,
    EMPRESA_ATIVA: empresaId ? { empresa_id: empresaId } : null,
    prompt: () => null,
    confirm: () => true,
  };
  ctx.window.BD_DATA = { headers: [], rows: [], count: 0 };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return ctx;
}

test('presets: salvar grava a combinacao atual de REL_FILTER com nome', () => {
  const ctx = carregar('EMP1');
  ctx.window.REL_FILTER.vendedor = ['JOAO'];
  ctx.window.REL_FILTER.ano = ['2026'];
  ctx.prompt = () => 'Minha analise';
  ctx.relPresetsSalvarAtual();
  const lista = ctx.relPresetsCarregar();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].nome, 'Minha analise');
  assert.deepEqual(Array.from(lista[0].filtro.vendedor), ['JOAO']);
  assert.deepEqual(Array.from(lista[0].filtro.ano), ['2026']);
});

test('presets: aplicar restaura REL_FILTER exatamente como foi salvo', () => {
  const ctx = carregar('EMP1');
  ctx.window.REL_FILTER.produto = ['VASSOURA S10'];
  ctx.window.REL_FILTER.grupo = ['VASSOURAS'];
  ctx.prompt = () => 'Vassouras';
  ctx.relPresetsSalvarAtual();

  ctx.window.REL_FILTER = { vendedor: [], produto: [], cliente: [], grupo: [], marca: [], ano: [] };
  ctx.relPresetsAplicar('Vassouras');
  assert.deepEqual(Array.from(ctx.window.REL_FILTER.produto), ['VASSOURA S10']);
  assert.deepEqual(Array.from(ctx.window.REL_FILTER.grupo), ['VASSOURAS']);
  assert.deepEqual(Array.from(ctx.window.REL_FILTER.vendedor), []);
});

test('presets: salvar de novo com o mesmo nome substitui, nao duplica', () => {
  const ctx = carregar('EMP1');
  ctx.prompt = () => 'Repetido';
  ctx.window.REL_FILTER.ano = ['2025'];
  ctx.relPresetsSalvarAtual();
  ctx.window.REL_FILTER.ano = ['2026'];
  ctx.relPresetsSalvarAtual();
  const lista = ctx.relPresetsCarregar();
  assert.equal(lista.length, 1);
  assert.deepEqual(Array.from(lista[0].filtro.ano), ['2026']);
});

test('presets: apagar remove da lista', () => {
  const ctx = carregar('EMP1');
  ctx.prompt = () => 'Pra apagar';
  ctx.relPresetsSalvarAtual();
  assert.equal(ctx.relPresetsCarregar().length, 1);
  ctx.relPresetsApagar('Pra apagar');
  assert.equal(ctx.relPresetsCarregar().length, 0);
});

test('presets: nome vazio ou cancelado nao salva nada', () => {
  const ctx = carregar('EMP1');
  ctx.prompt = () => null;
  ctx.relPresetsSalvarAtual();
  ctx.prompt = () => '   ';
  ctx.relPresetsSalvarAtual();
  assert.equal(ctx.relPresetsCarregar().length, 0);
});

test('presets: lista e separada por empresa ativa (mesma chave de storage, empresas diferentes)', () => {
  const storage = fakeLocalStorage();
  const ctxA = carregar('EMP_A', storage);
  ctxA.prompt = () => 'So da empresa A';
  ctxA.relPresetsSalvarAtual();

  const ctxB = carregar('EMP_B', storage);
  assert.equal(ctxB.relPresetsCarregar().length, 0, 'empresa B nao deve ver preset salvo pela empresa A');

  const ctxA2 = carregar('EMP_A', storage);
  assert.equal(ctxA2.relPresetsCarregar().length, 1, 'empresa A continua vendo o proprio preset');
});
