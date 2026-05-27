// =============================================================================
// JSS.JS — Grids Excel para todas as abas de BD E CADASTROS
// =============================================================================

// Definição das colunas de cada aba
const GRID_DEFS = {
  bd: {
    rows: 50000,
    lazy: true,
    cols: [
      {t:'ID',w:55},{t:'N° PEDIDO',w:95},{t:'PRODUTO OU SERVIÇO',w:220},
      {t:'QTD',w:60},{t:'Dt. Emissão',w:105},{t:'Data de Saída',w:105},
      {t:'VALOR',w:85},{t:'Vendedor',w:130},{t:'Indústria',w:100},
      {t:'Cliente',w:180},{t:'ANO',w:60},{t:'MÊS',w:60},
      {t:'GRUPO',w:120},{t:'SEM',w:65},{t:'tipo mercado',w:110},
      {t:'SETOR',w:140},{t:'CIDADE',w:120},{t:'UF',w:45},
      {t:'TIPO VENDEDOR',w:120},{t:'Dias Sem Compra',w:125},
      {t:'NOTA F',w:75},{t:'ROTA',w:75},{t:'DESCONTO',w:90},
      {t:'EMPRESA',w:130},{t:'cnpj',w:145},{t:'grupo_produto',w:130},
      {t:'GRUPO PAI',w:120},{t:'subgrupo_produto',w:145},
      {t:'marca',w:130},{t:'familia_produto',w:145},{t:'classes',w:100},
    ]
  },
  marca: {
    rows: 200,
    lazy: false,
    cols: [
      {t:'ID',w:60},{t:'COD MARCA',w:120},{t:'MARCA',w:250},
    ]
  },
  clientes: {
    rows: 10000,
    lazy: true,
    cols: [
      {t:'ID',w:55},{t:'COD_CLI',w:90},{t:'CLIENTES',w:220},
      {t:'TIPO',w:100},{t:'ORIG',w:80},{t:'CNPJ / CPF',w:150},
      {t:'RG/IE',w:120},{t:'CEP',w:90},{t:'Cidade',w:130},
      {t:'UF',w:50},{t:'Endereço',w:200},{t:'Endereço Nro',w:110},
      {t:'Complemento',w:130},{t:'Bairro',w:130},{t:'Telefone',w:120},
      {t:'Celular',w:120},{t:'E-mail',w:180},{t:'Fantasia',w:180},
      {t:'VENDEDOR',w:130},{t:'Ult Compra',w:110},{t:'Zona de Venda',w:120},
      {t:'dias sem venda',w:120},{t:'meses sem venda',w:130},
      {t:'DIAS_CICLO',w:105},{t:'LIGAR',w:80},{t:'ULT_VD_BD',w:105},
      {t:'dias>ciclo',w:100},{t:'dt_penu',w:100},
    ]
  },
  representantes: {
    rows: 200,
    lazy: false,
    cols: [
      {t:'ID',w:55},{t:'COD',w:80},{t:'REPRESENTANTE',w:220},
      {t:'TIPO',w:120},{t:'Fantasia',w:180},{t:'Fone',w:130},
      {t:'% CRESCIMENTO',w:120},{t:'email',w:180},
      {t:'obs',w:160},{t:'tipo_produto',w:130},
    ]
  },
  grupos: {
    rows: 200,
    lazy: false,
    cols: [
      {t:'ID',w:60},{t:'COD',w:80},{t:'GRUPO',w:200},{t:'GRUPO PAI',w:200},
    ]
  },
  produto: {
    rows: 2000,
    lazy: false,
    cols: [
      {t:'ID',w:55},{t:'CODPROD',w:100},{t:'DESCRIÇÃO',w:230},
      {t:'GRUPO',w:130},{t:'subgrupo',w:130},{t:'familia',w:130},
      {t:'ATIV_INAT',w:100},{t:'tipo_produto',w:120},
      {t:'DT_1',w:110},{t:'DT_2',w:110},{t:'DT_3',w:110},
      {t:'DT_4',w:110},{t:'DT_5',w:110},{t:'DT_6',w:110},
      {t:'DT_7',w:110},{t:'TOT_MIX',w:95},
    ]
  }
};

// Armazena instâncias e dados de cada grid
const GRIDS = {};
const GRID_DATA_STORE = {};

