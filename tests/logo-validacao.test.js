const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadValidador() {
  const src = fs.readFileSync(path.join(root, 'api/secure-proxy.js'), 'utf8')
    .replace(/^export default /m, '');
  const context = { process: { env: {} }, console, Buffer, URL, URLSearchParams };
  vm.createContext(context);
  vm.runInContext(src + '\n;globalThis.__v = { validarLogoUrl, LOGO_MAX_CHARS };', context);
  return context.__v;
}

const V = loadValidador();
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('logo: aceita null e data URL de PNG, JPEG ou WEBP', () => {
  assert.equal(V.validarLogoUrl(null), true);
  assert.equal(V.validarLogoUrl(undefined), true);
  assert.equal(V.validarLogoUrl(PNG), true);
  assert.equal(V.validarLogoUrl('data:image/jpeg;base64,/9j/4AAQ'), true);
  assert.equal(V.validarLogoUrl('data:image/webp;base64,UklGRg=='), true);
});

test('logo: rejeita URL externa, javascript: e tipo nao permitido', () => {
  assert.equal(V.validarLogoUrl('https://evil.example/x.png'), false);
  assert.equal(V.validarLogoUrl('javascript:alert(1)'), false);
  assert.equal(V.validarLogoUrl('data:text/html;base64,PGgxPg=='), false);
  assert.equal(V.validarLogoUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
});

test('logo: rejeita texto fora de base64 e valores de tipo errado', () => {
  assert.equal(V.validarLogoUrl('data:image/png;base64,abc def'), false);
  assert.equal(V.validarLogoUrl(123), false);
  assert.equal(V.validarLogoUrl({ x: 1 }), false);
});

test('logo: rejeita acima do teto de tamanho', () => {
  const grande = 'data:image/png;base64,' + 'A'.repeat(V.LOGO_MAX_CHARS);
  assert.equal(V.validarLogoUrl(grande), false);
});
