// =============================================================================
// JSS.JS — LiteGrid com seleção de célula estilo Excel
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
  marca:{ cols:[
    {t:'ID',w:55,auto:false},{t:'COD MARCA',w:115,auto:false},{t:'MARCA',w:240,auto:false}
  ]},
  clientes:{ cols:[
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
  representantes:{ cols:[
    {t:'ID',w:50,auto:false},{t:'COD',w:75,auto:false},{t:'REPRESENTANTE',w:210,auto:false},
    {t:'TIPO',w:115,auto:false},{t:'Fantasia',w:170,auto:false},{t:'Fone',w:120,auto:false},
    {t:'% CRESCIMENTO',w:115,auto:false},{t:'email',w:170,auto:false},
    {t:'obs',w:150,auto:false},{t:'tipo_produto',w:120,auto:false},
    {t:'DT_1',w:105,auto:true},{t:'DT_2',w:105,auto:true},{t:'DT_3',w:105,auto:true},
    {t:'DT_4',w:105,auto:true},{t:'DT_5',w:105,auto:true},{t:'DT_6',w:105,auto:true},
    {t:'DT_7',w:105,auto:true},{t:'TOT_MIX',w:85,auto:true}
  ]},
  grupos:{ cols:[
    {t:'ID',w:55,auto:false},{t:'COD',w:75,auto:false},
    {t:'GRUPO',w:190,auto:false},{t:'GRUPO PAI',w:190,auto:false}
  ]},
  produto:{ cols:[
    {t:'ID',w:50,auto:false},{t:'CODPROD',w:95,auto:false},{t:'DESCRIÇÃO',w:220,auto:false},
    {t:'GRUPO',w:120,auto:false},{t:'subgrupo',w:120,auto:false},{t:'familia',w:120,auto:false},
    {t:'ATIV_INAT',w:95,auto:false},{t:'tipo_produto',w:115,auto:false},
    {t:'DT_1',w:105,auto:true},{t:'DT_2',w:105,auto:true},{t:'DT_3',w:105,auto:true},
    {t:'DT_4',w:105,auto:true},{t:'DT_5',w:105,auto:true},{t:'DT_6',w:105,auto:true},
    {t:'DT_7',w:105,auto:true},{t:'TOT_MIX',w:85,auto:true}
  ]}
};

var GRIDS = {}, GRID_DATA_STORE = {}, FULL_DATA = {}, JSS_FILTERS = {};

// =============================================================================
// LITEGRID
// =============================================================================
function liteGridRenderCell(key, ci, val, td) {
  if (typeof _dreRenderToggle === 'function' && _dreRenderToggle(key, ci, val, td)) return;
  td.textContent = val;
}

function LiteGrid(container, key) {
  this.container = container;
  this.key       = key;
  this.def       = GRID_DEFS[key];
  this.allData   = [];
  this.filtered  = null;
  this.page      = 0;
  this.pageSize  = 500;
  this.minRows   = 100;
  this.selRow    = -1;
  this.selCol    = -1;
  this.undoStack = [];
  this.maxUndo   = 50;
  this._build();
}

LiteGrid.prototype._build = function() {
  var self = this;
  var def  = this.def;

  // 1. Barra de referência (ex: A1 | valor)
  var refBar = document.createElement('div');
  refBar.className = 'lg-ref-bar';
  refBar.innerHTML =
    '<span class="lg-ref-cell" id="lg-rc-'+self.key+'">A1</span>' +
    '<input class="lg-ref-val" id="lg-rv-'+self.key+'" readonly placeholder="valor..." />';

  // 2. Cabeçalho da tabela
  var thead = '<thead><tr><th class="lg-rn" style="width:42px;min-width:42px;max-width:42px">ID</th>';
  def.cols.forEach(function(c,i){
    thead += '<th class="'+(c.auto?'lg-auto':'')+'" style="width:'+c.w+'px;min-width:'+c.w+'px"'
           + ' onclick="lgSortCol(\''+self.key+'\','+i+',this)">'
           + c.t
           + '<span class="col-filter-btn" data-col="'+i+'" data-key="'+self.key+'"'
           + ' onclick="event.stopPropagation();lgShowFilter(\''+self.key+'\','+i+',this)">▾</span>'
           + '</th>';
  });
  thead += '</tr></thead>';

  // 3. Monta estrutura
  var wrap   = document.createElement('div');  wrap.className = 'lg-wrap';
  var scroll = document.createElement('div');  scroll.className = 'lg-scroll';
  var table  = document.createElement('table'); table.className = 'lg-table';
  var tbody  = document.createElement('tbody'); tbody.className = 'lg-body';
  var pag    = document.createElement('div');  pag.id = 'lg-pag-'+self.key;  pag.className = 'lg-pag';

  // Input flutuante — único para toda a grade
  var inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'lg-float-input';
  inp.id = 'lg-inp-'+self.key; inp.autocomplete = 'off'; inp.spellcheck = false;
  inp.style.display = 'none';

  table.innerHTML = thead;
  table.appendChild(tbody);
  scroll.appendChild(table);
  // inp DENTRO do scroll → segue o scroll (corrige ghost cell)
  scroll.appendChild(inp);
  scroll.style.position = 'relative';
  wrap.appendChild(refBar);
  wrap.appendChild(scroll);
  wrap.appendChild(pag);
  this.container.innerHTML = '';
  this.container.appendChild(wrap);
  // Evita scroll duplo: container externo (fin-tabela-scroll etc.) não deve rolar
  this.container.style.overflow  = 'visible';
  this.container.style.maxHeight = 'none';

  this._tbody = tbody;
  this._inp   = inp;

  // ── EVENTOS ────────────────────────────────────────────────────────────────

  // Clique numa célula → seleciona
  tbody.addEventListener('mousedown', function(e) {
    var td = e.target.closest('td');
    if (!td || td.classList.contains('lg-rn')) return;
    e.preventDefault();
    var tr  = td.closest('tr');
    var ci  = Array.from(tr.cells).indexOf(td) - 1;
    var rn  = tr.querySelector('.lg-rn');
    var ri  = rn ? parseInt(rn.textContent) - 1 : -1;
    if (ci < 0 || ri < 0) return;
    self._commit();
    var rowIdx = ri - (self.page * self.pageSize);
    var liveRow = self._tbody ? self._tbody.querySelectorAll('tr')[rowIdx] : null;
    var liveTd = liveRow ? liveRow.querySelectorAll('td')[ci + 1] : null;
    self._select(ri, ci, liveTd || td);
  });

  // Teclado no input
  inp.addEventListener('keydown', function(e) {
    var key = String(e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); self._undo(); return; }
    if (e.key === 'Enter')     { e.preventDefault(); self._commit(); self._move(1, 0); }
    else if (e.key === 'Tab')  { e.preventDefault(); self._commit(); self._move(0, e.shiftKey?-1:1); }
    else if (e.key === 'Escape') { self._hideInp(); }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); self._commit(); self._move(1,  0); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); self._commit(); self._move(-1, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); self._commit(); self._move(0, 1); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); self._commit(); self._move(0,-1); }
  });

  inp.addEventListener('input', function() {
    var rv = document.getElementById('lg-rv-'+key);
    if (rv) rv.value = inp.value;
  });

  inp.addEventListener('blur', function() {
    self._commit();
  });

  // Paste no input → cola a partir da célula selecionada
  inp.addEventListener('paste', function(e) {
    e.preventDefault();
    var txt = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (!txt.trim()) return;
    self._commit();
    self._pasteAt(txt, self.selRow, self.selCol);
  });

  // Paste no container (sem célula selecionada) → cola do início
  this.container.setAttribute('tabindex','0');
  this.container.addEventListener('paste', function(e) {
    if (e.target === inp) return;
    e.preventDefault();
    var txt = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (txt.trim()) self._paste(txt);
  });

  this.container.addEventListener('copy', function(e) {
    if (e.target === inp) return;
    self._copySelected(e);
  });

  // Setas + Enter + Tab no container (modo navegação, sem editar)
  this.container.addEventListener('keydown', function(e) {
    if (e.target === inp) return;
    var key = String(e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); self._undo(); return; }
    var map = {ArrowDown:[1,0], ArrowUp:[-1,0], ArrowRight:[0,1], ArrowLeft:[0,-1]};
    var d = map[e.key];
    if (!d && e.key !== 'Enter' && e.key !== 'Tab') return;
    e.preventDefault();
    if (e.key === 'Enter') d = [1, 0];
    else if (e.key === 'Tab') d = [0, e.shiftKey ? -1 : 1];
    if (self.selRow < 0 || self.selCol < 0) { self._select(0, 0, self._firstTd()); return; }
    self._move(d[0], d[1]);
  });

  this._render();
};

