// =============================================================================
// CHARTS — Renderização de gráficos (Chart.js) e tabelas
// =============================================================================

function fmtNumeroSmart(v, casas = 2) {
  const n = Number(v) || 0;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: casas
  }).format(n);
}

function fmtInt(v) {
  return fmtNumeroSmart(v, 0);
}

function fmtValor(v) {
  const n = typeof parseSmartNumber === 'function' ? parseSmartNumber(v) : (Number(v) || 0);
  const frac = Math.round(Math.abs(n * 100)) % 100;
  return 'R$ ' + new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: frac === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(n);
}

/** Renderiza (ou atualiza) um gráfico Chart.js */
function renderChart(id, tipo, rotulos, valores, label, extra = {}) {
  if (graficos[id]) { try { graficos[id].destroy(); } catch(e) {} }
  const el = $(id);
  if (!el) return;
  const ctx = el.getContext('2d');

  const labelsFull = rotulos.slice();
  const maxLabelLen = tipo === 'bar' && extra.indexAxis === 'y' ? 32 : 20;
  const labelsDisplay = rotulos.map(l => { const s = String(l || '—'); return s.length > maxLabelLen ? s.substring(0, maxLabelLen - 1) + '…' : s; });

  if (tipo === 'line') {
    extra.backgroundColor = ctx.createLinearGradient(0, 0, 0, 300);
    extra.backgroundColor.addColorStop(0, 'rgba(20,116,111,0.24)');
    extra.backgroundColor.addColorStop(1, 'rgba(20,116,111,0)');
    extra.borderColor       = extra.borderColor || '#14746F';
    extra.fill              = extra.fill !== false;
    extra.tension           = 0.35;
    extra.pointBackgroundColor = '#F0FAF8';
    extra.pointBorderColor  = extra.borderColor;
    extra.pointBorderWidth  = 2;
    extra.pointRadius       = 3;
    extra.pointHoverRadius  = 6;
  }

  const isCircular = ['pie','doughnut','polarArea','radar'].includes(tipo);
  const isMoney    = (label || '').toLowerCase().match(/faturamento|valor|receita/);
  const fmtValue   = v => isMoney ? fmtValor(v) : fmtInt(v);

  graficos[id] = new Chart(ctx, {
    type: tipo,
    data: { labels: labelsDisplay, datasets: [{ label, data: valores, ...extra }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          display: isCircular, position: 'right',
          labels: {
            color: '#5A7A74', padding: 12, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle',
            generateLabels: chart => {
              const d = chart.data;
              if (!d.labels || !d.datasets.length) return [];
              return d.labels.map((lbl, i) => {
                const full = labelsFull[i] || lbl;
                const dl   = String(full).length > 28 ? String(full).substring(0, 27) + '…' : full;
                const bg   = d.datasets[0].backgroundColor;
                return { text: dl, fillStyle: Array.isArray(bg) ? bg[i] : bg, strokeStyle: Array.isArray(bg) ? bg[i] : bg, hidden: false, index: i };
              });
            }
          }
        },
        tooltip: {
          backgroundColor: '#0A2F2F', titleColor: '#FFFFFF', bodyColor: '#D5EDE8',
          borderColor: '#14746F', borderWidth: 1, padding: 10,
          titleFont: { size: 12, weight: '600' }, bodyFont: { size: 12 }, cornerRadius: 6,
          callbacks: {
            title: items => items.map(i => labelsFull[i.dataIndex] || i.label).join(', '),
            label: item  => { const v = item.parsed.y !== undefined ? item.parsed.y : item.parsed; return ` ${label}: ${fmtValue(v)}`; }
          }
        }
      },
      scales: isCircular ? {} : {
        x: { ticks: { color: '#5A7A74', font: { size: 10.5 }, maxRotation: 45 }, grid: { color: '#D5EDE8', drawBorder: false } },
      y: {
          ticks: {
            color: '#5A7A74', font: { size: 10.5 },
            callback: v => {
              if (isMoney) {
                if (v >= 1000000) return 'R$ ' + fmtNumeroSmart(v / 1000000, 1) + 'M';
                if (v >= 1000)    return 'R$ ' + fmtNumeroSmart(v / 1000, 0) + 'k';
                return fmtValor(v);
              }
              return v >= 1000 ? fmtNumeroSmart(v / 1000, 1) + 'k' : fmtInt(v);
            }
          },
          grid: { color: '#D5EDE8', drawBorder: false }
        }
      }
    }
  });
}

