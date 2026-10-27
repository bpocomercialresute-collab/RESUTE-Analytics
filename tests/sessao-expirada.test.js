const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `funcao ${name} nao encontrada`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`funcao ${name} incompleta`);
}

const context = {};
vm.createContext(context);
vm.runInContext(extractFunction('_erroEhSessaoExpirada'), context);
const ehSessaoExpirada = context._erroEhSessaoExpirada;

test('401 com "Sessao invalida" e tratado como sessao expirada', () => {
  assert.equal(ehSessaoExpirada(401, { erro: 'Sessao invalida.' }), true);
});

test('401 com "Sessão inválida" (com acento) tambem e tratado', () => {
  assert.equal(ehSessaoExpirada(401, { erro: 'Sessão inválida.' }), true);
});

test('outros erros de autorizacao nao disparam o redirecionamento', () => {
  assert.equal(ehSessaoExpirada(403, { erro: 'Sessao invalida.' }), false);
  assert.equal(ehSessaoExpirada(401, { erro: 'Acesso negado a esta empresa.' }), false);
  assert.equal(ehSessaoExpirada(500, { erro: 'Sessao invalida.' }), false);
});

test('corpo ausente ou sem mensagem nao quebra e nao dispara', () => {
  assert.equal(ehSessaoExpirada(401, null), false);
  assert.equal(ehSessaoExpirada(401, {}), false);
});