// ── SELEÇÃO ───────────────────────────────────────────────────────────────────
LiteGrid.prototype._select = function(ri, ci, td) {
  var def = this.def;
  this.selRow = ri; this.selCol = ci;

  // Remove seleção anterior
  if (this._tbody) {
    this._tbody.querySelectorAll('.lg-sel-cell').forEach(function(el){ el.classList.remove('lg-sel-cell'); });
    this._tbody.querySelectorAll('.lg-sel-row').forEach(function(el){ el.classList.remove('lg-sel-row'); });
  }

  if (td) {
    td.classList.add('lg-sel-cell');
    var tr = td.closest('tr');
    if (tr) Array.from(tr.cells).forEach(function(c){ c.classList.add('lg-sel-row'); });
  }

  // Referência (A1, B3 etc.)
  var col = ci < 26 ? String.fromCharCode(65+ci) : String.fromCharCode(64+Math.floor(ci/26))+String.fromCharCode(65+(ci%26));
  var rc = document.getElementById('lg-rc-'+this.key);
  if (rc) rc.textContent = col+(ri+1);

  // Coluna automática → só mostra referência, não edita
  if (def.cols[ci] && def.cols[ci].auto) {
    if (this._inp) this._inp.style.display = 'none';
    var rv = document.getElementById('lg-rv-'+this.key);
    var src = this.filtered || this.allData;
    if (rv) rv.value = (src[ri] && src[ri][ci] !== undefined) ? src[ri][ci] : '';
    return;
  }

  // Posiciona input flutuante sobre a célula
  if (td && this._inp) {
    var scEl = this._tbody.closest('.lg-scroll');
    var tr2  = td.getBoundingClientRect();
    var wr   = this._inp.offsetParent ? this._inp.offsetParent.getBoundingClientRect()
                                      : (this._inp.parentElement ? this._inp.parentElement.getBoundingClientRect() : tr2);
    if (scEl) {
      // inp é position:absolute dentro do wrap (position:relative)
      // top = posição do td relativo ao topo do wrap + scroll
      var top  = tr2.top  - wr.top  + scEl.scrollTop;
      var left = tr2.left - wr.left + scEl.scrollLeft;
      this._inp.style.cssText =
        'display:block;position:absolute;top:'+top+'px;left:'+left+'px;'
        +'width:'+(tr2.width)+'px;height:'+(tr2.height)+'px;'
        +'background:#FFFFFF;border:2px solid #14746F;color:#0A2F2F;'
        +'font:12px inherit;padding:0 6px;z-index:50;outline:none;box-sizing:border-box;';
    }
    var src = this.filtered || this.allData;
    this._inp.value = (src[ri] && src[ri][ci] !== undefined) ? src[ri][ci] : '';
    var rv = document.getElementById('lg-rv-'+this.key);
    if (rv) rv.value = this._inp.value;
    this._inp.focus(); this._inp.select();
  }
};

