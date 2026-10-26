// =============================================================================
// FINANCEIRO — ADMIN
// =============================================================================
// O fluxo antigo de importacao manual em fin_lancamentos (colar planilha,
// "Limpar lancamentos") foi removido daqui — nao tinha mais nenhum caller,
// substituido pelo fluxo DRE (fin_dre_lancamentos/fin_dre_plano_contas),
// que o admin alimenta direto nas abas BD/Plano de Contas do painel DRE.
// =============================================================================

// ── RESUMO POR EMPRESA (consultado ao abrir a secao Financeiro do console) ──

var FIN_ADMIN_RESUMO = {};   // empresa_id -> { registros, receita, despesa }
var FIN_ADMIN_RESUMO_OK = false;

async function finAdminCarregarResumo(force) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  if (FIN_ADMIN_RESUMO_OK && !force) return;

  try {
    var linhas = await _fetchAll(
      SUPA_URL + '/rest/v1/fin_lancamentos?select=empresa_id,tipo,valor,status&order=id.asc',
      { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    );
    var resumo = {};
    (Array.isArray(linhas) ? linhas : []).forEach(function(l) {
      var id = String(l.empresa_id);
      if (!resumo[id]) resumo[id] = { registros: 0, receita: 0, despesa: 0 };
      resumo[id].registros += 1;
      if (String(l.status).toLowerCase() === 'cancelado') return;
      var tipo = String(l.tipo || '').trim().toLowerCase();
      if (tipo === 'receita') resumo[id].receita += Number(l.valor) || 0;
      else if (tipo === 'despesa') resumo[id].despesa += Number(l.valor) || 0;
    });

    FIN_ADMIN_RESUMO = resumo;
    FIN_ADMIN_RESUMO_OK = true;
  } catch (e) {
    // Tabela ainda não criada ou indisponível: os cards apenas não mostram volume
    FIN_ADMIN_RESUMO = {};
    FIN_ADMIN_RESUMO_OK = false;
    console.warn('[FIN-ADMIN] Resumo indisponível:', e && e.message);
  }

  if (typeof adminConsoleRenderFinanceiro === 'function') adminConsoleRenderFinanceiro();
}
