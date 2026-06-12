// =============================================================================
// JSS.JS — LiteGrid: grade leve e simples
// Cole com Ctrl+V → dados entram. Filtro ▾ por coluna. Paginação.
// =============================================================================

var GRID_DEFS = {
  bd: { cols:[
    {t:'ID',w:50,auto:false},{t:'N° PEDIDO',w:90,auto:false},
    {t:'PRODUTO OU SERVIÇO',w:220,auto:false},{t:'QTD',w:55,auto:false},
    {t:'Dt. Emissão',w:100,auto:false},{t:'Data de Saída',w:100,auto:false},
    {t:'VALOR',w:80,auto:false},{t:'Vendedor',w:120,auto:false},
    {t:'Indústria',w:95,auto:false},{t:'Cliente',w:170,auto:false},
    {t:'ANO',w:55,auto:true},{t:'MÊS',w:55,auto:true},
    {t:'GRUPO',w:115,auto:true},{t:'SEM',w:60,auto:true},
    {t:'tipo mercado',w:105,auto:true},{t:'SETOR',w:130,auto:true},
    {t:'CIDADE',w:115,auto:true},{t:'UF',w:40,auto:true},
    {t:'TIPO VENDEDOR',w:115,auto:true},{t:'Dias Sem Compra',w:120,auto:true},
    {t:'NOTA F',w:70,auto:true},{t:'ROTA',w:70,auto:true},
    {t:'DESCONTO',w:85,auto:true},{t:'EMPRESA',w:125,auto:true},
    {t:'cnpj',w:140,auto:true},{t:'grupo_produto',w:125,auto:true},
    {t:'GRUPO PAI',w:115,auto:true},{t:'subgrupo_produto',w:140,auto:true},
    {t:'marca',w:125,auto:true},{t:'familia_produto',w:140,auto:true},
    {t:'classes',w:95,auto:true}
  ]},
  marca: { cols:[
    {t:'ID',w:55,auto:false},{t:'COD MARCA',w:115,auto:false},{t:'MARCA',w:240,auto:false}
  ]},
  clientes: { cols:[
    {t:'ID',w:50,auto:false},{t:'COD_CLI',w:90,auto:false},{t:'CLIENTES',w:240,auto:false},
    {t:'TIPO',w:120,auto:false},{t:'CNPJ / CPF',w:150,auto:false},
    {t:'CEP',w:85,auto:false},{t:'Cidade',w:130,auto:false},{t:'UF',w:45,auto:false},
    {t:'Bairro',w:150,auto:false},{t:'Telefone',w:120,auto:false},
    {t:'E-mail',w:180,auto:false},{t:'Fantasia',w:200,auto:false},
    {t:'VENDEDOR',w:130,auto:false},{t:'Zona de Venda',w:120,auto:false},
    {t:'dias sem venda',w:115,auto:true},{t:'meses sem venda',w:125,auto:true},
    {t:'DIAS_CICLO',w:110,auto:true},{t:'LIGAR',w:105,auto:true},
    {t:'ULT_VD_BD',w:110,auto:true},{t:'dias>ciclo',w:125,auto:true},
    {t:'dt_penulte_ped',w:125,auto:true}
  ]},
  representantes: { cols:[
    {t:'ID',w:50,auto:false},{t:'COD',w:75,auto:false},{t:'REPRESENTANTE',w:210,auto:false},
    {t:'TIPO',w:115,auto:false},{t:'Fantasia',w:170,auto:false},{t:'Fone',w:120,auto:false},
    {t:'% CRESCIMENTO',w:115,auto:false},{t:'email',w:170,auto:false},
    {t:'obs',w:150,auto:false},{t:'tipo_produto',w:120,auto:false},
    {t:'DT_1',w:105,auto:true},{t:'DT_2',w:105,auto:true},{t:'DT_3',w:105,auto:true},
    {t:'DT_4',w:105,auto:true},{t:'DT_5',w:105,auto:true},{t:'DT_6',w:105,auto:true},
    {t:'DT_7',w:105,auto:true},{t:'TOT_MIX',w:85,auto:true}
  ]},
  grupos: { cols:[
    {t:'ID',w:55,auto:false},{t:'COD',w:75,auto:false},
    {t:'GRUPO',w:190,auto:false},{t:'GRUPO PAI',w:190,auto:false}
  ]},
  produto: { cols:[
    {t:'ID',w:50,auto:false},{t:'CODPROD',w:95,auto:false},{t:'DESCRIÇÃO',w:220,auto:false},
    {t:'GRUPO',w:120,auto:false},{t:'subgrupo',w:120,auto:false},{t:'familia',w:120,auto:false},
    {t:'ATIV_INAT',w:95,auto:false},{t:'tipo_produto',w:115,auto:false},
    {t:'DT_1',w:105,auto:true},{t:'DT_2',w:105,auto:true},{t:'DT_3',w:105,auto:true},
    {t:'DT_4',w:105,auto:true},{t:'DT_5',w:105,auto:true},{t:'DT_6',w:105,auto:true},
    {t:'DT_7',w:105,auto:true},{t:'TOT_MIX',w:85,auto:true}
  ]}
};

