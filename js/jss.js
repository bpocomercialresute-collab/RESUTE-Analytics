LiteGrid.prototype._syncInputRow = function() {
  var self = this;
  var def  = this.def;
  var irow = document.getElementById('lg-irow-cells-'+this.key);
  if (!irow) return;
  var boxes = irow.querySelectorAll('.lg-icell-box');
  // Sincroniza largura de cada box com a coluna correspondente
  var ths = this.container.querySelectorAll('thead th');
  // ths[0] = rn, ths[1..n] = colunas
  boxes.forEach(function(box, i) {
    var th = ths[i+1];
    if (th) {
      var w = th.offsetWidth || def.cols[i].w || 80;
      box.style.width    = w + 'px';
      box.style.minWidth = w + 'px';
    }
  });
};


LiteGrid.prototype._pasteToCol = function(txt, startCol) {
  var lines = txt.split('\n').filter(function(l){ return l.trim(); });
  var def   = this.def;
  var ncols = def.cols.length;

  // Remove cabeçalho se detectado
  if (lines.length > 1) {
    var kw = ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE','GRUPO','COD'];
    var fc = lines[0].split('\t');
    if (fc.some(function(c){ return kw.some(function(k){ return c.toUpperCase().indexOf(k)>=0; }); }))
      lines.shift();
  }

  // Garante linhas no allData
  while (this.allData.length < lines.length) {
    var er=[]; for(var j=0;j<ncols;j++) er.push(''); this.allData.push(er);
  }

  lines.forEach(function(line, ri) {
    if (!this.allData[ri]) { this.allData[ri]=[]; while(this.allData[ri].length<ncols) this.allData[ri].push(''); }
    var cells = line.split('\t');
    cells.forEach(function(v, ci) {
      var dest = startCol + ci;
      if (dest < ncols) {
        while(this.allData[ri].length <= dest) this.allData[ri].push('');
        this.allData[ri][dest] = v.trim();
      }
    }.bind(this));
  }.bind(this));

  FULL_DATA[this.key] = this.allData.filter(function(r){
    return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; });
  });
  this.filtered = null; this.page = 0;
  this._render(); this._updateStatus();

  var colName = def.cols[startCol] ? def.cols[startCol].t : '';
  var info = document.getElementById('jss-status-'+this.key);
  if (info) {
    info.textContent = '✓ '+lines.length.toLocaleString('pt-BR')+' linhas → "'+colName+'"';
    info.className = 'jss-status-badge jss-status-ok';
  }
  // Reseta seleção visual
  var irow = document.getElementById('lg-irow-cells-'+this.key);
  if (irow) irow.querySelectorAll('.lg-icell-box').forEach(function(b){ b.classList.remove('lg-isel'); });
  this._selCol = -1;
};


