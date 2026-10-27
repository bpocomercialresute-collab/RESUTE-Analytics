const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function load() {
  const src = fs.readFileSync(path.join(root, 'api/secure-proxy.js'), 'utf8')
    .replace(/^export default /m, '');
  const context = { process: { env: {} }, console, Buffer, URL, URLSearchParams, Map, Date };
  vm.createContext(context);
  vm.runInContext(src + '\n;globalThis.__r = { checkRateLimitGrupo };', context);
  return context.__r;
}

const R = load();

test('rate limit grupo: bloqueia acima do maximo dentro da janela', () => {
  const t = 1000000;
  for (let i = 0; i < 20; i += 1) assert.equal(R.checkRateLimitGrupo('sync', 'sessao-a', 20, t), true);
  assert.equal(R.checkRateLimitGrupo('sync', 'sessao-a', 20, t), false);
});

test('rate limit grupo: volta a liberar depois de 1 minuto', () => {
  const t = 2000000;
  for (let i = 0; i < 21; i += 1) R.checkRateLimitGrupo('sync', 'sessao-b', 20, t);
  assert.equal(R.checkRateLimitGrupo('sync', 'sessao-b', 20, t + 61 * 1000), true);
});

test('rate limit grupo: baldes de sync e admin sao independentes', () => {
  const t = 3000000;
  for (let i = 0; i < 21; i += 1) R.checkRateLimitGrupo('sync', 'sessao-c', 20, t);
  assert.equal(R.checkRateLimitGrupo('admin', 'sessao-c', 60, t), true);
});
