const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadAviso() {
  const context = {
    document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {}, remove() {} }), body: { appendChild() {} } },
    Intl,
    setTimeout
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8'), context);
  return context.avisoSubstituicaoGrade;
}

test('substituicao: grade vazia nao gera aviso', () => {
  assert.equal(loadAviso()(0, 50), '');
});

test('substituicao: grade com dados gera aviso com as duas contagens', () => {
  assert.equal(loadAviso()(1200, 35), 'Isso vai substituir as 1.200 linha(s) atuais por 35.');
});