LiteGrid.prototype._buildInputRow = function() {
  var self = this;
  var def  = this.def;
  var tbody = this.container.querySelector('.lg-input-row-'+this.key);
  if (!tbody) return;

  var html = '<tr class="lg-irow">';
  html += '<td class="lg-rn lg-irow-rn" title="Linha de entrada — clique numa célula e cole">✎</td>';
  def.cols.forEach(function(c, i) {
    html += '<td class="lg-icell'+(c.auto?' lg-auto':'')+'" '
          + 'contenteditable="true" '
          + 'data-col="'+i+'" '
          + 'data-key="'+self.key+'" '
          + 'title="Cole aqui para a coluna: '+c.t+'" '
          + 'spellcheck="false">'
          + '</td>';
  });
  html += '</tr>';
  tbody.innerHTML = html;

  // Evento paste em cada célula da linha de input
  tbody.addEventListener('paste', function(e) {
    var cell = e.target.closest('.lg-icell');
    if (!cell) return;
    e.preventDefault();

    var txt    = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (!txt.trim()) return;
    var colIdx = parseInt(cell.dataset.col);
    var lines  = txt.split('\n').filter(function(l){ return l.trim(); });

    // Remove cabeçalho se detectado
    if (lines.length > 1) {
      var kw = ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE','GRUPO','COD'];
      var fc = lines[0].split('\t');
      if (fc.some(function(c){ return kw.some(function(k){ return c.toUpperCase().indexOf(k)>=0; }); }))
        lines.shift();
    }

    var ncols = def.cols.length;

    // Garante linhas suficientes
    while (self.allData.length < lines.length) {
      var er=[]; for(var j=0;j<ncols;j++) er.push(''); self.allData.push(er);
    }

    // Cola cada linha na coluna correta
    lines.forEach(function(line, ri) {
      if (!self.allData[ri]) {
        self.allData[ri]=[];
        while(self.allData[ri].length<ncols) self.allData[ri].push('');
      }
      var cells = line.split('\t');
      cells.forEach(function(v, ci) {
        var dest = colIdx + ci;
        if (dest < ncols) {
          while(self.allData[ri].length <= dest) self.allData[ri].push('');
          self.allData[ri][dest] = v.trim();
        }
      });
    });

    FULL_DATA[self.key] = self.allData.filter(function(r){
      return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; });
    });
    self.filtered = null; self.page = 0;
    self._render();
    self._updateStatus();

    // Limpa a célula de input e mostra feedback
    cell.textContent = '';
    var colName = def.cols[colIdx] ? def.cols[colIdx].t : '';
    var info = document.getElementById('jss-status-'+self.key);
    if (info) {
      info.textContent = '✓ '+lines.length.toLocaleString('pt-BR')+' linhas → coluna "'+colName+'"';
      info.className   = 'jss-status-badge jss-status-ok';
    }
  });
};


// ── ENTRADA RÁPIDA POR COLUNA ─────────────────────────────────────────────────
function lgEntryApply(key) {
  var sel   = document.getElementById('lg-col-sel-'+key);
  var input = document.getElementById('lg-entry-'+key);
  if (!sel || !input) return;
  var colIdx = parseInt(sel.value);
  var txt    = input.value;
  if (isNaN(colIdx) || txt.trim() === '') {
    alert('Escolha uma coluna e cole o valor no campo acima.');
    return;
  }
  var grd = GRIDS[key];
  if (!grd) return;

  // Separa linhas (pode ser múltiplas linhas coladas)
  var lines = txt.split('\n').filter(function(l){ return l.trim(); });
  // Remove cabeçalho se detectado
  if (lines.length > 1) {
    var kw = ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE','GRUPO','COD'];
    var firstCells = lines[0].split('\t');
    if (firstCells.some(function(c){ return kw.some(function(k){ return c.toUpperCase().indexOf(k)>=0; }); }))
      lines.shift();
  }

  var ncols = GRID_DEFS[key].cols.length;
  // Garante dados suficientes
  while (grd.allData.length < lines.length) {
    var er = []; for (var j=0;j<ncols;j++) er.push(''); grd.allData.push(er);
  }
  // Cola cada linha na coluna escolhida
  lines.forEach(function(line, ri) {
    var cells = line.split('\t');
    if (!grd.allData[ri]) { grd.allData[ri]=[]; while(grd.allData[ri].length<ncols) grd.allData[ri].push(''); }
    cells.forEach(function(v, ci) {
      var dest = colIdx + ci;
      if (dest < ncols) { while(grd.allData[ri].length<=dest) grd.allData[ri].push(''); grd.allData[ri][dest]=v; }
    });
  });

  FULL_DATA[key] = grd.allData.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null; }); });
  grd.filtered = null; grd.page = 0; grd._render(); grd._updateStatus();
  input.value = '';

  var colName = (GRID_DEFS[key].cols[colIdx]||{}).t||'';
  var info = document.getElementById('jss-status-'+key);
  if (info) { info.textContent = '✓ '+lines.length+' linhas coladas na coluna "'+colName+'"'; info.className='jss-status-badge jss-status-ok'; }
}

// Intercepta paste no input de entrada
document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('paste', function(e) {
    var active = document.activeElement;
    if (active && active.classList.contains('lg-entry-input')) {
      // Deixa colar normalmente no input — browser já faz isso
    }
  });
});

// =============================================================================
// JSS.JS — LiteGrid: grade ultra-leve sem jspreadsheet
// Mesma interface (getData/setData) — compatível com bd.js
// =============================================================================

// ── DEFINIÇÕES DAS COLUNAS ────────────────────────────────────────────────────
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

