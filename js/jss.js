// =============================================================================
// JSS.JS — Grids jspreadsheet + filtros por coluna
// NOTA: usa var para globals (acessíveis de qualquer script)
// =============================================================================

var GRID_DEFS = {
  bd: { rows:150, lazy:false, cols:[
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
    {t:'classes',w:100,auto:true}
  ]},
  marca: { rows:200, lazy:false, cols:[
    {t:'ID',w:60,auto:false},{t:'COD MARCA',w:120,auto:false},{t:'MARCA',w:250,auto:false}
  ]},
  clientes: { rows:200, lazy:false, cols:[
    {t:'ID',w:55,auto:false},{t:'COD_CLI',w:100,auto:false},{t:'CLIENTES',w:250,auto:false},
    {t:'TIPO',w:130,auto:false},{t:'CNPJ / CPF',w:160,auto:false},
    {t:'CEP',w:90,auto:false},{t:'Cidade',w:140,auto:false},
    {t:'UF',w:50,auto:false},{t:'Bairro',w:160,auto:false},{t:'Telefone',w:130,auto:false},
    {t:'E-mail',w:190,auto:false},{t:'Fantasia',w:210,auto:false},
    {t:'VENDEDOR',w:140,auto:false},{t:'Zona de Venda',w:130,auto:false},
    {t:'dias sem venda',w:120,auto:true},{t:'meses sem venda',w:130,auto:true},
    {t:'DIAS_CICLO',w:115,auto:true},{t:'LIGAR',w:110,auto:true},
    {t:'ULT_VD_BD',w:115,auto:true},{t:'dias>ciclo',w:130,auto:true},
    {t:'dt_penulte_ped',w:130,auto:true}
  ]},
  representantes: { rows:200, lazy:false, cols:[
    {t:'ID',w:55,auto:false},{t:'COD',w:80,auto:false},{t:'REPRESENTANTE',w:220,auto:false},
    {t:'TIPO',w:120,auto:false},{t:'Fantasia',w:180,auto:false},{t:'Fone',w:130,auto:false},
    {t:'% CRESCIMENTO',w:120,auto:false},{t:'email',w:180,auto:false},
    {t:'obs',w:160,auto:false},{t:'tipo_produto',w:130,auto:false},
    {t:'DT_1',w:110,auto:true},{t:'DT_2',w:110,auto:true},{t:'DT_3',w:110,auto:true},
    {t:'DT_4',w:110,auto:true},{t:'DT_5',w:110,auto:true},{t:'DT_6',w:110,auto:true},
    {t:'DT_7',w:110,auto:true},{t:'TOT_MIX',w:90,auto:true}
  ]},
  grupos: { rows:200, lazy:false, cols:[
    {t:'ID',w:60,auto:false},{t:'COD',w:80,auto:false},
    {t:'GRUPO',w:200,auto:false},{t:'GRUPO PAI',w:200,auto:false}
  ]},
  produto: { rows:200, lazy:false, cols:[
    {t:'ID',w:55,auto:false},{t:'CODPROD',w:100,auto:false},{t:'DESCRIÇÃO',w:230,auto:false},
    {t:'GRUPO',w:130,auto:false},{t:'subgrupo',w:130,auto:false},{t:'familia',w:130,auto:false},
    {t:'ATIV_INAT',w:100,auto:false},{t:'tipo_produto',w:120,auto:false},
    {t:'DT_1',w:110,auto:true},{t:'DT_2',w:110,auto:true},{t:'DT_3',w:110,auto:true},
    {t:'DT_4',w:110,auto:true},{t:'DT_5',w:110,auto:true},{t:'DT_6',w:110,auto:true},
    {t:'DT_7',w:110,auto:true},{t:'TOT_MIX',w:90,auto:true}
  ]}
};

var GRIDS          = {};
var GRID_DATA_STORE = {};
var FULL_DATA      = {};
var JSS_FILTERS    = {};

