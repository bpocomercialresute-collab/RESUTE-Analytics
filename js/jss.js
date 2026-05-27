// =============================================================================
// JSS.JS — Grids Excel para todas as abas (colunas vermelhas = auto-calc)
// =============================================================================

// BD: primeiras 10 colunas = BRANCAS (usuário preenche)
//     restantes = VERMELHAS (auto-calculadas)
const BD_MANUAL_COLS = 10; // até Cliente

const GRID_DEFS = {
  bd: { rows:50000, lazy:true,
    cols:[
      {t:'ID',w:55,auto:false},{t:'N° PEDIDO',w:95,auto:false},
      {t:'PRODUTO OU SERVIÇO',w:220,auto:false},{t:'QTD',w:60,auto:false},
      {t:'Dt. Emissão',w:105,auto:false},{t:'Data de Saída',w:105,auto:false},
      {t:'VALOR',w:85,auto:false},{t:'Vendedor',w:130,auto:false},
      {t:'Indústria',w:100,auto:false},{t:'Cliente',w:180,auto:false},
      // VERMELHAS — auto-calculadas:
      {t:'ANO',w:60,auto:true},{t:'MÊS',w:60,auto:true},
      {t:'GRUPO',w:120,auto:true},{t:'SEM',w:65,auto:true},
      {t:'tipo mercado',w:110,auto:true},{t:'SETOR',w:140,auto:true},
      {t:'CIDADE',w:120,auto:true},{t:'UF',w:45,auto:true},
      {t:'TIPO VENDEDOR',w:120,auto:true},{t:'Dias Sem Compra',w:125,auto:true},
      {t:'NOTA F',w:75,auto:true},{t:'ROTA',w:75,auto:true},
      {t:'DESCONTO',w:90,auto:true},{t:'EMPRESA',w:130,auto:true},
      {t:'cnpj',w:145,auto:true},{t:'grupo_produto',w:130,auto:true},
      {t:'GRUPO PAI',w:120,auto:true},{t:'subgrupo_produto',w:145,auto:true},
      {t:'marca',w:130,auto:true},{t:'familia_produto',w:145,auto:true},
      {t:'classes',w:100,auto:true},
    ]
  },
  marca: { rows:200, lazy:false,
    cols:[{t:'ID',w:60,auto:false},{t:'COD MARCA',w:120,auto:false},{t:'MARCA',w:250,auto:false}]
  },
  clientes: { rows:10000, lazy:true,
    cols:[
      {t:'ID',w:55,auto:false},{t:'COD_CLI',w:90,auto:false},{t:'CLIENTES',w:220,auto:false},
      {t:'TIPO',w:100,auto:false},{t:'ORIG',w:80,auto:false},{t:'CNPJ / CPF',w:150,auto:false},
      {t:'RG/IE',w:120,auto:false},{t:'CEP',w:90,auto:false},{t:'Cidade',w:130,auto:false},
      {t:'UF',w:50,auto:false},{t:'Endereço',w:200,auto:false},{t:'Endereço Nro',w:110,auto:false},
      {t:'Complemento',w:130,auto:false},{t:'Bairro',w:130,auto:false},{t:'Telefone',w:120,auto:false},
      {t:'Celular',w:120,auto:false},{t:'E-mail',w:180,auto:false},{t:'Fantasia',w:180,auto:false},
      {t:'VENDEDOR',w:130,auto:false},{t:'Zona de Venda',w:120,auto:false},
      // VERMELHAS:
      {t:'Ult Compra',w:110,auto:true},{t:'dias sem venda',w:120,auto:true},
      {t:'meses sem venda',w:130,auto:true},{t:'DIAS_CICLO',w:105,auto:false},
      {t:'LIGAR',w:80,auto:true},{t:'ULT_VD_BD',w:105,auto:true},
      {t:'dias>ciclo',w:100,auto:true},{t:'dt_penu',w:100,auto:true},
    ]
  },
  representantes: { rows:200, lazy:false,
    cols:[
      {t:'ID',w:55,auto:false},{t:'COD',w:80,auto:false},{t:'REPRESENTANTE',w:220,auto:false},
      {t:'TIPO',w:120,auto:false},{t:'Fantasia',w:180,auto:false},{t:'Fone',w:130,auto:false},
      {t:'% CRESCIMENTO',w:120,auto:false},{t:'email',w:180,auto:false},
      {t:'obs',w:160,auto:false},{t:'tipo_produto',w:130,auto:false},
      // VERMELHAS:
      {t:'DT_1',w:110,auto:true},{t:'DT_2',w:110,auto:true},{t:'DT_3',w:110,auto:true},
      {t:'DT_4',w:110,auto:true},{t:'DT_5',w:110,auto:true},{t:'DT_6',w:110,auto:true},
      {t:'DT_7',w:110,auto:true},{t:'TOT_MIX',w:90,auto:true},
    ]
  },
  grupos: { rows:200, lazy:false,
    cols:[
      {t:'ID',w:60,auto:false},{t:'COD',w:80,auto:false},
      {t:'GRUPO',w:200,auto:false},{t:'GRUPO PAI',w:200,auto:false},
    ]
  },
  produto: { rows:2000, lazy:false,
    cols:[
      {t:'ID',w:55,auto:false},{t:'CODPROD',w:100,auto:false},{t:'DESCRIÇÃO',w:230,auto:false},
      {t:'GRUPO',w:130,auto:false},{t:'subgrupo',w:130,auto:false},{t:'familia',w:130,auto:false},
      {t:'ATIV_INAT',w:100,auto:false},{t:'tipo_produto',w:120,auto:false},
      // VERMELHAS:
      {t:'DT_1',w:110,auto:true},{t:'DT_2',w:110,auto:true},{t:'DT_3',w:110,auto:true},
      {t:'DT_4',w:110,auto:true},{t:'DT_5',w:110,auto:true},{t:'DT_6',w:110,auto:true},
      {t:'DT_7',w:110,auto:true},{t:'TOT_MIX',w:90,auto:true},
    ]
  }
};