// ── GLOBALS ───────────────────────────────────────────────────────────────────
var GRIDS          = {};   // instâncias LiteGrid por key
var GRID_DATA_STORE = {};  // dados das abas secundárias (para bdAutoFill)
var FULL_DATA      = {};   // dados completos colados (sem limite de exibição)
var JSS_FILTERS    = {};   // filtros ativos por key

// =============================================================================
// LITEGRID — grade leve sem dependências externas
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
  // Monta cabeçalho
  var hdr = '<div class="lg-wrap"><div class="lg-scroll"><table class="lg-table"><thead><tr><th class="lg-rn">#</th>';
  def.cols.forEach(function(c, i) {
    hdr += '<th class="'+(c.auto?'lg-auto':'')+'" onclick="lgSortCol(\''+self.key+'\','+i+',this)">'
         + c.t
         + '<span class="col-filter-btn" data-col="'+i+'" data-key="'+self.key+'" '
         + 'onclick="event.stopPropagation();lgShowFilter(\''+self.key+'\','+i+',this)">▾</span>'
         + '</th>';
  });
  hdr += '</tr></thead><tbody class="lg-body-'+this.key+'"></tbody></table></div>'
       + '<div class="lg-pag" id="lg-pag-'+this.key+'"></div></div>';

  // Barra de entrada rápida ACIMA da tabela
  var colOptions = '<option value="">— Escolha a coluna —</option>';
  def.cols.forEach(function(c, i) {
    colOptions += '<option value="'+i+'">'+c.t+'</option>';
  });
  var entryBar = '<div class="lg-entry-bar">'
    + '<select class="lg-entry-select" id="lg-col-sel-'+self.key+'">' + colOptions + '</select>'
    + '<input class="lg-entry-input" id="lg-entry-'+self.key+'" placeholder="Cole aqui (Ctrl+V) o valor para a coluna selecionada" />'
    + '<button class="lg-entry-btn" onclick="lgEntryApply(\''+self.key+'\')">Colar ↓</button>'
    + '</div>';

  this.container.innerHTML = entryBar + hdr;

  // Paste: captura Ctrl+V
  this.container.setAttribute('tabindex','0');
  this.container.addEventListener('paste', function(e) {
    e.preventDefault();
    var txt = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (txt.trim()) self._paste(txt);
  });
};


// Cola dados de uma única coluna (ou múltiplas colunas a partir da selecionada)
LiteGrid.prototype._pasteCol = function(txt, startCol, startRow) {
  var lines = txt.split('\n').filter(function(l){ return l.trim(); });
  var def   = this.def;

  // Detecta e remove cabeçalho
  var start = 0;
  if (lines.length > 0) {
    var kw = ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE','GRUPO','COD'];
    var first = lines[0].split('\t');
    if (first.some(function(c){ return kw.some(function(k){ return c.toUpperCase().indexOf(k)>=0; }); })) start=1;
  }

  // Garante que allData tem linhas suficientes
  while (this.allData.length < startRow + (lines.length - start)) {
    var emptyRow = [];
    for (var j = 0; j < def.cols.length; j++) emptyRow.push('');
    this.allData.push(emptyRow);
  }

  // Cola cada linha na posição correta
  for (var i = start; i < lines.length; i++) {
    var rowIdx = startRow + (i - start);
    var cells  = lines[i].split('\t');
    if (!this.allData[rowIdx]) {
      this.allData[rowIdx] = [];
      while (this.allData[rowIdx].length < def.cols.length) this.allData[rowIdx].push('');
    }
    // Cola as células a partir da coluna selecionada
    for (var ci = 0; ci < cells.length; ci++) {
      var destCol = startCol + ci;
      if (destCol < def.cols.length) {
        while (this.allData[rowIdx].length <= destCol) this.allData[rowIdx].push('');
        this.allData[rowIdx][destCol] = cells[ci];
      }
    }
  }

  FULL_DATA[this.key] = this.allData.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null; }); });
  this.filtered = null;
  this._selCol = -1; // limpa seleção após colar
  this._selRow = -1;
  this.page = 0;
  this._render();
  this._updateStatus();
};

