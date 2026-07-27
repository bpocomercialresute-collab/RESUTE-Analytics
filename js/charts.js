// =============================================================================
// CHARTS — Renderização de gráficos (Chart.js) e tabelas
// =============================================================================

function chartFmtNumeroSmart(v, casas = 2) {
  const n = Number(v) || 0;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: casas
  }).format(n);
}

function chartFmtInt(v) {
  return chartFmtNumeroSmart(v, 0);
}

function chartFmtValor(v) {
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
  const fmtValue   = v => isMoney ? chartFmtValor(v) : chartFmtInt(v);

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
                if (v >= 1000000) return 'R$ ' + chartFmtNumeroSmart(v / 1000000, 1) + 'M';
                if (v >= 1000)    return 'R$ ' + chartFmtNumeroSmart(v / 1000, 0) + 'k';
                return chartFmtValor(v);
              }
              return v >= 1000 ? chartFmtNumeroSmart(v / 1000, 1) + 'k' : chartFmtInt(v);
            }
          },
          grid: { color: '#D5EDE8', drawBorder: false }
        }
      }
    }
  });
}