LiteGrid.prototype._commit = function() {
  if (this.selRow < 0 || this.selCol < 0 || !this._inp) return;
  var val = this._inp.value;
  var ri = this.selRow, ci = this.selCol;
  var ncols = this.def.cols.length;
  while (this.allData.length <= ri) {
    var er = []; for(var j=0;j<ncols;j++) er.push(''); this.allData.push(er);
  }
  while (this.allData[ri].length < ncols) this.allData[ri].push('');
  var oldVal = this.allData[ri][ci];
  if (oldVal !== val) this._pushUndo({ type:'cells', oldLength:this.allData.length, changes:[{ri:ri, ci:ci, oldVal:oldVal}] });
  this.allData[ri][ci] = val;
  FULL_DATA[this.key] = this.allData.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null; }); });
  this._renderRow(ri);
  this._updateStatus();
};

LiteGrid.prototype._pushUndo = function(entry) {
  if (!entry) return;
  this.undoStack.push(entry);
  if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
};

LiteGrid.prototype._undo = function() {
  var entry = this.undoStack.pop();
  if (!entry) return;
  if (entry.type === 'replace') {
    this.allData = entry.oldData || [];
    this.filtered = null;
    this.page = entry.oldPage || 0;
  } else if (entry.type === 'cells') {
    (entry.changes || []).forEach(function(ch) {
      if (!this.allData[ch.ri]) return;
      while (this.allData[ch.ri].length < this.def.cols.length) this.allData[ch.ri].push('');
      this.allData[ch.ri][ch.ci] = ch.oldVal;
    }.bind(this));
    if (typeof entry.oldLength === 'number' && this.allData.length > entry.oldLength) {
      this.allData.length = entry.oldLength;
    }
  }
  FULL_DATA[this.key] = this.allData.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null; }); });
  this.filtered = null;
  this._render();
  this._updateStatus();
  if (this.selRow >= 0 && this.selCol >= 0) {
    var from = this.page * this.pageSize;
    var rowIdx = this.selRow - from;
    var tr = this._tbody ? this._tbody.querySelectorAll('tr')[rowIdx] : null;
    var td = tr ? tr.querySelectorAll('td')[this.selCol + 1] : null;
    if (td) this._select(this.selRow, this.selCol, td);
  }
};