LiteGrid.prototype._paste = function(txt) {
  var lines = txt.split('\n').filter(function(l){ return l.trim(); });
  var ncols = this.def.cols.length;

  // Detecta se tem cabeçalho
  var start = 0;
  this._headerRow = null;
  if (lines.length > 0) {
    var kw = ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR','CLIENTES','REPRESENTANTE','GRUPO','COD'];
    var first = lines[0].split('\t');
    if (first.some(function(c){ return kw.some(function(k){ return c.toUpperCase().indexOf(k)>=0; }); })) {
      // Guarda cabeçalho para exibir como referência
      this._headerRow = first.slice(0, ncols);
      while (this._headerRow.length < ncols) this._headerRow.push('');
      start = 1;
    }
  }

  var data = [];
  for (var i = start; i < lines.length; i++) {
    var cells = lines[i].split('\t');
    while (cells.length < ncols) cells.push('');
    data.push(cells.slice(0, ncols));
  }
  FULL_DATA[this.key] = data;
  this.allData = data;
  this.filtered = null;
  this.page = 0;
  this._render();
  this._updateStatus();
};

LiteGrid.prototype.getData = function() {
  return this.allData.filter(function(r){ return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; }); });
};

LiteGrid.prototype.setData = function(data) {
  this.allData = (data || []).filter(function(r){ return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; }); });
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

  // Linha de referência — mostra cabeçalho original do Excel colado
  if (this._headerRow) {
    html += '<tr class="lg-ref-row">';
    html += '<td class="lg-rn" title="Linha de referência do seu Excel">REF</td>';
    for (var hci = 0; hci < def.cols.length; hci++) {
      var hv = this._headerRow[hci] || '';
      html += '<td class="lg-ref" title="Coluna do seu Excel: '+hv+'">'+hv+'</td>';
    }
    html += '</tr>';
  }

  if (rows.length === 0) {
    html += '<tr><td colspan="'+(def.cols.length+1)+'" class="lg-empty">Cole os dados do Excel (Ctrl+V) nesta área</td></tr>';
  } else {
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri];
      html += '<tr>';
      html += '<td class="lg-rn">'+(from+ri+1)+'</td>';
      for (var ci = 0; ci < def.cols.length; ci++) {
        var v = r[ci] !== undefined && r[ci] !== null ? r[ci] : '';
        html += def.cols[ci].auto ? '<td class="lg-auto">'+v+'</td>' : '<td>'+v+'</td>';
      }
      html += '</tr>';
    }
  }

  var tbody = document.querySelector('.lg-body-'+this.key);
  if (tbody) tbody.innerHTML = html;
  this._renderPag(src.length);
  this._syncInputRow();
};

LiteGrid.prototype._renderPag = function(total) {
  var el = document.getElementById('lg-pag-'+this.key);
  if (!el) return;
  if (total <= this.pageSize) { el.innerHTML = ''; return; }
  var pages = Math.ceil(total / this.pageSize);
  var cur   = this.page;
  var key   = this.key;
  var html  = '';
  if (cur > 0) html += '<button class="lg-pb" onclick="lgGo(\''+key+'\',0)">«</button>';
  if (cur > 0) html += '<button class="lg-pb" onclick="lgGo(\''+key+'\','+(cur-1)+')">‹ Anterior</button>';
  html += '<span class="lg-pi">Pág '+(cur+1)+' / '+pages+' — '+total.toLocaleString('pt-BR')+' linhas</span>';
  if (cur < pages-1) html += '<button class="lg-pb" onclick="lgGo(\''+key+'\','+(cur+1)+')">Próxima ›</button>';
  if (cur < pages-1) html += '<button class="lg-pb" onclick="lgGo(\''+key+'\','+(pages-1)+')">»</button>';
  el.innerHTML = html;
};

