const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const DRE = require('../js/dre/dre-engine.js');

const root = path.resolve(__dirname, '..');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `funcao ${name} nao encontrada`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`funcao ${name} incompleta`);
}

function loadFromFile(file, names, extraSrc) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const context = {
    document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {}, remove() {} }), body: { appendChild() {} } },
    Intl, setTimeout, Number, Math
  };
  vm.createContext(context);
  if (extraSrc) vm.runInContext(extraSrc, context);
  const body = names.map((n) => extractFunction(src, n)).join('\n');
  vm.runInContext(body + '\n;globalThis.__fns = { ' + names.join(', ') + ' };', context);
  return context.__fns;
}

const utilsSrc = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8');
const auth = loadFromFile('js/auth.js', ['dcNumeroBase', 'dcNumeroLimpo', 'dcVariacaoAtualAnterior'], utilsSrc);
const relrep = loadFromFile('js/relatrep.js', ['repPremiacaoVariacaoInfo']);

function prepararDre(lancamentos, plano) {
  DRE.estado.plano = plano || [
    { cod: 'REC01', conta: 'Venda', grupo: 'RECEITA OPERACIONAL', fv: 'V', di: 'D' },
    { cod: 'DESP01', conta: 'Despesa variavel', grupo: 'CUSTO. MP OU REVENDA', fv: 'V', di: 'D' },
    { cod: 'DESP02', conta: 'Despesa fixa', grupo: 'DESP. ADM', fv: 'F', di: 'I' }
  ];
  DRE.estado.lancamentos = lancamentos;
  DRE.estado.ano = 2026;
  DRE.estado.anoInicio = 2026;
  DRE.estado.anoFim = 2026;
  DRE.estado.mesInicio = 0;
  DRE.estado.mesFim = 11;
  DRE.estado.cnpj = 1;
  DRE.estado.slots = [];
  DRE.montarBDDRE();
}

function lanc(conta, valor, dtVenc) {
  return { id: conta + valor + dtVenc, conta, valor, dt_venc: dtVenc, cnpj: 1 };
}

test('DRE analiseFVDI: margem de contribuicao e ponto de equilibrio', () => {
  prepararDre([
    lanc('Venda', 1000, '2026-01-10'),
    lanc('Despesa variavel', 200, '2026-01-11'),
    lanc('Despesa fixa', 100, '2026-01-12')
  ]);
  const a = DRE.analiseFVDI();
  assert.equal(a.receita, 1000);
  assert.equal(a.fv.V, -200);
  assert.equal(a.fv.F, -100);
  assert.equal(a.margemContrib, 800);
  assert.equal(a.indiceMC, 0.8);
  assert.equal(a.pontoEquilibrio, 125);
});

test('DRE analiseFVDI: sem receita nao divide por zero', () => {
  prepararDre([lanc('Despesa fixa', 100, '2026-01-12')]);
  const a = DRE.analiseFVDI();
  assert.equal(a.receita, 0);
  assert.equal(a.indiceMC, 0);
  assert.equal(a.pontoEquilibrio, 0);
});

test('DRE laudoMoMGrupo: variacao mes a mes usa valor com sinal de despesa', () => {
  prepararDre([
    lanc('Despesa fixa', 100, '2026-01-05'),
    lanc('Despesa fixa', 150, '2026-02-05')
  ]);
  const mom = DRE.laudoMoMGrupo('DESP. ADM');
  assert.equal(mom.anoAtual, 2026);
  assert.equal(mom.valores[0], null);
  assert.equal(mom.valores[1], -0.5);
});

test('variacao do dashboard: base negativa usa valor absoluto no denominador', () => {
  const r = auth.dcVariacaoAtualAnterior(-50, -100);
  assert.equal(r.pct, 50);
  assert.equal(r.classe, 'positivo');
});

test('variacao do dashboard: sem base anterior nao calcula', () => {
  const r = auth.dcVariacaoAtualAnterior(100, 0);
  assert.equal(r.pct, null);
  assert.equal(r.classe, 'neutro');
});

test('variacao do dashboard: queda gera percentual negativo', () => {
  const r = auth.dcVariacaoAtualAnterior(80, 100);
  assert.equal(Math.round(r.pct), -20);
  assert.equal(r.classe, 'negativo');
});

test('variacao da premiacao: sem base e sem atual vira neutro', () => {
  const r = relrep.repPremiacaoVariacaoInfo(0, 0);
  assert.equal(r.valor, null);
  assert.equal(r.classe, 'neutral');
});

test('variacao da premiacao: primeiro periodo com atual vira inicio de crescimento', () => {
  const r = relrep.repPremiacaoVariacaoInfo(500, 0);
  assert.equal(r.valor, 100);
  assert.equal(r.classe, 'up');
});

test('variacao da premiacao: calcula subida e queda sobre o anterior', () => {
  assert.equal(Math.round(relrep.repPremiacaoVariacaoInfo(150, 100).valor), 50);
  assert.equal(Math.round(relrep.repPremiacaoVariacaoInfo(80, 100).valor), -20);
});
