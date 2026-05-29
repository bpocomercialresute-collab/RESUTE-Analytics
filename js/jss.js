// =============================================================================
// JSS.JS — Grids jspreadsheet com filtros por coluna
// =============================================================================

const GRID_DEFS = {
  bd: { rows:500, lazy:true,
    cols:[
      {t:'ID',w:55,auto:false},{t:'N° PEDIDO',w:95,auto:false},
      {t:'PRODUTO OU SERVIÇO',w:220,auto:false},{t:'QTD',w:60,auto:false},
      {t:'Dt. Emissão',w:105,auto:false},{t:'Data de Saída',w:105,auto:false},
      {t:'VALOR',w:85,auto:false},{t:'Vendedor',w:130,auto:false},
      {t:'Indústria',w:100,auto:false},{t:'Cliente',w:180,auto:false},
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
  clientes: { rows:200, lazy:false,
    cols:[
      {t:'ID',w:55,auto:false},{t:'COD_CLI',w:100,auto:false},{t:'CLIENTES',w:250,auto:false},
      {t:'TIPO',w:130,auto:false},{t:'CNPJ / CPF',w:160,auto:false},
      {t:'CEP',w:90,auto:false},{t:'Cidade',w:140,auto:false},
      {t:'UF',w:50,auto:false},{t:'Bairro',w:160,auto:false},{t:'Telefone',w:130,auto:false},
      {t:'E-mail',w:190,auto:false},{t:'Fantasia',w:210,auto:false},
      {t:'VENDEDOR',w:140,auto:false},{t:'Zona de Venda',w:130,auto:false},
      {t:'dias sem venda',w:120,auto:true},{t:'meses sem venda',w:130,auto:true},
      {t:'DIAS_CICLO',w:115,auto:true},{t:'LIGAR',w:110,auto:true},
      {t:'ULT_VD_BD',w:115,auto:true},{t:'dias>ciclo',w:130,auto:true},
      {t:'dt_penulte_ped',w:130,auto:true},
    ]
  },
  representantes: { rows:200, lazy:false,
    cols:[
      {t:'ID',w:55,auto:false},{t:'COD',w:80,auto:false},{t:'REPRESENTANTE',w:220,auto:false},
      {t:'TIPO',w:120,auto:false},{t:'Fantasia',w:180,auto:false},{t:'Fone',w:130,auto:false},
      {t:'% CRESCIMENTO',w:120,auto:false},{t:'email',w:180,auto:false},
      {t:'obs',w:160,auto:false},{t:'tipo_produto',w:130,auto:false},
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
  produto: { rows:200, lazy:false,
    cols:[
      {t:'ID',w:55,auto:false},{t:'CODPROD',w:100,auto:false},{t:'DESCRIÇÃO',w:230,auto:false},
      {t:'GRUPO',w:130,auto:false},{t:'subgrupo',w:130,auto:false},{t:'familia',w:130,auto:false},
      {t:'ATIV_INAT',w:100,auto:false},{t:'tipo_produto',w:120,auto:false},
      {t:'DT_1',w:110,auto:true},{t:'DT_2',w:110,auto:true},{t:'DT_3',w:110,auto:true},
      {t:'DT_4',w:110,auto:true},{t:'DT_5',w:110,auto:true},{t:'DT_6',w:110,auto:true},
      {t:'DT_7',w:110,auto:true},{t:'TOT_MIX',w:90,auto:true},
    ]
  }
};

const GRIDS         = {};
const GRID_DATA_STORE = {};
const FULL_DATA     = {}; // dados completos (antes de limitar ao grid)

// ── CRIA GRID ─────────────────────────────────────────────────────────────────
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
      tableHeight:       key === 'bd' ? 'calc(100vh - 250px)' : 'calc(100vh - 260px)',
      lazyLoading:       def.lazy,
      loadingSpin:       def.lazy,
      allowInsertRow:    true,
      allowDeleteRow:    true,
      allowInsertColumn: false,
      allowDeleteColumn: false,
      columnSorting:     true,
      columnResize:      true,
      rowResize:         false,
      editable:          true,
      search:            false,
      filters:           false,   // SEM linha extra de filtro do jspreadsheet
      freezeColumns:     0,
      defaultColAlign:   'left',
      onselection: function(inst, x1, y1) {
        const ref = document.getElementById('jss-ref-' + key);
        if (ref) ref.textContent = jssColLetter(x1) + (y1+1);
      },
      onpaste:  function() { setTimeout(() => jssOnPaste(key), 400); },
      onchange: function() { setTimeout(() => jssUpdateStatus(key), 200); },
    });

    setTimeout(() => {
      jssColorAutoHeaders(key);
      jssInjectFilterIcons(key);
    }, 500);

    jssUpdateStatus(key);
  } catch(e) { console.error('Grid ['+key+']:', e); }
}