LiteGrid.prototype._copySelected = function(e) {
  if (this.selRow < 0 || this.selCol < 0) return;
  var src = this.filtered !== null ? this.filtered : this.allData;
  var val = (src[this.selRow] && src[this.selRow][this.selCol] !== undefined)
    ? src[this.selRow][this.selCol]
    : '';
  if (e) e.preventDefault();
  if (e && e.clipboardData) e.clipboardData.setData('text/plain', String(val || ''));
};

LiteGrid.prototype._renderRow = function(ri) {
  // Atualiza só a linha editada sem re-renderizar tudo
  if (!this._tbody) return;
  var from = this.page * this.pageSize;
  var rowIdx = ri - from;
  var rows = this._tbody.querySelectorAll('tr');
  if (rowIdx < 0 || rowIdx >= rows.length) return;
  var tr = rows[rowIdx];
  var r = this.allData[ri] || [];
  var def = this.def;
  var tds = tr.querySelectorAll('td');
  for (var ci = 0; ci < def.cols.length; ci++) {
    var td = tds[ci+1];
    var _val = (r[ci] !== undefined && r[ci] !== null) ? r[ci] : '';
    if (td) liteGridRenderCell(this.key, ci, _val, td);
  }
};

LiteGrid.prototype._move = function(dr, dc) {
  var ri = this.selRow + dr;
  var ci = this.selCol + dc;
  var ncols = this.def.cols.length;
  ri = Math.max(0, ri);
  ci = Math.max(0, Math.min(ncols-1, ci));
  this._ensureRow(ri);
  // Vai para a página certa se necessário
  var from = this.page * this.pageSize;
  if (ri >= from + this.pageSize) { this.page++; this._render(); }
  else if (ri < from) { this.page = Math.max(0, this.page-1); this._render(); }
  var from2 = this.page * this.pageSize;
  var rowIdx = ri - from2;
  if (!this._tbody) return;
  var rows = this._tbody.querySelectorAll('tr');
  if (rowIdx < 0 || rowIdx >= rows.length) {
    this._render();
    rows = this._tbody.querySelectorAll('tr');
    if (rowIdx < 0 || rowIdx >= rows.length) return;
  }
  var td = rows[rowIdx].querySelectorAll('td')[ci+1];
  this._scrollToTd(td); // scroll antes de selecionar → inp posicionado já com td visível
  this._select(ri, ci, td);
};

LiteGrid.prototype._ensureRow = function(ri) {
  if (ri < 0) return;
  var ncols = this.def.cols.length;
  while (this.allData.length <= ri) {
    var row = [];
    for (var j = 0; j < ncols; j++) row.push('');
    this.allData.push(row);
  }
  while (this.allData[ri].length < ncols) this.allData[ri].push('');
};

LiteGrid.prototype._hideInp = function() {
  if (this._inp) this._inp.style.display = 'none';
  this.selRow = -1; this.selCol = -1;
  if (this._tbody) {
    this._tbody.querySelectorAll('.lg-sel-cell,.lg-sel-row').forEach(function(el){
      el.classList.remove('lg-sel-cell','lg-sel-row');
    });
  }
};

