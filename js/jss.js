// =============================================================================
// JSS.JS — Grids Excel com filtros por coluna + paginação inteligente
// =============================================================================

const GRID_DEFS = {
  bd: { rows:200, lazy:true,
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

// Dados completos (o grid mostra só as primeiras linhas, dados completos ficam aqui)
const GRIDS        = {};
const GRID_DATA_STORE = {};
const FULL_DATA    = {}; // dados completos por key (antes de limitar linhas)

const VISIBLE_ROWS = 200; // linhas visíveis na grade

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
      columns: def.cols.map(c => ({
        title: c.t, width: c.w, type: 'text', align: 'left', wordWrap: false,
      })),
      tableOverflow:     true,
      tableWidth:        '100%',
      tableHeight:       key === 'bd' ? 'calc(100vh - 250px)' : 'calc(100vh - 260px)',
      lazyLoading:       def.lazy,
      loadingSpin:       def.lazy,
      allowInsertRow:    true,
      allowDeleteRow:    true,
      allowInsertColumn: false,
      allowDeleteColumn: false,
      columnSorting:     true,  // Ordena ao clicar no cabeçalho
      columnResize:      true,
      rowResize:         false,
      editable:          true,
      search:            false,
      freezeColumns:     0,
      defaultColAlign:   'left',
      onselection: function(inst, x1, y1) {
        const ref = document.getElementById('jss-ref-' + key);
        if (ref) ref.textContent = jssColLetter(x1) + (y1 + 1);
      },
      onpaste:  function() { setTimeout(() => jssAfterPaste(key), 600); },
      onchange: function() { setTimeout(() => jssUpdateStatus(key), 200); },
    });

    setTimeout(() => { jssColorAutoHeaders(key); jssInjectFilters(key); }, 500);
    jssUpdateStatus(key);
  } catch(e) { console.error('Grid [' + key + '] erro:', e); }
}

// ── APÓS COLAR — mostra "Ver total" e armazena dados completos ────────────────
function jssAfterPaste(key) {
  const grd = GRIDS[key];
  if (!grd) return;
  const all = grd.getData().filter(r => r && r.some(c => c !== '' && c !== null));
  FULL_DATA[key] = all;
  jssUpdateStatus(key);
}

// ── STATUS + "Ver total de X linhas" ─────────────────────────────────────────
function jssUpdateStatus(key) {
  if (!GRIDS[key]) return;
  try {
    const data = GRIDS[key].getData();
    const filled = data.filter(r => r && r.some(c => c !== '' && c !== null)).length;
    const el = document.getElementById('jss-status-' + key);
    if (!el) return;

    const full = FULL_DATA[key];
    if (full && full.length > filled) {
      el.textContent = `Total: ${full.length.toLocaleString('pt-BR')} linhas · Exibindo ${filled.toLocaleString('pt-BR')}`;
    } else if (filled > 0) {
      el.textContent = `✓ ${filled.toLocaleString('pt-BR')} linhas`;
    } else {
      el.textContent = 'Pronto para receber dados';
    }
    el.className = 'jss-status-badge' + (filled > 0 ? ' jss-status-ok' : '');
  } catch(e) {}
}

// ── COLORE CABEÇALHOS AUTOMÁTICOS ────────────────────────────────────────────
function jssColorAutoHeaders(key) {
  const elId = key === 'bd' ? 'jss-container' : 'jss-container-' + key;
  const el = document.getElementById(elId);
  if (!el) return;
  const ths = el.querySelectorAll('thead td');
  GRID_DEFS[key].cols.forEach((c, i) => {
    const th = ths[i + 1];
    if (th && c.auto) {
      th.style.background   = '#3d0000';
      th.style.color        = '#ff9999';
      th.style.borderBottom = '2px solid #cc0000';
    }
  });
}

function jssColLetter(i) {
  let s = ''; i++;
  while (i > 0) { let m = (i-1)%26; s = String.fromCharCode(65+m)+s; i = Math.floor((i-1)/26); }
  return s;
}

