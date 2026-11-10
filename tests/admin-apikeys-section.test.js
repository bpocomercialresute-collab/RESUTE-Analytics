const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const consoleJs = fs.readFileSync(path.join(root, 'js/admin-console.js'), 'utf8');

test('secao "Chaves de API" existe, com meta cadastrado e todos os ids que o JS busca', () => {
  assert.match(html, /id="admin-section-apikeys"/, 'secao admin-section-apikeys nao existe');
  assert.match(html, /data-admin-target="apikeys"/, 'item de menu da secao apikeys nao existe');
  assert.match(consoleJs, /apikeys:\s*\{/, 'ADMIN_SECTION_META.apikeys nao existe');
  ['admin-apikeys-empresa', 'admin-apikeys-gerar-btn', 'admin-apikeys-result', 'admin-apikeys-body'].forEach((id) => {
    assert.match(html, new RegExp('id="' + id + '"'), 'index.html nao tem #' + id);
  });
});

test('proxy bloqueia api_keys pro navegador: so leitura, so super_admin', () => {
  const proxySrc = fs.readFileSync(path.join(root, 'api/secure-proxy.js'), 'utf8');
  assert.match(proxySrc, /targetUrl\.pathname === '\/rest\/v1\/api_keys'/, 'secure-proxy.js perdeu a regra de api_keys');
  const regraInicio = proxySrc.indexOf("if (targetUrl.pathname === '/rest/v1/api_keys')");
  assert.notEqual(regraInicio, -1, 'regra de autorizacao de api_keys nao existe');
  const trecho = proxySrc.slice(regraInicio, regraInicio + 800);
  assert.match(trecho, /super_admin/, 'regra de api_keys nao exige super_admin');
  assert.match(trecho, /isWrite/, 'regra de api_keys nao bloqueia escrita');
});

test('acoes api-key-create e api-key-revoke estao registradas no dispatcher', () => {
  const proxySrc = fs.readFileSync(path.join(root, 'api/secure-proxy.js'), 'utf8');
  assert.match(proxySrc, /action === 'api-key-create'/);
  assert.match(proxySrc, /action === 'api-key-revoke'/);
});