// Garante que o td selecionado esteja visível no scroll (vertical + horizontal)
LiteGrid.prototype._scrollToTd = function(td) {
  if (!td) return;
  var scEl = this._tbody ? this._tbody.closest('.lg-scroll') : null;
  if (!scEl) return;
  var tdR = td.getBoundingClientRect();
  var scR = scEl.getBoundingClientRect();
  var RN  = 46; // largura da coluna # (sticky left)
  // Vertical
  if (tdR.bottom > scR.bottom - 2) scEl.scrollTop += tdR.bottom - scR.bottom + 4;
  else if (tdR.top < scR.top + 2)  scEl.scrollTop -= scR.top + 2 - tdR.top;
  // Horizontal
  if (tdR.right  > scR.right  - 2) scEl.scrollLeft += tdR.right  - scR.right  + 4;
  else if (tdR.left < scR.left + RN) scEl.scrollLeft -= scR.left + RN - tdR.left;
};

// Primeira td navegável (linha 0, coluna 0 manual)
LiteGrid.prototype._firstTd = function() {
  if (!this._tbody) return null;
  var rows = this._tbody.querySelectorAll('tr');
  if (!rows.length) return null;
  var tds = rows[0].querySelectorAll('td');
  return tds[1] || null;
};

// ── PASTE ─────────────────────────────────────────────────────────────────────
LiteGrid.prototype._pasteAt = function(txt, startRow, startCol) {
  if (startRow < 0) startRow = 0;
  if (startCol < 0) startCol = 0;
  var ncols = this.def.cols.length;
  var lines = String(txt || '').replace(/\r/g, '').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines = lines.filter(function(l){ return l.length || l.indexOf('\t') >= 0; });
  if (lines.length > 1) {
    var kw = ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE','GRUPO','COD'];
    var fc = lines[0].split('\t');
    if (fc.some(function(c){ return kw.some(function(k){ return c.toUpperCase().indexOf(k)>=0; }); })) lines.shift();
  }
  if (!lines.length) return;
  var changes = [];
  var oldLength = this.allData.length;
  while (this.allData.length < startRow + lines.length) {
    var er=[]; for(var j=0;j<ncols;j++) er.push(''); this.allData.push(er);
  }
  lines.forEach(function(line, li) {
    var ri = startRow + li;
    if (!this.allData[ri]) { this.allData[ri]=[]; }
    while (this.allData[ri].length < ncols) this.allData[ri].push('');
    line.split('\t').forEach(function(v,ci){
      var d=startCol+ci;
      if(d<ncols) {
        var oldVal = this.allData[ri][d];
        if (oldVal !== v) changes.push({ri:ri, ci:d, oldVal:oldVal});
        this.allData[ri][d]=v;
      }
    }.bind(this));
  }.bind(this));
  if (changes.length) this._pushUndo({ type:'cells', oldLength:oldLength, changes:changes });
  FULL_DATA[this.key] = this.allData.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null; }); });
  this.filtered=null; this._render(); this._updateStatus();
};

LiteGrid.prototype._paste = function(txt) {
  var ncols = this.def.cols.length;
  var lines = String(txt || '').replace(/\r/g, '').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines = lines.filter(function(l){ return l.length || l.indexOf('\t') >= 0; });
  var start = 0;
  if (lines.length>0) {
    var kw=['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE','GRUPO','COD'];
    var fc=lines[0].split('\t');
    if(fc.some(function(c){return kw.some(function(k){return c.toUpperCase().indexOf(k)>=0;});})) start=1;
  }
  var data=[];
  for(var i=start;i<lines.length;i++){
    var cells=lines[i].split('\t');
    while(cells.length<ncols) cells.push('');
    data.push(cells.slice(0,ncols));
  }
  this._pushUndo({ type:'replace', oldData:this.allData.map(function(r){ return (r || []).slice(); }), oldPage:this.page });
  FULL_DATA[this.key]=data; this.allData=data; this.filtered=null; this.page=0;
  this._render(); this._updateStatus();
};

LiteGrid.prototype.getData = function() {
  return this.allData.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null&&c!==undefined; }); });
};

LiteGrid.prototype.setData = function(data) {
  this.allData = (data||[]).filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null&&c!==undefined; }); });
  this.undoStack = [];
  this.filtered=null; this.page=0; this._render(); this._updateStatus();
};

