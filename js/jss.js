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

  // Referência da célula ativa (linha e coluna)
  this._selRow = 0;
  this._selCol = 0;

  var hdr = '<div class="lg-wrap" style="position:relative">'
          + '<div class="lg-ref-bar" id="lg-ref-'+self.key+'">'
          +   '<span class="lg-ref-cell" id="lg-ref-label-'+self.key+'">A1</span>'
          +   '<span class="lg-ref-sep"></span>'
          +   '<span class="lg-ref-val" id="lg-ref-val-'+self.key+'"></span>'
          + '</div>'
          + '<div class="lg-scroll" id="lg-scroll-'+self.key+'"><table class="lg-table" id="lg-tbl-'+self.key+'"><thead><tr><th class="lg-rn">#</th>';
  def.cols.forEach(function(c, i) {
    hdr += '<th class="'+(c.auto?'lg-auto':'')+'" style="width:'+c.w+'px;min-width:'+c.w+'px" '
         + 'onclick="lgSortCol(\''+self.key+'\','+i+',this)">'
         + c.t
         + '<span class="col-filter-btn" data-col="'+i+'" data-key="'+self.key+'" '
         + 'onclick="event.stopPropagation();lgShowFilter(\''+self.key+'\','+i+',this)">▾</span>'
         + '</th>';
  });
  hdr += '</tr></thead><tbody class="lg-body-'+self.key+'"></tbody></table></div>'
       + '<div class="lg-pag" id="lg-pag-'+self.key+'"></div>'
       // Input flutuante — fica em cima da célula selecionada
       + '<input type="text" id="lg-inp-'+self.key+'" class="lg-float-input" autocomplete="off" spellcheck="false" />'
       + '</div>';

  this.container.innerHTML = hdr;

  // Input flutuante
  var inp = document.getElementById('lg-inp-'+self.key);

  // Clique numa célula de dados → seleciona
  var scroll = document.getElementById('lg-scroll-'+self.key);
  scroll.addEventListener('mousedown', function(e) {
    var td = e.target.closest('td');
    if (!td) return;
    var tr = td.closest('tr');
    if (!tr || tr.closest('thead')) return;
    var ci = Array.from(tr.children).indexOf(td) - 1; // -1 por causa do td#
    if (ci < 0) return;
    var ri = parseInt(tr.querySelector('.lg-rn').textContent) - 1;
    if (isNaN(ri)) return;
    e.preventDefault();
    self._selectCell(ri, ci, inp);
  });

  // Teclado no input
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      self._commitEdit(inp);
      self._selectCell(self._selRow + 1, self._selCol, inp);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      self._commitEdit(inp);
      var nextCol = self._selCol + 1;
      if (nextCol >= def.cols.length) { nextCol = 0; self._selRow++; }
      self._selectCell(self._selRow, nextCol, inp);
    } else if (e.key === 'Escape') {
      self._hideInput(inp);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); self._commitEdit(inp);
      self._selectCell(self._selRow + 1, self._selCol, inp);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); self._commitEdit(inp);
      self._selectCell(Math.max(0, self._selRow - 1), self._selCol, inp);
    } else if (e.key === 'ArrowRight' && inp.selectionEnd === inp.value.length) {
      e.preventDefault(); self._commitEdit(inp);
      self._selectCell(self._selRow, Math.min(def.cols.length-1, self._selCol+1), inp);
    } else if (e.key === 'ArrowLeft' && inp.selectionStart === 0) {
      e.preventDefault(); self._commitEdit(inp);
      self._selectCell(self._selRow, Math.max(0, self._selCol-1), inp);
    }
  });

  // Paste no input → cola a partir da célula selecionada
  inp.addEventListener('paste', function(e) {
    e.preventDefault();
    var txt = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (!txt.trim()) return;
    self._commitEdit(inp);
    self._pasteFromCell(txt, self._selRow, self._selCol);
  });

  // Atualiza barra de referência ao digitar
  inp.addEventListener('input', function() {
    var refVal = document.getElementById('lg-ref-val-'+self.key);
    if (refVal) refVal.textContent = inp.value;
  });

  // Ctrl+V no container (fora do input) → cole do início
  this.container.setAttribute('tabindex','0');
  this.container.addEventListener('paste', function(e) {
    if (e.target === inp) return;
    e.preventDefault();
    var txt = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (txt.trim()) self._paste(txt);
  });

  this._render();
};

