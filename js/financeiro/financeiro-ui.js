// =============================================================================
// FINANCEIRO — UI
// =============================================================================
// Renderiza KPIs, abas, tabelas e estados vazios de #view-dash-financeiro.
//
// O layout ja e o definitivo. Enquanto MODULO_META.financeiro.disponivel for
// false, tudo desenha em estado vazio e o aviso de construcao aparece no topo.
// Na Fase 2 basta as funcoes finCalc* devolverem numeros reais.
//
// Nunca montar innerHTML com dado de banco sem escapar — use escapeHtml()
// de js/utils.js, como o resto do projeto faz.
// =============================================================================

/**
 * Contrato de KPIs do painel. A Fase 2 so precisa preencher `calc`, que
 * recebe FIN_DATA e devolve { valor, detalhe } — nada de mexer no layout.
 */
var FIN_KPIS = [
  { id: 'receber',      titulo: 'A receber no período', tipo: 'moeda',   nota: 'Títulos em aberto com vencimento no recorte.' },
  { id: 'pagar',        titulo: 'A pagar no período',   tipo: 'moeda',   nota: 'Compromissos em aberto no recorte.' },
  { id: 'saldo',        titulo: 'Saldo previsto',       tipo: 'moeda',   nota: 'Diferença entre entradas e saídas previstas.' },
  { id: 'recebido',     titulo: 'Recebido',             tipo: 'moeda',   nota: 'Baixas confirmadas no período.' },
  { id: 'pago',         titulo: 'Pago',                 tipo: 'moeda',   nota: 'Pagamentos confirmados no período.' },
  { id: 'inadimplencia',titulo: 'Inadimplência',        tipo: 'percent', nota: 'Parcela vencida sobre o total a receber.' }
];

/** Colunas de cada tabela. Fase 2: alimentar `linhas`. */
var FIN_TABELAS = {
  'fin-tab-categorias': { colunas: ['Categoria', 'Total', '% do total'],                    vazio: 'Nenhuma despesa categorizada no período.' },
  'fin-tab-receber':    { colunas: ['Vencimento', 'Cliente', 'Documento', 'Valor', 'Status'], vazio: 'Nenhum título a receber no período.' },
  'fin-tab-pagar':      { colunas: ['Vencimento', 'Fornecedor', 'Documento', 'Valor', 'Status'], vazio: 'Nenhum título a pagar no período.' },
  'fin-tab-fluxo':      { colunas: ['Data', 'Descrição', 'Categoria', 'Entrada', 'Saída', 'Saldo'], vazio: 'Sem movimentação no período.' },
  'fin-tab-dre':        { colunas: ['Linha', 'Valor', '% da receita'],                      vazio: 'Sem resultado apurado no período.' }
};

// ── ENTRADA PRINCIPAL ────────────────────────────────────────────────────────

function finRenderizar() {
  var emConstrucao = !(typeof MODULO_META !== 'undefined'
    && MODULO_META.financeiro && MODULO_META.financeiro.disponivel);

  finRenderizarAvisoConstrucao(emConstrucao);
  finRenderizarPeriodoLabel();
  finRenderizarKpis();
  finRenderizarSecoes();
  if (typeof finRenderizarGraficos === 'function') finRenderizarGraficos();
}

/** Banner do topo. Some sozinho quando o módulo virar disponível. */
function finRenderizarAvisoConstrucao(mostrar) {
  var alvo = document.getElementById('fin-conteudo');
  if (!alvo) return;
  if (!mostrar) { alvo.innerHTML = ''; return; }

  alvo.innerHTML =
      '<div class="fin-empty">'
    +   '<div class="fin-empty-icon">'
    +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="28" height="28">'
    +       '<path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'
    +     '</svg>'
    +   '</div>'
    +   '<strong>Módulo financeiro em construção</strong>'
    +   '<p>A estrutura do painel já está pronta — KPIs, contas a receber e a pagar, '
    +   'fluxo de caixa e resultado. Assim que a base de dados financeira for conectada, '
    +   'os números aparecem aqui automaticamente.</p>'
    + '</div>';
}