const GRIDS = {};
const GRID_DATA_STORE = {};

function jssCreateGrid(key) {
  const elId = key==='bd' ? 'jss-container' : 'jss-container-'+key;
  const el   = document.getElementById(elId);
  if (!el || GRIDS[key]) return;

  const def  = GRID_DEFS[key];
  const data = Array.from({length:def.rows}, () => Array(def.cols.length).fill(''));

  try {
    GRIDS[key] = jspreadsheet(el, {
      data,
      columns: def.cols.map(c => ({
        title: c.t, width: c.w, type: 'text', align: 'left', wordWrap: false,
        readOnly: c.auto,
      })),
      tableOverflow: true, tableWidth: '100%',
      tableHeight: key==='bd' ? 'calc(100vh - 250px)' : 'calc(100vh - 220px)',
      lazyLoading: def.lazy, loadingSpin: def.lazy,
      allowInsertRow: true, allowDeleteRow: true,
      allowInsertColumn: false, allowDeleteColumn: false,
      columnSorting: false, columnResize: true,
      rowResize: false, editable: true, search: false,
      freezeColumns: 0, defaultColAlign: 'left',
      onselection: function(inst, x1, y1) {
        const ref = document.getElementById('jss-ref-'+key);
        if (ref) ref.textContent = jssColLetter(x1)+(y1+1);
      },
      onpaste:  function() { setTimeout(()=>jssUpdateStatus(key), 500); },
      onchange: function() { setTimeout(()=>jssUpdateStatus(key), 200); },
    });

    // Colore headers das colunas automáticas em vermelho
    setTimeout(() => jssColorAutoHeaders(key), 300);
    jssUpdateStatus(key);
  } catch(e) { console.error('grid ['+key+'] error:', e); }
}

