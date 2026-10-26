const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dreViewSrc = fs.readFileSync(path.join(root, 'js/dre/dre-view.js'), 'utf8');

// GRID_DEFS['dre_bd']/['dre_plano'] so sao montados dentro de
// _dreIniciarGradesLiteGrid, que tambem cria grades reais (DOM pesado) logo
// em seguida - em vez de rodar a funcao inteira, extrai so a atribuicao
// "GRID_DEFS['chave'] = { cols: [...] };" por contagem de colchete/chave,
// igual o extractFunction ja usado em commercial-data.test.js faz pra
// funcoes. Testa a definicao real da grade, nao uma copia dela.
function extrairAtribuicao(source, marcador) {
  const start = source.indexOf(marcador);
  assert.notEqual(start, -1, `"${marcador}" nao encontrado em dre-view.js`);
  const semicolon = source.indexOf('};', start);
  assert.notEqual(semicolon, -1, `fim de "${marcador}" nao encontrado`);
  return source.slice(start, semicolon + 2);
}

function carregarDefsEModelo() {
  const context = { module: {}, GRID_DEFS: {} };
  vm.createContext(context);
  const trechoBd = extrairAtribuicao(dreViewSrc, "GRID_DEFS['dre_bd'] = {");
  const trechoPlano = extrairAtribuicao(dreViewSrc, "GRID_DEFS['dre_plano'] = {");
  vm.runInContext(trechoBd, context);
  vm.runInContext(trechoPlano, context);

  const inicioExemplo = dreViewSrc.indexOf('var DRE_MODELO_EXEMPLO = {');
  assert.notEqual(inicioExemplo, -1, 'DRE_MODELO_EXEMPLO nao encontrado em dre-view.js');
  const fimExemplo = dreViewSrc.indexOf('\n};', inicioExemplo) + 3;
  vm.runInContext(dreViewSrc.slice(inicioExemplo, fimExemplo), context);

  const inicioFn = dreViewSrc.indexOf('function _dreModeloLinha');
  assert.notEqual(inicioFn, -1, '_dreModeloLinha nao encontrada em dre-view.js');
  const abreFn = dreViewSrc.indexOf('{', inicioFn);
  let depth = 0, fimFn = -1;
  for (let i = abreFn; i < dreViewSrc.length; i += 1) {
    if (dreViewSrc[i] === '{') depth += 1;
    if (dreViewSrc[i] === '}') { depth -= 1; if (depth === 0) { fimFn = i + 1; break; } }
  }
  vm.runInContext(dreViewSrc.slice(inicioFn, fimFn), context);

  return context;
}

// Mesma heuristica de _dreLinhasParaGrid (dre-view.js): linha e cabecalho se
// a primeira celula NAO parecer data DD/MM/AAAA ou AAAA-MM-DD.
function pareceData(valor) {
  const v = String(valor || '').trim();
  return /^\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v);
}

test('modelo DRE: cabecalho de BD e Plano de Contas e reconhecido (primeira celula nao parece data)', () => {
  const ctx = carregarDefsEModelo();
  ['dre_bd', 'dre_plano'].forEach((key) => {
    const def = ctx.GRID_DEFS[key];
    const primeiraCelula = def.cols[0].t;
    assert.equal(pareceData(primeiraCelula), false, `aba ${key}: primeira coluna do cabecalho ("${primeiraCelula}") pareceria data e a linha nao seria pulada`);
  });
});

test('modelo DRE: linha de exemplo cai na coluna certa pelo nome, e nunca preenche coluna auto:true', () => {
  const ctx = carregarDefsEModelo();
  ['dre_bd', 'dre_plano'].forEach((key) => {
    const def = ctx.GRID_DEFS[key];
    const exemplo = ctx.DRE_MODELO_EXEMPLO[key];
    assert.ok(exemplo, `falta DRE_MODELO_EXEMPLO.${key}`);
    const linha = ctx._dreModeloLinha(def, exemplo);
    assert.equal(linha.length, def.cols.length, `aba ${key}: linha de exemplo com numero de colunas diferente da grade`);
    def.cols.forEach((col, i) => {
      if (col.auto) {
        assert.equal(linha[i], '', `aba ${key}, coluna "${col.t}": e calculada automaticamente, mas o modelo preenche valor nela`);
      } else {
        const esperado = exemplo[col.t] !== undefined ? exemplo[col.t] : '';
        assert.equal(linha[i], esperado, `aba ${key}, coluna "${col.t}": valor da linha de exemplo nao bate com DRE_MODELO_EXEMPLO`);
      }
    });
  });
});

test('modelo DRE: todo nome de coluna em DRE_MODELO_EXEMPLO existe de verdade na grade (sem chave sobrando/typo)', () => {
  const ctx = carregarDefsEModelo();
  ['dre_bd', 'dre_plano'].forEach((key) => {
    const def = ctx.GRID_DEFS[key];
    const titulos = new Set(def.cols.map((c) => c.t));
    Object.keys(ctx.DRE_MODELO_EXEMPLO[key]).forEach((chave) => {
      assert.ok(titulos.has(chave), `DRE_MODELO_EXEMPLO.${key} tem a chave "${chave}", que nao existe como coluna em GRID_DEFS['${key}'] (typo?)`);
    });
  });
});
