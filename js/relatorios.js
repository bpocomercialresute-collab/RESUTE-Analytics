// =============================================================================
// ANÁLISE DE VENDAS — navegação
// =============================================================================

function avGoHome() {
  document.getElementById('av-home').style.display     = 'block';
  document.getElementById('av-bd-area').style.display  = 'none';
  document.getElementById('av-rel-area').style.display = 'none';
  document.getElementById('av-rep-area').style.display = 'none';
}

function avShowBD() {
  document.getElementById('av-home').style.display     = 'none';
  document.getElementById('av-bd-area').style.display  = 'block';
  document.getElementById('av-rel-area').style.display = 'none';
  document.getElementById('av-rep-area').style.display = 'none';
  if (typeof jssEnsureInit === 'function') jssEnsureInit();
}

function avShowRel(tipo) {
  document.getElementById('av-home').style.display     = 'none';
  document.getElementById('av-bd-area').style.display  = 'none';

  // RELAT REPRESENTANTES → área própria com 7 abas
  if (tipo === 'relat-representantes') {
    document.getElementById('av-rel-area').style.display = 'none';
    document.getElementById('av-rep-area').style.display = 'block';
    if (typeof repUpdateAll === 'function') repUpdateAll();
    return;
  }

  // RELATÓRIOS / RELAT PRODUTOS → área de relatórios de produto
  document.getElementById('av-rel-area').style.display = 'block';
  document.getElementById('av-rep-area').style.display = 'none';

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
  // Dispara render da aba de representantes
  if (tab.dataset.area === 'rep' && typeof repRenderTab === 'function') {
    repRenderTab(tab.dataset.target);
  }
});