// =============================================================================
// FILTERS — Filtros do dashboard
// =============================================================================

/** Aplica os filtros ativos e re-renderiza o dashboard */
function aplicarFiltros() {
  const filters = state.activeFilters;
  state.filtered = state.unified.filter(r => {
    for (const key in filters) {
      const val = filters[key];
      if (!val) continue;
      if (key === 'dtIni') { if (!r.data || r.data < new Date(val + 'T00:00:00')) return false; }
      else if (key === 'dtFim') { if (!r.data || r.data > new Date(val + 'T23:59:59')) return false; }
      else if (key === 'mesAno') { if (r.mesAno !== val) return false; }
      else if (key.startsWith('custom::')) { if (r[key] !== val) return false; }
      else { if (r[key.toLowerCase()] !== val && r[key] !== val) return false; }
    }
    return true;
  });
  renderDashboard();
}

/** Retorna valores únicos de uma dimensão (respeitando os outros filtros) */
function uniqueVals(key) {
  const set = new Set();
  state.unified.forEach(r => {
    const testFilters = { ...state.activeFilters };
    delete testFilters[key];
    let ok = true;
    for (const k in testFilters) {
      const v = testFilters[k];
      if (!v) continue;
      if (k === 'dtIni') { if (!r.data || r.data < new Date(v + 'T00:00:00')) ok = false; }
      else if (k === 'dtFim') { if (!r.data || r.data > new Date(v + 'T23:59:59')) ok = false; }
      else if (k.startsWith('custom::')) { if (r[k] !== v) ok = false; }
      else if (r[k.toLowerCase()] !== v && r[k] !== v) ok = false;
    }
    if (ok) {
      const val = key.startsWith('custom::') ? r[key] : r[key];
      if (val && val !== '—') set.add(val);
    }
  });
  return [...set].sort();
}

/** Renderiza o painel de filtros do dashboard */
function renderFilters() {
  const dims       = state.activeDimensions;
  const customCols = getCustomCols('pedidos');
  let html = '';

  if (dims.includes('DATA')) {
    html += `<input type="date" id="fltDtIni" title="Data inicial" onchange="onFilterChange('dtIni', this.value)" value="${state.activeFilters.dtIni || ''}">`;
    html += `<input type="date" id="fltDtFim" title="Data final" onchange="onFilterChange('dtFim', this.value)" value="${state.activeFilters.dtFim || ''}">`;
    html += `<select id="fltMesAno" onchange="onFilterChange('mesAno', this.value)"><option value="">Todos os meses</option>${uniqueVals('mesAno').map(v => `<option value="${v}" ${state.activeFilters.mesAno === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  }
  if (dims.includes('PRODUTO')) {
    html += `<select onchange="onFilterChange('produto', this.value)"><option value="">Todos os produtos</option>${uniqueVals('produto').map(v => `<option value="${v}" ${state.activeFilters.produto === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  }
  if (dims.includes('COR') || dims.includes('COR_EXTRAIDA')) {
    html += `<select onchange="onFilterChange('cor', this.value)"><option value="">Todas as cores</option>${uniqueVals('cor').map(v => `<option value="${v}" ${state.activeFilters.cor === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  }
  if (dims.includes('TAMANHO') || dims.includes('TAMANHO_EXTRAIDO')) {
    html += `<select onchange="onFilterChange('tamanho', this.value)"><option value="">Todos os tamanhos</option>${uniqueVals('tamanho').map(v => `<option value="${v}" ${state.activeFilters.tamanho === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  }
  if (dims.includes('ESTAMPA')) {
    html += `<select onchange="onFilterChange('estampa', this.value)"><option value="">Todas as estampas</option>${uniqueVals('estampa').map(v => `<option value="${v}" ${state.activeFilters.estampa === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  }
  if (dims.includes('STATUS')) {
    html += `<select onchange="onFilterChange('status', this.value)"><option value="">Todos os status</option>${uniqueVals('status').map(v => `<option value="${v}" ${state.activeFilters.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  }
  customCols.forEach(h => {
    const k = `custom::${h}`;
    html += `<select onchange="onFilterChange('${k}', this.value)"><option value="">Todos — ${escapeHtml(h)}</option>${uniqueVals(k).map(v => `<option value="${escapeAttr(v)}" ${state.activeFilters[k] === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>`;
  });

  html += `<button class="btn btn-warning" onclick="limparFiltros()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></svg>
    Limpar filtros
  </button>`;

  $('filterGrid').innerHTML = html;
}

function onFilterChange(key, value) {
  if (value) state.activeFilters[key] = value;
  else delete state.activeFilters[key];
  aplicarFiltros();
}

function limparFiltros() {
  state.activeFilters = {};
  aplicarFiltros();
}