function jssClearGrid(key) {
  if (!GRIDS[key]) return;
  if (!confirm('Limpar todos os dados desta aba?')) return;
  const def = GRID_DEFS[key];
  GRIDS[key].setData(Array.from({length: def.rows}, () => Array(def.cols.length).fill('')));
  FULL_DATA[key] = null;
  jssUpdateStatus(key);
}

// ── PROCESSAR — alimenta BD_DATA e relatórios ─────────────────────────────────
function jssProcess() {
  if (!GRIDS.bd) { alert('Aguarde carregar.'); return; }

  // Usa FULL_DATA se disponível (dados completos colados), senão pega do grid
  const all = FULL_DATA.bd || GRIDS.bd.getData();
  const rows = all.filter(r => r && r.some(c => c !== '' && c !== null));
  if (!rows.length) { alert('Sem dados no BD. Cole os dados e tente novamente.'); return; }

  // Salva dados de todas as abas inicializadas
  Object.keys(GRIDS).forEach(k => {
    if (k !== 'bd') {
      const src = FULL_DATA[k] || GRIDS[k].getData();
      GRID_DATA_STORE[k] = src.filter(r => r && r.some(c => c !== '' && c !== null));
    }
  });

  BD_DATA.headers = GRID_DEFS.bd.cols.map(c => c.t);
  BD_DATA.rows    = rows;
  BD_DATA.count   = rows.length;
  bdMapColumns();
  try { bdAutoFill(); } catch(e) { console.warn('autoFill', e); }
  try { bdUpdateAllTabs(); } catch(e) { console.warn('updateTabs', e); }

  setTimeout(() => jssColorAutoHeaders('bd'), 400);

  const el = document.getElementById('jss-status-bd');
  if (el) {
    el.textContent = '✓ ' + rows.length.toLocaleString('pt-BR') + ' linhas processadas — relatórios atualizados!';
    el.className   = 'jss-status-badge jss-status-ok';
  }
  const btn = document.querySelector('.jss-btn-success');
  if (btn) {
    const orig = btn.innerHTML;
    btn.textContent = '✓ Processado!';
    setTimeout(() => { btn.innerHTML = orig; }, 2500);
  }
}

// ── PASTE: captura TODOS os dados colados (não limita a 200 linhas) ───────────
// Override do evento paste para capturar dados completos antes do jspreadsheet
function jssInterceptPaste(key) {
  const elId = key === 'bd' ? 'jss-container' : 'jss-container-' + key;
  const el = document.getElementById(elId);
  if (!el) return;

  el.addEventListener('paste', function(e) {
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text.trim()) return;

    const lines = text.trim().split('\n');
    const def = GRID_DEFS[key];

    // Detecta se tem cabeçalho
    const firstCells = lines[0].split('\t');
    const isHeader = firstCells.some(c =>
      ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE'].some(k =>
        c.toUpperCase().includes(k)
      )
    );

    const dataLines = isHeader ? lines.slice(1) : lines;
    const allData   = dataLines
      .filter(l => l.trim())
      .map(l => {
        const cells = l.split('\t');
        // Garante mínimo de colunas
        while (cells.length < def.cols.length) cells.push('');
        return cells.slice(0, def.cols.length);
      });

    if (allData.length > 0) {
      FULL_DATA[key] = allData;
      // Atualiza status com total
      setTimeout(() => {
        const el2 = document.getElementById('jss-status-' + key);
        if (el2) {
          const vis = Math.min(allData.length, def.rows);
          el2.textContent = allData.length > vis
            ? `Total: ${allData.length.toLocaleString('pt-BR')} linhas · Exibindo ${vis.toLocaleString('pt-BR')} (usar Processar para carregar tudo)`
            : `✓ ${allData.length.toLocaleString('pt-BR')} linhas`;
          el2.className = 'jss-status-badge jss-status-ok';
        }
      }, 300);
    }
  }, true); // capture = true para capturar antes do jspreadsheet
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────
function jssEnsureInit() {
  const ORDER = ['bd','marca','grupos','representantes','produto','clientes'];
  ORDER.forEach((key, i) => {
    setTimeout(() => {
      jssCreateGrid(key);
      setTimeout(() => jssInterceptPaste(key), 500);
    }, 200 + i * 150);
  });
}