// ── SELECIONA CÉLULA ──────────────────────────────────────────────────────────
LiteGrid.prototype._selectCell = function(ri, ci, inp) {
  var def = this.def;
  // Limita aos bounds
  var src = this.filtered || this.allData;
  ri = Math.max(0, Math.min(ri, Math.max(src.length - 1, 0)));
  ci = Math.max(0, Math.min(ci, def.cols.length - 1));

  this._selRow = ri;
  this._selCol = ci;

  // Não edita colunas automáticas
  if (def.cols[ci] && def.cols[ci].auto) {
    this._hideInput(inp || document.getElementById('lg-inp-'+this.key));
    this._highlightCell(ri, ci);
    return;
  }

  // Referência (ex: "C5")
  var label = String.fromCharCode(65 + ci) + (ri + 1);
  var refEl = document.getElementById('lg-ref-label-'+this.key);
  if (refEl) refEl.textContent = label;

  // Valor atual da célula
  var val = '';
  if (src[ri] && src[ri][ci] !== undefined) val = src[ri][ci];
  var refVal = document.getElementById('lg-ref-val-'+this.key);
  if (refVal) refVal.textContent = val;

  // Posiciona o input flutuante sobre a célula
  var td = this._getTd(ri, ci);
  if (!inp) inp = document.getElementById('lg-inp-'+this.key);

  if (td && inp) {
    var scroll = document.getElementById('lg-scroll-'+this.key);
    var scrollRect = scroll ? scroll.getBoundingClientRect() : null;
    var tdRect = td.getBoundingClientRect();
    if (scrollRect) {
      var top  = tdRect.top  - scrollRect.top  + scroll.scrollTop;
      var left = tdRect.left - scrollRect.left + scroll.scrollLeft;
      inp.style.top    = top  + 'px';
      inp.style.left   = left + 'px';
      inp.style.width  = tdRect.width  + 'px';
      inp.style.height = tdRect.height + 'px';
      inp.style.display = 'block';
      inp.value = val;
      inp.focus();
      inp.select();
    }
    this._highlightCell(ri, ci);
  }
};

LiteGrid.prototype._getTd = function(ri, ci) {
  var tbody = this.container.querySelector('.lg-body-'+this.key);
  if (!tbody) return null;
  var from = this.page * this.pageSize;
  var rowIdx = ri - from;
  var rows = tbody.querySelectorAll('tr');
  if (rowIdx < 0 || rowIdx >= rows.length) return null;
  var tds = rows[rowIdx].querySelectorAll('td');
  return tds[ci + 1] || null; // +1 por causa do td de número
};

LiteGrid.prototype._highlightCell = function(ri, ci) {
  var tbody = this.container.querySelector('.lg-body-'+this.key);
  if (!tbody) return;
  // Remove highlight anterior
  tbody.querySelectorAll('.lg-cell-sel').forEach(function(el){ el.classList.remove('lg-cell-sel'); });
  tbody.querySelectorAll('.lg-row-sel').forEach(function(el){ el.classList.remove('lg-row-sel'); });
  var td = this._getTd(ri, ci);
  if (td) {
    td.classList.add('lg-cell-sel');
    var tr = td.closest('tr');
    if (tr) tr.classList.add('lg-row-sel');
  }
};

LiteGrid.prototype._commitEdit = function(inp) {
  if (!inp) return;
  var ri = this._selRow;
  var ci = this._selCol;
  var val = inp.value;
  var src = this.filtered || this.allData;
  var ncols = this.def.cols.length;

  // Garante linhas suficientes
  while (this.allData.length <= ri) {
    var er = []; for(var j=0;j<ncols;j++) er.push('');
    this.allData.push(er);
  }
  if (!this.allData[ri]) { this.allData[ri] = []; }
  while (this.allData[ri].length < ncols) this.allData[ri].push('');
  this.allData[ri][ci] = val;

  FULL_DATA[this.key] = this.allData.filter(function(r){
    return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; });
  });

  // Re-renderiza só se mudou
  this._render();
  this._updateStatus();
};

LiteGrid.prototype._hideInput = function(inp) {
  if (inp) inp.style.display = 'none';
  var tbody = this.container.querySelector('.lg-body-'+this.key);
  if (tbody) {
    tbody.querySelectorAll('.lg-cell-sel').forEach(function(el){ el.classList.remove('lg-cell-sel'); });
    tbody.querySelectorAll('.lg-row-sel').forEach(function(el){ el.classList.remove('lg-row-sel'); });
  }
};

