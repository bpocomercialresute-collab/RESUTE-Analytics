// =============================================================================
// ANÁLISE DE VENDAS — navegação
// =============================================================================

function _hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function _show(id, type) { const el = document.getElementById(id); if (el) el.style.display = type||'block'; }

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
  if (typeof jssEnsureInit === 'function') jssEnsureInit();
}

function avShowRel(tipo) {
  _hide('av-home');
  _hide('av-bd-area');

  if (tipo === 'relat-representantes') {
    _hide('av-rel-area');
    _show('av-rep-area');
    if (typeof repUpdateAll === 'function') repUpdateAll();
    return;
  }

  _show('av-rel-area');
  _hide('av-rep-area');

  const mapa = {
    'laudo-grupo':    'av-rel-laudo-grupo',
    'relat-produtos': 'av-rel-venda-produto',
  };
  const target = mapa[tipo] || 'av-rel-laudo-grupo';
  document.querySelectorAll('#av-rel-area .av-tab').forEach(t  => t.classList.remove('active'));
  document.querySelectorAll('#av-rel-area .av-tab-pane').forEach(p => p.classList.remove('active'));
  const tab  = document.querySelector(`#av-rel-area [data-target="${target}"]`);
  const pane = document.getElementById(target);
  if (tab)  tab.classList.add('active');
  if (pane) pane.classList.add('active');
}

// Abas universais
document.addEventListener('click', e => {
  const tab = e.target.closest('.av-tab');
  if (!tab || !tab.dataset.target) return;
  const bar  = tab.closest('.av-tabs-bar');
  const area = bar.parentElement;
  bar.querySelectorAll('.av-tab').forEach(t  => t.classList.remove('active'));
  area.querySelectorAll('.av-tab-pane').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  const pane = document.getElementById(tab.dataset.target);
  if (pane) pane.classList.add('active');
  if (tab.dataset.area === 'rep' && typeof repRenderTab === 'function') {
    repRenderTab(tab.dataset.target);
  }
});