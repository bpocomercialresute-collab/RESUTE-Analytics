const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadLogin() {
  const src = fs.readFileSync(path.join(root, 'api/login.js'), 'utf8')
    .replace(/^export default /m, '');
  const context = { URL, URLSearchParams, Map, Set, JSON, Date, console, process: { env: {} } };
  vm.createContext(context);
  vm.runInContext(src + '\n;globalThis.__login = { loginChave, loginBloqueado, loginRegistrarFalha, loginLimpar, LOGIN_MAX_FALHAS, LOGIN_JANELA_MS, LOGIN_BLOQUEIO_MS };', context);
  return context.__login;
}

const L = loadLogin();
const MIN = 60 * 1000;

test('login: 4 falhas nao bloqueiam, a 5a bloqueia', () => {
  const k = L.loginChave('a@x.com', '1.1.1.1');
  const t = 1000000;
  for (let i = 0; i < 4; i += 1) L.loginRegistrarFalha(k, t);
  assert.equal(L.loginBloqueado(k, t), false);
  L.loginRegistrarFalha(k, t);
  assert.equal(L.loginBloqueado(k, t), true);
});

test('login: bloqueio expira depois de 15 minutos e zera o contador', () => {
  const k = L.loginChave('b@x.com', '1.1.1.1');
  const t = 1000000;
  for (let i = 0; i < 5; i += 1) L.loginRegistrarFalha(k, t);
  assert.equal(L.loginBloqueado(k, t + 14 * MIN), true);
  assert.equal(L.loginBloqueado(k, t + 16 * MIN), false);
  L.loginRegistrarFalha(k, t + 16 * MIN);
  assert.equal(L.loginBloqueado(k, t + 16 * MIN), false);
});

test('login: falhas fora da janela de 15 minutos nao acumulam', () => {
  const k = L.loginChave('c@x.com', '1.1.1.1');
  const t = 1000000;
  for (let i = 0; i < 4; i += 1) L.loginRegistrarFalha(k, t);
  L.loginRegistrarFalha(k, t + 16 * MIN);
  assert.equal(L.loginBloqueado(k, t + 16 * MIN), false);
});

test('login: sucesso zera as falhas', () => {
  const k = L.loginChave('d@x.com', '1.1.1.1');
  const t = 1000000;
  for (let i = 0; i < 4; i += 1) L.loginRegistrarFalha(k, t);
  L.loginLimpar(k);
  L.loginRegistrarFalha(k, t);
  assert.equal(L.loginBloqueado(k, t), false);
});

test('login: chave separa email e IP, e ignora caixa do email', () => {
  assert.equal(L.loginChave('A@X.com', '1.1.1.1'), L.loginChave('a@x.com', '1.1.1.1'));
  assert.notEqual(L.loginChave('a@x.com', '1.1.1.1'), L.loginChave('a@x.com', '2.2.2.2'));
});