/** Gráfico Pareto (bar + line acumulada) */
function renderParetoChart(id, data) {
  if (graficos[id]) { try { graficos[id].destroy(); } catch(e) {} }
  const el = $(id);
  if (!el) return;
  const ctx = el.getContext('2d');

  const labelsFull    = data.map(d => d.nome);
  const labelsDisplay = labelsFull.map(l => { const s = String(l || '—'); return s.length > 14 ? s.substring(0, 12) + '…' : s; });

  graficos[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labelsDisplay,
      datasets: [
        { type: 'bar',  label: 'Faturamento', data: data.map(d => d.fat), backgroundColor: '#14746F', borderRadius: 3, order: 2, yAxisID: 'y' },
        { type: 'line', label: 'Acumulado %', data: data.map(d => d.acum), borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.15)', tension: 0.3, pointBackgroundColor: '#F0FAF8', pointBorderColor: '#059669', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6, order: 1, yAxisID: 'y1', fill: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 700 },
      plugins: {
        legend: { display: true, position: 'top', labels: { color: '#5A7A74', padding: 10, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: {
          backgroundColor: '#0A2F2F', titleColor: '#FFFFFF', bodyColor: '#D5EDE8',
          borderColor: '#14746F', borderWidth: 1, padding: 10,
          callbacks: {
            title: items => items.map(i => labelsFull[i.dataIndex] || i.label).join(', '),
            label:  item  => item.dataset.type === 'line' ? ` Acumulado: ${item.parsed.y.toFixed(1)}%` : ` Faturamento: ${fmtValor(item.parsed.y)}`
          }
        }
      },
      scales: {
        x:  { ticks: { color: '#5A7A74', font: { size: 10 }, maxRotation: 45 }, grid: { color: '#D5EDE8' } },
        y:  { position: 'left',  ticks: { color: '#5A7A74', font: { size: 10.5 }, callback: v => v >= 1000 ? 'R$ ' + (v/1000).toFixed(0) + 'k' : 'R$ ' + v }, grid: { color: '#D5EDE8' } },
        y1: { position: 'right', min: 0, max: 100, ticks: { color: '#059669', font: { size: 10.5 }, callback: v => v + '%' }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

/** Renderiza uma tabela HTML genérica */
function renderTable(id, cols, dados) {
  const thead = `<tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
  let body = '';
  if (!dados.length) {
    body = `<tr><td colspan="${cols.length}" style="text-align:center;padding:24px;color:var(--text-tertiary);">Nenhum registro</td></tr>`;
  } else {
    body = dados.map(r => {
      const tds = cols.map(c => {
        let v = c.fmt ? c.fmt(r[c.key], r) : (r[c.key] !== undefined && r[c.key] !== null && r[c.key] !== '' ? r[c.key] : '-');
        if (c.tag && v !== '-') v = `<span class="tag ${c.tag(v)}">${v}</span>`;
        return `<td>${v}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
  }
  $(id).innerHTML = `<thead>${thead}</thead><tbody>${body}</tbody>`;
}

/** Renderiza gráficos do Resumo geral */
function renderResumoCharts() {
  const hasData = state.activeDimensions.includes('DATA');

  if (hasData) {
    const trend = agruparData();
    if (trend.length) {
      renderChart('chartEvolucao', 'line', trend.map(x => x.nome), trend.map(x => x.fat), 'Faturamento');
      renderChart('chartQtdPeriodo', 'bar', trend.map(x => x.nome), trend.map(x => x.qtd), 'Quantidade', { backgroundColor: '#14746F', borderRadius: 3 });
      renderChart('chartTicketPeriodo', 'line', trend.map(x => x.nome), trend.map(x => x.qtd > 0 ? x.fat / x.qtd : 0), 'Ticket médio', { borderColor: '#059669', fill: false });
    }
  }

  const top = agrupar('produto').slice(0, 10);
  if (top.length) {
    renderChart('chartTopResumo', 'bar', top.map(x => x.nome), top.map(x => x.fat), 'Faturamento',
      { backgroundColor: colorPalette.slice(0, top.length), borderRadius: 4, indexAxis: 'y' });
    const top5   = top.slice(0, 5);
    const outros = agrupar('produto').slice(5).reduce((s, x) => s + x.fat, 0);
    renderChart('chartTopDonut', 'doughnut',
      [...top5.map(x => x.nome), 'Outros'], [...top5.map(x => x.fat), outros], 'Faturamento',
      { backgroundColor: [...colorPalette.slice(0, 5), 'rgba(90,122,116,0.35)'], borderWidth: 0, cutout: '55%' });
  }
}

/** Renderiza gráficos + tabela de uma aba de ranking */
function renderRanking(id, customHeader) {
  const limit   = window['limit-' + id] || 20;
  const keyMap  = { produtos: 'produto', estampas: 'estampa', cores: 'cor', tamanhos: 'tamanho', status: 'status' };
  const key     = customHeader ? `custom::${customHeader}` : (keyMap[id] || id);
  const ranking = agrupar(key);
  const withPos = ranking.slice(0, limit).map((r, i) => ({ ...r, pos: i + 1 }));

  const totalFat = ranking.reduce((s, r) => s + r.fat, 0);
  const totalQtd = ranking.reduce((s, r) => s + r.qtd, 0);
  const top3Fat  = ranking.slice(0, 3).reduce((s, r) => s + r.fat, 0);

  // KPIs
  if ($(`kpi-${id}-total`))    $(`kpi-${id}-total`).textContent   = fmtInt(ranking.length);
  if ($(`kpi-${id}-lider`) && ranking.length > 0) {
    const n = String(ranking[0].nome);
    $(`kpi-${id}-lider`).textContent = n.length > 22 ? n.substring(0, 20) + '…' : n;
    $(`kpi-${id}-lider`).title = n;
  }
  if ($(`kpi-${id}-liderval`) && ranking.length > 0) $(`kpi-${id}-liderval`).textContent = fmtValor(ranking[0].fat);
  if ($(`kpi-${id}-conc`))   $(`kpi-${id}-conc`).textContent   = totalFat > 0 ? (top3Fat / totalFat * 100).toFixed(1) + '%' : '0%';
  if ($(`kpi-${id}-ticket`)) $(`kpi-${id}-ticket`).textContent = fmtValor(totalQtd > 0 ? totalFat / totalQtd : 0);

  // Tabela
  renderTable('tbl-' + id, [
    { label: 'Pos.',        key: 'pos' },
    { label: 'Item',        key: 'nome' },
    { label: 'Quantidade',  key: 'qtd', fmt: fmtInt },
    { label: 'Faturamento', key: 'fat', fmt: fmtValor },
    { label: '% do total',  key: 'fat', fmt: v => totalFat > 0 ? (v / totalFat * 100).toFixed(1) + '%' : '0%' }
  ], withPos);

  // Gráfico 1: barra horizontal
  const top      = ranking.slice(0, 10);
  const isColor  = key === 'cor';
  const bgColors = isColor ? top.map(x => getChartColor(x.nome)) : top.map((_, i) => colorPalette[i % colorPalette.length]);
  renderChart('chart-' + id, 'bar', top.map(x => x.nome), top.map(x => x.fat), 'Faturamento',
    { backgroundColor: bgColors, borderRadius: 4, indexAxis: 'y' });

  // Gráfico 2: doughnut
  const donutEl = $(`chart-${id}-donut`);
  if (donutEl) {
    const top7      = ranking.slice(0, 7);
    const outrosFat = ranking.slice(7).reduce((s, r) => s + r.fat, 0);
    const dLabels   = outrosFat > 0 ? [...top7.map(x => x.nome), 'Outros'] : top7.map(x => x.nome);
    const dData     = outrosFat > 0 ? [...top7.map(x => x.fat), outrosFat]  : top7.map(x => x.fat);
    const dColors   = isColor
      ? dLabels.map(n => n === 'Outros' ? 'rgba(90,122,116,0.35)' : getChartColor(n))
      : [...colorPalette.slice(0, dLabels.length - (outrosFat > 0 ? 1 : 0)), 'rgba(90,122,116,0.35)'];
    renderChart(`chart-${id}-donut`, 'doughnut', dLabels, dData, 'Faturamento', { backgroundColor: dColors, borderWidth: 0, cutout: '55%' });
  }

  // Extras para Cores e Tamanhos
  if (id === 'cores' || id === 'tamanhos') {
    const qtdEl   = $(`chart-${id}-qtd`);
    const polarEl = $(`chart-${id}-polar`);
    if (qtdEl) {
      const topQtd    = ranking.slice().sort((a, b) => b.qtd - a.qtd).slice(0, 8);
      const qtdColors = isColor ? topQtd.map(x => getChartColor(x.nome)) : colorPalette;
      renderChart(`chart-${id}-qtd`, 'bar', topQtd.map(x => x.nome), topQtd.map(x => x.qtd), 'Quantidade', { backgroundColor: qtdColors, borderRadius: 4 });
    }
    if (polarEl) {
      const topPolar    = ranking.slice(0, 7);
      const polarColors = isColor ? topPolar.map(x => getChartColor(x.nome)) : topPolar.map((_, i) => colorPalette[i % colorPalette.length]);
      renderChart(`chart-${id}-polar`, 'polarArea', topPolar.map(x => x.nome), topPolar.map(x => x.fat), 'Faturamento',
        { backgroundColor: polarColors.map(c => (c.startsWith('rgba') || c.startsWith('hsl')) ? c : c + 'cc'), borderWidth: 1, borderColor: '#D5EDE8' });
    }
  }

  // Pareto para Produtos
  if (id === 'produtos') {
    const paretoEl = $(`chart-${id}-pareto`);
    if (paretoEl) {
      const topPareto   = ranking.slice(0, 15);
      let cumulative    = 0;
      const totalRank   = ranking.reduce((s, r) => s + r.fat, 0);
      const paretoData  = topPareto.map(x => { cumulative += x.fat; return { nome: x.nome, fat: x.fat, acum: totalRank > 0 ? (cumulative / totalRank * 100) : 0 }; });
      renderParetoChart(`chart-${id}-pareto`, paretoData);
    }
  }
}

/** Renderiza a base analítica na aba "Base de dados" */
function renderBaseAnalitica(lim) {
  const dims       = state.activeDimensions;
  const customCols = getCustomCols('pedidos');
  const cols = [
    { label: 'Data',     key: 'data',        fmt: v => fmtData(v) },
    { label: 'Pedido',   key: 'pedido' },
    { label: 'SKU',      key: 'skuOriginal' },
    { label: 'Produto',  key: 'produto' }
  ];
  if (dims.includes('ESTAMPA')) cols.push({ label: 'Estampa', key: 'estampa' });
  cols.push({ label: 'Cor',      key: 'cor',        tag: v => v === 'N/D' ? 'bad' : colorNameMap[v] ? 'good' : 'neutral' });
  cols.push({ label: 'Tamanho',  key: 'tamanho' });
  cols.push({ label: 'Qtd',      key: 'quantidade', fmt: fmtInt });
  cols.push({ label: 'Valor',    key: 'valorTotal',  fmt: fmtValor });
  if (dims.includes('STATUS')) cols.push({ label: 'Status', key: 'status' });
  customCols.forEach(h => cols.push({ label: h, key: `custom::${h}` }));
  if (state.produtos.raw.length) cols.push({ label: 'Origem', key: 'match', tag: v => v === 'SKU EXATO' || v === 'NOME' ? 'good' : v === 'SEM MATCH' ? 'bad' : 'warn' });
  renderTable('tblBase', cols, state.filtered.slice(0, lim));
}

/** Renderiza a aba de auditoria de match */
function renderAudit() {
  let dSku = 0, dNome = 0, dBusca = 0, dSem = 0;
  state.filtered.forEach(r => {
    if (r.match === 'SKU EXATO') dSku++;
    else if (r.match === 'NOME') dNome++;
    else if (r.match === 'BUSCA TEXTUAL') dBusca++;
    else if (r.match === 'SEM MATCH') dSem++;
  });
  $('auditSku').textContent   = fmtInt(dSku);
  $('auditNome').textContent  = fmtInt(dNome);
  $('auditBusca').textContent = fmtInt(dBusca);
  $('auditSem').textContent   = fmtInt(dSem);

  renderChart('chartAudit', 'doughnut',
    ['SKU exato','Nome exato','Busca textual','Sem match'],
    [dSku, dNome, dBusca, dSem], 'Origem',
    { backgroundColor: ['#059669','#2DD4BF','#D97706','#DC2626'], borderWidth: 0, cutout: '65%' });

  renderTable('tblAudit', [
    { label: 'Pedido', key: 'pedido' }, { label: 'SKU', key: 'skuOriginal' },
    { label: 'Produto', key: 'produto' }, { label: 'Cor', key: 'cor' },
    { label: 'Origem', key: 'match', tag: v => v === 'SEM MATCH' ? 'bad' : 'warn' }
  ], state.filtered.filter(r => r.match === 'BUSCA TEXTUAL' || r.match === 'SEM MATCH').slice(0, 50));
}