function jssInit() { 
  jssCreateGrid('bd'); 
  setTimeout(() => jssInterceptPaste('bd'), 500);
}

const TAB_MAP = {
  'av-tab-bd':'bd','av-tab-marca':'marca','av-tab-clientes':'clientes',
  'av-tab-representantes':'representantes','av-tab-grupos':'grupos','av-tab-produto':'produto',
};

document.addEventListener('click', e => {
  const tab = e.target.closest('.av-tab[data-target]');
  if (!tab) return;
  const key = TAB_MAP[tab.dataset.target];
  if (key && !GRIDS[key]) {
    setTimeout(() => {
      jssCreateGrid(key);
      setTimeout(() => jssInterceptPaste(key), 500);
    }, 200);
  }
});

// ── UTILITÁRIO: lê grupos do PRODUTO SERVIÇO ──────────────────────────────────
function jssGetProdutoGrupos() {
  const src = FULL_DATA.produto
    || (GRIDS.produto ? GRIDS.produto.getData().filter(r=>r&&r[2]&&r[2]!=='') : [])
    || (GRID_DATA_STORE.produto || []);
  const grupos   = [...new Set(src.map(r => String(r[3]||'').trim()).filter(Boolean))].sort();
  const subgrupos= [...new Set(src.map(r => String(r[4]||'').trim()).filter(Boolean))].sort();
  const tipos    = [...new Set(BD_DATA.rows.map(r => {
    const i = IDX.mercado; return i>=0?String(r[i]||'').trim():'';
  }).filter(Boolean))].sort();
  return { grupos, subgrupos, tipos };
}

// =============================================================================
// FILTROS POR COLUNA — dropdown em cada cabeçalho (estilo Excel)
// =============================================================================

const FILTROS_ATIVOS = {}; // key → { colIdx: value }

// Injeta ícone de filtro em cada cabeçalho de coluna
function jssInjectFilters(key) {
  const elId = key === 'bd' ? 'jss-container' : 'jss-container-' + key;
  const el   = document.getElementById(elId);
  if (!el) return;

  const headers = el.querySelectorAll('thead tr:first-child td');
  // headers[0] é o corner (número de linha), headers[1..n] são as colunas
  headers.forEach((th, i) => {
    if (i === 0) return; // pula corner
    const colIdx = i - 1;

    // Cria o ícone de filtro
    const btn = document.createElement('span');
    btn.className = 'col-filter-btn';
    btn.innerHTML = '▾';
    btn.title = 'Filtrar coluna';
    btn.dataset.col = colIdx;
    btn.dataset.key = key;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      jssShowFilterDropdown(key, colIdx, btn);
    });

    th.style.position = 'relative';
    th.appendChild(btn);
  });

  FILTROS_ATIVOS[key] = {};
}

// Mostra o dropdown de filtro para uma coluna
function jssShowFilterDropdown(key, colIdx, anchorEl) {
  // Remove dropdowns existentes
  document.querySelectorAll('.col-filter-dropdown').forEach(d => d.remove());

  const grd = GRIDS[key];
  if (!grd) return;

  // Pega valores únicos da coluna (de FULL_DATA ou do grid)
  const src = (FULL_DATA[key] || grd.getData()).filter(r => r && r.some(c => c !== '' && c !== null));
  const vals = [...new Set(src.map(r => String(r[colIdx] || '')).filter(Boolean))].sort((a,b)=>{
    const na = parseFloat(a), nb = parseFloat(b);
    return (!isNaN(na) && !isNaN(nb)) ? na-nb : a.localeCompare(b);
  });

  if (!vals.length) return;

  const ativo = FILTROS_ATIVOS[key]?.[colIdx];

  // Cria o dropdown
  const drop = document.createElement('div');
  drop.className = 'col-filter-dropdown';

  const rect = anchorEl.getBoundingClientRect();
  drop.style.top  = (rect.bottom + window.scrollY) + 'px';
  drop.style.left = (rect.left  + window.scrollX) + 'px';

  drop.innerHTML = `
    <div class="cfd-header">
      <span>Filtrar coluna ${colIdx+1}</span>
      <button class="cfd-clear" onclick="jssClearFilter('${key}',${colIdx})">✕ Limpar</button>
    </div>
    <div class="cfd-list">
      <label class="cfd-item ${!ativo?'cfd-active':''}">
        <input type="radio" name="cfd-${key}-${colIdx}" value="" ${!ativo?'checked':''}>
        <span>(Todos)</span>
      </label>
      ${vals.map(v=>`
      <label class="cfd-item ${ativo===v?'cfd-active':''}">
        <input type="radio" name="cfd-${key}-${colIdx}" value="${v.replace(/"/g,'&quot;')}" ${ativo===v?'checked':''}>
        <span>${v}</span>
      </label>`).join('')}
    </div>
    <div class="cfd-footer">
      <button class="cfd-apply" onclick="jssApplyFilter('${key}',${colIdx},this)">Aplicar</button>
    </div>`;

  document.body.appendChild(drop);

  // Fecha ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', function closeDrop(e) {
      if (!drop.contains(e.target)) {
        drop.remove();
        document.removeEventListener('click', closeDrop);
      }
    });
  }, 0);
}