// ── CRIA GRID ─────────────────────────────────────────────────────────────────
function jssCreateGrid(key) {
  var elId = key === 'bd' ? 'jss-container' : 'jss-container-' + key;
  var el   = document.getElementById(elId);
  if (!el || GRIDS[key]) return;
  var def  = GRID_DEFS[key];
  var data = [];
  for (var i = 0; i < def.rows; i++) {
    var row = [];
    for (var j = 0; j < def.cols.length; j++) row.push('');
    data.push(row);
  }
  try {
    // Para o BD: intercepta paste ANTES do jspreadsheet (evita travar com 77k linhas)
    if (key === 'bd') {
      el.addEventListener('paste', function(e) {
        var text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
        if (!text || text.trim().length === 0) return;
        var lines = text.split('\n').filter(function(l){ return l.trim(); });
        if (lines.length < 10) return; // pequeno: deixa jspreadsheet tratar
        e.stopPropagation();
        e.preventDefault();
        jssHandleLargePaste('bd', lines);
      }, true); // capture=true: roda ANTES do handler do jspreadsheet
    }

    GRIDS[key] = jspreadsheet(el, {
      data: data,
      columns: def.cols.map(function(c){ return {title:c.t,width:c.w,type:'text',align:'left',wordWrap:false}; }),
      tableOverflow:true, tableWidth:'100%',
      tableHeight: key==='bd' ? 'calc(100vh - 250px)' : 'calc(100vh - 260px)',
      lazyLoading:false, loadingSpin:false,
      allowInsertRow:true, allowDeleteRow:true,
      allowInsertColumn:false, allowDeleteColumn:false,
      columnSorting:true, columnResize:true, rowResize:false,
      editable:true, search:false, filters:false, freezeColumns:0,
      defaultColAlign:'left',
      onselection: function(inst,x1,y1){
        var ref = document.getElementById('jss-ref-'+key);
        if(ref) ref.textContent = jssColLetter(x1)+(y1+1);
      },
      onpaste:  function(){ setTimeout(function(){ jssOnPaste(key); }, 400); },
      onchange: function(){ setTimeout(function(){ jssUpdateStatus(key); }, 200); }
    });
    setTimeout(function(){ jssColorAutoHeaders(key); jssInjectFilterIcons(key); }, 500);
    jssUpdateStatus(key);
  } catch(e){ console.error('Grid ['+key+']:', e); }
}

function jssOnPaste(key) {
  var grd = GRIDS[key];
  if (!grd) return;
  var all = grd.getData().filter(function(r){ return r && r.some(function(c){ return c!==''&&c!==null; }); });
  if (all.length) FULL_DATA[key] = all;
  jssUpdateStatus(key);
}

function jssUpdateStatus(key) {
  if (!GRIDS[key]) return;
  try {
    var data   = GRIDS[key].getData();
    var filled = data.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null; }); }).length;
    var full   = FULL_DATA[key];
    var el     = document.getElementById('jss-status-'+key);
    if (!el) return;
    var total = (full && full.length) ? full.length : filled;
    if (total > 0) {
      el.textContent = '✓ '+total.toLocaleString('pt-BR')+' linhas';
      el.className   = 'jss-status-badge jss-status-ok';
    } else {
      el.textContent = 'Pronto';
      el.className   = 'jss-status-badge';
    }
  } catch(e){}
}

function jssColorAutoHeaders(key) {
  var elId = key==='bd'?'jss-container':'jss-container-'+key;
  var el   = document.getElementById(elId);
  if (!el) return;
  var ths = el.querySelectorAll('thead td');
  GRID_DEFS[key].cols.forEach(function(c,i){
    var th = ths[i+1];
    if (th && c.auto) {
      th.style.background   = '#3d0000';
      th.style.color        = '#ff9999';
      th.style.borderBottom = '2px solid #cc0000';
    }
  });
}

function jssInjectFilterIcons(key) {
  var elId = key==='bd'?'jss-container':'jss-container-'+key;
  var el   = document.getElementById(elId);
  if (!el) return;
  el.querySelectorAll('.col-filter-btn').forEach(function(b){ b.remove(); });
  var ths = el.querySelectorAll('thead tr:first-child td');
  ths.forEach(function(th,i){
    if (i===0) return;
    var colIdx = i-1;
    th.style.position = 'relative';
    var btn = document.createElement('span');
    btn.className = 'col-filter-btn';
    btn.dataset.key = key;
    btn.dataset.col = colIdx;
    btn.innerHTML = '▾';
    btn.title = 'Filtrar: '+(GRID_DEFS[key].cols[colIdx]?GRID_DEFS[key].cols[colIdx].t:'');
    btn.addEventListener('click', function(e){
      e.stopPropagation(); e.preventDefault();
      jssShowFilterDropdown(key, colIdx, btn);
    });
    btn.addEventListener('mousedown', function(e){ e.stopPropagation(); });
    th.appendChild(btn);
  });
}

