const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const consoleJs = fs.readFileSync(path.join(root, 'js/admin-console.js'), 'utf8');

test('bloco de saude do console: id buscado pelo JS existe no HTML', () => {
  const buscado = consoleJs.match(/getElementById\('(admin-health-list)'\)/);
  assert.ok(buscado, 'admin-console.js deixou de buscar admin-health-list');
  assert.match(html, /id="admin-health-list"/, 'index.html nao tem o contêiner admin-health-list');
});
