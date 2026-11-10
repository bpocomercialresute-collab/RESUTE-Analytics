const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const authSource = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
const proxySource = fs.readFileSync(path.join(root, 'api/secure-proxy.js'), 'utf8');

function loadProxyHelpers() {
  const src = proxySource
    .replace(/^import .*$/m, '')
    .replace(/^export default /m, '');
  const context = { URL, URLSearchParams, Map, Set, JSON, Date, console };
  vm.createContext(context);
  vm.runInContext(
    src + '\n;globalThis.__helpers = { normalizeVisualSaefBaseUrl, isVisualLoginPath, visualLoginPathFor };',
    context
  );
  return context.__helpers;
}

test('Visual Saef escolhe endpoints v1 ou legados pela URL da empresa', () => {
  assert.match(authSource, /clientes:\s*\['\/api\/v1\/cliente'\]/);
  assert.match(authSource, /produtos:\s*\['\/api\/v1\/produto'\]/);
  assert.match(authSource, /representantes:\s*\['\/api\/v1\/vendedor'\]/);
  assert.match(authSource, /login:\s*'\/login'/);
  assert.match(authSource, /vendas:\s*'\/relacaovendaitem'/);
  assert.match(authSource, /clientes:\s*\['\/cadastrocliente'\]/);
  assert.match(authSource, /_fetchApiProxy\(_visualSaefBaseUrl\(apiUrl\), routes\.login/);
  assert.match(authSource, /\/api\/v1\/relacaovendaitem/);
  assert.match(authSource, /_visualSaefRoutes\(apiUrl\)/);
});

test('proxy permite rotas v1 e legadas da Visual Saef', () => {
  for (const route of [
    '/api/v1/login',
    '/api/v1/relacaovendaitem',
    '/api/v1/cliente',
    '/api/v1/cliente-parceiro',
    '/api/v1/produto',
    '/api/v1/vendedor',
    '/login',
    '/relacaovendaitem',
    '/cadastrocliente',
    '/cadastroclienteparceiro',
    '/cadastroproduto',
    '/cadastrovendedor'
  ]) {
    assert.match(proxySource, new RegExp("'" + route.replaceAll('/', '\\/') + "'"));
  }
  assert.match(proxySource, /VISUAL_CADASTRO_PATHS[\s\S]*\/cadastrocliente/);
});

test('normalização aceita raiz, /api/v1 e link Scalar sem duplicar o caminho', () => {
  const helpers = loadProxyHelpers();
  assert.equal(helpers.normalizeVisualSaefBaseUrl('https://api-plastrio.visualsaef.com'), 'https://api-plastrio.visualsaef.com');
  assert.equal(helpers.normalizeVisualSaefBaseUrl('https://api-plastrio.visualsaef.com/api/v1'), 'https://api-plastrio.visualsaef.com');
  assert.equal(helpers.normalizeVisualSaefBaseUrl('https://api-plastrio.visualsaef.com/scalar/#tag/autenticação'), 'https://api-plastrio.visualsaef.com');
  assert.equal(helpers.isVisualLoginPath('/api/v1/login'), true);
  assert.equal(helpers.isVisualLoginPath('/login'), true);
  assert.equal(helpers.normalizeVisualSaefBaseUrl('https://api-vmtre.visualsaef.com/swagger/index.html'), 'https://api-vmtre.visualsaef.com');
  assert.equal(helpers.visualLoginPathFor('https://api-vmtre.visualsaef.com', '/login'), '/login');
  assert.equal(helpers.visualLoginPathFor('https://api-plastrio.visualsaef.com', '/api/v1/login'), '/api/v1/login');
});
