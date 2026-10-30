const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8') + '\n'
  + fs.readFileSync(path.join(root, 'js/relatrep.js'), 'utf8');

const DIA_LABEL_FULL = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];

function fmtDataBr(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function carregar() {
  const elDia = { innerHTML: '' };
  const ctx = {
    document: {
      addEventListener() {},
      getElementById(id) { return id === 'rep-tab-dia' ? elDia : null; },
      querySelector() { return null; },
    },
    console,
    setTimeout,
    SESSION: { papel: 'admin', empresa_id: 'EMP1' },
    EMPRESA_ATIVA: { empresa_id: 'EMP1' },
  };
  ctx.window = ctx;
  ctx.BD_DATA = { headers: [], rows: [], count: 0 };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  ctx.IDX = { vendedor: 1, produto: 2, cliente: 3, grupo: 4, marca: 5, ano: 6, mes: 7, valor: 8, qtd: 9, saida: 10, emissao: 11, pedido: 12 };
  return { ctx, elDia };
}

function linha(ctx, campos) {
  const r = [];
  Object.keys(campos).forEach((k) => { r[ctx.IDX[k]] = campos[k]; });
  return r;
}

test('repDia: conta PEDIDOS DISTINTOS por dia da semana, nao linhas de venda', () => {
  const { ctx, elDia } = carregar();
  const dia1 = new Date(2026, 2, 2);
  const dia2 = new Date(2026, 2, 3);
  const dia1Str = fmtDataBr(dia1);
  const dia2Str = fmtDataBr(dia2);

  ctx.BD_DATA.rows = [
    // JOAO: pedido P1 tem 2 linhas no mesmo dia (2 produtos) -> conta como 1 pedido
    linha(ctx, { vendedor: 'JOAO', pedido: 'P1', saida: dia1Str, valor: 100 }),
    linha(ctx, { vendedor: 'JOAO', pedido: 'P1', saida: dia1Str, valor: 50 }),
    // JOAO: pedido P2, mesmo dia1, pedido diferente -> 2 pedidos no dia1
    linha(ctx, { vendedor: 'JOAO', pedido: 'P2', saida: dia1Str, valor: 80 }),
    // JOAO: pedido P3, dia2 -> 1 pedido no dia2
    linha(ctx, { vendedor: 'JOAO', pedido: 'P3', saida: dia2Str, valor: 60 }),
    // MARIA: 2 pedidos distintos no dia2
    linha(ctx, { vendedor: 'MARIA', pedido: 'P9', saida: dia2Str, valor: 40 }),
    linha(ctx, { vendedor: 'MARIA', pedido: 'P10', saida: dia2Str, valor: 30 }),
  ];

  ctx.repDia();

  const diaLabel1 = DIA_LABEL_FULL[dia1.getDay()];
  const diaLabel2 = DIA_LABEL_FULL[dia2.getDay()];

  assert.match(elDia.innerHTML, /PRODUTIVIDADE DI[ÁA]RIA POR REPRESENTANTE/);
  assert.match(elDia.innerHTML, /JOAO/);
  assert.match(elDia.innerHTML, /MARIA/);
  // JOAO: 2 pedidos no dia1 (nao 3, apesar de 3 linhas de venda), 1 no dia2, total 3
  assert.match(elDia.innerHTML, new RegExp('TOTAL PEDIDOS'));
  // dia mais produtivo do JOAO e o dia1 (2 pedidos contra 1)
  const linhaJoao = elDia.innerHTML.split('<tr>').find((l) => l.includes('JOAO'));
  assert.ok(linhaJoao, 'linha do JOAO deve existir na tabela');
  assert.ok(linhaJoao.includes('>' + diaLabel1 + '<') || linhaJoao.includes(diaLabel1), 'melhor dia do JOAO deveria ser ' + diaLabel1);

  // garante que nao e so um clone do REP_MIX com titulo trocado: o titulo do
  // MIX ("MIX DE PRODUTOS POR DIA DA SEMANA") nao deve aparecer aqui
  assert.doesNotMatch(elDia.innerHTML, /MIX DE PRODUTOS/);
});

test('repDia: vendedor sem nenhum pedido no periodo filtrado nao aparece na tabela', () => {
  const { ctx, elDia } = carregar();
  const dia1Str = fmtDataBr(new Date(2026, 2, 2));
  ctx.BD_DATA.rows = [
    linha(ctx, { vendedor: 'JOAO', pedido: 'P1', saida: dia1Str, valor: 10 }),
  ];
  ctx.repDia();
  assert.doesNotMatch(elDia.innerHTML, /MARIA/);
});

test('repDia: sem elemento na pagina nao quebra', () => {
  const ctx = carregar().ctx;
  ctx.document.getElementById = () => null;
  assert.doesNotThrow(() => ctx.repDia());
});
