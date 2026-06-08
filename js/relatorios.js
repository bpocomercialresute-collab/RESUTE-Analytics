// =============================================================================
// ANÁLISE DE VENDAS — navegação
// =============================================================================

function _hide(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }
function _show(id, type) { var el = document.getElementById(id); if (el) el.style.display = type||'block'; }

function avGoHome() {
  _show('av-home');
  _hide('av-bd-area');
  _hide('av-rel-area');
  _hide('av-rep-area');
}

function avShowBD() {
  _hide('av-home');
  _show('av-bd-area');
  _hide('av-rel-area');
  _hide('av-rep-area');
  if (typeof bdgInit === 'function') bdgInit();
  if (typeof jssEnsureInit === 'function') jssEnsureInit();
}

// Regenera TODOS os relatórios de produto (chamado ao navegar)
function avRegeneraProdutos() {
  if (typeof BD_DATA === 'undefined' || !BD_DATA.rows || !BD_DATA.rows.length) return false;
  try { if (typeof bdUpdateVendaProduto    === 'function') bdUpdateVendaProduto(); } catch(e){ console.error('VendaProduto',e); }
  try { if (typeof bdUpdateLaudoGrupo       === 'function') bdUpdateLaudoGrupo(); } catch(e){ console.error('LaudoGrupo',e); }
  try { if (typeof bdUpdateLaudoMarca       === 'function') bdUpdateLaudoMarca(); } catch(e){ console.error('LaudoMarca',e); }
  try { if (typeof bdUpdateLaudoGruposAno   === 'function') bdUpdateLaudoGruposAno(); } catch(e){ console.error('GruposAno',e); }
  try { if (typeof bdUpdateLaudoGruposAno02 === 'function') bdUpdateLaudoGruposAno02(); } catch(e){ console.error('GruposAno02',e); }
  return true;
}

function avShowRel(tipo) {
  _hide('av-home');
  _hide('av-bd-area');

  // RELAT REPRESENTANTES → área própria
  if (tipo === 'relat-representantes') {
    _hide('av-rel-area');
    _show('av-rep-area');
    if (typeof repUpdateAll === 'function') {
      if (typeof BD_DATA === 'undefined' || !BD_DATA.rows || !BD_DATA.rows.length) {
        alert('Cole os dados no BD e clique em "Processar Relatórios" primeiro.');
      }
      repUpdateAll();
    }
    return;
  }

  // RELATÓRIOS / RELAT PRODUTOS
  _show('av-rel-area');
  _hide('av-rep-area');

  // Regenera os relatórios com os dados atuais do BD
  var temDados = avRegeneraProdutos();
  if (!temDados) {
    alert('Cole os dados no BD e clique em "Processar Relatórios" primeiro.');
  }

  var mapa = {
    'laudo-grupo':    'av-rel-laudo-grupo',
    'relat-produtos': 'av-rel-venda-produto',
  };
  var target = mapa[tipo] || 'av-rel-laudo-grupo';
  document.querySelectorAll('#av-rel-area .av-tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('#av-rel-area .av-tab-pane').forEach(function(p){ p.classList.remove('active'); });
  var tab  = document.querySelector('#av-rel-area [data-target="'+target+'"]');
  var pane = document.getElementById(target);
  if (tab)  tab.classList.add('active');
  if (pane) pane.classList.add('active');
}

// Abas universais
document.addEventListener('click', function(e) {
  var tab = e.target.closest('.av-tab');
  if (!tab || !tab.dataset.target) return;
  var bar  = tab.closest('.av-tabs-bar');
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