// ── CAPTURA DADOS COMPLETOS APÓS PASTE ────────────────────────────────────────
function jssOnPaste(key) {
  const grd = GRIDS[key];
  if (!grd) return;
  const all = grd.getData().filter(r => r && r.some(c => c !== '' && c !== null));
  if (all.length) FULL_DATA[key] = all;
  jssUpdateStatus(key);
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function jssUpdateStatus(key) {
  if (!GRIDS[key]) return;
  try {
    const data   = GRIDS[key].getData();
    const filled = data.filter(r => r && r.some(c => c !== '' && c !== null)).length;
    const full   = FULL_DATA[key];
    const el     = document.getElementById('jss-status-' + key);
    if (!el) return;
    if (filled > 0 || (full && full.length > 0)) {
      const total = full ? full.length : filled;
      el.textContent = '✓ ' + total.toLocaleString('pt-BR') + ' linhas';
      el.className   = 'jss-status-badge jss-status-ok';
    } else {
      el.textContent = 'Pronto';
      el.className   = 'jss-status-badge';
    }
  } catch(e) {}
}

// ── COR COLUNAS AUTOMÁTICAS ───────────────────────────────────────────────────
function jssColorAutoHeaders(key) {
  const elId = key === 'bd' ? 'jss-container' : 'jss-container-' + key;
  const el   = document.getElementById(elId);
  if (!el) return;
  const ths = el.querySelectorAll('thead td');
  GRID_DEFS[key].cols.forEach((c, i) => {
    const th = ths[i+1];
    if (th && c.auto) {
      th.style.background   = '#3d0000';
      th.style.color        = '#ff9999';
      th.style.borderBottom = '2px solid #cc0000';
    }
  });
}

// ── ÍCONES DE FILTRO NOS CABEÇALHOS ──────────────────────────────────────────
function jssInjectFilterIcons(key) {
  const elId = key === 'bd' ? 'jss-container' : 'jss-container-' + key;
  const el   = document.getElementById(elId);
  if (!el) return;

  // Remove ícones anteriores
  el.querySelectorAll('.col-filter-btn').forEach(b => b.remove());

  const ths = el.querySelectorAll('thead tr:first-child td');
  ths.forEach((th, i) => {
    if (i === 0) return;
    const colIdx = i - 1;
    th.style.position = 'relative';

    const btn = document.createElement('span');
    btn.className     = 'col-filter-btn';
    btn.dataset.key   = key;
    btn.dataset.col   = colIdx;
    btn.innerHTML     = '▾';
    btn.title         = 'Filtrar: ' + (GRID_DEFS[key].cols[colIdx]?.t || '');

    btn.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      jssShowFilterDropdown(key, colIdx, btn);
    });
    btn.addEventListener('mousedown', e => e.stopPropagation());

    th.appendChild(btn);
  });
}

// ── FILTROS ───────────────────────────────────────────────────────────────────
const JSS_FILTERS = {}; // key → { colIdx: value }