// ── RENDER ────────────────────────────────────────────────────────────────────
LiteGrid.prototype._render = function() {
  var src   = this.filtered !== null ? this.filtered : this.allData;
  var from  = this.page * this.pageSize;
  var rows  = src.slice(from, from + this.pageSize);
  var def   = this.def;
  var html  = '';
  var total = Math.max(rows.length, this.minRows || 100);

  for (var ri = 0; ri < total; ri++) {
    var r = rows[ri] || [];
    html += '<tr><td class="lg-rn" style="width:42px;min-width:42px;max-width:42px">'+(from+ri+1)+'</td>';
    for (var ci = 0; ci < def.cols.length; ci++) {
      var v = (r[ci]!==undefined&&r[ci]!==null) ? r[ci] : '';
      html += def.cols[ci].auto ? '<td class="lg-auto">'+v+'</td>' : '<td>'+v+'</td>';
    }
    html += '</tr>';
  }

  if (this._tbody) {
    this._tbody.innerHTML = html;
    var trs = this._tbody.querySelectorAll('tr');
    for (var rix = 0; rix < total; rix++) {
      var tr = trs[rix];
      var row = rows[rix] || [];
      if (!tr) continue;
      var tds = tr.querySelectorAll('td');
      for (var cix = 0; cix < def.cols.length; cix++) {
        var td = tds[cix+1];
        var val = (row[cix]!==undefined&&row[cix]!==null) ? row[cix] : '';
        if (td && typeof _dreRenderToggle === 'function') _dreRenderToggle(this.key, cix, val, td);
      }
    }
  }
  this._renderPag(src.length);
};

LiteGrid.prototype._renderPag = function(total) {
  var el = document.getElementById('lg-pag-'+this.key);
  if (!el) return;
  if (total <= this.pageSize) { el.innerHTML=''; return; }
  var pages = Math.ceil(total/this.pageSize), cur = this.page, key = this.key;
  var h = '';
  if(cur>0) h+='<button class="lg-pb" onclick="lgGo(\''+key+'\',0)">«</button><button class="lg-pb" onclick="lgGo(\''+key+'\','+(cur-1)+')">‹</button>';
  h+='<span class="lg-pi">Pág '+(cur+1)+'/'+pages+' — '+total.toLocaleString('pt-BR')+' linhas</span>';
  if(cur<pages-1) h+='<button class="lg-pb" onclick="lgGo(\''+key+'\','+(cur+1)+')">›</button><button class="lg-pb" onclick="lgGo(\''+key+'\','+(pages-1)+')">»</button>';
  el.innerHTML = h;
};

LiteGrid.prototype._updateStatus = function() {
  var el = document.getElementById('jss-status-'+this.key);
  if (!el) return;
  var all = FULL_DATA[this.key] || this.allData;
  if (all.length>0) { el.textContent='✓ '+all.length.toLocaleString('pt-BR')+' linhas'; el.className='jss-status-badge jss-status-ok'; }
  else { el.textContent='Pronto'; el.className='jss-status-badge'; }
};

LiteGrid.prototype.applyFilter = function(filters) {
  JSS_FILTERS[this.key]=filters;
  var src=FULL_DATA[this.key]||this.allData, fks=Object.keys(filters);
  this.filtered=fks.length===0?null:src.filter(function(r){ return fks.every(function(ci){ return String(r[parseInt(ci)]||'').trim()===filters[ci]; }); });
  this.page=0; this._render();
  var self=this;
  this.container.querySelectorAll('.col-filter-btn').forEach(function(b){
    var ci=parseInt(b.dataset.col); b.innerHTML=filters[ci]?'▾●':'▾'; b.style.color=filters[ci]?'#ffd24a':'';
  });
  var sEl=document.getElementById('jss-status-'+this.key);
  if(sEl){ var tot=src.length,res=(this.filtered||this.allData).length,has=fks.length>0;
    sEl.textContent=has?'🔽 '+res.toLocaleString('pt-BR')+' de '+tot.toLocaleString('pt-BR'):'✓ '+tot.toLocaleString('pt-BR')+' linhas';
    sEl.className='jss-status-badge jss-status-ok'; }
};

// ── GLOBAIS ───────────────────────────────────────────────────────────────────
function lgGo(key,page){ if(GRIDS[key]){GRIDS[key].page=page;GRIDS[key]._render();} }

