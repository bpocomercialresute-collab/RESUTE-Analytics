const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('toast: a mensagem passa por escapeHtml antes de entrar no innerHTML', () => {
  const src = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8');
  assert.match(src, /<span>\$\{escapeHtml\(msg\)\}<\/span>/);
  assert.doesNotMatch(src, /<span>\$\{msg\}<\/span>/);
});
