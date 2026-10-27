const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8');

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
vm.runInContext(extractFunction(source, 'escapeHtml'), context);

test('escapeHtml neutraliza < > & " e aspas simples', () => {
  const out = context.escapeHtml('<img src=x onerror="a&b\'c">');
  assert.equal(out, '&lt;img src=x onerror=&quot;a&amp;b&#39;c&quot;&gt;');
  assert.ok(!out.includes('<'));
  assert.ok(!out.includes('"'));
});

test('escapeHtml impede quebrar atributo com aspas (onclick)', () => {
  const out = context.escapeHtml("x' onclick='alert(1)");
  assert.ok(!out.includes("'"));
  assert.equal(out, 'x&#39; onclick=&#39;alert(1)');
});

test('escapeHtml converte numero para texto sem alterar', () => {
  assert.equal(context.escapeHtml(42), '42');
});

test('escapeHtml trata null e undefined como texto vazio, nao como "null"', () => {
  assert.equal(context.escapeHtml(null), '');
  assert.equal(context.escapeHtml(undefined), '');
  assert.equal(context.escapeHtml(0), '0');
});
