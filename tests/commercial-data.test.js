const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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

function loadNumberParser() {
  const context = {
    Intl,
    setTimeout,
    document: {
      getElementById: () => null,
      createElement: () => ({
        className: '', innerHTML: '', style: {}, appendChild() {}, remove() {}
      }),
      body: { appendChild() {} }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8'), context);
  return context.parseSmartNumber;
}

test('interpreta numeros comerciais brasileiros sem distorcer escala ou sinal', () => {
  const parse = loadNumberParser();
  const cases = [
    ['1.234,56', 1234.56],
    ['R$ 1.234,56', 1234.56],
    ['1,234', 1.234],
    ['1,234,567', 1234567],
    ['1.234', 1234],
    ['1234.56', 1234.56],
    ['(1.234,56)', -1234.56],
    ['1.234,56-', -1234.56],
    ['-123,45', -123.45]
  ];

  cases.forEach(([input, expected]) => {
    assert.equal(parse(input), expected, input);
  });
});

test('sincronizacao da API nao remove nem sobrescreve a origem manual', () => {
  const source = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
  assert.match(
    source,
    /origem=eq\.api&dt_saida=gte\.' \+ delInicio \+ '&dt_saida=lte\.' \+ delFim/
  );
  assert.match(source, /_adminCarregar\(id, 'manual'\)/);
  assert.match(source, /_adminCarregar\(EMPRESA_ATIVA\.empresa_id, 'api'\)/);
});

test('existe apenas um fluxo de persistencia do BD manual', () => {
  const auth = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
  const grid = fs.readFileSync(path.join(root, 'js/jss.js'), 'utf8');
  assert.doesNotMatch(auth, /function salvarDadosManuaisNoSupabase/);
  assert.doesNotMatch(auth, /function adminSalvarBancoSilencioso/);
  assert.doesNotMatch(auth, /function adminSalvarBanco\(/);
  assert.doesNotMatch(grid, /salvarDadosManuaisNoSupabase/);
  assert.match(auth, /async function adminProcessarManual\(/);
});

test('preserva a ordem original de uma colagem com 40 mil linhas', () => {
  const source = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
  const context = {};
  vm.createContext(context);
  ['_comercialPadOrdem', '_comercialOrdemImportacao', '_comercialOrdenarImportacao']
    .forEach((name) => vm.runInContext(extractFunction(source, name), context));

  const total = 40000;
  const batch = 'manual_deadbeef_1790000000000_';
  const rows = Array.from({ length: total }, (_, index) => ({
    id_externo: batch + context._comercialPadOrdem(total - index - 1)
  }));
  const sorted = context._comercialOrdenarImportacao(rows);

  assert.equal(sorted.length, total);
  assert.equal(sorted[0].id_externo, batch + '00000000');
  assert.equal(sorted[total - 1].id_externo, batch + '00039999');
});

test('mantem ponto decimal vindo da API sem confundir com milhar do Excel', () => {
  const auth = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
  const context = { parseSmartNumber: loadNumberParser() };
  vm.createContext(context);
  vm.runInContext(extractFunction(auth, '_comercialNumeroApi'), context);

  assert.equal(context._comercialNumeroApi(1.234), 1.234);
  assert.equal(context._comercialNumeroApi('1.234'), 1.234);
  assert.equal(context._comercialNumeroApi('1,234'), 1.234);
  assert.equal(context._comercialNumeroApi('1.234,56'), 1234.56);
});

test('normaliza datas brasileiras, ISO e serial do Excel', () => {
  const source = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
  const context = { Date };
  vm.createContext(context);
  vm.runInContext(extractFunction(source, '_cvDataReal'), context);
  vm.runInContext(extractFunction(source, '_cvData'), context);

  assert.equal(context._cvData('31/12/2026'), '2026-12-31');
  assert.equal(context._cvData('2026-12-31'), '2026-12-31');
  assert.equal(context._cvData('25569'), '1970-01-01');
  assert.equal(context._cvData('31/02/2026'), null);
});