// ── FILTROS ───────────────────────────────────────────────────────────────────
function jssShowFilterDropdown(key, colIdx, anchor) {
  document.querySelectorAll('.col-filter-dropdown').forEach(function(d){ d.remove(); });
  var grd = GRIDS[key]; if (!grd) return;
  var src  = FULL_DATA[key] || grd.getData();
  var all  = src.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null; }); });
  var seen = {};
  var vals = [];
  all.forEach(function(r){ var v=String(r[colIdx]||'').trim(); if(v&&!seen[v]){seen[v]=1;vals.push(v);} });
  vals.sort(function(a,b){ var na=parseFloat(a),nb=parseFloat(b); return (!isNaN(na)&&!isNaN(nb))?na-nb:a.localeCompare(b); });
  vals = vals.slice(0,500);
  var ativo = (JSS_FILTERS[key]||{})[colIdx];
  var rect  = anchor.getBoundingClientRect();
  var label = (GRID_DEFS[key].cols[colIdx]||{}).t||('Col '+(colIdx+1));
  var drop  = document.createElement('div');
  drop.className = 'col-filter-dropdown';
  drop.style.cssText = 'position:fixed;top:'+(rect.bottom+4)+'px;left:'+Math.min(rect.left,window.innerWidth-250)+'px;z-index:9999';
  var items = vals.map(function(v){
    return '<label class="cfd-item'+(ativo===v?' cfd-active':'')+'">'
      +'<input type="radio" name="jf'+key+colIdx+'" value="'+v.replace(/"/g,'&quot;')+'"'+(ativo===v?' checked':'')+'>'
      +'<span>'+v+'</span></label>';
  }).join('');
  drop.innerHTML = '<div class="cfd-header"><span>'+label+'</span>'
    +'<button class="cfd-clear" onclick="jssClearColFilter(\''+key+'\','+colIdx+')">✕ Limpar</button></div>'
    +'<div class="cfd-list"><label class="cfd-item'+(!ativo?' cfd-active':'')+'"><input type="radio" name="jf'+key+colIdx+'" value=""'+(!ativo?' checked':'')+'><span>(Todos)</span></label>'+items+'</div>'
    +'<div class="cfd-footer"><button class="cfd-apply" onclick="jssApplyColFilter(\''+key+'\','+colIdx+',this)">Aplicar</button></div>';
  document.body.appendChild(drop);
  setTimeout(function(){
    document.addEventListener('click', function cl(e){
      if (!drop.contains(e.target)){ drop.remove(); document.removeEventListener('click',cl); }
    });
  }, 0);
}

function jssApplyColFilter(key, colIdx, btn) {
  var drop = btn.closest('.col-filter-dropdown');
  var sel  = drop.querySelector('input[name="jf'+key+colIdx+'"]:checked');
  var val  = sel ? sel.value : '';
  if (!JSS_FILTERS[key]) JSS_FILTERS[key] = {};
  if (val==='') delete JSS_FILTERS[key][colIdx]; else JSS_FILTERS[key][colIdx] = val;
  jssAplicaFiltros(key);
  drop.remove();
}

function jssClearColFilter(key, colIdx) {
  if (JSS_FILTERS[key]) delete JSS_FILTERS[key][colIdx];
  jssAplicaFiltros(key);
  document.querySelectorAll('.col-filter-dropdown').forEach(function(d){ d.remove(); });
}

