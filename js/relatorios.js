// =============================================================================
// RELATÓRIOS — Navegação entre menus e abas
// =============================================================================

function relGoHome() {
  document.getElementById('rel-menu-inicial').style.display = 'block';
  document.getElementById('rel-bd-area').style.display = 'none';
  document.getElementById('rel-vendas-area').style.display = 'none';
}

function relShowBD() {
  document.getElementById('rel-menu-inicial').style.display = 'none';
  document.getElementById('rel-bd-area').style.display = 'block';
  document.getElementById('rel-vendas-area').style.display = 'none';
}

function relShowRelatorios(tipo) {
  document.getElementById('rel-menu-inicial').style.display = 'none';
  document.getElementById('rel-bd-area').style.display = 'none';
  document.getElementById('rel-vendas-area').style.display = 'block';
  const titles = {
    'relatorios': 'RELATÓRIOS',
    'relat-produtos': 'RELAT PRODUTOS',
    'relat-representantes': 'RELAT REPRESENTANTES'
  };
  document.getElementById('rel-vendas-title').textContent = titles[tipo] || 'RELATÓRIOS';
}

// Abas
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.rel-tab');
  if (!tab) return;
  const target = tab.dataset.target;
  const bar = tab.closest('.rel-tabs-bar');
  
  bar.querySelectorAll('.rel-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  
  const area = bar.nextElementSibling;
  const panes = area.parentElement.querySelectorAll('.rel-tab-pane');
  panes.forEach(p => p.classList.remove('active'));
  document.getElementById(target).classList.add('active');
});