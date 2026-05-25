// =============================================================================
// DASHBOARD — Tabs, KPIs e renderização do dashboard completo
// =============================================================================

/** Agrupa state.filtered por uma dimensão e retorna ranking por faturamento */
function agrupar(key) {
  const map = new Map();
  state.filtered.forEach(r => {
    const k = String(key.startsWith('custom::') ? r[key] : r[key] || 'N/D').trim() || 'N/D';
    let o = map.get(k);
    if (!o) { o = { nome: k, qtd: 0, fat: 0 }; map.set(k, o); }
    o.qtd += r.quantidade;
    o.fat += r.valorTotal;
  });
  return [...map.values()].sort((a, b) => b.fat - a.fat);
}

/** Agrupa por data, ordenado cronologicamente */
function agruparData() {
  const map = new Map();
  state.filtered.forEach(r => {
    const k = fmtData(r.data) || 'S/ data';
    let o = map.get(k);
    if (!o) { o = { dataOri: r.data, nome: k, qtd: 0, fat: 0 }; map.set(k, o); }
    o.qtd += r.quantidade;
    o.fat += r.valorTotal;
  });
  return [...map.values()].sort((a, b) => (a.dataOri || 0) - (b.dataOri || 0));
}

/** Constrói o HTML interno de uma tab */
function buildTabHTML(tab) {
  if (tab.id === 'tab-resumo') {
    const hasData = state.activeDimensions.includes('DATA');
    return `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label"><span class="kpi-indicator info"></span>Registros</div><div class="kpi-value" id="kpiLinhas">0</div><div class="kpi-caption">Total filtrado</div></div>
        <div class="kpi"><div class="kpi-label"><span class="kpi-indicator info"></span>Volume</div><div class="kpi-value" id="kpiPecas">0</div><div class="kpi-caption">Quantidade</div></div>
        <div class="kpi"><div class="kpi-label"><span class="kpi-indicator ok"></span>Faturamento</div><div class="kpi-value" id="kpiFat">R$ 0,00</div><div class="kpi-caption">Total</div></div>
        <div class="kpi"><div class="kpi-label"><span class="kpi-indicator info"></span>Ticket médio</div><div class="kpi-value" id="kpiTicket">R$ 0,00</div><div class="kpi-caption">Por linha</div></div>
        <div class="kpi"><div class="kpi-label"><span class="kpi-indicator info"></span>Itens distintos</div><div class="kpi-value" id="kpiMix">0</div><div class="kpi-caption">Mix</div></div>
      </div>
      ${hasData ? `<div class="card" style="margin-bottom:var(--s-4);">
        <div class="card-header"><h3>Evolução do faturamento ao longo do tempo</h3></div>
        <p class="card-caption">Acompanhe a performance diária de vendas.</p>
        <canvas id="chartEvolucao" style="max-height:280px!important;"></canvas>
      </div>` : ''}
      <div class="card-row">
        <div class="card"><div class="card-header"><h3>Top 10 produtos por faturamento</h3></div><p class="card-caption">Os produtos que mais geram receita.</p><canvas id="chartTopResumo" style="max-height:360px!important;"></canvas></div>
        <div class="card"><div class="card-header"><h3>Participação dos top 5</h3></div><p class="card-caption">Concentração de vendas nos principais produtos.</p><canvas id="chartTopDonut" style="max-height:360px!important;"></canvas></div>
      </div>
      ${hasData ? `<div class="card-row">
        <div class="card"><div class="card-header"><h3>Volume vendido por período</h3></div><p class="card-caption">Distribuição de quantidade ao longo do tempo.</p><canvas id="chartQtdPeriodo" style="max-height:260px!important;"></canvas></div>
        <div class="card"><div class="card-header"><h3>Ticket médio por período</h3></div><p class="card-caption">Valor médio por registro em cada dia.</p><canvas id="chartTicketPeriodo" style="max-height:260px!important;"></canvas></div>
      </div>` : ''}
    `;
  }

  if (tab.id === 'tab-produtos')  return rankingTabHTML('produtos',  'Produtos');
  if (tab.id === 'tab-estampas')  return rankingTabHTML('estampas',  'Estampas');
  if (tab.id === 'tab-cores')     return rankingTabHTML('cores',     'Cores');
  if (tab.id === 'tab-tamanhos')  return rankingTabHTML('tamanhos',  'Tamanhos');
  if (tab.id === 'tab-status')    return rankingTabHTML('status',    'Status operacional');
  if (tab.id.startsWith('tab-custom-')) return rankingTabHTML(tab.id, tab.label, tab.customHeader);

  if (tab.id === 'tab-base') return `
    <div class="card">
      <div class="card-header">
        <h3>Base consolidada</h3>
        <div style="display:flex;gap:var(--s-2);">
          <button class="btn btn-ghost btn-sm" onclick="renderBaseAnalitica(100)">100 linhas</button>
          <button class="btn btn-primary btn-sm" onclick="renderBaseAnalitica(99999)">Todas</button>
        </div>
      </div>
      <div class="table-wrap" style="max-height:600px;"><table id="tblBase"></table></div>
    </div>`;

  if (tab.id === 'tab-audit') return `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label"><span class="kpi-indicator ok"></span>SKU exato</div><div class="kpi-value" id="auditSku">0</div></div>
      <div class="kpi"><div class="kpi-label"><span class="kpi-indicator ok"></span>Nome exato</div><div class="kpi-value" id="auditNome">0</div></div>
      <div class="kpi"><div class="kpi-label"><span class="kpi-indicator warn"></span>Busca textual</div><div class="kpi-value" id="auditBusca">0</div></div>
      <div class="kpi"><div class="kpi-label"><span class="kpi-indicator bad"></span>Sem match</div><div class="kpi-value" id="auditSem">0</div></div>
    </div>
    <div class="card-row">
      <div class="card"><div class="card-header"><h3>Origem do dado</h3></div><canvas id="chartAudit"></canvas></div>
      <div class="card"><div class="card-header"><h3>Sem correspondência no cadastro</h3></div><p class="card-caption">Pedidos onde dados foram extraídos só pelo nome.</p><div class="table-wrap"><table id="tblAudit"></table></div></div>
    </div>`;

  return '';
}

