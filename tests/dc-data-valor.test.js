const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');

function extrair(src, nome) {
  const m = src.match(new RegExp('function\\s+' + nome + '\\s*\\('));
  assert.ok(m, `funcao ${nome} nao encontrada`);
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') depth -= 1;
    if (depth === 0) return src.slice(m.index, i + 1);
  }
  throw new Error(`funcao ${nome} incompleta`);
}

function carregar() {
  const ctx = { WeakMap, Date, parseInt, Number, String, isNaN };
  vm.createContext(ctx);
  vm.runInContext('var _DC_DATA_CACHE = new WeakMap();', ctx);
  ['dcMesNumero', '_dcDataValorCalcular', 'dcDataValor'].forEach((n) => vm.runInContext(extrair(source, n), ctx));
  return ctx;
}

test('dcDataValor: mesmo resultado do calculo direto, para todos os formatos de data', () => {
  const c = carregar();
  const casos = [
    { dt_saida: '2026-03-05' },
    { dt_saida: '05/03/2026' },
    { dt_saida: '05-03-2026' },
    { dt_emissao: '2025-12-31T10:20:30Z' },
    { dt_saida: '', dt_emissao: '2024-01-15' },
    { ano: 2026, mes: '4' },
    { ano: 2026, mes: 'marco' },
    { ano: '2026', mes: 'set' },
    { dt_saida: 'data invalida' },
    {}
  ];
  casos.forEach((linha) => {
    const direto = c._dcDataValorCalcular(linha);
    const memo1 = c.dcDataValor(linha);
    const memo2 = c.dcDataValor(linha);
    assert.equal(memo1 && memo1.getTime(), direto && direto.getTime(), JSON.stringify(linha));
    assert.equal(memo2, memo1, 'segunda chamada reaproveita o mesmo Date');
  });
});

test('dcDataValor: entradas que nao sao objeto continuam funcionando', () => {
  const c = carregar();
  assert.equal(c.dcDataValor(null), null);
  assert.equal(c.dcDataValor(undefined), null);
  assert.equal(c.dcDataValor('2026-03-05'), c._dcDataValorCalcular('2026-03-05'));
});

test('dcDataValor: se data, ano ou mes da linha mudam, o resultado acompanha (nao devolve valor velho)', () => {
  const c = carregar();
  const linha = { dt_saida: '2026-03-05' };
  assert.equal(c.dcDataValor(linha).getMonth(), 2);
  linha.dt_saida = '2026-07-20';
  assert.equal(c.dcDataValor(linha).getMonth(), 6);

  const so = { ano: 2026, mes: '4' };
  assert.equal(c.dcDataValor(so).getMonth(), 3);
  so.mes = '9';
  assert.equal(c.dcDataValor(so).getMonth(), 8);
});

test('dcDataValor: linhas diferentes nao compartilham o cache', () => {
  const c = carregar();
  const a = { dt_saida: '2026-01-10' };
  const b = { dt_saida: '2026-02-10' };
  assert.equal(c.dcDataValor(a).getMonth(), 0);
  assert.equal(c.dcDataValor(b).getMonth(), 1);
  assert.notEqual(c.dcDataValor(a), c.dcDataValor(b));
});