var GRIDS           = {};
var GRID_DATA_STORE = {};
var FULL_DATA       = {};
var JSS_FILTERS     = {};

// =============================================================================
// LITEGRID
// =============================================================================
function LiteGrid(container, key) {
  this.container = container;
  this.key       = key;
  this.def       = GRID_DEFS[key];
  this.allData   = [];
  this.filtered  = null;
  this.page      = 0;
  this.pageSize  = 100;
  this._build();
}

LiteGrid.prototype._build = function() {
  var self = this;
  var def  = this.def;

  var hdr = '<div class="lg-wrap"><div class="lg-scroll"><table class="lg-table"><thead><tr><th class="lg-rn">#</th>';
  def.cols.forEach(function(c, i) {
    hdr += '<th class="'+(c.auto?'lg-auto':'')+'" style="width:'+c.w+'px;min-width:'+c.w+'px" '
         + 'onclick="lgSortCol(\''+self.key+'\','+i+',this)">'
         + c.t
         + '<span class="col-filter-btn" data-col="'+i+'" data-key="'+self.key+'" '
         + 'onclick="event.stopPropagation();lgShowFilter(\''+self.key+'\','+i+',this)">▾</span>'
         + '</th>';
  });
  hdr += '</tr></thead><tbody class="lg-body-'+self.key+'"></tbody></table></div>'
       + '<div class="lg-pag" id="lg-pag-'+self.key+'"></div></div>';

  this.container.innerHTML = hdr;

  // Paste simples: Ctrl+V em qualquer lugar da grade cola tudo
  this.container.setAttribute('tabindex','0');
  this.container.addEventListener('paste', function(e) {
    e.preventDefault();
    var txt = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (txt.trim()) self._paste(txt);
  });
  // Clique na grade dá foco (para capturar Ctrl+V)
  this.container.addEventListener('click', function() { self.container.focus(); });

  this._render();
};

LiteGrid.prototype._paste = function(txt) {
  var lines = txt.split('\n').filter(function(l){ return l.trim(); });
  var ncols = this.def.cols.length;

  // Remove cabeçalho se detectado
  var start = 0;
  if (lines.length > 0) {
    var kw = ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE','GRUPO','COD'];
    var first = lines[0].split('\t');
    if (first.some(function(c){ return kw.some(function(k){ return c.toUpperCase().indexOf(k)>=0; }); })) start = 1;
  }

  var data = [];
  for (var i = start; i < lines.length; i++) {
    var cells = lines[i].split('\t');
    while (cells.length < ncols) cells.push('');
    data.push(cells.slice(0, ncols));
  }

  FULL_DATA[this.key] = data;
  this.allData  = data;
  this.filtered = null;
  this.page     = 0;
  this._render();
  this._updateStatus();
};

LiteGrid.prototype.getData = function() {
  return this.allData.filter(function(r){
    return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; });
  });
};

LiteGrid.prototype.setData = function(data) {
  this.allData = (data||[]).filter(function(r){
    return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; });
  });
  this.filtered = null;
  this.page = 0;
  this._render();
  this._updateStatus();
};

