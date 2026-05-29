// =============================================================================
// BD-GRID.JS — Grid ultra-leve para o BD (substitui jspreadsheet no BD)
// Suporta 500k+ linhas sem travar
// =============================================================================

const BDG = {
  cols: [
    'ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída',
    'VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM',
    'tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra',
    'NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto',
    'GRUPO PAI','subgrupo_produto','marca','familia_produto','classes'
  ],
  autoFrom: 10, // colunas 0-9 = brancas, 10+ = vermelhas
  data:     [],  // todos os dados (array de arrays)
  filtered: null, // dados filtrados (null = sem filtro)
  filters:  {},   // { colIdx: value }
  page:     0,
  pageSize: 150,
};

// ── INICIALIZA ────────────────────────────────────────────────────────────────
function bdgInit() {
  const el = document.getElementById('bdg-root');
  if (!el || el.dataset.init) return;
  el.dataset.init = '1';
  bdgBuildHeader();

  // Captura Ctrl+V na zona de cole
  const zone = document.getElementById('bdg-paste-zone');
  if (zone) {
    zone.addEventListener('paste', e => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      if (text.trim()) bdgProcessPaste(text);
    });
    zone.addEventListener('click', () => zone.focus());
  }

  bdgRender();
}

// ── PROCESSA TEXTO COLADO ─────────────────────────────────────────────────────
function bdgProcessPaste(text) {
  const t0 = performance.now();
  const lines = text.split('\n');
  let start = 0;

  // Detecta cabeçalho
  const first = lines[0].split('\t');
  const isHeader = first.some(c =>
    ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR'].some(k => c.toUpperCase().includes(k))
  );
  if (isHeader) start = 1;

  // Parse rápido: divide por tab
  const newRows = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = line.split('\t');
    // Garante 31 colunas
    while (cells.length < BDG.cols.length) cells.push('');
    newRows.push(cells.slice(0, BDG.cols.length));
  }

  // ADICIONA aos dados existentes (append mode)
  BDG.data = BDG.data.concat(newRows);
  BDG.filtered = null;
  BDG.filters  = {};
  BDG.page     = 0;

  const ms = Math.round(performance.now() - t0);
  bdgSetStatus(`✓ ${BDG.data.length.toLocaleString('pt-BR')} linhas (${ms}ms)`, true);
  bdgRender();
}

// ── RENDERIZA TABELA VIRTUAL (só linhas visíveis) ─────────────────────────────
function bdgRender() {
  const tbody = document.getElementById('bdg-tbody');
  const info  = document.getElementById('bdg-info');
  if (!tbody) return;

  const src  = BDG.filtered !== null ? BDG.filtered : BDG.data;
  const from = BDG.page * BDG.pageSize;
  const to   = Math.min(from + BDG.pageSize, src.length);
  const page = src.slice(from, to);

  // innerHTML em bloco — muito mais rápido que appendChild
  let html = '';
  for (let ri = 0; ri < page.length; ri++) {
    const r = page[ri];
    html += '<tr>';
    for (let ci = 0; ci < BDG.cols.length; ci++) {
      const v = r[ci] || '';
      html += ci >= BDG.autoFrom
        ? `<td class="bdg-auto">${v}</td>`
        : `<td>${v}</td>`;
    }
    html += '</tr>';
  }
  if (!html) html = `<tr><td colspan="${BDG.cols.length}" class="bdg-empty">Cole os dados do Excel acima (Ctrl+V)</td></tr>`;
  tbody.innerHTML = html;

  // Info de paginação
  if (info) {
    const total = src.length;
    const hasFilter = Object.keys(BDG.filters).length > 0;
    const filterNote = hasFilter ? ` · 🔽 filtrado de ${BDG.data.length.toLocaleString('pt-BR')}` : '';
    info.textContent = total > 0
      ? `Exibindo ${from+1}–${to} de ${total.toLocaleString('pt-BR')} linhas${filterNote}`
      : '';
  }

  // Atualiza botões de paginação
  bdgUpdatePagination(src.length);
}

function bdgUpdatePagination(total) {
  const pages = Math.ceil(total / BDG.pageSize);
  const el = document.getElementById('bdg-pagination');
  if (!el) return;

  if (pages <= 1) { el.innerHTML = ''; return; }

  const cur = BDG.page;
  let html = '';
  if (cur > 0) html += `<button class="bdg-page-btn" onclick="bdgGo(0)">« Início</button>`;
  if (cur > 0) html += `<button class="bdg-page-btn" onclick="bdgGo(${cur-1})">‹ Anterior</button>`;
  html += `<span class="bdg-page-info">Pág. ${cur+1} / ${pages}</span>`;
  if (cur < pages-1) html += `<button class="bdg-page-btn" onclick="bdgGo(${cur+1})">Próxima ›</button>`;
  if (cur < pages-1) html += `<button class="bdg-page-btn" onclick="bdgGo(${pages-1})">Fim »</button>`;
  el.innerHTML = html;
}

function bdgGo(page) {
  BDG.page = page;
  bdgRender();
  document.getElementById('bdg-root')?.scrollIntoView({behavior:'smooth'});
}

