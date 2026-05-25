// =============================================================================
// ACTIONS — Ações globais: limpar tudo e exportar CSV
// =============================================================================

/** Apaga todos os dados carregados e volta ao step 1 */
function limparTudo() {
  state.produtos = { raw: [], headers: [], sample: [], fileName: '' };
  state.pedidos  = { raw: [], headers: [], sample: [], fileName: '' };
  state.mapping  = { pedidos: {}, produtos: {} };
  state.explicitIgnored = { pedidos: new Set(), produtos: new Set() };
  state.gridView = { pedidos: 'all', produtos: 'all' };
  state.unified = [];
  state.filtered = [];
  state.activeFilters = {};
  state.activeDimensions = [];

  for (const k in graficos) {
    if (graficos[k]) { try { graficos[k].destroy(); } catch(e) {} }
  }
  graficos = {};

  ['fileProd', 'filePed'].forEach(id => $(id).value = '');
  ['zoneProd', 'zonePed'].forEach(id => $(id).classList.remove('loaded'));

  $('lblProd').textContent = 'Clique ou arraste a planilha (.csv, .xlsx)';
  $('lblProd').style.color = 'var(--text-tertiary)';
  $('lblPed').textContent  = 'Clique ou arraste a planilha (.csv, .xlsx)';
  $('lblPed').style.color  = 'var(--text-tertiary)';

  $('tagProd').textContent = 'Opcional';    $('tagProd').className = 'tag-tiny opt';
  $('tagPed').textContent  = 'Obrigatório'; $('tagPed').className  = 'tag-tiny req';

  $('filterGrid').innerHTML  = '';
  $('dashTabs').innerHTML    = '';
  $('dashContent').innerHTML = '';

  updateUploadButtons();
  setStep(1);
  toast('Tudo apagado', 'success');
}

/** Exporta os dados filtrados como CSV */
function exportarCSV() {
  if (!state.filtered.length) { toast('Não há dados para exportar', 'warn'); return; }

  const rows = state.filtered.map(r => {
    const base = {
      Data:           fmtData(r.data),
      Mes_Ano:        r.mesAno,
      Pedido:         r.pedido,
      SKU:            r.skuOriginal,
      Produto:        r.produto,
      Estampa:        r.estampa,
      Cor:            r.cor,
      Tamanho:        r.tamanho,
      Status:         r.status,
      Quantidade:     r.quantidade,
      Valor_Unitario: r.valorUnitario,
      Valor_Total:    r.valorTotal
    };
    getCustomCols('pedidos').forEach(h => {
      base[h.replace(/[^\w]/g, '_')] = r[`custom::${h}`];
    });
    if (state.produtos.raw.length) base.Origem = r.match;
    return base;
  });

  const csv  = Papa.unparse(rows, { delimiter: ';' });
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href     = URL.createObjectURL(blob);
  link.download = 'resute_relatorio.csv';
  link.click();
  toast('CSV exportado', 'success');
}
