const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// Mesmo padrao de tests/secure-proxy-auth.test.js: carrega api/secure-proxy.js
// como script comum e expoe as funcoes de CORS pra testar isoladas do handler HTTP.
function loadProxy() {
  const src = fs.readFileSync(path.join(root, 'api/secure-proxy.js'), 'utf8')
    .replace(/^export default /m, '');
  const context = { URL, URLSearchParams, Map, Set, JSON, Date, decodeURIComponent, console, process };
  vm.createContext(context);
  vm.runInContext(src + '\n;globalThis.__proxy = { isOriginAllowed, setCorsHeaders };', context);
  return context.__proxy;
}

const P = loadProxy();
const semAllowedOrigins = process.env.ALLOWED_ORIGINS;
delete process.env.ALLOWED_ORIGINS;

function reqCom(origin, host) {
  return { headers: { origin, host } };
}

function resFalso() {
  const headers = {};
  return { headers, setHeader(k, v) { headers[k] = v; } };
}

test('CORS sem ALLOWED_ORIGINS configurado: aceita quando Origin bate com o Host da requisicao', () => {
  assert.equal(P.isOriginAllowed(reqCom('https://app.resute.com', 'app.resute.com')), true);
});

test('CORS sem ALLOWED_ORIGINS configurado: nega origem que NAO bate com o Host (nao reflete mais qualquer Origin)', () => {
  assert.equal(P.isOriginAllowed(reqCom('https://site-malicioso.com', 'app.resute.com')), false);
});

test('CORS sem ALLOWED_ORIGINS configurado: nega quando falta Origin ou Host', () => {
  assert.equal(P.isOriginAllowed(reqCom('', 'app.resute.com')), false);
  assert.equal(P.isOriginAllowed(reqCom('https://app.resute.com', '')), false);
});

test('setCorsHeaders sem ALLOWED_ORIGINS: so reflete o Origin quando bate com o Host', () => {
  const res1 = resFalso();
  P.setCorsHeaders(reqCom('https://app.resute.com', 'app.resute.com'), res1);
  assert.equal(res1.headers['Access-Control-Allow-Origin'], 'https://app.resute.com');

  const res2 = resFalso();
  P.setCorsHeaders(reqCom('https://site-malicioso.com', 'app.resute.com'), res2);
  assert.equal(res2.headers['Access-Control-Allow-Origin'], undefined);
});

test('CORS com ALLOWED_ORIGINS configurado: respeita a lista, ignora o Host', () => {
  process.env.ALLOWED_ORIGINS = 'https://app.resute.com,https://outro.dominio.com';
  try {
    assert.equal(P.isOriginAllowed(reqCom('https://app.resute.com', 'host-qualquer.com')), true);
    assert.equal(P.isOriginAllowed(reqCom('https://outro.dominio.com', 'host-qualquer.com')), true);
    assert.equal(P.isOriginAllowed(reqCom('https://nao-listado.com', 'host-qualquer.com')), false);
  } finally {
    delete process.env.ALLOWED_ORIGINS;
  }
});

test.after(() => {
  if (semAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
  else process.env.ALLOWED_ORIGINS = semAllowedOrigins;
});
