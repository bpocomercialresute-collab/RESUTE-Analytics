// =============================================================================
// JSS.JS — Excel embutido com jspreadsheet-ce
// =============================================================================

const JSS_COLS = [
  {title:'ID',             width:55},
  {title:'N° PEDIDO',      width:100},
  {title:'PRODUTO OU SERVIÇO', width:220},
  {title:'QTD',            width:65},
  {title:'Dt. Emissão',    width:110},
  {title:'Data de Saída',  width:110},
  {title:'VALOR',          width:90},
  {title:'Vendedor',       width:130},
  {title:'Indústria',      width:100},
  {title:'Cliente',        width:180},
  {title:'ANO',            width:65},
  {title:'MÊS',            width:65},
  {title:'GRUPO',          width:130},
  {title:'SEM',            width:70},
  {title:'tipo mercado',   width:110},
  {title:'SETOR',          width:130},
  {title:'CIDADE',         width:120},
  {title:'UF',             width:50},
  {title:'TIPO VENDEDOR',  width:120},
  {title:'Dias Sem Compra',width:120},
  {title:'NOTA F',         width:80},
  {title:'ROTA',           width:80},
  {title:'DESCONTO',       width:90},
  {title:'EMPRESA',        width:130},
  {title:'cnpj',           width:140},
  {title:'grupo_produto',  width:130},
  {title:'GRUPO PAI',      width:120},
  {title:'subgrupo_produto',width:140},
  {title:'marca',          width:130},
  {title:'familia_produto',width:140},
  {title:'classes',        width:100},
];

let jssInstance = null;

// ── INICIALIZA ────────────────────────────────────────────────────────────────
function jssInit() {
  const el = document.getElementById('jss-container');
  if (!el || jssInstance) return;

  // 500 linhas vazias
  const emptyData = Array.from({length: 500}, () =>
    Array(JSS_COLS.length).fill('')
  );

  try {
    jssInstance = jspreadsheet(el, {
      data: emptyData,
      columns: JSS_COLS.map(c => ({
        title: c.title,
        width: c.width,
        type: 'text',
        wordWrap: false,
      })),
      tableOverflow: true,
      tableWidth: '100%',
      tableHeight: 'calc(100vh - 230px)',
      allowInsertRow: true,
      allowDeleteRow: true,
      allowInsertColumn: false,
      allowDeleteColumn: false,
      columnSorting: true,
      columnResize: true,
      rowResize: false,
      rowDrag: false,
      editable: true,
      allowExport: false,
      search: false,
      freezeColumns: 0,
      onpaste: function() {
        setTimeout(jssUpdateStatus, 300);
      },
      onchange: function() {
        setTimeout(jssUpdateStatus, 100);
      },
    });
    jssUpdateStatus();
  } catch(e) {
    console.error('jspreadsheet error:', e);
  }
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function jssUpdateStatus() {
  if (!jssInstance) return;
  try {
    const data = jssInstance.getData();
    const filled = data.filter(r => r && r.some(c => c !== '' && c !== null && c !== undefined)).length;
    const el = document.getElementById('jss-status');
    if (el) {
      el.textContent = filled > 0 ? `${filled.toLocaleString('pt-BR')} linhas com dados` : 'Grade pronta — cole os dados do Excel com Ctrl+V';
      el.style.color = filled > 0 ? 'var(--success)' : 'var(--text-tertiary)';
    }
  } catch(e) {}
}

// ── LIMPAR ────────────────────────────────────────────────────────────────────
function jssClear() {
  if (!jssInstance) return;
  if (!confirm('Limpar todos os dados do BD?')) return;
  const empty = Array.from({length: 500}, () => Array(JSS_COLS.length).fill(''));
  jssInstance.setData(empty);
  jssUpdateStatus();
}

// ── PROCESSAR ────────────────────────────────────────────────────────────────
function jssProcess() {
  if (!jssInstance) { alert('Aguarde a grade carregar.'); return; }
  const raw = jssInstance.getData();
  const rows = raw.filter(r => r && r.some(c => c !== '' && c !== null && c !== undefined));

  if (!rows.length) {
    alert('Nenhum dado encontrado. Cole os dados do Excel na grade primeiro.');
    return;
  }

  BD_DATA.headers = JSS_COLS.map(c => c.title);
  BD_DATA.rows = rows;
  BD_DATA.count = rows.length;
  bdMapColumns();
  bdUpdateAllTabs();

  const el = document.getElementById('jss-status');
  if (el) {
    el.textContent = `✓ ${rows.length.toLocaleString('pt-BR')} linhas processadas — relatórios atualizados!`;
    el.style.color = 'var(--success)';
  }
}

// ── GARANTE INIT AO ABRIR ─────────────────────────────────────────────────────
function jssEnsureInit() {
  if (!jssInstance) {
    setTimeout(jssInit, 150);
  }
}

// Também dispara ao clicar na aba BD
document.addEventListener('click', e => {
  if (e.target.closest('.av-tab[data-target="av-tab-bd"]')) {
    setTimeout(jssInit, 150);
  }
});