function jssShowFilterDropdown(key, colIdx, anchor) {
  document.querySelectorAll('.col-filter-dropdown').forEach(d => d.remove());

  const grd = GRIDS[key];
  if (!grd) return;

  const src  = FULL_DATA[key] || grd.getData();
  const all  = src.filter(r => r && r.some(c => c !== '' && c !== null));
  const vals = [...new Set(all.map(r => String(r[colIdx]||'').trim()).filter(Boolean))]
    .sort((a,b)=>{ const na=parseFloat(a),nb=parseFloat(b); return (!isNaN(na)&&!isNaN(nb))?na-nb:a.localeCompare(b); })
    .slice(0, 500);

  const ativo = JSS_FILTERS[key]?.[colIdx];
  const rect  = anchor.getBoundingClientRect();
  const label = GRID_DEFS[key].cols[colIdx]?.t || 'Coluna ' + (colIdx+1);

  const drop = document.createElement('div');
  drop.className = 'col-filter-dropdown';
  drop.style.cssText = `position:fixed;top:${rect.bottom+4}px;left:${Math.min(rect.left, window.innerWidth-250)}px;z-index:9999`;

  drop.innerHTML = `
    <div class="cfd-header">
      <span>${label}</span>
      <button class="cfd-clear" onclick="jssClearColFilter('${key}',${colIdx})">✕ Limpar</button>
    </div>
    <div class="cfd-list">
      <label class="cfd-item ${!ativo?'cfd-active':''}">
        <input type="radio" name="jf${key}${colIdx}" value="" ${!ativo?'checked':''}><span>(Todos)</span>
      </label>
      ${vals.map(v=>`<label class="cfd-item ${ativo===v?'cfd-active':''}">
        <input type="radio" name="jf${key}${colIdx}" value="${v.replace(/"/g,'&quot;')}" ${ativo===v?'checked':''}><span>${v}</span>
      </label>`).join('')}
    </div>
    <div class="cfd-footer">
      <button class="cfd-apply" onclick="jssApplyColFilter('${key}',${colIdx},this)">Aplicar</button>
    </div>`;

  document.body.appendChild(drop);
  setTimeout(() => {
    document.addEventListener('click', function cl(e) {
      if (!drop.contains(e.target)) { drop.remove(); document.removeEventListener('click',cl); }
    });
  }, 0);
}

function jssApplyColFilter(key, colIdx, btn) {
  const drop = btn.closest('.col-filter-dropdown');
  const sel  = drop.querySelector(`input[name="jf${key}${colIdx}"]:checked`);
  const val  = sel ? sel.value : '';
  if (!JSS_FILTERS[key]) JSS_FILTERS[key] = {};
  if (val === '') delete JSS_FILTERS[key][colIdx]; else JSS_FILTERS[key][colIdx] = val;
  jssAplicaFiltros(key);
  drop.remove();
}

function jssClearColFilter(key, colIdx) {
  if (JSS_FILTERS[key]) delete JSS_FILTERS[key][colIdx];
  jssAplicaFiltros(key);
  document.querySelectorAll('.col-filter-dropdown').forEach(d=>d.remove());
}

function jssAplicaFiltros(key) {
  const grd = GRIDS[key];
  if (!grd) return;
  const filtros = JSS_FILTERS[key] || {};
  const src = FULL_DATA[key] || grd.getData().filter(r=>r&&r.some(c=>c!==''&&c!==null));

  let resultado = src;
  if (Object.keys(filtros).length > 0) {
    resultado = src.filter(r =>
      Object.entries(filtros).every(([ci,val]) => String(r[parseInt(ci)]||'').trim()===val)
    );
  }

  const def = GRID_DEFS[key];
  const padded = resultado.slice(0, Math.max(def.rows, resultado.length));
  while (padded.length < def.rows) padded.push(Array(def.cols.length).fill(''));

  grd.setData(padded);

  // Atualiza ícones
  const elId = key==='bd'?'jss-container':'jss-container-'+key;
  const el = document.getElementById(elId);
  if (el) {
    el.querySelectorAll('.col-filter-btn').forEach(b => {
      const ci = parseInt(b.dataset.col);
      const ativo = filtros[ci];
      b.innerHTML    = ativo ? '▾●' : '▾';
      b.style.color  = ativo ? '#ffd24a' : '';
    });
  }

  const statusEl = document.getElementById('jss-status-'+key);
  if (statusEl) {
    const total = src.length;
    const has   = Object.keys(filtros).length > 0;
    statusEl.textContent = has
      ? `🔽 ${resultado.length.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} linhas`
      : `✓ ${total.toLocaleString('pt-BR')} linhas`;
    statusEl.className = 'jss-status-badge jss-status-ok';
  }
}

