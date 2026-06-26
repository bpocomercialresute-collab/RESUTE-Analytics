// =============================================================================
// RELATORIOS.JS — Navegação entre áreas do app
// =============================================================================

function _hide(id){ var e=document.getElementById(id); if(e) e.style.display='none'; }
function _show(id){ var e=document.getElementById(id); if(e) e.style.display='block'; }
function _setBreadcrumb(txt){ var e=document.getElementById('breadcrumb-text'); if(e) e.textContent=txt; }

function avGoHome() {
  _hide('av-bd-area');
  _hide('av-rel-area');
  _hide('av-rep-area');
  _show('av-home');
  _setBreadcrumb('Início');
}

function avShowBD() {
  _hide('av-home');
  _hide('av-rel-area');
  _hide('av-rep-area');
  _show('av-bd-area');
  _setBreadcrumb('BD & Cadastros');
  if (typeof jssEnsureInit === 'function') jssEnsureInit();
}

function avShowRel(tipo) {
  _hide('av-home');
  _hide('av-bd-area');
  _hide('av-rep-area');

  // RELAT REPRESENTANTES vai para área própria
  if (tipo === 'relat-representantes') {
    _show('av-rep-area');
    _setBreadcrumb('Relat. Representantes');
    if (typeof BD_DATA !== 'undefined' && BD_DATA.rows && BD_DATA.rows.length > 0) {
      if (typeof repUpdateAll === 'function') repUpdateAll();
    }
    return;
  }

  // RELAT PRODUTOS
  _show('av-rel-area');
  _setBreadcrumb('Relat. Produtos');

  // Gera todos os relatórios se tiver dados
  if (typeof BD_DATA !== 'undefined' && BD_DATA.rows && BD_DATA.rows.length > 0) {
    try { if (typeof bdUpdateCadastroInsights === 'function') bdUpdateCadastroInsights(); } catch(e){ console.error(e); }
    try { if (typeof bdUpdateVendaProduto    === 'function') bdUpdateVendaProduto(); }    catch(e){ console.error(e); }
    try { if (typeof bdUpdateLaudoGrupo      === 'function') bdUpdateLaudoGrupo(); }      catch(e){ console.error(e); }
    try { if (typeof bdUpdateLaudoMarca      === 'function') bdUpdateLaudoMarca(); }      catch(e){ console.error(e); }
    try { if (typeof bdUpdateLaudoGruposAno  === 'function') bdUpdateLaudoGruposAno(); }  catch(e){ console.error(e); }
    try { if (typeof bdUpdateLaudoGruposAno02=== 'function') bdUpdateLaudoGruposAno02();} catch(e){ console.error(e); }
  } else {
    // Sem dados — mostra aviso em cada painel
    var msg = '<div class="rel-sem-dados">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="40" height="40"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
      + '<p>Nenhum dado carregado</p>'
      + '<span>Clique em <b>Sincronizar</b> para buscar os dados da API, ou acesse <b>BD & Cadastros</b> e cole manualmente.</span>'
      + '</div>';
    ['av-rel-cadastro-insights','av-rel-venda-produto','av-rel-laudo-grupo','av-rel-laudo-ano','av-rel-laudo-ano02','av-rel-laudo-marca'].forEach(function(id){
      var el = document.getElementById(id);
      if (el) el.innerHTML = msg;
    });
  }

  // Ativa a aba correta
  var alvo = 'av-rel-cadastro-insights';
  if (tipo === 'relat-produtos') alvo = 'av-rel-cadastro-insights';
  document.querySelectorAll('#av-rel-area .av-tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('#av-rel-area .av-tab-pane').forEach(function(p){ p.classList.remove('active'); });
  var tab  = document.querySelector('#av-rel-area [data-target="'+alvo+'"]');
  var pane = document.getElementById(alvo);
  if (tab)  tab.classList.add('active');
  if (pane) pane.classList.add('active');
}

// Troca de abas genérica
document.addEventListener('click', function(e) {
  var tab = e.target.closest('.av-tab');
  if (!tab || !tab.dataset.target) return;
  var bar  = tab.closest('.av-tabs-bar');
  if (!bar) return;
  var area = bar.parentElement;
  bar.querySelectorAll('.av-tab').forEach(function(t){ t.classList.remove('active'); });
  area.querySelectorAll('.av-tab-pane').forEach(function(p){ p.classList.remove('active'); });
  tab.classList.add('active');
  var pane = document.getElementById(tab.dataset.target);
  if (pane) pane.classList.add('active');
  if (tab.dataset.area === 'rep' && typeof repRenderTab === 'function') {
    repRenderTab(tab.dataset.target);
  }
});
