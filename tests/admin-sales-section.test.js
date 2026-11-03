const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const consoleJs = fs.readFileSync(path.join(root, 'js/admin-console.js'), 'utf8');

test('secao "Material de vendas" existe no HTML e tem meta cadastrado no console admin', () => {
  assert.match(html, /id="admin-section-sales"/, 'index.html nao tem a secao admin-section-sales');
  assert.match(html, /data-admin-target="sales"/, 'index.html nao tem o item de menu pra secao sales');
  assert.match(consoleJs, /sales:\s*\{/, 'admin-console.js nao tem ADMIN_SECTION_META.sales');
});

test('secao de vendas so abre pra super_admin (mesmo guard das outras secoes do console)', () => {
  const guarda = consoleJs.match(/function adminConsoleAbrir\([^)]*\)\s*\{\s*\n\s*if\s*\(!SESSION \|\| SESSION\.papel !== 'super_admin'\) return false;/);
  assert.ok(guarda, 'adminConsoleAbrir perdeu o guard de super_admin no topo -- secao sales ficaria aberta pra qualquer papel');
});
