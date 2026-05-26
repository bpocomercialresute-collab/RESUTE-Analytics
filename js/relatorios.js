// =============================================================================
// ANÁLISE DE VENDAS — Navegação entre menus e abas (interface Excel)
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

function relShowVendas(tipo) {
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

// Navegação entre abas (BD, CLIENTES, etc.)
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.rel-tab');
  if (!tab || !tab.dataset.target) return;
  const target = tab.dataset.target;
  const bar = tab.closest('.rel-tabs-bar');
  bar.querySelectorAll('.rel-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  document.querySelectorAll('.rel-tab-pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById(target);
  if (pane) pane.classList.add('active');
});