/** HTML de uma aba de ranking (produtos, cores, tamanhos, etc.) */
function rankingTabHTML(id, label, customHeader) {
  const lbl   = label.toLowerCase();
  const isProd = id === 'produtos', isCor = id === 'cores', isTam = id === 'tamanhos';
  const descs  = { produtos: 'Análise completa do mix de produtos — identifique os campeões de venda e os produtos em recuperação.', cores: 'Preferências de cores dos clientes — veja quais tonalidades mais vendem.', tamanhos: 'Distribuição de tamanhos — essencial para planejamento de estoque.', estampas: 'Análise das estampas — quais variantes têm melhor performance.', status: 'Distribuição operacional — acompanhe em que estágio os pedidos se encontram.' };
  const desc   = descs[id] || `Análise detalhada de ${lbl}.`;

  return `
    <div class="ranking-intro"><p>${desc}</p></div>
    <div class="kpi-grid" style="margin-bottom:var(--s-4);">
      <div class="kpi"><div class="kpi-label"><span class="kpi-indicator info"></span>Total de ${lbl}</div><div class="kpi-value" id="kpi-${id}-total">0</div><div class="kpi-caption">Itens distintos</div></div>
      <div class="kpi"><div class="kpi-label"><span class="kpi-indicator ok"></span>Líder</div><div class="kpi-value" id="kpi-${id}-lider" style="font-size:16px;line-height:1.3;">—</div><div class="kpi-caption" id="kpi-${id}-liderval">—</div></div>
      <div class="kpi"><div class="kpi-label"><span class="kpi-indicator warn"></span>Concentração top 3</div><div class="kpi-value" id="kpi-${id}-conc">0%</div><div class="kpi-caption">Do faturamento total</div></div>
      <div class="kpi"><div class="kpi-label"><span class="kpi-indicator info"></span>Ticket médio</div><div class="kpi-value" id="kpi-${id}-ticket">R$ 0,00</div><div class="kpi-caption">Por item vendido</div></div>
    </div>
    <div class="card-row">
      <div class="card"><div class="card-header"><h3>Top ${lbl} por faturamento</h3></div><p class="card-caption">Ranking ordenado pelo valor total vendido.</p><canvas id="chart-${id}" style="max-height:380px!important;"></canvas></div>
      <div class="card"><div class="card-header"><h3>Distribuição de ${lbl}</h3></div><p class="card-caption">Participação percentual no faturamento total.</p><canvas id="chart-${id}-donut" style="max-height:380px!important;"></canvas></div>
    </div>
    ${(isTam || isCor) ? `<div class="card-row">
      <div class="card"><div class="card-header"><h3>Top por volume (peças vendidas)</h3></div><p class="card-caption">${isCor ? 'As cores mais movimentadas em unidades.' : 'Os tamanhos com maior giro de estoque.'}</p><canvas id="chart-${id}-qtd" style="max-height:280px!important;"></canvas></div>
      <div class="card"><div class="card-header"><h3>Visão polar</h3></div><p class="card-caption">Comparativo visual alternativo.</p><canvas id="chart-${id}-polar" style="max-height:280px!important;"></canvas></div>
    </div>` : ''}
    ${isProd ? `<div class="card"><div class="card-header"><h3>Análise Pareto — os 80% do faturamento</h3></div><p class="card-caption">Quais produtos respondem pela maior parte da receita. A linha mostra a contribuição acumulada.</p><canvas id="chart-${id}-pareto" style="max-height:320px!important;"></canvas></div>` : ''}
    <div class="card">
      <div class="card-header">
        <h3>Ranking completo</h3>
        <select class="btn btn-sm" style="padding:6px 11px;width:auto;" onchange="window['limit-${id}']=parseInt(this.value);renderRanking('${id}',${customHeader ? `'${escapeAttr(customHeader)}'` : 'null'});">
          <option value="10">Top 10</option><option value="20" selected>Top 20</option>
          <option value="50">Top 50</option><option value="99999">Todos</option>
        </select>
      </div>
      <div class="table-wrap"><table id="tbl-${id}"></table></div>
    </div>`;
}

