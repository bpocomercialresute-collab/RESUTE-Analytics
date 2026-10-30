const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// api/secure-proxy.js e ESM (export default). Carrega o arquivo como script
// comum, removendo so o export, e expoe as funcoes de autorizacao. O handler
// HTTP nao e executado aqui.
function loadProxy() {
  const src = fs.readFileSync(path.join(root, 'api/secure-proxy.js'), 'utf8')
    .replace(/^export default /m, '');
  const context = { URL, URLSearchParams, Map, Set, JSON, Date, decodeURIComponent, console };
  vm.createContext(context);
  vm.runInContext(src + '\n;globalThis.__proxy = { assertAuthorized, canAccessEmpresa, checkRateLimit, extractEmpresaIdsFromUrl, RATE_LIMIT_MAX };', context);
  return context.__proxy;
}

const P = loadProxy();
const url = (p) => new URL('https://x.test' + p);
const cliente = { papel: 'cliente', email: 'c@x.com', empresa_id: 'A', empresa_ids: ['A'] };
const admin = { papel: 'admin', email: 'a@x.com', empresa_id: 'A', empresa_ids: ['A'] };
const superAdmin = { papel: 'super_admin', email: 's@x.com', empresa_id: null, empresa_ids: [] };

test('autorizacao: usuario de uma empresa nao le dados de outra', () => {
  assert.throws(() => P.assertAuthorized(cliente, url('/rest/v1/vendas?empresa_id=eq.B'), 'GET', null), /Acesso negado/);
});

test('autorizacao: usuario le a propria empresa', () => {
  assert.doesNotThrow(() => P.assertAuthorized(cliente, url('/rest/v1/vendas?empresa_id=eq.A'), 'GET', null));
});

test('autorizacao: cliente nao escreve em vendas', () => {
  assert.throws(() => P.assertAuthorized(cliente, url('/rest/v1/vendas?empresa_id=eq.A'), 'POST', '[{"empresa_id":"A"}]'), /Apenas super_admin ou admin/);
});

test('autorizacao: admin da empresa escreve na propria, nao em outra', () => {
  assert.doesNotThrow(() => P.assertAuthorized(admin, url('/rest/v1/vendas?empresa_id=eq.A'), 'POST', '[{"empresa_id":"A"}]'));
  assert.throws(() => P.assertAuthorized(admin, url('/rest/v1/vendas?empresa_id=eq.B'), 'POST', '[{"empresa_id":"B"}]'), /Acesso negado/);
});

test('autorizacao: super_admin acessa qualquer empresa', () => {
  assert.doesNotThrow(() => P.assertAuthorized(superAdmin, url('/rest/v1/vendas?empresa_id=eq.Z'), 'GET', null));
});

test('autorizacao: select com embed e bloqueado mesmo com empresa correta', () => {
  assert.throws(() => P.assertAuthorized(cliente, url('/rest/v1/vendas?empresa_id=eq.A&select=*,empresas(*)'), 'GET', null), /embed/);
});

test('autorizacao: rota fora da lista e negada', () => {
  assert.throws(() => P.assertAuthorized(superAdmin, url('/rest/v1/tabela_qualquer'), 'GET', null), /Rota nao permitida/);
});

test('autorizacao error_log: so super_admin le, ninguem escreve pelo navegador', () => {
  assert.doesNotThrow(() => P.assertAuthorized(superAdmin, url('/rest/v1/error_log'), 'GET', null));
  assert.throws(() => P.assertAuthorized(admin, url('/rest/v1/error_log'), 'GET', null), /Apenas super_admin/);
  assert.throws(() => P.assertAuthorized(cliente, url('/rest/v1/error_log'), 'GET', null), /Apenas super_admin/);
  assert.throws(() => P.assertAuthorized(superAdmin, url('/rest/v1/error_log'), 'POST', '[]'), /nao pode ser alterado/);
});

test('autorizacao metas: cliente le a propria empresa, nao escreve', () => {
  assert.doesNotThrow(() => P.assertAuthorized(cliente, url('/rest/v1/metas?empresa_id=eq.A'), 'GET', null));
  assert.throws(() => P.assertAuthorized(cliente, url('/rest/v1/metas?empresa_id=eq.A'), 'POST', '[{"empresa_id":"A"}]'), /Apenas super_admin ou admin/);
});

test('autorizacao metas: cliente nao le metas de outra empresa', () => {
  assert.throws(() => P.assertAuthorized(cliente, url('/rest/v1/metas?empresa_id=eq.B'), 'GET', null), /Filtro de empresa|Acesso negado/);
});

test('autorizacao metas: admin da empresa escreve na propria, nao em outra', () => {
  assert.doesNotThrow(() => P.assertAuthorized(admin, url('/rest/v1/metas?empresa_id=eq.A'), 'POST', '[{"empresa_id":"A"}]'));
  assert.throws(() => P.assertAuthorized(admin, url('/rest/v1/metas?empresa_id=eq.B'), 'POST', '[{"empresa_id":"B"}]'), /Filtro de empresa|Acesso negado/);
});

test('autorizacao metas: super_admin acessa qualquer empresa', () => {
  assert.doesNotThrow(() => P.assertAuthorized(superAdmin, url('/rest/v1/metas?empresa_id=eq.Z'), 'GET', null));
  assert.doesNotThrow(() => P.assertAuthorized(superAdmin, url('/rest/v1/metas'), 'POST', '[{"empresa_id":"Z"}]'));
});

test('autorizacao metas: sem filtro de empresa e negado (nao super_admin)', () => {
  assert.throws(() => P.assertAuthorized(admin, url('/rest/v1/metas'), 'GET', null), /Filtro de empresa obrigatorio/);
});

test('extracao: le empresa_id de eq e de in', () => {
  assert.deepEqual(Array.from(P.extractEmpresaIdsFromUrl(url('/rest/v1/vendas?empresa_id=eq.A'))), ['A']);
  assert.deepEqual(Array.from(P.extractEmpresaIdsFromUrl(url('/rest/v1/vendas?empresa_id=in.(A,B)'))), ['A', 'B']);
});

test('rate limit: conta por chave e bloqueia depois do maximo', () => {
  const chave = 'teste-' + Math.random();
  for (let i = 0; i < P.RATE_LIMIT_MAX; i += 1) assert.equal(P.checkRateLimit(chave), true);
  assert.equal(P.checkRateLimit(chave), false);
  assert.equal(P.checkRateLimit(chave + '-outra'), true);
});
