const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadParseSmartNumber() {
  const context = {
    document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {}, remove() {} }), body: { appendChild() {} } },
    Intl,
    setTimeout
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8'), context);
  return context.parseSmartNumber;
}

const parse = loadParseSmartNumber();

test('quantidade: separador de milhar pt-BR nao vira decimal', () => {
  assert.equal(parse('1.234'), 1234);
  assert.equal(parse('2.500,75'), 2500.75);
});

test('quantidade: virgula decimal pt-BR e preservada', () => {
  assert.equal(parse('2,5'), 2.5);
});

test('quantidade: numero e texto simples continuam iguais', () => {
  assert.equal(parse(3), 3);
  assert.equal(parse('12'), 12);
  assert.equal(parse('1.5'), 1.5);
});