// ── UTILITÁRIOS ───────────────────────────────────────────────────────────────
function jssColLetter(i) {
  let s=''; i++;
  while(i>0){let m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}
  return s;
}

function jssClearGrid(key) {
  if (!GRIDS[key]) return;
  if (!confirm('Limpar todos os dados desta aba?')) return;
  const def = GRID_DEFS[key];
  GRIDS[key].setData(Array.from({length:def.rows},()=>Array(def.cols.length).fill('')));
  FULL_DATA[key] = null;
  JSS_FILTERS[key] = {};
  jssUpdateStatus(key);
}

// ── PROCESSAR ─────────────────────────────────────────────────────────────────
function jssProcess() {
  if (!GRIDS.bd) { alert('Aguarde carregar.'); return; }

  const src  = FULL_DATA.bd || GRIDS.bd.getData();
  const rows = src.filter(r => r && r.some(c => c !== '' && c !== null));
  if (!rows.length) { alert('Sem dados no BD. Cole os dados (Ctrl+V) e tente novamente.'); return; }

  Object.keys(GRIDS).forEach(k => {
    if (k !== 'bd') {
      const s = FULL_DATA[k] || GRIDS[k].getData();
      GRID_DATA_STORE[k] = s.filter(r=>r&&r.some(c=>c!==''&&c!==null));
    }
  });

  BD_DATA.headers = GRID_DEFS.bd.cols.map(c => c.t);
  BD_DATA.rows    = rows;
  BD_DATA.count   = rows.length;

  const el  = document.getElementById('jss-status-bd');
  const upd = (msg,ok) => { if(el){el.textContent=msg;el.className='jss-status-badge'+(ok?' jss-status-ok':'');} };

  upd('⏳ Mapeando colunas...');
  setTimeout(() => {
    try { bdMapColumns(); } catch(e){console.warn(e);}
    upd('⏳ Preenchendo colunas automáticas...');
    setTimeout(() => {
      try { bdAutoFill(); } catch(e){console.warn(e);}
      upd('⏳ Gerando relatórios...');
      setTimeout(() => {
        try { bdUpdateAllTabs(); } catch(e){console.warn(e);}
        upd('✓ '+rows.length.toLocaleString('pt-BR')+' linhas processadas!', true);
        setTimeout(() => { jssColorAutoHeaders('bd'); jssInjectFilterIcons('bd'); }, 300);
      }, 50);
    }, 50);
  }, 50);
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────
function jssEnsureInit() {
  const ORDER = ['bd','marca','grupos','representantes','produto','clientes'];
  ORDER.forEach((key, i) => setTimeout(() => jssCreateGrid(key), 200 + i*150));
}
function jssInit() { jssCreateGrid('bd'); }

const TAB_MAP = {
  'av-tab-bd':'bd','av-tab-marca':'marca','av-tab-clientes':'clientes',
  'av-tab-representantes':'representantes','av-tab-grupos':'grupos','av-tab-produto':'produto',
};
document.addEventListener('click', e => {
  const tab = e.target.closest('.av-tab[data-target]');
  if (!tab) return;
  const key = TAB_MAP[tab.dataset.target];
  if (key && !GRIDS[key]) setTimeout(() => jssCreateGrid(key), 200);
});

function jssGetProdutoGrupos() {
  const src = FULL_DATA.produto
    || (GRIDS.produto ? GRIDS.produto.getData().filter(r=>r&&r[2]&&r[2]!=='') : [])
    || (GRID_DATA_STORE.produto || []);
  const grupos   = [...new Set(src.map(r=>String(r[3]||'').trim()).filter(Boolean))].sort();
  const subgrupos= [...new Set(src.map(r=>String(r[4]||'').trim()).filter(Boolean))].sort();
  const tipos    = [...new Set(BD_DATA.rows.map(r=>{const i=IDX.mercado;return i>=0?String(r[i]||'').trim():'';}).filter(Boolean))].sort();
  return { grupos, subgrupos, tipos };
}