// ── FILTROS POR COLUNA ────────────────────────────────────────────────────────
function bdgShowFilter(colIdx, anchorEl) {
  document.querySelectorAll('.col-filter-dropdown').forEach(d => d.remove());

  const src = BDG.data;
  const vals = [...new Set(src.map(r => String(r[colIdx]||'').trim()).filter(Boolean))].sort((a,b)=>{
    const na=parseFloat(a),nb=parseFloat(b);
    return (!isNaN(na)&&!isNaN(nb))?na-nb:a.localeCompare(b);
  }).slice(0, 500); // máx 500 opções

  const ativo = BDG.filters[colIdx];
  const rect  = anchorEl.getBoundingClientRect();

  const drop = document.createElement('div');
  drop.className = 'col-filter-dropdown';
  drop.style.top  = (rect.bottom + 4) + 'px';
  drop.style.left = rect.left + 'px';

  drop.innerHTML = `
    <div class="cfd-header">
      <span>${BDG.cols[colIdx]}</span>
      <button class="cfd-clear" onclick="bdgClearFilter(${colIdx})">✕ Limpar</button>
    </div>
    <div class="cfd-list">
      <label class="cfd-item ${!ativo?'cfd-active':''}">
        <input type="radio" name="bdgf${colIdx}" value="" ${!ativo?'checked':''}><span>(Todos)</span>
      </label>
      ${vals.map(v=>`<label class="cfd-item ${ativo===v?'cfd-active':''}">
        <input type="radio" name="bdgf${colIdx}" value="${v.replace(/"/g,'&quot;').replace(/'/g,'&#39;')}" ${ativo===v?'checked':''}><span>${v}</span>
      </label>`).join('')}
    </div>
    <div class="cfd-footer">
      <button class="cfd-apply" onclick="bdgApplyFilter(${colIdx},this)">Aplicar</button>
    </div>`;

  document.body.appendChild(drop);
  setTimeout(() => {
    document.addEventListener('click', function cl(e) {
      if (!drop.contains(e.target)) { drop.remove(); document.removeEventListener('click',cl); }
    });
  }, 0);
}

function bdgApplyFilter(colIdx, btn) {
  const drop = btn.closest('.col-filter-dropdown');
  const sel  = drop.querySelector(`input[name="bdgf${colIdx}"]:checked`);
  const val  = sel ? sel.value : '';
  if (val === '') delete BDG.filters[colIdx]; else BDG.filters[colIdx] = val;
  bdgAplicaFiltros();
  drop.remove();
  bdgUpdateFilterIndicators();
}

function bdgClearFilter(colIdx) {
  delete BDG.filters[colIdx];
  bdgAplicaFiltros();
  document.querySelectorAll('.col-filter-dropdown').forEach(d=>d.remove());
  bdgUpdateFilterIndicators();
}

function bdgClearAllFilters() {
  BDG.filters = {};
  bdgAplicaFiltros();
  bdgUpdateFilterIndicators();
}

function bdgAplicaFiltros() {
  BDG.page = 0;
  if (Object.keys(BDG.filters).length === 0) {
    BDG.filtered = null;
  } else {
    BDG.filtered = BDG.data.filter(r =>
      Object.entries(BDG.filters).every(([ci,val]) => String(r[parseInt(ci)]||'').trim()===val)
    );
  }
  bdgRender();
}

function bdgUpdateFilterIndicators() {
  document.querySelectorAll('#bdg-thead .bdg-flt').forEach(btn => {
    const ci = parseInt(btn.dataset.col);
    btn.innerHTML  = BDG.filters[ci] ? '▾●' : '▾';
    btn.style.color= BDG.filters[ci] ? '#ffd24a' : '';
  });
}

// ── LIMPAR ────────────────────────────────────────────────────────────────────
function bdgClear() {
  if (!confirm('Limpar todos os dados do BD?')) return;
  BDG.data = []; BDG.filtered = null; BDG.filters = {}; BDG.page = 0;
  bdgRender();
  bdgSetStatus('BD limpo', false);
}

function bdgSetStatus(msg, ok) {
  const el = document.getElementById('jss-status-bd');
  if (el) { el.textContent = msg; el.className = 'jss-status-badge'+(ok?' jss-status-ok':''); }
}

// ── FORNECE DADOS PARA O BD_DATA (compatibilidade com bd.js) ─────────────────
// Chamado pelo jssProcess quando o BD usa bdg
function bdgGetData() {
  return BDG.filtered !== null ? BDG.filtered : BDG.data;
}

// ── GERA CABEÇALHOS COM FILTROS ───────────────────────────────────────────────
function bdgBuildHeader() {
  const thead = document.getElementById('bdg-thead');
  if (!thead) return;

  let html = '<tr><th class="bdg-rn">#</th>';
  BDG.cols.forEach((col, ci) => {
    const isAuto = ci >= BDG.autoFrom;
    const cls = isAuto ? ' class="bdg-auto"' : '';
    html += `<th${cls} onclick="bdgSort(${ci})" title="Clique para ordenar">
      ${col}
      <span class="bdg-flt" data-col="${ci}" onclick="event.stopPropagation();bdgShowFilter(${ci},this)" title="Filtrar">▾</span>
    </th>`;
  });
  html += '</tr>';
  thead.innerHTML = html;
}

// ── ORDENA POR COLUNA ─────────────────────────────────────────────────────────
let bdgSortCol = -1, bdgSortAsc = true;
function bdgSort(ci) {
  if (bdgSortCol === ci) bdgSortAsc = !bdgSortAsc; else { bdgSortCol=ci; bdgSortAsc=true; }
  BDG.data.sort((a,b) => {
    const va=a[ci]||'', vb=b[ci]||'';
    const na=parseFloat(va), nb=parseFloat(vb);
    if(!isNaN(na)&&!isNaN(nb)) return bdgSortAsc?na-nb:nb-na;
    return bdgSortAsc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
  });
  if (BDG.filtered) bdgAplicaFiltros(); else { BDG.page=0; bdgRender(); }
}