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

async function dreAdminCarregarResumo(force) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  if (DRE_ADMIN_RESUMO_OK && !force) return;

  try {
    var respostas = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/fin_dre_plano_contas?select=empresa_id&limit=100000',
        { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }),
      fetch(SUPA_URL + '/rest/v1/fin_dre_lancamentos?select=empresa_id&limit=100000',
        { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } })
    ]);
    respostas.forEach(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); });

    var dados = await Promise.all(respostas.map(function(r) { return r.json(); }));
    var resumo = {};

    (Array.isArray(dados[0]) ? dados[0] : []).forEach(function(l) {
      var id = String(l.empresa_id);
      if (!resumo[id]) resumo[id] = { contas: 0, lancamentos: 0 };
      resumo[id].contas += 1;
    });
    (Array.isArray(dados[1]) ? dados[1] : []).forEach(function(l) {
      var id = String(l.empresa_id);
      if (!resumo[id]) resumo[id] = { contas: 0, lancamentos: 0 };
      resumo[id].lancamentos += 1;
    });

    DRE_ADMIN_RESUMO = resumo;
    DRE_ADMIN_RESUMO_OK = true;
  } catch (e) {
    // Tabelas ainda nao criadas (docs/supabase-dre.sql nao rodou) ou indisponiveis
    DRE_ADMIN_RESUMO = {};
    DRE_ADMIN_RESUMO_OK = false;
    console.warn('[DRE-ADMIN] Resumo indisponível:', e && e.message);
  }

  if (typeof adminConsoleRenderFinanceiro === 'function') adminConsoleRenderFinanceiro();
}

/** Linha de volume mostrada no card da empresa. */
function dreAdminResumoTexto(empresaId) {
  var resumo = DRE_ADMIN_RESUMO[String(empresaId)];
  if (!resumo || (!resumo.contas && !resumo.lancamentos)) return 'Nenhum dado de DRE cadastrado.';
  return resumo.contas.toLocaleString('pt-BR') + ' conta(s) no plano · '
    + resumo.lancamentos.toLocaleString('pt-BR') + ' lançamento(s)';
}
