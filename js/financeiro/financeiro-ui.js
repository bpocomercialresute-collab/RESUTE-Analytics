// =============================================================================
// FINANCEIRO — UI (FASE 1: espaco reservado)
// =============================================================================
// Renderiza KPIs, secoes e tabelas dentro de #view-dash-financeiro.
//
// FASE 1: mostra apenas o estado vazio "Módulo financeiro em construção".
// FASE 2: preencher finRenderizarKpis() / finRenderizarSecoes() com FIN_DATA
//         e remover finRenderizarPlaceholder().
//
// Nunca use innerHTML com dado vindo do banco sem escapar — reaproveite
// escapeHtml() de js/utils.js, como o resto do projeto faz.
// =============================================================================

function finRenderizar() {
  if (MODULO_META && MODULO_META.financeiro && !MODULO_META.financeiro.disponivel) {
    finRenderizarPlaceholder();
    return;
  }
  finRenderizarKpis();
  finRenderizarSecoes();
  if (typeof finRenderizarGraficos === 'function') finRenderizarGraficos();
}

/** FASE 1 — estado vazio. Remover quando o modulo existir. */
function finRenderizarPlaceholder() {
  var main = document.getElementById('fin-conteudo');
  if (!main) return;
  main.innerHTML =
      '<div class="fin-empty">'
    +   '<div class="fin-empty-icon">'
    +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="28" height="28">'
    +       '<path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'
    +     '</svg>'
    +   '</div>'
    +   '<strong>Módulo financeiro em construção</strong>'
    +   '<p>O espaço já está reservado no sistema. Assim que a ferramenta for publicada, '
    +   'os relatórios financeiros aparecem aqui — sem precisar refazer acesso ou contrato.</p>'
    + '</div>';
}

/** FASE 2 — KPIs do topo (a receber, a pagar, saldo, inadimplencia...). */
function finRenderizarKpis() {
  var alvo = document.getElementById('fin-kpis');
  if (!alvo) return;
  alvo.innerHTML = '';
}

/** FASE 2 — secoes de relatorio (fluxo de caixa, contas, categorias...). */
function finRenderizarSecoes() {
  var alvo = document.getElementById('fin-secoes');
  if (!alvo) return;
  alvo.innerHTML = '';
}
