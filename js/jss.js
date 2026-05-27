// =============================================================================
// JSS.JS — Excel embutido via jspreadsheet-ce + alimenta relatórios
// =============================================================================

const JSS_COLS = [
  'ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída',
  'VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM',
  'tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra',
  'NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto',
  'GRUPO PAI','subgrupo_produto','marca','familia_produto','classes'
];

let jssInstance = null;
let jssInited = false;

// ── INICIALIZA O JSPREADSHEET ─────────────────────────────────────────────────
function jssInit() {
  const el = document.getElementById('jss-container');
  if (!el || jssInited) return;

  // Dados iniciais: 500 linhas vazias
  const emptyData = Array.from({length: 500}, () => Array(JSS_COLS.length).fill(''));

  const columns = JSS_COLS.map((title, i) => ({
    title,
    width: i === 2 ? 200 : i === 9 ? 180 : i === 6 ? 90 : 110,
    type: 'text'
  }));

  jssInstance = jspreadsheet(el, {
    data: emptyData,
    columns,
    minDimensions: [JSS_COLS.length, 500],
    tableOverflow: true,
    tableWidth: '100%',
    tableHeight: 'calc(100vh - 220px)',
    columnDrag: false,
    allowInsertRow: true,
    allowDeleteRow: true,
    allowInsertColumn: false,
    allowDeleteColumn: false,
    freezeColumns: 1,
    search: false,
    lazyLoading: true,
    loadingSpin: true,
    onpaste: function() {
      setTimeout(() => jssUpdateStatus(), 200);
    },
    onchange: function() {
      jssUpdateStatus();
    }
  });

  jssInited = true;
  jssUpdateStatus();
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function jssUpdateStatus() {
  if (!jssInstance) return;
  const data = jssInstance.getData();
  const filled = data.filter(r => r.some(c => c !== '' && c !== null && c !== undefined)).length;
  const el = document.getElementById('jss-status');
  if (el) el.textContent = filled > 0 ? `${filled.toLocaleString('pt-BR')} linhas com dados` : '';
}

// ── LIMPAR ────────────────────────────────────────────────────────────────────
function jssClear() {
  if (!jssInstance) return;
  if (!confirm('Limpar todos os dados do BD?')) return;
  const empty = Array.from({length: 500}, () => Array(JSS_COLS.length).fill(''));
  jssInstance.setData(empty);
  jssUpdateStatus();
  const el = document.getElementById('jss-status');
  if (el) { el.textContent = 'BD limpo'; el.style.color = 'var(--warning)'; }
}

// ── PROCESSAR — alimenta todos os relatórios ─────────────────────────────────
function jssProcess() {
  if (!jssInstance) return;
  const raw = jssInstance.getData();

  // Filtra linhas com dados
  const rows = raw.filter(r => r.some(c => c !== '' && c !== null && c !== undefined));
  if (!rows.length) {
    alert('Nenhum dado encontrado. Cole os dados primeiro.');
    return;
  }

  // Alimenta BD_DATA
  BD_DATA.headers = [...JSS_COLS];
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

// ── INICIALIZA AO ABRIR BD E CADASTROS ───────────────────────────────────────
// Chamado pelo relatorios.js quando avShowBD() é executado
function jssEnsureInit() {
  setTimeout(jssInit, 100);
}

// Também inicializa se o tab BD for clicado diretamente
document.addEventListener('click', e => {
  const tab = e.target.closest('.av-tab[data-target="av-tab-bd"]');
  if (tab) setTimeout(jssInit, 100);
});