LiteGrid.prototype._render = function() {
  var src  = this.filtered !== null ? this.filtered : this.allData;
  var from = this.page * this.pageSize;
  var to   = Math.min(from + this.pageSize, src.length);
  var rows = src.slice(from, to);
  var def  = this.def;
  var html = '';

  if (rows.length === 0) {
    html = '<tr><td colspan="'+(def.cols.length+1)+'" class="lg-empty">Clique aqui e cole os dados do Excel com Ctrl+V</td></tr>';
  } else {
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri];
      html += '<tr><td class="lg-rn">'+(from+ri+1)+'</td>';
      for (var ci = 0; ci < def.cols.length; ci++) {
        var v = (r[ci] !== undefined && r[ci] !== null) ? r[ci] : '';
        html += def.cols[ci].auto ? '<td class="lg-auto">'+v+'</td>' : '<td>'+v+'</td>';
      }
      html += '</tr>';
    }
  }

  var tbody = this.container.querySelector('.lg-body-'+this.key);
  if (tbody) tbody.innerHTML = html;
  this._renderPag(src.length);
};

LiteGrid.prototype._renderPag = function(total) {
  var el = document.getElementById('lg-pag-'+this.key);
  if (!el) return;
  if (total <= this.pageSize) { el.innerHTML=''; return; }
  var pages = Math.ceil(total/this.pageSize);
  var cur = this.page, key = this.key;
  var html = '';
  if (cur > 0) html += '<button class="lg-pb" onclick="lgGo(\''+key+'\',0)">«</button>'
                     + '<button class="lg-pb" onclick="lgGo(\''+key+'\','+(cur-1)+')">‹ Anterior</button>';
  html += '<span class="lg-pi">Pág '+(cur+1)+'/'+pages+' — '+total.toLocaleString('pt-BR')+' linhas</span>';
  if (cur < pages-1) html += '<button class="lg-pb" onclick="lgGo(\''+key+'\','+(cur+1)+')">Próxima ›</button>'
                           + '<button class="lg-pb" onclick="lgGo(\''+key+'\','+(pages-1)+')">»</button>';
  el.innerHTML = html;
};

LiteGrid.prototype._updateStatus = function() {
  var el  = document.getElementById('jss-status-'+this.key);
  if (!el) return;
  var all = FULL_DATA[this.key] || this.allData;
  if (all.length > 0) {
    el.textContent = '✓ '+all.length.toLocaleString('pt-BR')+' linhas';
    el.className   = 'jss-status-badge jss-status-ok';
  } else {
    el.textContent = 'Pronto';
    el.className   = 'jss-status-badge';
  }
};

LiteGrid.prototype.applyFilter = function(filters) {
  JSS_FILTERS[this.key] = filters;
  var src = FULL_DATA[this.key] || this.allData;
  var fks = Object.keys(filters);
  this.filtered = fks.length === 0 ? null : src.filter(function(r) {
    return fks.every(function(ci){ return String(r[parseInt(ci)]||'').trim() === filters[ci]; });
  });
  this.page = 0;
  this._render();

  // Indicadores visuais nos ícones
  var self = this;
  this.container.querySelectorAll('.col-filter-btn').forEach(function(b) {
    var ci = parseInt(b.dataset.col);
    b.innerHTML   = filters[ci] ? '▾●' : '▾';
    b.style.color = filters[ci] ? '#ffd24a' : '';
  });

  var sEl = document.getElementById('jss-status-'+this.key);
  if (sEl) {
    var total = src.length;
    var res   = this.filtered ? this.filtered.length : total;
    sEl.textContent = fks.length>0 ? '🔽 '+res.toLocaleString('pt-BR')+' de '+total.toLocaleString('pt-BR') : '✓ '+total.toLocaleString('pt-BR')+' linhas';
    sEl.className = 'jss-status-badge jss-status-ok';
  }
};

// ── GLOBAIS ───────────────────────────────────────────────────────────────────
function lgGo(key, page) {
  if (GRIDS[key]) { GRIDS[key].page = page; GRIDS[key]._render(); }
}

function lgSortCol(key, ci, th) {
  var grd = GRIDS[key]; if (!grd) return;
  var asc = th.dataset.asc !== 'true';
  th.dataset.asc = asc;
  grd.allData.sort(function(a,b){
    var va=String(a[ci]||''), vb=String(b[ci]||'');
    var na=parseFloat(va), nb=parseFloat(vb);
    if (!isNaN(na)&&!isNaN(nb)) return asc?na-nb:nb-na;
    return asc?va.localeCompare(vb):vb.localeCompare(va);
  });
  grd.filtered = null; grd.page = 0; grd._render();
}

