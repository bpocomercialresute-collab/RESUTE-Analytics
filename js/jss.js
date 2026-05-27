// =============================================================================
// JSS.JS — Excel embutido (jspreadsheet-ce) — suporte a 500.000 linhas
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

const MAX_ROWS = 500000;
let jssInstance = null;

function jssInit() {
  const el = document.getElementById('jss-container');
  if (!el || jssInstance) return;

  try {
    jssInstance = jspreadsheet(el, {
      data: [Array(JSS_COLS.length).fill('')],
      columns: JSS_COLS.map(c => ({
        title: c.title,
        width: c.width,
        type: 'text',
        wordWrap: false,
        align: 'left',
      })),
      minDimensions: [JSS_COLS.length, MAX_ROWS],
      tableOverflow: true,
      tableWidth: '100%',
      tableHeight: 'calc(100vh - 250px)',
      lazyLoading: true,
      loadingSpin: true,
      allowInsertRow: true,
      allowDeleteRow: true,
      allowInsertColumn: false,
      allowDeleteColumn: false,
      columnSorting: false,
      columnResize: true,
      rowResize: false,
      editable: true,
      search: false,
      freezeColumns: 0,
      defaultColAlign: 'left',
      onselection: function(el, x1, y1) {
        const ref = document.getElementById('jss-ref');
        if (ref) ref.textContent = jssColLetter(x1) + (y1+1);
      },
      onpaste: function() { setTimeout(jssUpdateStatus, 500); },
      onchange: function() { setTimeout(jssUpdateStatus, 200); },
    });
    jssUpdateStatus();
  } catch(e) { console.error('jss error:', e); }
}

function jssColLetter(i) {
  let s=''; i++;
  while(i>0){let m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}
  return s;
}

function jssUpdateStatus() {
  if (!jssInstance) return;
  try {
    const data = jssInstance.getData();
    const filled = data.filter(r=>r&&r.some(c=>c!==''&&c!==null&&c!==undefined)).length;
    const el = document.getElementById('jss-status');
    if (!el) return;
    if (filled > 0) {
      el.textContent = '✓ ' + filled.toLocaleString('pt-BR') + ' linhas com dados';
      el.className = 'jss-status-badge jss-status-ok';
    } else {
      el.textContent = MAX_ROWS.toLocaleString('pt-BR') + ' linhas disponíveis';
      el.className = 'jss-status-badge';
    }
  } catch(e) {}
}

function jssClear() {
  if (!jssInstance) return;
  if (!confirm('Limpar todos os dados do BD?')) return;
  jssInstance.setData([Array(JSS_COLS.length).fill('')]);
  jssUpdateStatus();
}

function jssProcess() {
  if (!jssInstance) { alert('Aguarde carregar.'); return; }
  const raw = jssInstance.getData();
  const rows = raw.filter(r=>r&&r.some(c=>c!==''&&c!==null&&c!==undefined));
  if (!rows.length) { alert('Sem dados. Cole os dados do Excel na grade (Ctrl+V).'); return; }

  BD_DATA.headers = JSS_COLS.map(c=>c.title);
  BD_DATA.rows = rows;
  BD_DATA.count = rows.length;
  bdMapColumns();
  bdUpdateAllTabs();

  const el = document.getElementById('jss-status');
  if (el) {
    el.textContent = '✓ ' + rows.length.toLocaleString('pt-BR') + ' processadas — relatórios atualizados!';
    el.className = 'jss-status-badge jss-status-ok';
  }
  const btn = document.querySelector('.jss-btn-success');
  if (btn) {
    const orig = btn.innerHTML;
    btn.textContent = '✓ Relatórios atualizados!';
    setTimeout(() => btn.innerHTML = orig, 2500);
  }
}

function jssEnsureInit() { setTimeout(jssInit, 150); }

document.addEventListener('click', e => {
  if (e.target.closest('.av-tab[data-target="av-tab-bd"]')) setTimeout(jssInit, 150);
});