LiteGrid.prototype._updateStatus = function() {
  var el  = document.getElementById('jss-status-'+this.key);
  var all = FULL_DATA[this.key] || this.allData;
  if (!el) return;
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
  if (fks.length === 0) {
    this.filtered = null;
  } else {
    this.filtered = src.filter(function(r) {
      return fks.every(function(ci) { return String(r[parseInt(ci)]||'').trim() === filters[ci]; });
    });
  }
  this.page = 0;
  this._render();
  // Indicadores visuais
  var self = this;
  this.container.querySelectorAll('.col-filter-btn').forEach(function(b) {
    var ci = parseInt(b.dataset.col);
    b.innerHTML  = filters[ci] ? '▾●' : '▾';
    b.style.color = filters[ci] ? '#ffd24a' : '';
  });
  var sEl = document.getElementById('jss-status-'+this.key);
  if (sEl) {
    var total = (FULL_DATA[this.key]||this.allData).length;
    var res   = (this.filtered||this.allData).length;
    var has   = fks.length > 0;
    sEl.textContent = has ? '🔽 '+res.toLocaleString('pt-BR')+' de '+total.toLocaleString('pt-BR') : '✓ '+total.toLocaleString('pt-BR')+' linhas';
    sEl.className = 'jss-status-badge jss-status-ok';
  }
};

// ── FUNÇÕES GLOBAIS DO LITEGRID ───────────────────────────────────────────────
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
  var src  = FULL_DATA[key] || grd.allData;
  var seen = {}, vals = [];
  src.forEach(function(r){ var v=String(r[colIdx]||'').trim(); if(v&&!seen[v]){seen[v]=1;vals.push(v);} });
  vals.sort(function(a,b){ var na=parseFloat(a),nb=parseFloat(b); return (!isNaN(na)&&!isNaN(nb))?na-nb:a.localeCompare(b); });
  vals = vals.slice(0,500);
  var ativo  = (JSS_FILTERS[key]||{})[colIdx];
  var label  = (GRID_DEFS[key].cols[colIdx]||{}).t||('Col '+(colIdx+1));
  var rect   = anchor.getBoundingClientRect();
  var drop   = document.createElement('div');
  drop.className = 'col-filter-dropdown';
  drop.style.cssText = 'position:fixed;top:'+(rect.bottom+4)+'px;left:'+Math.min(rect.left,window.innerWidth-250)+'px;z-index:9999';
  var items = vals.map(function(v){
    return '<label class="cfd-item'+(ativo===v?' cfd-active':'')+'"><input type="radio" name="lgf'+key+colIdx+'" value="'+v.replace(/"/g,'&quot;')+'"'+(ativo===v?' checked':'')+'><span>'+v+'</span></label>';
  }).join('');
  drop.innerHTML = '<div class="cfd-header"><span>'+label+'</span><button class="cfd-clear" onclick="lgClearFilter(\''+key+'\','+colIdx+')">✕ Limpar</button></div>'
    +'<div class="cfd-list"><label class="cfd-item'+(!ativo?' cfd-active':'')+'"><input type="radio" name="lgf'+key+colIdx+'" value=""'+(!ativo?' checked':'')+'><span>(Todos)</span></label>'+items+'</div>'
    +'<div class="cfd-footer"><button class="cfd-apply" onclick="lgApplyFilter(\''+key+'\','+colIdx+',this)">Aplicar</button></div>';
  document.body.appendChild(drop);
  setTimeout(function(){
    document.addEventListener('click', function cl(e){
      if(!drop.contains(e.target)){drop.remove();document.removeEventListener('click',cl);}
    });
  },0);
}

function lgApplyFilter(key, colIdx, btn) {
  var drop = btn.closest('.col-filter-dropdown');
  var sel  = drop.querySelector('input[name="lgf'+key+colIdx+'"]:checked');
  var val  = sel ? sel.value : '';
  if (!JSS_FILTERS[key]) JSS_FILTERS[key] = {};
  if (val==='') delete JSS_FILTERS[key][colIdx]; else JSS_FILTERS[key][colIdx] = val;
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
  GRIDS[key].allData = []; GRIDS[key].filtered = null;
  FULL_DATA[key] = []; JSS_FILTERS[key] = {};
  GRIDS[key].page = 0; GRIDS[key]._render(); GRIDS[key]._updateStatus();
}