// Aplica o filtro selecionado
function jssApplyFilter(key, colIdx, btn) {
  const drop = btn.closest('.col-filter-dropdown');
  const selected = drop.querySelector('input[name="cfd-'+key+'-'+colIdx+'"]:checked');
  const val = selected ? selected.value : '';

  if (!FILTROS_ATIVOS[key]) FILTROS_ATIVOS[key] = {};
  if (val === '') {
    delete FILTROS_ATIVOS[key][colIdx];
  } else {
    FILTROS_ATIVOS[key][colIdx] = val;
  }

  jssAplicaFiltros(key);
  drop.remove();

  // Indica visualmente que a coluna tem filtro ativo
  const elId = key === 'bd' ? 'jss-container' : 'jss-container-' + key;
  const el = document.getElementById(elId);
  if (el) {
    const ths = el.querySelectorAll('thead tr:first-child td');
    ths.forEach((th, i) => {
      if (i === 0) return;
      const ci = i-1;
      const btn = th.querySelector('.col-filter-btn');
      if (btn) {
        btn.style.color = FILTROS_ATIVOS[key][ci] ? '#ffd24a' : '';
        btn.innerHTML = FILTROS_ATIVOS[key][ci] ? '▾●' : '▾';
      }
    });
  }
}

// Limpa filtro de uma coluna
function jssClearFilter(key, colIdx) {
  if (FILTROS_ATIVOS[key]) delete FILTROS_ATIVOS[key][colIdx];
  jssAplicaFiltros(key);
  document.querySelectorAll('.col-filter-dropdown').forEach(d => d.remove());
}

// Aplica todos os filtros ativos na grade
function jssAplicaFiltros(key) {
  const grd = GRIDS[key];
  if (!grd) return;

  const filtros = FILTROS_ATIVOS[key] || {};
  const temFiltro = Object.keys(filtros).length > 0;

  // Fonte de dados completa
  const src = FULL_DATA[key] || grd.getData();
  const def = GRID_DEFS[key];

  let resultado = src.filter(r => r && r.some(c => c !== '' && c !== null));

  if (temFiltro) {
    resultado = resultado.filter(r =>
      Object.entries(filtros).every(([ci, val]) =>
        String(r[parseInt(ci)] || '').trim() === val
      )
    );
  }

  // Exibe resultado limitado ao tamanho do grid
  const padded = resultado.slice(0, Math.max(def.rows, resultado.length));
  while (padded.length < def.rows) padded.push(Array(def.cols.length).fill(''));
  grd.setData(padded);

  // Atualiza status
  const el = document.getElementById('jss-status-' + key);
  if (el) {
    const total = (FULL_DATA[key] || []).length || 0;
    el.textContent = temFiltro
      ? `🔽 Filtrado: ${resultado.length.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} linhas`
      : `✓ ${resultado.length.toLocaleString('pt-BR')} linhas`;
    el.className = 'jss-status-badge jss-status-ok';
  }
}

// Limpa TODOS os filtros de uma grade
function jssClearAllFilters(key) {
  FILTROS_ATIVOS[key] = {};
  jssAplicaFiltros(key);
}