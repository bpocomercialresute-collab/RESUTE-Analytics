// =============================================================================
// JSS.JS — Excel embutido (jspreadsheet-ce) para aba BD
// =============================================================================

const JSS_COLS = [
  {title:'ID',              width:55},
  {title:'N° PEDIDO',       width:95},
  {title:'PRODUTO OU SERVIÇO', width:230},
  {title:'QTD',             width:60},
  {title:'Dt. Emissão',     width:105},
  {title:'Data de Saída',   width:105},
  {title:'VALOR',           width:85},
  {title:'Vendedor',        width:130},
  {title:'Indústria',       width:100},
  {title:'Cliente',         width:190},
  {title:'ANO',             width:60},
  {title:'MÊS',             width:60},
  {title:'GRUPO',           width:130},
  {title:'SEM',             width:65},
  {title:'tipo mercado',    width:110},
  {title:'SETOR',           width:140},
  {title:'CIDADE',          width:120},
  {title:'UF',              width:45},
  {title:'TIPO VENDEDOR',   width:120},
  {title:'Dias Sem Compra', width:125},
  {title:'NOTA F',          width:75},
  {title:'ROTA',            width:75},
  {title:'DESCONTO',        width:90},
  {title:'EMPRESA',         width:130},
  {title:'cnpj',            width:145},
  {title:'grupo_produto',   width:130},
  {title:'GRUPO PAI',       width:120},
  {title:'subgrupo_produto',width:145},
  {title:'marca',           width:130},
  {title:'familia_produto', width:145},
  {title:'classes',         width:100},
];

let jssInstance = null;
const INIT_ROWS = 1000;

// ── INICIALIZA ────────────────────────────────────────────────────────────────
function jssInit() {
  const el = document.getElementById('jss-container');
  if (!el || jssInstance) return;

  const emptyData = Array.from({length: INIT_ROWS}, () =>
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
        align: 'left',
      })),
      tableOverflow: true,
      tableWidth: '100%',
      tableHeight: 'calc(100vh - 250px)',
      minHeight: '400px',
      allowInsertRow: true,
      allowDeleteRow: true,
      allowInsertColumn: false,
      allowDeleteColumn: false,
      columnSorting: true,
      columnResize: true,
      rowResize: false,
      editable: true,
      search: false,
      freezeColumns: 0,
      defaultColAlign: 'left',
      onselection: function(el, x1, y1) {
        const ref = document.getElementById('jss-ref');
        if (ref) {
          const letter = jssColLetter(x1);
          ref.textContent = `${letter}${y1 + 1}`;
        }
      },
      onpaste: function() {
        setTimeout(jssUpdateStatus, 400);
      },
      onchange: function() {
        setTimeout(jssUpdateStatus, 150);
      },
    });

    jssUpdateStatus();
  } catch(e) {
    console.error('jspreadsheet init error:', e);
  }
}

function jssColLetter(i) {
  let s = ''; i++;
  while (i > 0) { let m = (i-1)%26; s = String.fromCharCode(65+m)+s; i = Math.floor((i-1)/26); }
  return s;
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function jssUpdateStatus() {
  if (!jssInstance) return;
  try {
    const data = jssInstance.getData();
    const filled = data.filter(r => r && r.some(c => c !== '' && c !== null && c !== undefined)).length;
    const el = document.getElementById('jss-status');
    if (el) {
      if (filled > 0) {
        el.textContent = `✓ ${filled.toLocaleString('pt-BR')} linhas`;
        el.className = 'jss-status-badge jss-status-ok';
      } else {
        el.textContent = 'Sem dados';
        el.className = 'jss-status-badge';
      }
    }
  } catch(e) {}
}

// ── ADICIONAR LINHAS ─────────────────────────────────────────────────────────
function jssAddRows() {
  if (!jssInstance) return;
  jssInstance.insertRow(500, jssInstance.getData().length);
  const el = document.getElementById('jss-status');
  if (el) { el.textContent = '+500 linhas adicionadas'; el.className = 'jss-status-badge jss-status-ok'; }
  setTimeout(jssUpdateStatus, 300);
}

// ── LIMPAR ────────────────────────────────────────────────────────────────────
function jssClear() {
  if (!jssInstance) return;
  if (!confirm('Limpar todos os dados do BD?')) return;
  const empty = Array.from({length: INIT_ROWS}, () => Array(JSS_COLS.length).fill(''));
  jssInstance.setData(empty);
  jssUpdateStatus();
}

// ── PROCESSAR → alimenta relatórios ──────────────────────────────────────────
function jssProcess() {
  if (!jssInstance) { alert('Aguarde a grade carregar.'); return; }
  const raw = jssInstance.getData();
  const rows = raw.filter(r => r && r.some(c => c !== '' && c !== null && c !== undefined));

  if (!rows.length) {
    alert('Sem dados. Cole os dados do Excel na grade primeiro (Ctrl+V).');
    return;
  }

  BD_DATA.headers = JSS_COLS.map(c => c.title);
  BD_DATA.rows = rows;
  BD_DATA.count = rows.length;
  bdMapColumns();
  bdUpdateAllTabs();

  const el = document.getElementById('jss-status');
  if (el) {
    el.textContent = `✓ ${rows.length.toLocaleString('pt-BR')} processadas`;
    el.className = 'jss-status-badge jss-status-ok';
  }

  // Feedback visual
  const btn = document.querySelector('.jss-btn-success');
  if (btn) {
    btn.textContent = '✓ Relatórios atualizados!';
    setTimeout(() => {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M13 5l7 7-7 7"/></svg> Processar Relatórios`;
    }, 2500);
  }
}

// ── GARANTE INIT ──────────────────────────────────────────────────────────────
function jssEnsureInit() {
  setTimeout(jssInit, 150);
}

document.addEventListener('click', e => {
  if (e.target.closest('.av-tab[data-target="av-tab-bd"]')) {
    setTimeout(jssInit, 150);
  }
});