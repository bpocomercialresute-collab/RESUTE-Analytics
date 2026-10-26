const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// Carrega js/jss.js num sandbox minimo (sem DOM de verdade) pra reaproveitar
// o mesmo GRID_DEFS, JSS_MODELO_EXEMPLO e as funcoes de parse (lgParseTSV,
// lgLooksLikeHeader) que o app usa de verdade - testa o codigo real, nao uma
// copia dele.
function loadJss() {
  const context = {
    setTimeout,
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      createElement: () => ({ className: '', innerHTML: '', style: {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {} })
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/jss.js'), 'utf8'), context);
  return context;
}

// Reproduz exatamente a logica de LiteGrid.prototype._paste (jss.js) sem
// precisar do DOM: detecta e pula a linha de cabecalho, depois corta/
// completa cada linha pro numero de colunas da grade.
function simularPaste(ctx, key, tsv) {
  const def = ctx.GRID_DEFS[key];
  const ncols = def.cols.length;
  const lines = ctx.lgParseTSV(tsv);
  const temCabecalho = lines.length > 0 && ctx.lgLooksLikeHeader(lines[0].join('\t'));
  const start = temCabecalho ? 1 : 0;
  const linhas = [];
  for (let i = start; i < lines.length; i += 1) {
    const cells = lines[i].slice(0, ncols);
    while (cells.length < ncols) cells.push('');
    linhas.push(cells);
  }
  return { temCabecalho, linhas };
}

test('modelo de planilha: cabecalho de toda aba e reconhecido e pulado ao importar', () => {
  const ctx = loadJss();
  ctx.JSS_MODELO_ABAS.forEach((item) => {
    const def = ctx.GRID_DEFS[item.key];
    const headers = def.cols.map((c) => c.t);
    assert.equal(
      ctx.lgLooksLikeHeader(headers.join('\t')),
      true,
      `aba ${item.aba} (${item.key}): cabecalho do modelo nao foi reconhecido como cabecalho - seria importado como linha de dado`
    );
  });
});

test('modelo de planilha: linha de exemplo de toda aba cai nas colunas certas depois de importada', () => {
  const ctx = loadJss();
  ctx.JSS_MODELO_ABAS.forEach((item) => {
    const def = ctx.GRID_DEFS[item.key];
    const headers = def.cols.map((c) => c.t);
    const exemplo = ctx.JSS_MODELO_EXEMPLO[item.key] || [];
    const linhaExemplo = headers.map((_, i) => (exemplo[i] !== undefined ? exemplo[i] : ''));
    const tsv = [headers, linhaExemplo].map((r) => r.join('\t')).join('\n');

    const { temCabecalho, linhas } = simularPaste(ctx, item.key, tsv);
    assert.equal(temCabecalho, true, `aba ${item.aba}: cabecalho nao foi pulado`);
    assert.equal(linhas.length, 1, `aba ${item.aba}: esperava 1 linha de dado depois de importar, veio ${linhas.length}`);
    assert.equal(linhas[0].length, def.cols.length, `aba ${item.aba}: linha importada com numero de colunas diferente da grade`);

    def.cols.forEach((col, i) => {
      const esperado = exemplo[i] !== undefined ? exemplo[i] : '';
      assert.equal(linhas[0][i], esperado, `aba ${item.aba}, coluna "${col.t}": valor importado nao bate com o exemplo do modelo`);
    });
  });
});

test('modelo de planilha: exemplo nunca preenche coluna calculada automaticamente (auto:true)', () => {
  const ctx = loadJss();
  ctx.JSS_MODELO_ABAS.forEach((item) => {
    const def = ctx.GRID_DEFS[item.key];
    const exemplo = ctx.JSS_MODELO_EXEMPLO[item.key] || [];
    def.cols.forEach((col, i) => {
      if (col.auto) {
        assert.equal(
          exemplo[i] === undefined || exemplo[i] === '',
          true,
          `aba ${item.aba}, coluna "${col.t}": e calculada automaticamente ao Processar, mas o modelo vem com valor de exemplo preenchido nela`
        );
      }
    });
  });
});

test('modelo de planilha: toda aba do GRID_DEFS esta representada no modelo (JSS_MODELO_ABAS/EXEMPLO)', () => {
  const ctx = loadJss();
  // Array.from (realm de fora) pra nao comparar array criado dentro do vm
  // sandbox com array normal do Node - deepEqual acusa diferenca de
  // prototipo entre realms mesmo com o mesmo conteudo.
  const chavesGrid = Array.from(Object.keys(ctx.GRID_DEFS)).sort();
  const chavesModelo = Array.from(ctx.JSS_MODELO_ABAS, (item) => item.key).sort();
  assert.deepEqual(chavesModelo, chavesGrid, 'JSS_MODELO_ABAS nao cobre exatamente as mesmas abas de GRID_DEFS');
  chavesGrid.forEach((key) => {
    assert.ok(ctx.JSS_MODELO_EXEMPLO[key], `falta linha de exemplo (JSS_MODELO_EXEMPLO) pra aba "${key}"`);
  });
});
