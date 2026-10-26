const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadResumoImportacao() {
  const context = {
    document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {}, remove() {} }), body: { appendChild() {} } },
    Intl,
    setTimeout
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8'), context);
  return context.resumoImportacao;
}

const ehCabecalhoTexto = (row) => /^(ID|CONTA|CODIGO|COD)$/i.test(String(row[0] || '').trim());

test('previa: cabecalho e linhas vazias ficam de fora, o resto entra', () => {
  const resumoImportacao = loadResumoImportacao();
  const r = resumoImportacao([
    ['ID', 'CONTA', 'VALOR'],
    ['1', 'Venda', '100'],
    ['', '', ''],
    ['2', 'Frete', '20']
  ], ehCabecalhoTexto);

  assert.equal(r.total, 4);
  assert.equal(r.cabecalho, 1);
  assert.equal(r.vazias, 1);
  assert.equal(r.importar, 2);
  assert.deepEqual(r.linhas, [['1', 'Venda', '100'], ['2', 'Frete', '20']]);
});

test('previa: sem cabecalho, so vazias sao descartadas', () => {
  const resumoImportacao = loadResumoImportacao();
  const r = resumoImportacao([
    ['1', 'Venda', '100'],
    ['  ', '', null]
  ], ehCabecalhoTexto);

  assert.equal(r.cabecalho, 0);
  assert.equal(r.vazias, 1);
  assert.equal(r.importar, 1);
});

test('previa: arquivo so com cabecalho nao importa nada', () => {
  const resumoImportacao = loadResumoImportacao();
  const r = resumoImportacao([['ID', 'CONTA']], ehCabecalhoTexto);

  assert.equal(r.cabecalho, 1);
  assert.equal(r.importar, 0);
  assert.deepEqual(r.linhas, []);
});

test('previa: entrada vazia nao quebra', () => {
  const resumoImportacao = loadResumoImportacao();
  const r = resumoImportacao([], ehCabecalhoTexto);

  assert.equal(r.total, 0);
  assert.equal(r.importar, 0);
});
