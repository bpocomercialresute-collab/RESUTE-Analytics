const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function carregarRegra() {
  const source = fs.readFileSync(path.join(root, 'js/relatrep.js'), 'utf8');
  const start = source.indexOf('function repPremiacaoEhReativacao(');
  assert.notEqual(start, -1, 'repPremiacaoEhReativacao nao encontrada');
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') { depth -= 1; if (depth === 0) { end = i + 1; break; } }
  }
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(source.slice(start, end), ctx);
  return ctx.repPremiacaoEhReativacao;
}

const DIA = 86400000;
const inicio = new Date(Date.UTC(2026, 8, 1)); // 01/09/2026

test('reativacao: compra ha exatamente 180 dias conta como reativado', () => {
  const ehReativacao = carregarRegra();
  const ultima = new Date(inicio.getTime() - 180 * DIA);
  assert.equal(ehReativacao([ultima], inicio), true);
});

test('reativacao: compra ha 179 dias NAO conta (ainda nao estava inativo)', () => {
  const ehReativacao = carregarRegra();
  const ultima = new Date(inicio.getTime() - 179 * DIA);
  assert.equal(ehReativacao([ultima], inicio), false);
});

test('reativacao: cliente novo (nenhuma compra antes do periodo) nao e reativacao', () => {
  const ehReativacao = carregarRegra();
  assert.equal(ehReativacao([], inicio), false);
});

test('reativacao: compra apos o inicio do periodo nao conta como historico', () => {
  const ehReativacao = carregarRegra();
  const dentro = new Date(inicio.getTime() + 5 * DIA);
  assert.equal(ehReativacao([dentro], inicio), false);
});

test('reativacao: usa a compra MAIS RECENTE anterior, nao a mais antiga', () => {
  const ehReativacao = carregarRegra();
  const antiga = new Date(inicio.getTime() - 700 * DIA);
  const recente = new Date(inicio.getTime() - 60 * DIA);
  assert.equal(ehReativacao([antiga, recente], inicio), false);
});