function lgShowFilter(key, colIdx, anchor) {
  document.querySelectorAll('.col-filter-dropdown').forEach(function(d){ d.remove(); });
  var grd = GRIDS[key]; if (!grd) return;
  var src = FULL_DATA[key] || grd.allData;
  var seen = {}, vals = [];
  src.forEach(function(r){ var v=String(r[colIdx]||'').trim(); if(v&&!seen[v]){seen[v]=1;vals.push(v);} });
  vals.sort(function(a,b){ var na=parseFloat(a),nb=parseFloat(b); return (!isNaN(na)&&!isNaN(nb))?na-nb:a.localeCompare(b); });
  vals = vals.slice(0, 500);

  var ativo = (JSS_FILTERS[key]||{})[colIdx];
  var label = (GRID_DEFS[key].cols[colIdx]||{}).t || ('Col '+(colIdx+1));
  var rect  = anchor.getBoundingClientRect();
  var drop  = document.createElement('div');
  drop.className = 'col-filter-dropdown';
  drop.style.cssText = 'position:fixed;top:'+(rect.bottom+4)+'px;left:'+Math.min(rect.left, window.innerWidth-260)+'px;z-index:9999';

  var items = vals.map(function(v){
    return '<label class="cfd-item'+(ativo===v?' cfd-active':'')+'">'
      + '<input type="radio" name="lgf'+key+colIdx+'" value="'+v.replace(/"/g,'&quot;')+'"'+(ativo===v?' checked':'')+'>'
      + '<span>'+v+'</span></label>';
  }).join('');

  drop.innerHTML = '<div class="cfd-header"><span>'+label+'</span>'
    + '<button class="cfd-clear" onclick="lgClearFilter(\''+key+'\','+colIdx+')">✕ Limpar</button></div>'
    + '<div class="cfd-list">'
    + '<label class="cfd-item'+(!ativo?' cfd-active':'')+'"><input type="radio" name="lgf'+key+colIdx+'" value=""'+(!ativo?' checked':'')+'><span>(Todos)</span></label>'
    + items + '</div>'
    + '<div class="cfd-footer"><button class="cfd-apply" onclick="lgApplyFilter(\''+key+'\','+colIdx+',this)">Aplicar</button></div>';

  document.body.appendChild(drop);
  setTimeout(function(){
    document.addEventListener('click', function cl(e){
      if (!drop.contains(e.target)) { drop.remove(); document.removeEventListener('click', cl); }
    });
  }, 0);
}

function lgApplyFilter(key, colIdx, btn) {
  var drop = btn.closest('.col-filter-dropdown');
  var sel  = drop.querySelector('input[name="lgf'+key+colIdx+'"]:checked');
  var val  = sel ? sel.value : '';
  if (!JSS_FILTERS[key]) JSS_FILTERS[key] = {};
  if (val === '') delete JSS_FILTERS[key][colIdx]; else JSS_FILTERS[key][colIdx] = val;
  if (GRIDS[key]) GRIDS[key].applyFilter(JSS_FILTERS[key]);
  drop.remove();
}

function lgClearFilter(key, colIdx) {
  if (JSS_FILTERS[key]) delete JSS_FILTERS[key][colIdx];
  if (GRIDS[key]) GRIDS[key].applyFilter(JSS_FILTERS[key]||{});
  document.querySelectorAll('.col-filter-dropdown').forEach(function(d){ d.remove(); });
}

function jssClearGrid(key) {
  if (!GRIDS[key]) return;
  if (!confirm('Limpar todos os dados desta aba?')) return;
  GRIDS[key].allData = [];
  GRIDS[key].filtered = null;
  FULL_DATA[key] = [];
  JSS_FILTERS[key] = {};
  GRIDS[key].page = 0;
  GRIDS[key]._render();
  GRIDS[key]._updateStatus();
}

// ── PROCESSAR RELATÓRIOS ──────────────────────────────────────────────────────
function jssProcess() {
  var statusEl = document.getElementById('jss-status-bd');
  function setStatus(msg, ok) {
    if (statusEl) { statusEl.textContent = msg; statusEl.className = 'jss-status-badge'+(ok?' jss-status-ok':''); }
  }

  var src = (FULL_DATA.bd && FULL_DATA.bd.length>0) ? FULL_DATA.bd
          : (GRIDS.bd ? GRIDS.bd.getData() : []);
  var rows = src.filter(function(r){ return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; }); });

  if (!rows.length) {
    alert('Sem dados no BD. Clique na grade do BD e cole os dados do Excel (Ctrl+V).');
    return;
  }

  setStatus('⏳ Processando '+rows.length.toLocaleString('pt-BR')+' linhas...');

  // Salva dados das outras abas para o autoFill
  Object.keys(GRIDS).forEach(function(k) {
    if (k === 'bd') return;
    var s = (FULL_DATA[k] && FULL_DATA[k].length>0) ? FULL_DATA[k] : GRIDS[k].getData();
    GRID_DATA_STORE[k] = s.filter(function(r){ return r && r.some(function(c){ return c!==''&&c!==null; }); });
  });

  BD_DATA.headers = GRID_DEFS.bd.cols.map(function(c){ return c.t; });
  BD_DATA.rows    = rows;
  BD_DATA.count   = rows.length;

  setTimeout(function() {
    try { bdMapColumns(); }    catch(e){ console.error('bdMapColumns', e); }
    try { bdAutoFill(); }      catch(e){ console.error('bdAutoFill', e); }

    // Atualiza grade do BD com colunas vermelhas preenchidas
    if (GRIDS.bd && BD_DATA.rows.length > 0) {
      GRIDS.bd.allData  = BD_DATA.rows;
      GRIDS.bd.filtered = null;
      GRIDS.bd.page     = 0;
      GRIDS.bd._render();
    }

    try { bdUpdateAllTabs(); } catch(e){ console.error('bdUpdateAllTabs', e); }

    setStatus('✓ '+rows.length.toLocaleString('pt-BR')+' linhas processadas — relatórios atualizados!', true);
  }, 10);
}