// Cola a partir de uma célula específica (linha + coluna)
LiteGrid.prototype._pasteFromCell = function(txt, startRow, startCol) {
  var ncols = this.def.cols.length;
  var lines = txt.split('\n').filter(function(l){ return l.trim(); });
  // Remove cabeçalho
  if (lines.length > 1) {
    var kw = ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE','GRUPO','COD'];
    var fc = lines[0].split('\t');
    if (fc.some(function(c){ return kw.some(function(k){ return c.toUpperCase().indexOf(k)>=0; }); }))
      lines.shift();
  }
  while (this.allData.length < startRow + lines.length) {
    var er = []; for(var j=0;j<ncols;j++) er.push('');
    this.allData.push(er);
  }
  lines.forEach(function(line, li) {
    var ri = startRow + li;
    if (!this.allData[ri]) { this.allData[ri]=[]; }
    while (this.allData[ri].length < ncols) this.allData[ri].push('');
    var cells = line.split('\t');
    cells.forEach(function(v, ci) {
      var dest = startCol + ci;
      if (dest < ncols) this.allData[ri][dest] = v;
    }.bind(this));
  }.bind(this));

  FULL_DATA[this.key] = this.allData.filter(function(r){
    return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; });
  });
  this.filtered = null;
  this._render();
  this._updateStatus();
  // Seleciona célula final
  var inp = document.getElementById('lg-inp-'+this.key);
  this._selectCell(startRow + lines.length - 1, startCol, inp);
};


// Cola a partir de uma coluna específica para a direita (igual Excel)
LiteGrid.prototype._pasteFromCol = function(txt, startCol) {
  var ncols = this.def.cols.length;
  var lines = txt.split('\n').filter(function(l){ return l.trim(); });

  // Remove cabeçalho se detectado
  if (lines.length > 1) {
    var kw = ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE','GRUPO','COD'];
    var fc  = lines[0].split('\t');
    if (fc.some(function(c){ return kw.some(function(k){ return c.toUpperCase().indexOf(k)>=0; }); }))
      lines.shift();
  }

  // Garante linhas suficientes
  while (this.allData.length < lines.length) {
    var er = []; for(var j=0;j<ncols;j++) er.push('');
    this.allData.push(er);
  }

  lines.forEach(function(line, ri) {
    if (!this.allData[ri]) {
      this.allData[ri] = [];
      while (this.allData[ri].length < ncols) this.allData[ri].push('');
    }
    while (this.allData[ri].length < ncols) this.allData[ri].push('');

    var cells = line.split('\t');
    cells.forEach(function(v, ci) {
      var dest = startCol + ci;
      if (dest < ncols) this.allData[ri][dest] = v;
    }.bind(this));
  }.bind(this));

  FULL_DATA[this.key] = this.allData.filter(function(r){
    return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; });
  });
  this.filtered = null;
  this.page = 0;
  this._render();
  this._updateStatus();

  // Feedback
  var colName = this.def.cols[startCol] ? this.def.cols[startCol].t : '';
  var info = document.getElementById('jss-status-'+this.key);
  if (info) {
    info.textContent = '✓ '+lines.length.toLocaleString('pt-BR')+' linhas coladas a partir de "'+colName+'"';
    info.className = 'jss-status-badge jss-status-ok';
  }
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
  var src   = this.filtered !== null ? this.filtered : this.allData;
  var from  = this.page * this.pageSize;
  var to    = Math.min(from + this.pageSize, src.length);
  var rows  = src.slice(from, to);
  var def   = this.def;
  var html  = '';

  // Sempre mostra pelo menos 30 linhas (vazias ou com dados) — igual ao Excel
  var minRows  = 30;
  var totalVis = Math.max(rows.length, minRows);

  for (var ri = 0; ri < totalVis; ri++) {
    var r = rows[ri] || [];
    var isEmpty = !r.some(function(c){ return c !== '' && c !== null && c !== undefined; });
    html += '<tr class="'+(isEmpty?'lg-tr-empty':'')+'">';
    html += '<td class="lg-rn">'+(from+ri+1)+'</td>';
    for (var ci = 0; ci < def.cols.length; ci++) {
      var v = (r[ci] !== undefined && r[ci] !== null) ? r[ci] : '';
      html += def.cols[ci].auto
        ? '<td class="lg-auto">'+v+'</td>'
        : '<td>'+v+'</td>';
    }
    html += '</tr>';
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