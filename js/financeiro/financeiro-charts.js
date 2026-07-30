// =============================================================================
// FINANCEIRO — CHARTS (FASE 1: espaco reservado)
// =============================================================================
// Todos os graficos do modulo financeiro.
//
// REGRA OBRIGATORIA: toda instancia Chart.js criada aqui precisa ser guardada
// em FIN_CHARTS[chave] via finCriarGrafico(). E FIN_CHARTS que
// financeiroDestruir() percorre para dar destroy(). Chart criado fora desse
// registro vaza memoria e quebra o canvas ao reabrir o modulo.
// =============================================================================

/**
 * Cria (ou recria) um grafico registrado em FIN_CHARTS.
 * @param {string} chave     identificador estavel do grafico
 * @param {string} canvasId  id do <canvas> no DOM
 * @param {object} config    config do Chart.js
 */
function finCriarGrafico(chave, canvasId, config) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return null;

  if (FIN_CHARTS[chave]) {
    try { FIN_CHARTS[chave].destroy(); } catch (e) {}
    delete FIN_CHARTS[chave];
  }

  FIN_CHARTS[chave] = new Chart(canvas.getContext('2d'), config);
  return FIN_CHARTS[chave];
}

/** FASE 2 — montar os graficos a partir de FIN_DATA. */
function finRenderizarGraficos() {
  // Reaproveite colorPalette de js/constants.js para manter a identidade visual.
  // Exemplo do contrato esperado:
  //   finCriarGrafico('fluxo', 'fin-chart-fluxo', { type:'line', data:{...}, options:{...} });
}