// ── MODAL COLAR POR COLUNA ────────────────────────────────────────────────────
function lgOpenColModal(key) {
  // Remove modal anterior
  var old = document.getElementById('lg-col-modal');
  if (old) old.remove();

  var def = GRID_DEFS[key];
  var opts = def.cols
    .filter(function(c){ return !c.auto; })
    .map(function(c, _){ return c; });

  var optHtml = opts.map(function(c){
    var i = def.cols.indexOf(c);
    return '<option value="'+i+'">'+c.t+'</option>';
  }).join('');

  var modal = document.createElement('div');
  modal.id = 'lg-col-modal';
  modal.className = 'lg-modal-overlay';
  modal.innerHTML =
    '<div class="lg-modal">' +
      '<div class="lg-modal-header">' +
        '<span>Colar em coluna específica — <b id="lg-modal-key"></b></span>' +
        '<button class="lg-modal-close" onclick="lgCloseModal()">✕</button>' +
      '</div>' +
      '<div class="lg-modal-body">' +
        '<label class="lg-modal-label">1. Escolha a coluna:</label>' +
        '<select class="lg-modal-select" id="lg-modal-col">' + optHtml + '</select>' +
        '<label class="lg-modal-label" style="margin-top:12px">2. Cole os dados aqui (Ctrl+V):</label>' +
        '<textarea class="lg-modal-textarea" id="lg-modal-txt" ' +
          'placeholder="Cole aqui os dados do Excel (com ou sem cabeçalho)..." rows="8"></textarea>' +
      '</div>' +
      '<div class="lg-modal-footer">' +
        '<button class="lg-modal-btn-cancel" onclick="lgCloseModal()">Cancelar</button>' +
        '<button class="lg-modal-btn-ok" onclick="lgModalApply()">✓ Colar na Coluna</button>' +
      '</div>' +
    '</div>';

  modal.dataset.key = key;
  document.body.appendChild(modal);
  document.getElementById('lg-modal-key').textContent = key.toUpperCase();
  setTimeout(function(){ document.getElementById('lg-modal-txt').focus(); }, 100);

  // Fecha clicando fora
  modal.addEventListener('click', function(e){
    if (e.target === modal) lgCloseModal();
  });
}

function lgCloseModal() {
  var m = document.getElementById('lg-col-modal');
  if (m) m.remove();
}

