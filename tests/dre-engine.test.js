const assert = require('node:assert/strict');
const test = require('node:test');

const DRE = require('../js/dre/dre-engine.js');

function prepararEstado(lancamentos) {
  DRE.estado.plano = [
    { cod: 'REC01', conta: 'Venda de produtos', grupo: 'RECEITA OPERACIONAL', fv: 'F', di: 'D' },
    { cod: 'DESP01', conta: 'Despesa administrativa', grupo: 'DESP. ADM', fv: 'F', di: 'D' },
    { cod: 'INV01', conta: 'Investimento', grupo: 'INVESTIMENTOS', fv: 'F', di: 'D' }
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

function lancamento(conta, valor, dtVenc = '2026-01-15', extra = {}) {
  return {
    id: extra.id || conta + '-' + valor,
    conta,
    valor,
    dt_venc: dtVenc,
    dt_caixa: extra.dtCaixa || null,
    dt_pag: extra.dtPag || null,
    cnpj: 1
  };
}

test('DRE soma receita e reduz despesa sem inverter o sinal', () => {
  prepararEstado([
    lancamento('Venda de produtos', 1000),
    lancamento('Despesa administrativa', 200),
    lancamento('Despesa administrativa', -50),
    lancamento('Investimento', 75)
  ]);

  const resultado = DRE.calcularResultado();

  assert.equal(resultado.total.totReceita, 1000);
  assert.equal(resultado.total.totalDespesas, -250);
  assert.equal(resultado.total.resultFinanceiro, 750);
  assert.equal(resultado.total.resultOperacional, 675);
});

test('DRE usa data de vencimento e mantém data de caixa apenas como dado auxiliar', () => {
  prepararEstado([
    lancamento('Venda de produtos', 500, '2026-01-15', { dtCaixa: '2026-02-20' }),
    lancamento('Despesa administrativa', 100, '2026-02-10', { dtCaixa: '2026-01-05' })
  ]);

  const janeiro = DRE.estado.bdDre.reduce((total, linha) => total + (linha.meses[0] || 0), 0);
  const fevereiro = DRE.estado.bdDre.reduce((total, linha) => total + (linha.meses[1] || 0), 0);

  assert.equal(janeiro, 500);
  assert.equal(fevereiro, -100);
});

test('DRE exclui do relatório lançamento sem vencimento ou sem valor', () => {
  prepararEstado([
    lancamento('Venda de produtos', 500),
    lancamento('Venda de produtos', 700, ''),
    lancamento('Venda de produtos', '', '2026-01-20'),
    lancamento('Venda de produtos', 0, '2026-01-21')
  ]);

  const resultado = DRE.calcularResultado();

  assert.equal(resultado.total.totReceita, 500);
  assert.equal(DRE.estado.bd.length, 4);
  assert.equal(DRE.estado.bd.filter(linha => linha.entraRelatorio).length, 1);
});