// Colore os cabeçalhos das colunas auto-calculadas em vermelho
function jssColorAutoHeaders(key) {
  const elId = key==='bd' ? 'jss-container' : 'jss-container-'+key;
  const el = document.getElementById(elId);
  if (!el) return;
  const def = GRID_DEFS[key];
  const ths = el.querySelectorAll('thead td');
  def.cols.forEach((c, i) => {
    // +1 porque o primeiro th é o corner (número de linha)
    const th = ths[i+1];
    if (th && c.auto) {
      th.style.background    = '#3d0000';
      th.style.color         = '#ff9999';
      th.style.borderBottom  = '2px solid #cc0000';
    }
  });
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
      .filter(r=>r&&r.some(c=>c!==''&&c!==null)).length;
    const el = document.getElementById('jss-status-'+key);
    if (!el) return;
    el.textContent = filled>0
      ? '✓ '+filled.toLocaleString('pt-BR')+' linhas'
      : GRID_DEFS[key].rows.toLocaleString('pt-BR')+' linhas disponíveis';
    el.className = 'jss-status-badge'+(filled>0?' jss-status-ok':'');
  } catch(e) {}
}

function jssClearGrid(key) {
  if (!GRIDS[key]) return;
  if (!confirm('Limpar todos os dados desta aba?')) return;
  const def = GRID_DEFS[key];
  GRIDS[key].setData(Array.from({length:def.rows},()=>Array(def.cols.length).fill('')));
  jssUpdateStatus(key);
}

function jssProcess() {
  if (!GRIDS.bd) { alert('Aguarde carregar.'); return; }
  const rows = GRIDS.bd.getData().filter(r=>r&&r.some(c=>c!==''&&c!==null));
  if (!rows.length) { alert('Sem dados no BD. Cole os dados e tente novamente.'); return; }

  // Salva dados das outras abas
  Object.keys(GRIDS).forEach(k => {
    if (k!=='bd') GRID_DATA_STORE[k] = GRIDS[k].getData().filter(r=>r&&r.some(c=>c!==''));
  });

  // Alimenta BD_DATA
  BD_DATA.headers = GRID_DEFS.bd.cols.map(c=>c.t);
  BD_DATA.rows    = rows;
  BD_DATA.count   = rows.length;
  bdMapColumns();

  // Auto-preenche colunas vermelhas
  bdAutoFill();

  // Atualiza grid BD com dados auto-preenchidos
  const padded = BD_DATA.rows.map(r => {
    while (r.length < GRID_DEFS.bd.cols.length) r.push('');
    return r;
  });
  const emptyPad = Array.from({length:Math.max(0,50000-padded.length)},()=>Array(GRID_DEFS.bd.cols.length).fill(''));
  GRIDS.bd.setData([...padded,...emptyPad]);
  setTimeout(()=>jssColorAutoHeaders('bd'),300);

  // Atualiza relatórios
  bdUpdateAllTabs();

  const el = document.getElementById('jss-status-bd');
  if (el) { el.textContent='✓ '+rows.length.toLocaleString('pt-BR')+' linhas processadas!'; el.className='jss-status-badge jss-status-ok'; }

  const btn = document.querySelector('.jss-btn-success');
  if (btn) {
    const orig = btn.innerHTML;
    btn.textContent='✓ Processado!';
    setTimeout(()=>btn.innerHTML=orig,2500);
  }
}

function jssEnsureInit() { setTimeout(()=>jssCreateGrid('bd'),150); }
function jssInit()       { jssCreateGrid('bd'); }

const TAB_MAP = {
  'av-tab-bd':'bd','av-tab-marca':'marca','av-tab-clientes':'clientes',
  'av-tab-representantes':'representantes','av-tab-grupos':'grupos','av-tab-produto':'produto',
};
document.addEventListener('click', e => {
  const tab = e.target.closest('.av-tab[data-target]');
  if (!tab) return;
  const key = TAB_MAP[tab.dataset.target];
  if (key) setTimeout(()=>jssCreateGrid(key),150);
});