function lgModalApply() {
  var modal  = document.getElementById('lg-col-modal');
  if (!modal) return;
  var key    = modal.dataset.key;
  var colIdx = parseInt(document.getElementById('lg-modal-col').value);
  var txt    = document.getElementById('lg-modal-txt').value.trim();
  if (!txt) { alert('Cole os dados no campo antes de confirmar.'); return; }

  var grd  = GRIDS[key];
  var def  = GRID_DEFS[key];
  var ncols = def.cols.length;

  var lines = txt.split('\n').filter(function(l){ return l.trim(); });

  // Remove cabeçalho se detectado
  if (lines.length > 1) {
    var kw = ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE','GRUPO','COD'];
    var fc = lines[0].split('\t');
    if (fc.some(function(c){ return kw.some(function(k){ return c.toUpperCase().indexOf(k)>=0; }); }))
      lines.shift();
  }

  // Garante linhas no allData
  var data = grd ? grd.allData.slice() : [];
  while (data.length < lines.length) {
    var er = []; for(var j=0;j<ncols;j++) er.push('');
    data.push(er);
  }

  // Cola cada linha na coluna escolhida
  lines.forEach(function(line, ri) {
    if (!data[ri]) { data[ri]=[]; while(data[ri].length<ncols) data[ri].push(''); }
    while(data[ri].length < ncols) data[ri].push('');
    var cells = line.split('\t');
    cells.forEach(function(v, ci) {
      var dest = colIdx + ci;
      if (dest < ncols) data[ri][dest] = v.trim();
    });
  });

  FULL_DATA[key] = data.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null; }); });
  if (grd) {
    grd.allData  = FULL_DATA[key];
    grd.filtered = null;
    grd.page     = 0;
    grd._render();
    grd._updateStatus();
  }

  var colName = def.cols[colIdx] ? def.cols[colIdx].t : '';
  var info = document.getElementById('jss-status-'+key);
  if (info) {
    info.textContent = '✓ '+lines.length.toLocaleString('pt-BR')+' linhas → coluna "'+colName+'"';
    info.className = 'jss-status-badge jss-status-ok';
  }
  lgCloseModal();
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────
function jssCreateGrid(key) {
  var elId = key === 'bd' ? 'jss-container' : 'jss-container-'+key;
  var el   = document.getElementById(elId);
  if (!el || GRIDS[key]) return;
  GRIDS[key] = new LiteGrid(el, key);
}

function jssEnsureInit() {
  var ORDER = ['bd','marca','grupos','representantes','produto','clientes'];
  ORDER.forEach(function(key, i){ setTimeout(function(){ jssCreateGrid(key); }, i*80); });
}

function jssInit() { jssCreateGrid('bd'); }

var TAB_MAP = {
  'av-tab-bd':'bd','av-tab-marca':'marca','av-tab-clientes':'clientes',
  'av-tab-representantes':'representantes','av-tab-grupos':'grupos','av-tab-produto':'produto'
};
document.addEventListener('click', function(e) {
  var tab = e.target.closest('.av-tab[data-target]');
  if (!tab) return;
  var key = TAB_MAP[tab.dataset.target];
  if (key && !GRIDS[key]) setTimeout(function(){ jssCreateGrid(key); }, 80);
});

// Botão Atualizar Clientes
function bdgAtualizarClientes() {
  try { bdUpdateClientes(); } catch(e){ console.error(e); }
}

// PRODUTO SERVIÇO → grupos/subgrupos para o LAUDO_GRUPO
function jssGetProdutoGrupos() {
  var src = (FULL_DATA.produto && FULL_DATA.produto.length>0) ? FULL_DATA.produto
          : (GRID_DATA_STORE.produto || []);
  var seenG = {}, seenS = {}, grupos = [], subgrupos = [];
  src.forEach(function(r) {
    var g = String(r[3]||'').trim(), s = String(r[4]||'').trim();
    if (g && !seenG[g]) { seenG[g]=1; grupos.push(g); }
    if (s && !seenS[s]) { seenS[s]=1; subgrupos.push(s); }
  });
  grupos.sort(); subgrupos.sort();
  var seenT = {}, tipos = [];
  if (typeof BD_DATA !== 'undefined' && BD_DATA.rows) {
    BD_DATA.rows.forEach(function(r) {
      var i = (typeof IDX !== 'undefined') ? IDX.mercado : -1;
      var v = i >= 0 ? String(r[i]||'').trim() : '';
      if (v && !seenT[v]) { seenT[v]=1; tipos.push(v); }
    });
  }
  tipos.sort();
  return { grupos: grupos, subgrupos: subgrupos, tipos: tipos };
}