function finRenderizarPeriodoLabel() {
  var el = document.getElementById('fin-periodo-label');
  if (!el) return;
  el.textContent = (typeof finPeriodoDescricao === 'function') ? finPeriodoDescricao() : '';
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

function finRenderizarKpis() {
  var alvo = document.getElementById('fin-kpis');
  if (!alvo) return;

  alvo.innerHTML = FIN_KPIS.map(function(kpi) {
    var resultado = (typeof finCalcularKpi === 'function') ? finCalcularKpi(kpi) : null;
    var valor = resultado && resultado.valor != null
      ? finFormatarValor(resultado.valor, kpi.tipo)
      : '—';
    var detalhe = (resultado && resultado.detalhe) || kpi.nota;

    // Mesma estrutura do KPI do painel comercial — reaproveita o CSS existente
    return '<div class="dc-kpi-card">'
      + '<div class="dc-kpi-value">' + escapeHtml(valor) + '</div>'
      + '<div class="dc-kpi-label">' + escapeHtml(kpi.titulo) + '</div>'
      + '<div class="dc-kpi-sub">' + escapeHtml(detalhe) + '</div>'
      + '</div>';
  }).join('');
}

function finFormatarValor(valor, tipo) {
  if (valor == null || isNaN(valor)) return '—';
  if (tipo === 'percent') return Number(valor).toFixed(1).replace('.', ',') + '%';
  if (tipo === 'moeda') return finFormatarMoedaCurta(valor);
  return String(valor);
}

// ── TABELAS E SECOES ─────────────────────────────────────────────────────────

function finRenderizarSecoes() {
  Object.keys(FIN_TABELAS).forEach(function(id) {
    var alvo = document.getElementById(id);
    if (!alvo) return;

    var config = FIN_TABELAS[id];
    var linhas = (typeof finLinhasTabela === 'function') ? finLinhasTabela(id) : [];

    if (!linhas || !linhas.length) {
      alvo.innerHTML = finEstadoVazio(config.vazio);
      return;
    }

    alvo.innerHTML = '<table class="dc-tabela"><thead><tr>'
      + config.colunas.map(function(c) { return '<th>' + escapeHtml(c) + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + linhas.map(function(linha) {
          return '<tr>' + linha.map(function(celula) {
            return '<td>' + escapeHtml(String(celula == null ? '' : celula)) + '</td>';
          }).join('') + '</tr>';
        }).join('')
      + '</tbody></table>';
  });

  finRenderizarAlertas();
}

function finEstadoVazio(mensagem) {
  return '<div class="fin-tabela-vazia">' + escapeHtml(mensagem || 'Sem dados no período.') + '</div>';
}

/** Fase 2: alertas de vencido, saldo negativo, concentração de cliente. */
function finRenderizarAlertas() {
  var alvo = document.getElementById('fin-alertas');
  if (!alvo) return;
  var alertas = (typeof finCalcularAlertas === 'function') ? finCalcularAlertas() : [];
  if (!alertas.length) { alvo.innerHTML = ''; return; }

  // Classes iguais às do painel comercial: positivo | negativo | atencao
  alvo.innerHTML = alertas.map(function(alerta) {
    return '<div class="dc-alert-card ' + escapeHtml(alerta.tipo || 'atencao') + '">'
      + '<strong>' + escapeHtml(alerta.titulo || '') + '</strong>'
      + '<span>' + escapeHtml(alerta.detalhe || '') + '</span>'
      + '</div>';
  }).join('');
}

// ── ABAS ─────────────────────────────────────────────────────────────────────

function finAbrirAba(paneId, btn) {
  document.querySelectorAll('#view-dash-financeiro .fin-pane').forEach(function(pane) {
    pane.classList.toggle('active', pane.id === paneId);
  });
  document.querySelectorAll('#view-dash-financeiro .fin-tab').forEach(function(tab) {
    tab.classList.toggle('active', tab.dataset.finPane === paneId);
  });
  if (btn) btn.classList.add('active');

  // Chart.js precisa recalcular o canvas que estava escondido
  if (typeof finRenderizarGraficos === 'function') finRenderizarGraficos();
}