// ── CRIA UM GRID ──────────────────────────────────────────────────────────────
function jssCreateGrid(key) {
  const elId = key === 'bd' ? 'jss-container' : 'jss-container-' + key;
  const el   = document.getElementById(elId);
  if (!el || GRIDS[key]) return;

  const def  = GRID_DEFS[key];
  const data = Array.from({length: def.rows}, () => Array(def.cols.length).fill(''));

  try {
    GRIDS[key] = jspreadsheet(el, {
      data,
      columns: def.cols.map(c => ({ title:c.t, width:c.w, type:'text', align:'left', wordWrap:false })),
      tableOverflow:     true,
      tableWidth:        '100%',
      tableHeight:       key === 'bd' ? 'calc(100vh - 250px)' : 'calc(100vh - 220px)',
      lazyLoading:       def.lazy,
      loadingSpin:       def.lazy,
      allowInsertRow:    true,
      allowDeleteRow:    true,
      allowInsertColumn: false,
      allowDeleteColumn: false,
      columnSorting:     false,
      columnResize:      true,
      rowResize:         false,
      editable:          true,
      search:            false,
      freezeColumns:     0,
      defaultColAlign:   'left',
      onselection: function(instance, x1, y1) {
        const ref = document.getElementById('jss-ref-' + key);
        if (ref) ref.textContent = jssColLetter(x1) + (y1 + 1);
      },
      onpaste:  function() { setTimeout(() => jssUpdateStatus(key), 500); },
      onchange: function() { setTimeout(() => jssUpdateStatus(key), 200); },
    });
    jssUpdateStatus(key);
  } catch(e) { console.error('grid error [' + key + ']:', e); }
}

function jssColLetter(i) {
  let s=''; i++;
  while(i>0){let m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}
  return s;
}

function jssUpdateStatus(key) {
  if (!GRIDS[key]) return;
  try {
    const filled = GRIDS[key].getData()
      .filter(r => r && r.some(c => c !== '' && c !== null)).length;
    const el = document.getElementById('jss-status-' + key);
    if (!el) return;
    el.textContent  = filled > 0
      ? '✓ ' + filled.toLocaleString('pt-BR') + ' linhas'
      : GRID_DEFS[key].rows.toLocaleString('pt-BR') + ' linhas disponíveis';
    el.className = 'jss-status-badge' + (filled > 0 ? ' jss-status-ok' : '');
  } catch(e) {}
}

function jssClearGrid(key) {
  if (!GRIDS[key]) return;
  if (!confirm('Limpar todos os dados desta aba?')) return;
  const def = GRID_DEFS[key];
  GRIDS[key].setData(Array.from({length: def.rows}, () => Array(def.cols.length).fill('')));
  jssUpdateStatus(key);
}

// ── PROCESSAR — agrega tudo e atualiza relatórios ─────────────────────────────
function jssProcess() {
  if (!GRIDS.bd) { alert('Aguarde carregar.'); return; }
  const rows = GRIDS.bd.getData().filter(r => r && r.some(c => c !== '' && c !== null));
  if (!rows.length) { alert('Sem dados no BD. Cole os dados do Excel (Ctrl+V).'); return; }

  // Alimenta BD_DATA com as colunas do BD
  BD_DATA.headers = GRID_DEFS.bd.cols.map(c => c.t);
  BD_DATA.rows    = rows;
  BD_DATA.count   = rows.length;
  bdMapColumns();
  bdUpdateAllTabs();

  // Armazena dados das outras abas para uso futuro
  Object.keys(GRIDS).forEach(k => {
    if (k !== 'bd') {
      GRID_DATA_STORE[k] = GRIDS[k].getData()
        .filter(r => r && r.some(c => c !== '' && c !== null));
    }
  });

  const el = document.getElementById('jss-status-bd');
  if (el) {
    el.textContent = '✓ ' + rows.length.toLocaleString('pt-BR') + ' linhas processadas!';
    el.className   = 'jss-status-badge jss-status-ok';
  }
  const btn = document.querySelector('.jss-btn-success');
  if (btn) {
    const orig = btn.innerHTML;
    btn.textContent = '✓ Relatórios atualizados!';
    setTimeout(() => { btn.innerHTML = orig; }, 2500);
  }
}

// ── INICIALIZAÇÃO POR ABA ─────────────────────────────────────────────────────
function jssEnsureInit() { setTimeout(() => jssCreateGrid('bd'), 150); }

// Mapeia aba → key
const TAB_MAP = {
  'av-tab-bd':              'bd',
  'av-tab-marca':           'marca',
  'av-tab-clientes':        'clientes',
  'av-tab-representantes':  'representantes',
  'av-tab-grupos':          'grupos',
  'av-tab-produto':         'produto',
};

document.addEventListener('click', e => {
  const tab = e.target.closest('.av-tab[data-target]');
  if (!tab) return;
  const key = TAB_MAP[tab.dataset.target];
  if (key) setTimeout(() => jssCreateGrid(key), 150);
});

// Backward compat com o código de relatorios.js
function jssInit() { jssCreateGrid('bd'); }