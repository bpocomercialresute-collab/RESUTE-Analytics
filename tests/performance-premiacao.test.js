const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// Carrega js/relatrep.js de verdade (nao copia) num sandbox minimo sem DOM.
function loadRelatrep() {
  const windowObj = {};
  const context = {
    window: windowObj,
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => []
    },
    console, Set, Map, Date, Math, Array, Object, String, Number, Boolean, JSON,
    parseSmartNumber: (v) => Number(v) || 0
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/relatrep.js'), 'utf8'), context, { filename: 'relatrep.js' });
  windowObj.IDX = { saida: 5, emissao: 4 };
  context.IDX = windowObj.IDX;
  return context;
}

function linha(dataBR) {
  const r = [];
  r[4] = dataBR;
  r[5] = dataBR;
  return r;
}

test('repPremiacaoDisponiveis cacheia por referencia do array (3 chamadas por render viravam 3x o custo)', () => {
  // repPremiacao() chama repPremiacaoDisponiveis 3x com o MESMO array baseRows
  // num unico render (direto, via repPremiacaoFiltroHtml e via
  // repPremiacaoPeriodoSelecionado) - medido ~500ms so nesta funcao pra 30 mil
  // linhas, ou seja ~1s so de retrabalho identico por render. A garantia aqui
  // e de identidade (mesma referencia -> mesmo objeto), nao de tempo: isso
  // documenta e protege o cache sem depender de medir ms (ambiente variavel).
  const ctx = loadRelatrep();
  const rowsA = [linha('15/01/2024'), linha('20/02/2024'), linha('10/03/2024')];
  const rowsB = [linha('01/06/2025')];

  const r1 = ctx.repPremiacaoDisponiveis(rowsA);
  const r2 = ctx.repPremiacaoDisponiveis(rowsA);
  assert.equal(r1, r2, 'mesma referencia de array devia reaproveitar o resultado cacheado');

  const r3 = ctx.repPremiacaoDisponiveis(rowsB);
  assert.notEqual(r1, r3, 'array diferente nao pode reaproveitar o cache de outro array');
  // Array.from (realm de fora): arrays criados dentro do vm sandbox nao sao
  // reference-equal aos do Node mesmo com conteudo identico.
  assert.deepEqual(Array.from(r3.anos, (a) => a.key), ['2025']);
  assert.deepEqual(Array.from(r1.anos, (a) => a.key), ['2024']);
});

test('repPremiacaoDisponiveis continua correto (semanas/meses/trimestres/semestres/anos) independente do cache', () => {
  const ctx = loadRelatrep();
  const rows = [linha('05/01/2024'), linha('20/01/2024'), linha('14/07/2024'), linha('02/02/2025')];
  const d = ctx.repPremiacaoDisponiveis(rows);
  assert.deepEqual(Array.from(d.anos, (a) => a.key), ['2025', '2024']);
  assert.deepEqual(Array.from(d.meses, (m) => m.key).sort(), ['2024-01', '2024-07', '2025-02']);
  assert.equal(d.trimestres.length, 3);
  assert.equal(d.semestres.length, 3);
});
