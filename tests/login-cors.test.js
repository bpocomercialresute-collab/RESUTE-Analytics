const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// api/login.js e ESM (export default). Carrega como script comum, removendo
// so o export, e expoe as funcoes de CORS -- mesmo padrao de
// tests/secure-proxy-cors.test.js. O handler HTTP nao e executado aqui.
function loadLogin() {
  const src = fs.readFileSync(path.join(root, 'api/login.js'), 'utf8')
    .replace(/^import .*$/m, '')
    .replace(/^export default /m, '')
    .replace(/^export const config[^;]*;\s*$/m, '');
  const context = { URL, URLSearchParams, Map, Set, JSON, Date, decodeURIComponent, console, process, createHash: require('node:crypto').createHash };
  vm.createContext(context);
  vm.runInContext(src + '\n;globalThis.__login = { isOriginAllowed, setCorsHeaders };', context);
  return context.__login;
}

const P = loadLogin();
const semAllowedOrigins = process.env.ALLOWED_ORIGINS;
delete process.env.ALLOWED_ORIGINS;

function reqCom(origin, host) {
  return { headers: { origin, host } };
}

test('login CORS sem ALLOWED_ORIGINS: aceita quando Origin bate com o Host', () => {
  assert.equal(P.isOriginAllowed(reqCom('https://app.resute.com', 'app.resute.com')), true);
});

test('login CORS sem ALLOWED_ORIGINS: nega origem que nao bate com o Host (endpoint de senha nao pode refletir qualquer Origin)', () => {
  assert.equal(P.isOriginAllowed(reqCom('https://site-malicioso.com', 'app.resute.com')), false);
});

test('login CORS com ALLOWED_ORIGINS configurado: respeita a lista', () => {
  process.env.ALLOWED_ORIGINS = 'https://app.resute.com';
  try {
    assert.equal(P.isOriginAllowed(reqCom('https://app.resute.com', 'outro-host.com')), true);
    assert.equal(P.isOriginAllowed(reqCom('https://nao-listado.com', 'outro-host.com')), false);
  } finally {
    delete process.env.ALLOWED_ORIGINS;
  }
});

test.after(() => {
  if (semAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
  else process.env.ALLOWED_ORIGINS = semAllowedOrigins;
});