function lgSortCol(key,ci,th){
  var grd=GRIDS[key]; if(!grd) return;
  var asc=th.dataset.asc!=='true'; th.dataset.asc=asc;
  grd.allData.sort(function(a,b){ var va=String(a[ci]||''),vb=String(b[ci]||''),na=parseFloat(va),nb=parseFloat(vb); return(!isNaN(na)&&!isNaN(nb))?asc?na-nb:nb-na:asc?va.localeCompare(vb):vb.localeCompare(va); });
  grd.filtered=null; grd.page=0; grd._render();
}

function lgShowFilter(key,colIdx,anchor){
  document.querySelectorAll('.col-filter-dropdown').forEach(function(d){d.remove();});
  var grd=GRIDS[key]; if(!grd) return;
  var src=FULL_DATA[key]||grd.allData, seen={}, vals=[];
  src.forEach(function(r){var v=String(r[colIdx]||'').trim();if(v&&!seen[v]){seen[v]=1;vals.push(v);}});
  vals.sort(function(a,b){var na=parseFloat(a),nb=parseFloat(b);return(!isNaN(na)&&!isNaN(nb))?na-nb:a.localeCompare(b);});
  vals=vals.slice(0,500);
  var ativo=(JSS_FILTERS[key]||{})[colIdx], label=(GRID_DEFS[key].cols[colIdx]||{}).t||('Col '+(colIdx+1)), rect=anchor.getBoundingClientRect();
  var drop=document.createElement('div'); drop.className='col-filter-dropdown';
  drop.style.cssText='position:fixed;top:'+(rect.bottom+4)+'px;left:'+Math.min(rect.left,window.innerWidth-260)+'px;z-index:9999';
  var items=vals.map(function(v){return '<label class="cfd-item'+(ativo===v?' cfd-active':'')+'"><input type="radio" name="lgf'+key+colIdx+'" value="'+v.replace(/"/g,'&quot;')+'"'+(ativo===v?' checked':'')+'><span>'+v+'</span></label>';}).join('');
  drop.innerHTML='<div class="cfd-header"><span>'+label+'</span><button class="cfd-clear" onclick="lgClearFilter(\''+key+'\','+colIdx+')">✕ Limpar</button></div>'
    +'<div class="cfd-list"><label class="cfd-item'+(!ativo?' cfd-active':'')+'"><input type="radio" name="lgf'+key+colIdx+'" value=""'+(!ativo?' checked':'')+'><span>(Todos)</span></label>'+items+'</div>'
    +'<div class="cfd-footer"><button class="cfd-apply" onclick="lgApplyFilter(\''+key+'\','+colIdx+',this)">Aplicar</button></div>';
  document.body.appendChild(drop);
  setTimeout(function(){document.addEventListener('click',function cl(e){if(!drop.contains(e.target)){drop.remove();document.removeEventListener('click',cl);}});},0);
}

function lgApplyFilter(key,colIdx,btn){
  var drop=btn.closest('.col-filter-dropdown'), sel=drop.querySelector('input[name="lgf'+key+colIdx+'"]:checked'), val=sel?sel.value:'';
  if(!JSS_FILTERS[key]) JSS_FILTERS[key]={}; if(val==='') delete JSS_FILTERS[key][colIdx]; else JSS_FILTERS[key][colIdx]=val;
  if(GRIDS[key]) GRIDS[key].applyFilter(JSS_FILTERS[key]); drop.remove();
}

function lgClearFilter(key,colIdx){
  if(JSS_FILTERS[key]) delete JSS_FILTERS[key][colIdx];
  if(GRIDS[key]) GRIDS[key].applyFilter(JSS_FILTERS[key]||{});
  document.querySelectorAll('.col-filter-dropdown').forEach(function(d){d.remove();});
}

function jssClearGrid(key){
  if(!GRIDS[key]||!confirm('Limpar todos os dados desta aba?')) return;
  GRIDS[key].allData=[];GRIDS[key].filtered=null;FULL_DATA[key]=[];JSS_FILTERS[key]={};
  GRIDS[key].page=0;GRIDS[key]._render();GRIDS[key]._updateStatus();
}

// ── PROCESSAR ─────────────────────────────────────────────────────────────────
function jssProcess(){
  var statusEl=document.getElementById('jss-status-bd');
  function setStatus(msg,ok){if(statusEl){statusEl.textContent=msg;statusEl.className='jss-status-badge'+(ok?' jss-status-ok':'');}}
  var src=(FULL_DATA.bd&&FULL_DATA.bd.length>0)?FULL_DATA.bd:(GRIDS.bd?GRIDS.bd.getData():[]);
  var rows=src.filter(function(r){return r&&r.some(function(c){return c!==''&&c!==null&&c!==undefined;});});
  if(!rows.length){alert('Sem dados no BD. Cole os dados (Ctrl+V) e tente novamente.');return;}
  setStatus('⏳ Processando '+rows.length.toLocaleString('pt-BR')+' linhas...');
  Object.keys(GRIDS).forEach(function(k){
    if(k==='bd') return;
    var s=(FULL_DATA[k]&&FULL_DATA[k].length>0)?FULL_DATA[k]:GRIDS[k].getData();
    GRID_DATA_STORE[k]=s.filter(function(r){return r&&r.some(function(c){return c!==''&&c!==null;});});
  });
  BD_DATA.headers=GRID_DEFS.bd.cols.map(function(c){return c.t;});
  BD_DATA.rows=rows; BD_DATA.count=rows.length;
  setTimeout(function(){
    try{bdMapColumns();}catch(e){console.error(e);}
    try{bdAutoFill();}catch(e){console.error(e);}
    if(GRIDS.bd){GRIDS.bd.allData=BD_DATA.rows;GRIDS.bd.filtered=null;GRIDS.bd.page=0;GRIDS.bd._render();}
    try{bdUpdateAllTabs();}catch(e){console.error(e);}
    setStatus('✓ '+rows.length.toLocaleString('pt-BR')+' linhas processadas — relatórios atualizados!',true);
    // Salva automaticamente no Supabase
    setTimeout(function(){
      if(typeof salvarDadosManuaisNoSupabase==='function') salvarDadosManuaisNoSupabase(true);
    },300);
  },10);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function jssCreateGrid(key){
  var elId=key==='bd'?'jss-container':'jss-container-'+key;
  var el=document.getElementById(elId);
  if(!el||GRIDS[key]) return;
  GRIDS[key]=new LiteGrid(el,key);
}

function jssEnsureInit(){
  ['bd','marca','grupos','representantes','produto','clientes'].forEach(function(key,i){
    setTimeout(function(){jssCreateGrid(key);},i*80);
  });
}

function jssInit(){ jssCreateGrid('bd'); }

var TAB_MAP={'av-tab-bd':'bd','av-tab-marca':'marca','av-tab-clientes':'clientes','av-tab-representantes':'representantes','av-tab-grupos':'grupos','av-tab-produto':'produto'};
document.addEventListener('click',function(e){
  var tab=e.target.closest('.av-tab[data-target]');
  if(!tab) return;
  var key=TAB_MAP[tab.dataset.target];
  if(key&&!GRIDS[key]) setTimeout(function(){jssCreateGrid(key);},80);
});

function jssColorAutoHeaders(key) {
  var grd = GRIDS[key];
  if (!grd || !grd.container) return;
  var ths = grd.container.querySelectorAll('thead th.lg-auto');
  ths.forEach(function(th) {
    th.style.transition = 'background 0.4s';
    th.style.background = '#D5EDE8';
    setTimeout(function() { th.style.background = ''; }, 1200);
  });
}

function jssGetProdutoGrupos(){
  var src=(FULL_DATA.produto&&FULL_DATA.produto.length>0)?FULL_DATA.produto:(GRID_DATA_STORE.produto||[]);
  var seenG={},seenS={},grupos=[],subgrupos=[];
  src.forEach(function(r){var g=String(r[3]||'').trim(),s=String(r[4]||'').trim();if(g&&!seenG[g]){seenG[g]=1;grupos.push(g);}if(s&&!seenS[s]){seenS[s]=1;subgrupos.push(s);}});
  grupos.sort();subgrupos.sort();
  var seenT={},tipos=[];
  if(typeof BD_DATA!=='undefined'&&BD_DATA.rows) BD_DATA.rows.forEach(function(r){var i=typeof IDX!=='undefined'?IDX.mercado:-1;var v=i>=0?String(r[i]||'').trim():'';if(v&&!seenT[v]){seenT[v]=1;tipos.push(v);}});
  tipos.sort();
  return{grupos:grupos,subgrupos:subgrupos,tipos:tipos};
}