function jssAplicaFiltros(key) {
  var grd = GRIDS[key]; if (!grd) return;
  var filtros  = JSS_FILTERS[key] || {};
  var src = FULL_DATA[key] || grd.getData().filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null; }); });
  var resultado = src;
  var fKeys = Object.keys(filtros);
  if (fKeys.length > 0) {
    resultado = src.filter(function(r){
      return fKeys.every(function(ci){ return String(r[parseInt(ci)]||'').trim()===filtros[ci]; });
    });
  }
  var def = GRID_DEFS[key];
  var padded = resultado.slice(0, Math.max(def.rows, resultado.length));
  while (padded.length < def.rows) { var empty=[]; for(var i=0;i<def.cols.length;i++)empty.push(''); padded.push(empty); }
  grd.setData(padded);
  var elId = key==='bd'?'jss-container':'jss-container-'+key;
  var el = document.getElementById(elId);
  if (el) el.querySelectorAll('.col-filter-btn').forEach(function(b){
    var ci=parseInt(b.dataset.col);
    b.innerHTML = filtros[ci]?'▾●':'▾';
    b.style.color = filtros[ci]?'#ffd24a':'';
  });
  var sEl = document.getElementById('jss-status-'+key);
  if (sEl) {
    var has = fKeys.length > 0;
    sEl.textContent = has ? '🔽 '+resultado.length.toLocaleString('pt-BR')+' de '+src.length.toLocaleString('pt-BR') : '✓ '+src.length.toLocaleString('pt-BR')+' linhas';
    sEl.className = 'jss-status-badge jss-status-ok';
  }
}

// ── UTILITÁRIOS ───────────────────────────────────────────────────────────────
function jssColLetter(i) {
  var s=''; i++;
  while(i>0){var m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}
  return s;
}

function jssClearGrid(key) {
  if (!GRIDS[key]) return;
  if (!confirm('Limpar todos os dados desta aba?')) return;
  var def = GRID_DEFS[key];
  var empty = [];
  for(var i=0;i<def.rows;i++){var r=[];for(var j=0;j<def.cols.length;j++)r.push('');empty.push(r);}
  GRIDS[key].setData(empty);
  FULL_DATA[key] = null;
  JSS_FILTERS[key] = {};
  jssUpdateStatus(key);
}


// ── PASTE RÁPIDO (sem travar o browser) ──────────────────────────────────────
function jssHandleLargePaste(key, lines) {
  var def   = GRID_DEFS[key];
  var ncols = def.cols.length;

  // Remove cabeçalho se presente
  var start = 0;
  if (lines.length > 0) {
    var firstCols = lines[0].split('\t');
    var keywords  = ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','DATA','CLIENTE','CNPJ'];
    var isHeader  = firstCols.some(function(c){
      return keywords.some(function(k){ return c.toUpperCase().indexOf(k) >= 0; });
    });
    if (isHeader) start = 1;
  }

  // Parse rápido (sem regex pesado)
  var allData = [];
  for (var i = start; i < lines.length; i++) {
    var cells = lines[i].split('\t');
    while (cells.length < ncols) cells.push('');
    allData.push(cells.slice(0, ncols));
  }

  if (allData.length === 0) return;

  // Guarda TUDO em memória
  FULL_DATA[key] = allData;

  // Mostra só as primeiras 150 linhas na grade (evita travar)
  var preview = allData.slice(0, 150);
  while (preview.length < 150) {
    var emptyRow = [];
    for (var j = 0; j < ncols; j++) emptyRow.push('');
    preview.push(emptyRow);
  }

  if (GRIDS[key]) {
    GRIDS[key].setData(preview);
    setTimeout(function(){ jssColorAutoHeaders(key); jssInjectFilterIcons(key); }, 300);
  }

  // Status
  var el = document.getElementById('jss-status-' + key);
  if (el) {
    var msg = allData.length > 150
      ? '✓ ' + allData.length.toLocaleString('pt-BR') + ' linhas carregadas (mostrando 150 na grade — clique Processar para gerar relatórios)'
      : '✓ ' + allData.length.toLocaleString('pt-BR') + ' linhas';
    el.textContent = msg;
    el.className   = 'jss-status-badge jss-status-ok';
  }
}