/** Troca a aba ativa do dashboard */
function switchTab(tabId, el) {
  document.querySelectorAll('#dashTabs .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#dashContent .tab-content').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  $(tabId).classList.add('active');
  renderTabCharts(tabId);
}

/** Renderiza gráficos da aba ativa */
function renderTabCharts(tabId) {
  if (tabId === 'tab-resumo')    { renderResumoCharts(); return; }
  if (tabId === 'tab-produtos')  { renderRanking('produtos'); return; }
  if (tabId === 'tab-estampas')  { renderRanking('estampas'); return; }
  if (tabId === 'tab-cores')     { renderRanking('cores'); return; }
  if (tabId === 'tab-tamanhos')  { renderRanking('tamanhos'); return; }
  if (tabId === 'tab-status')    { renderRanking('status'); return; }
  if (tabId === 'tab-base')      { renderBaseAnalitica(100); return; }
  if (tabId === 'tab-audit')     { renderAudit(); return; }
  if (tabId.startsWith('tab-custom-')) {
    const idx = parseInt(tabId.replace('tab-custom-', ''));
    const h   = getCustomCols('pedidos')[idx];
    if (h) renderRanking(tabId, h);
  }
}

/** Monta as tabs do dashboard e seus containers */
function renderTabs() {
  const dims       = state.activeDimensions;
  const customCols = getCustomCols('pedidos');
  const tabs       = [{ id: 'tab-resumo', label: 'Visão geral', icon: 'chart' }];

  if (dims.includes('PRODUTO'))  tabs.push({ id: 'tab-produtos',  label: 'Produtos',  icon: 'pkg'     });
  if (dims.includes('ESTAMPA'))  tabs.push({ id: 'tab-estampas',  label: 'Estampas',  icon: 'star'    });
  if (dims.includes('COR') || dims.includes('COR_EXTRAIDA'))     tabs.push({ id: 'tab-cores',    label: 'Cores',     icon: 'palette' });
  if (dims.includes('TAMANHO') || dims.includes('TAMANHO_EXTRAIDO')) tabs.push({ id: 'tab-tamanhos', label: 'Tamanhos',  icon: 'ruler'   });
  if (dims.includes('STATUS'))   tabs.push({ id: 'tab-status',    label: 'Status',    icon: 'flag'    });
  customCols.forEach((h, i) => tabs.push({ id: `tab-custom-${i}`, label: h, icon: 'layers', customHeader: h }));
  tabs.push({ id: 'tab-base',  label: 'Base de dados', icon: 'db'    });
  if (state.produtos.raw.length) tabs.push({ id: 'tab-audit', label: 'Auditoria', icon: 'alert' });

  const icons = {
    chart:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/><path d="M18.4 9L12 15.6 8 11.6 3 16.6"/></svg>',
    pkg:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>',
    star:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.8 5.7 21l2.3-7.2-6-4.4h7.6z"/></svg>',
    palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2a10 10 0 0 0 0 20c.26 0 .51-.01.76-.03a1.4 1.4 0 0 0 1.24-1.4v-.5a2.5 2.5 0 0 1 2.5-2.5h1.5a3.5 3.5 0 0 0 3.5-3.5C21 6.5 17 2 12 2z"/></svg>',
    ruler:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01"/></svg>',
    flag:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    layers:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    db:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/></svg>',
    alert:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };

  $('dashTabs').innerHTML = tabs.map((t, i) =>
    `<div class="tab ${i === 0 ? 'active' : ''}" data-tab="${t.id}" onclick="switchTab('${t.id}', this)">${icons[t.icon] || ''}${escapeHtml(t.label)}</div>`
  ).join('');

  $('dashContent').innerHTML = tabs.map((t, i) =>
    `<div id="${t.id}" class="tab-content ${i === 0 ? 'active' : ''}">${buildTabHTML(t)}</div>`
  ).join('');
}

/** Renderiza (ou atualiza) o dashboard completo */
function renderDashboard() {
  if (!$('filterGrid').innerHTML) { renderFilters(); renderTabs(); }
  else renderFilters();

  const rows = state.filtered;
  const n    = rows.length;
  let pecas  = 0, fat = 0;
  const mixSet = new Set();
  rows.forEach(r => { pecas += r.quantidade; fat += r.valorTotal; mixSet.add(r.produto); });

  if ($('kpiLinhas')) $('kpiLinhas').textContent = fmtInt(n);
  if ($('kpiPecas'))  $('kpiPecas').textContent  = fmtInt(pecas);
  if ($('kpiFat'))    $('kpiFat').textContent    = fmtValor(fat);
  if ($('kpiTicket')) $('kpiTicket').textContent = fmtValor(n ? fat / n : 0);
  if ($('kpiMix'))    $('kpiMix').textContent    = fmtInt(mixSet.size);

  const activeTab = document.querySelector('#dashTabs .tab.active');
  if (activeTab) renderTabCharts(activeTab.dataset.tab);
}
