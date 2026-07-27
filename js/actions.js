// =============================================================================
// ACTIONS — Ações globais: limpar tudo e exportar
// =============================================================================

/** Apaga todos os dados carregados nos Grids (Excel) e volta ao estado inicial */
function limparTudo() {
  // 1. Limpa todos os LiteGrids do JSS (BD, Marca, Clientes, Representantes, Grupos, Produto)
  if (typeof GRIDS !== 'undefined') {
    Object.keys(GRIDS).forEach(key => {
      if (GRIDS[key]) {
        GRIDS[key].allData = [];
        GRIDS[key].filtered = null;
        if (typeof FULL_DATA !== 'undefined') FULL_DATA[key] = [];
        if (typeof JSS_FILTERS !== 'undefined') JSS_FILTERS[key] = {};
        GRIDS[key].page = 0;
        GRIDS[key]._render();
        GRIDS[key]._updateStatus();
      }
    });
  }

  // 2. Destrói os gráficos antigos da memória
  if (typeof graficos !== 'undefined') {
    for (const k in graficos) {
      if (graficos[k]) { try { graficos[k].destroy(); } catch(e) {} }
    }
    graficos = {};
  }

  // Volta para a tela inicial
  if (typeof switchView === 'function') switchView('view-home');
  toast('Todos os dados das planilhas foram limpos', 'success');
}

/** Exporta os dados do Grid do BD atual como CSV */
function exportarCSV() {
  if (typeof GRIDS === 'undefined' || !GRIDS.bd || !GRIDS.bd.getData().length) {
    toast('Não há dados no BD para exportar', 'warn');
    return;
  }

  // Pega os dados do grid (respeitando filtros se houver)
  const src = GRIDS.bd.filtered !== null ? GRIDS.bd.filtered : GRIDS.bd.getData();
  if (!src.length) { toast('Nenhum dado visível para exportar', 'warn'); return; }

  // Monta os cabeçalhos a partir do GRID_DEFS (motor do Excel)
  const headers = GRID_DEFS.bd.cols.map(c => c.t);

  // Constrói as linhas para o CSV
  const rows = src.map(r => {
    let obj = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] || '';
    });
    return obj;
  });

  const escCsv = v => {
    const s = String(v === null || v === undefined ? '' : v);
    return s.includes(';') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  const csv = [
    headers.map(escCsv).join(';'),
    ...rows.map(r => headers.map(h => escCsv(r[h])).join(';'))
  ].join('\r\n');
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href     = URL.createObjectURL(blob);
  link.download = 'resute_dados_bd.csv';
  link.click();
  toast('Planilha exportada com sucesso', 'success');
}