// ── PROCESSAR RELATÓRIOS ──────────────────────────────────────────────────────
function jssProcess() {
  var statusEl = document.getElementById('jss-status-bd');
  function setStatus(msg, ok) {
    if (statusEl) { statusEl.textContent=msg; statusEl.className='jss-status-badge'+(ok?' jss-status-ok':''); }
  }

  // Pega dados: FULL_DATA.bd tem tudo colado
  var src  = (FULL_DATA.bd && FULL_DATA.bd.length > 0) ? FULL_DATA.bd
           : (GRIDS.bd ? GRIDS.bd.getData() : []);
  var rows = src.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null&&c!==undefined; }); });

  if (!rows.length) {
    alert('Sem dados no BD. Clique na grade do BD e cole os dados do Excel (Ctrl+V).');
    return;
  }

  setStatus('⏳ Processando '+rows.length.toLocaleString('pt-BR')+' linhas...');

  // Salva dados das abas de cadastro para o autoFill
  Object.keys(GRIDS).forEach(function(k) {
    if (k==='bd') return;
    var s = (FULL_DATA[k]&&FULL_DATA[k].length>0) ? FULL_DATA[k] : GRIDS[k].getData();
    GRID_DATA_STORE[k] = s.filter(function(r){ return r&&r.some(function(c){ return c!==''&&c!==null; }); });
  });

  // Configura BD_DATA
  BD_DATA.headers = GRID_DEFS.bd.cols.map(function(c){ return c.t; });
  BD_DATA.rows    = rows;
  BD_DATA.count   = rows.length;

  setTimeout(function() {
    // 1. Mapeia índices das colunas
    try { bdMapColumns(); } catch(e){ console.error('bdMapColumns',e); }

    // 2. Preenche colunas vermelhas do BD (ANO, MÊS, GRUPO, etc.)
    try { bdAutoFill(); } catch(e){ console.error('bdAutoFill',e); }

    // 3. Atualiza grade BD com dados preenchidos (150 linhas)
    if (GRIDS.bd && BD_DATA.rows.length > 0) {
      var preview = BD_DATA.rows.slice(0, 150);
      GRIDS.bd.allData = BD_DATA.rows;
      GRIDS.bd.filtered = null;
      GRIDS.bd.page = 0;
      GRIDS.bd._render();
    }

    // 4. Gera todos os relatórios
    try { bdUpdateAllTabs(); } catch(e){ console.error('bdUpdateAllTabs',e); }

    setStatus('✓ '+rows.length.toLocaleString('pt-BR')+' linhas processadas — relatórios atualizados!', true);
  }, 10);
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────
function jssCreateGrid(key) {
  var elId = key==='bd' ? 'jss-container' : 'jss-container-'+key;
  var el   = document.getElementById(elId);
  if (!el || GRIDS[key]) return;
  GRIDS[key] = new LiteGrid(el, key);
}

function jssEnsureInit() {
  var ORDER = ['bd','marca','grupos','representantes','produto','clientes'];
  ORDER.forEach(function(key,i){ setTimeout(function(){ jssCreateGrid(key); }, i*80); });
}

function jssInit() { jssCreateGrid('bd'); }

// Cria grid ao clicar na aba
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

// PRODUTO SERVIÇO → grupos para LAUDO_GRUPO
function jssGetProdutoGrupos() {
  var src = (FULL_DATA.produto && FULL_DATA.produto.length>0) ? FULL_DATA.produto
          : (GRID_DATA_STORE.produto || []);
  var seenG={},seenS={}, grupos=[], subgrupos=[];
  src.forEach(function(r){
    var g=String(r[3]||'').trim(), s=String(r[4]||'').trim();
    if(g&&!seenG[g]){seenG[g]=1;grupos.push(g);}
    if(s&&!seenS[s]){seenS[s]=1;subgrupos.push(s);}
  });
  grupos.sort(); subgrupos.sort();
  var seenT={}, tipos=[];
  if(typeof BD_DATA!=='undefined'&&BD_DATA.rows){
    BD_DATA.rows.forEach(function(r){
      var i=typeof IDX!=='undefined'?IDX.mercado:-1;
      var v=i>=0?String(r[i]||'').trim():'';
      if(v&&!seenT[v]){seenT[v]=1;tipos.push(v);}
    });
  }
  tipos.sort();
  return {grupos:grupos,subgrupos:subgrupos,tipos:tipos};
}