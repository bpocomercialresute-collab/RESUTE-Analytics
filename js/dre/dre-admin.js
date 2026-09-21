// =============================================================================
// DRE — ADMIN (abertura + configuração da empresa)
// =============================================================================
// A digitação do DRE (colar planilha, editar célula a célula, marcar F_V/D_I)
// mudou para dentro do próprio painel — ver js/dre/dre-engine.js (grade nas
// abas Plano de Contas/Lançamentos) e js/dre/dre-view.js (botões "Salvar no
// banco"). Este arquivo cuida só do que é mesmo do console admin:
//
//   - Botão "Abrir DRE" no card da empresa -> dreAbrirDoAdmin() (js/dre/dre-view.js)
//   - Resumo somente-leitura (quantas contas/lançamentos a empresa já tem)
//     mostrado no mesmo card, para o super_admin saber se falta configurar
// =============================================================================

// ── RESUMO POR EMPRESA (mostrado nos cards da aba Financeiro) ────────────────

var DRE_ADMIN_RESUMO = {};   // empresa_id -> { contas, lancamentos }
var DRE_ADMIN_RESUMO_OK = false;
var DRE_ADMIN_RESUMO_ERRO = false;
var DRE_ADMIN_RESUMO_CARREGANDO = false;

/**
 * Total de linhas da empresa numa tabela fin_dre_*. O proxy exige filtro
 * empresa_id em toda leitura financeira, entao a contagem e por empresa
 * (Prefer: count=exact + Range 0-0 -> total no content-range). A busca antiga,
 * sem filtro, tomava 403 sempre e todo card dizia "Nenhum dado de DRE".
 */
async function _dreAdminContar(tabela, empresaId) {
  var r = await fetch(
    SUPA_URL + '/rest/v1/' + tabela + '?empresa_id=eq.' + encodeURIComponent(empresaId) + '&select=id',
    { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'count=exact', 'Range': '0-0' } }
  );
  if (!r.ok) throw new Error('HTTP ' + r.status);
  var faixa = r.headers.get('content-range') || '';
  var total = faixa.indexOf('/') >= 0 ? faixa.split('/')[1] : '0';
  return total === '*' ? 0 : (Number(total) || 0);
}

async function dreAdminCarregarResumo(force) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  if (DRE_ADMIN_RESUMO_CARREGANDO) return;
  if (DRE_ADMIN_RESUMO_OK && !force) return;

  // Pode ser chamado enquanto a lista de empresas do console ainda carrega.
  for (var t = 0; t < 40 && typeof ADMIN_CONSOLE !== 'undefined' && !ADMIN_CONSOLE.loaded; t++) {
    await new Promise(function(resolve) { setTimeout(resolve, 250); });
  }
  var ids = (typeof ADMIN_CONSOLE !== 'undefined' ? ADMIN_CONSOLE.companies : []).map(function(c) {
    return String(c.id || c.empresa_id || '');
  }).filter(Boolean);
  if (!ids.length) return;

  DRE_ADMIN_RESUMO_CARREGANDO = true;
  try {
    var resumo = {};
    var falhas = 0;
    await Promise.all(ids.map(async function(id) {
      try {
        var contagens = await Promise.all([
          _dreAdminContar('fin_dre_plano_contas', id),
          _dreAdminContar('fin_dre_lancamentos', id)
        ]);
        resumo[id] = { contas: contagens[0], lancamentos: contagens[1] };
      } catch (e) {
        falhas += 1;
        console.warn('[DRE-ADMIN] Resumo indisponível para ' + id + ':', e && e.message);
      }
    }));
    DRE_ADMIN_RESUMO = resumo;
    DRE_ADMIN_RESUMO_ERRO = falhas === ids.length;
    DRE_ADMIN_RESUMO_OK = !DRE_ADMIN_RESUMO_ERRO;
  } finally {
    DRE_ADMIN_RESUMO_CARREGANDO = false;
  }

  if (typeof adminConsoleRenderFinanceiro === 'function') adminConsoleRenderFinanceiro();
}

/** Linha de volume mostrada no card da empresa. */
function dreAdminResumoTexto(empresaId) {
  var resumo = DRE_ADMIN_RESUMO[String(empresaId)];
  if (!resumo) return DRE_ADMIN_RESUMO_ERRO ? 'Resumo indisponível no momento.' : 'Carregando resumo...';
  if (!resumo.contas && !resumo.lancamentos) return 'Nenhum dado de DRE cadastrado.';
  return resumo.contas.toLocaleString('pt-BR') + ' conta(s) no plano · '
    + resumo.lancamentos.toLocaleString('pt-BR') + ' lançamento(s)';
}