// ── PROCESSAR RELATÓRIOS ──────────────────────────────────────────────────────
function jssProcess() {
  var statusEl = document.getElementById('jss-status-bd');
  function setStatus(msg, ok) {
    if (statusEl) { statusEl.textContent=msg; statusEl.className='jss-status-badge'+(ok?' jss-status-ok':''); }
  }

  // Garante que o grid existe
  if (!GRIDS.bd) {
    jssCreateGrid('bd');
    setStatus('⏳ Inicializando...');
    setTimeout(jssProcess, 800);
    return;
  }

  // Coleta dados — FULL_DATA guarda tudo colado, getData() o que está visível
  var src = (FULL_DATA.bd && FULL_DATA.bd.length > 0) ? FULL_DATA.bd : GRIDS.bd.getData();
  var rows = src.filter(function(r){ return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; }); });

  if (rows.length === 0) {
    alert('Sem dados no BD. Cole os dados do Excel (Ctrl+V na grade) e tente novamente.');
    return;
  }

  setStatus('⏳ Processando '+rows.length.toLocaleString('pt-BR')+' linhas...');

  // Salva dados das outras abas
  var gKeys = Object.keys(GRIDS);
  for (var gi = 0; gi < gKeys.length; gi++) {
    var k = gKeys[gi];
    if (k==='bd') continue;
    var ks = (FULL_DATA[k] && FULL_DATA[k].length>0) ? FULL_DATA[k] : GRIDS[k].getData();
    GRID_DATA_STORE[k] = ks.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null; }); });
  }

  // Configura BD_DATA (definido em bd.js)
  BD_DATA.headers = GRID_DEFS.bd.cols.map(function(c){ return c.t; });
  BD_DATA.rows    = rows;
  BD_DATA.count   = rows.length;

  // Executa processamento após render do status
  setTimeout(function(){
    try { bdMapColumns(); } catch(e){ console.error('bdMapColumns',e); }
    try { bdAutoFill(); }   catch(e){ console.error('bdAutoFill',e); }
    try { bdUpdateAllTabs(); } catch(e){ console.error('bdUpdateAllTabs',e); }

    // Atualiza grade BD com colunas vermelhas preenchidas (mostra 150 linhas)
    if (GRIDS.bd && BD_DATA.rows && BD_DATA.rows.length > 0) {
      var ncols   = GRID_DEFS.bd.cols.length;
      var preview = BD_DATA.rows.slice(0, 150).map(function(r){
        var row = r.slice(0, ncols);
        while (row.length < ncols) row.push('');
        return row;
      });
      while (preview.length < 150) {
        var er = []; for (var _i=0;_i<ncols;_i++) er.push('');
        preview.push(er);
      }
      try { GRIDS.bd.setData(preview); } catch(e){ console.error('setData BD',e); }
    }

    setTimeout(function(){
      jssColorAutoHeaders('bd');
      jssInjectFilterIcons('bd');
    }, 300);

    setStatus('✓ '+rows.length.toLocaleString('pt-BR')+' linhas processadas — relatórios atualizados!', true);
  }, 10);
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────
function jssEnsureInit() {
  var ORDER = ['bd','marca','grupos','representantes','produto','clientes'];
  ORDER.forEach(function(key,i){ setTimeout(function(){ jssCreateGrid(key); }, 200+i*150); });
}
function jssInit() { jssCreateGrid('bd'); }

var TAB_MAP = {
  'av-tab-bd':'bd','av-tab-marca':'marca','av-tab-clientes':'clientes',
  'av-tab-representantes':'representantes','av-tab-grupos':'grupos','av-tab-produto':'produto'
};
document.addEventListener('click', function(e){
  var tab = e.target.closest('.av-tab[data-target]');
  if (!tab) return;
  var key = TAB_MAP[tab.dataset.target];
  if (key && !GRIDS[key]) setTimeout(function(){ jssCreateGrid(key); }, 200);
});

function jssGetProdutoGrupos() {
  var src = FULL_DATA.produto
    || (GRIDS.produto ? GRIDS.produto.getData().filter(function(r){ return r&&r[2]&&r[2]!==''; }) : [])
    || (GRID_DATA_STORE.produto || []);
  var grupos   = [];
  var subgrupos= [];
  var seenG={}, seenS={};
  src.forEach(function(r){ var g=String(r[3]||'').trim(),s=String(r[4]||'').trim(); if(g&&!seenG[g]){seenG[g]=1;grupos.push(g);} if(s&&!seenS[s]){seenS[s]=1;subgrupos.push(s);} });
  grupos.sort(); subgrupos.sort();
  var tipos = [];
  var seenT = {};
  if (typeof BD_DATA !== 'undefined' && BD_DATA.rows) {
    BD_DATA.rows.forEach(function(r){ var i=typeof IDX!=='undefined'?IDX.mercado:-1; var v=i>=0?String(r[i]||'').trim():''; if(v&&!seenT[v]){seenT[v]=1;tipos.push(v);} });
  }
  tipos.sort();
  return { grupos:grupos, subgrupos:subgrupos, tipos:tipos };
}