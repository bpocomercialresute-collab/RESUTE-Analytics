const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/admin-console.js'), 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `funcao ${name} nao encontrada`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') depth -= 1;
    if (depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`funcao ${name} incompleta`);
}

const context = {};
vm.createContext(context);
vm.runInContext(extractFunction(source, 'adminConsoleEscape'), context);
vm.runInContext(extractFunction(source, 'adminConsoleJsArg'), context);

// Simula o navegador: desfaz as entidades HTML do valor de atributo.
function decodeAttr(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Monta o onclick como o admin-console.js faz e devolve o valor que o JS recebe.
function receivedByHandler(value) {
  const attr = `onclick="f(${context.adminConsoleJsArg(value)})"`;
  const code = decodeAttr(attr.slice('onclick="'.length, -1));
  let received;
  const sandbox = { f(v) { received = v; } };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return received;
}

test('adminConsoleJsArg preserva o id exatamente como o handler recebe', () => {
  assert.equal(receivedByHandler('a1b2c3-uuid'), 'a1b2c3-uuid');
});

test('adminConsoleJsArg impede que aspas simples fechem a string do onclick', () => {
  const payload = "x');alert(1);//";
  assert.equal(receivedByHandler(payload), payload);
});

test('adminConsoleJsArg neutraliza aspas duplas e barras invertidas', () => {
  const payload = 'a"b\c</script>';
  assert.equal(receivedByHandler(payload), payload);
});

test('adminConsoleJsArg trata null e undefined como vazio', () => {
  assert.equal(receivedByHandler(null), '');
  assert.equal(receivedByHandler(undefined), '');
});
