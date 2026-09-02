// =============================================================================
// FINANCEIRO — CHARTS
// =============================================================================
// Todos os graficos do modulo financeiro.
//
// REGRA OBRIGATORIA: toda instancia Chart.js criada aqui precisa ser guardada
// em FIN_CHARTS via finCriarGrafico(). E FIN_CHARTS que financeiroDestruir()
// percorre para dar destroy(). Chart criado fora desse registro vaza memoria
// e quebra o canvas ao reabrir o modulo.
//
// Canvas dentro de aba escondida tem largura zero — o Chart.js renderiza
// errado e nao se recupera sozinho. Por isso so desenhamos o que esta visivel;
// finAbrirAba() chama finRenderizarGraficos() de novo ao trocar de aba.
// =============================================================================

var FIN_CORES = {
  receita:  '#14746F',
  despesa:  '#DC2626',
  saldo:    '#2DD4BF',
  neutro:   '#5A7A74',
  atencao:  '#D97706'
};

/**
 * Cria (ou recria) um grafico registrado em FIN_CHARTS.
 * @param {string} chave     identificador estavel do grafico
 * @param {string} canvasId  id do <canvas> no DOM
 * @param {object} config    config do Chart.js
 */
function finCriarGrafico(chave, canvasId, config) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return null;
  if (canvas.offsetParent === null) return null; // aba escondida

  if (FIN_CHARTS[chave]) {
    try { FIN_CHARTS[chave].destroy(); } catch (e) {}
    delete FIN_CHARTS[chave];
  }

  FIN_CHARTS[chave] = new Chart(canvas.getContext('2d'), config);
  return FIN_CHARTS[chave];
}

/** Eixo de valores em R$ compacto, para não estourar a largura. */
function finEixoMoeda() {
  return {
    beginAtZero: true,
    ticks: {
      callback: function(valor) {
        var n = Number(valor);
        if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
        if (Math.abs(n) >= 1000)    return (n / 1000).toFixed(0) + 'k';
        return String(Math.round(n));
      },
      font: { size: 10 }
    },
    grid: { color: 'rgba(90,122,116,.12)' }
  };
}

function finTooltipMoeda() {
  return {
    callbacks: {
      label: function(ctx) {
        var valor = ctx.parsed.y != null ? ctx.parsed.y : ctx.parsed;
        return (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + finFormatarMoedaCurta(valor);
      }
    }
  };
}

function finOpcoesBase() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { font: { size: 11 }, boxWidth: 12 } },
      tooltip: finTooltipMoeda()
    },
    scales: { x: { ticks: { font: { size: 10 } }, grid: { display: false } }, y: finEixoMoeda() }
  };
}

// ── RENDER ───────────────────────────────────────────────────────────────────

function finRenderizarGraficos() {
  if (typeof Chart === 'undefined') return;

  var mensal = finSerieMensal();
  var temDado = mensal.labels.length > 0;

  // Visão geral — receitas x despesas
  finCriarGrafico('receita-despesa', 'fin-chart-receita-despesa', {
    type: 'bar',
    data: {
      labels: temDado ? mensal.labels : [],
      datasets: [
        { label: 'Receitas', data: mensal.receitas, backgroundColor: FIN_CORES.receita, borderRadius: 4 },
        { label: 'Despesas', data: mensal.despesas, backgroundColor: FIN_CORES.despesa, borderRadius: 4 }
      ]
    },
    options: finOpcoesBase()
  });

  // Visão geral — saldo acumulado
  finCriarGrafico('saldo', 'fin-chart-saldo', {
    type: 'line',
    data: {
      labels: temDado ? mensal.labels : [],
      datasets: [{
        label: 'Saldo acumulado',
        data: mensal.saldoAcumulado,
        borderColor: FIN_CORES.saldo,
        backgroundColor: 'rgba(45,212,191,.16)',
        fill: true,
        tension: .3,
        pointRadius: 3
      }]
    },
    options: finOpcoesBase()
  });

  // Aging
  finCriarGraficoAging('aging-receber', 'fin-chart-aging-receber', 'receita', FIN_CORES.receita);
  finCriarGraficoAging('aging-pagar',   'fin-chart-aging-pagar',   'despesa', FIN_CORES.despesa);

  // Fluxo de caixa
  finCriarGrafico('fluxo', 'fin-chart-fluxo', {
    type: 'line',
    data: {
      labels: temDado ? mensal.labels : [],
      datasets: [
        { label: 'Entradas', data: mensal.receitas, borderColor: FIN_CORES.receita, tension: .3, pointRadius: 3 },
        { label: 'Saídas',   data: mensal.despesas, borderColor: FIN_CORES.despesa, tension: .3, pointRadius: 3 },
        { label: 'Saldo',    data: mensal.saldoAcumulado, borderColor: FIN_CORES.saldo,
          borderDash: [5, 4], tension: .3, pointRadius: 0 }
      ]
    },
    options: finOpcoesBase()
  });
}

function finCriarGraficoAging(chave, canvasId, tipo, cor) {
  var serie = finSerieAging(tipo);
  var opcoes = finOpcoesBase();
  opcoes.plugins.legend.display = false;

  finCriarGrafico(chave, canvasId, {
    type: 'bar',
    data: {
      labels: serie.labels,
      datasets: [{
        label: tipo === 'receita' ? 'A receber' : 'A pagar',
        data: serie.valores,
        backgroundColor: serie.labels.map(function(label) {
          if (label === 'A vencer') return FIN_CORES.neutro;
          if (label === 'Baixado')  return cor;
          return FIN_CORES.atencao;
        }),
        borderRadius: 4
      }]
    },
    options: opcoes
  });
}
