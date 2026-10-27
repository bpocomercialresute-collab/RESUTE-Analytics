const assert = require('node:assert/strict');
const vm = require('node:vm');
const test = require('node:test');
const { criarContexto, criarServidor, gerarLinhas, renderOcioso, impressao } = require('./helpers/dashboard-vm.js');

function novo() {
  return criarContexto({ servidor: criarServidor([]), armazem: new Map() });
}

const TABELAS = ['dc-tab-reps', 'dc-tab-positiv', 'dc-tab-ufs', 'dc-tab-cidades', 'dc-tab-cli', 'dc-tab-inat', 'dc-tab-novos', 'dc-tab-ticket'];

test('KPIs e graficos ficam prontos de forma sincrona; tabelas vem depois', async () => {
  const { ctx, elementos } = novo();
  ctx.dcAplicarVendasCarregadas(gerarLinhas(3000));
  assert.ok(elementos.get('dc-kpis').innerHTML.includes('dc-kpi-card'), 'KPIs ja desenhados na volta da chamada');
  assert.ok(ctx.DC_RENDER_PENDENTES > 0, 'ainda ha passos de tabela pendentes');
  assert.equal(ctx.document.getElementById('dc-tab-reps').innerHTML, '', 'tabela de representantes ainda nao montada');

  await renderOcioso(ctx);
  assert.equal(ctx.DC_RENDER_PENDENTES, 0);
  TABELAS.forEach((id) => assert.ok(elementos.get(id).innerHTML.length > 0, id + ' foi montada'));
  assert.ok(elementos.get('dc-last-update').textContent.startsWith('Dados renderizados em'));
});

test('um render novo cancela os passos que ficaram pendentes do anterior', async () => {
  const { ctx } = novo();
  let chamadas = 0;
  const original = ctx._dcTabelaInativos;
  ctx._dcTabelaInativos = function (rows) { chamadas++; return original.apply(this, arguments); };
  ctx.dcAplicarVendasCarregadas(gerarLinhas(3000));
  // antes de qualquer passo rodar, dispara outro render (usuario mudou o filtro)
  ctx.dcAplicarFiltro();
  ctx.dcAplicarFiltro();
  await renderOcioso(ctx);
  assert.equal(chamadas, 1, 'so o ultimo render monta a tabela de inativos');
});

test('resultado final com render adiado e igual ao de renderizar so o ultimo filtro', async () => {
  const a = novo();
  a.ctx.dcAplicarVendasCarregadas(gerarLinhas(2500));
  a.ctx.dcAplicarFiltro();
  a.ctx.dcAplicarFiltro();
  await renderOcioso(a.ctx);

  const b = novo();
  b.ctx.dcAplicarVendasCarregadas(gerarLinhas(2500));
  await renderOcioso(b.ctx);

  assert.equal(impressao(a.elementos), impressao(b.elementos));
});

test('erro numa tabela nao impede as demais e e informado', async () => {
  const { ctx, elementos } = novo();
  ctx._dcTabelaPositivacao = function () { throw new Error('falha de teste'); };
  ctx.dcAplicarVendasCarregadas(gerarLinhas(2000));
  await renderOcioso(ctx);
  assert.ok(elementos.get('dc-tab-ufs').innerHTML.length > 0, 'tabelas depois da que falhou foram montadas');
  assert.ok(elementos.get('dc-tab-ticket').innerHTML.length > 0);
  assert.ok(/Erro ao renderizar Positiva/.test(elementos.get('dc-status').textContent), 'o erro aparece no status');
});

test('sem dados no recorte: tabelas mostram aviso na hora e nao sobra passo pendente', async () => {
  const { ctx, elementos } = novo();
  ctx.dcAplicarVendasCarregadas(gerarLinhas(2000));
  vm.runInContext('DC_DATA = [];', ctx);
  ctx.dcRenderizar();
  assert.equal(ctx.DC_RENDER_PENDENTES, 0);
  assert.ok(elementos.get('dc-tab-reps').innerHTML.includes('Sem dados'));
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(elementos.get('dc-tab-reps').innerHTML.includes('Sem dados'), 'passos antigos nao sobrescrevem o aviso');
});
