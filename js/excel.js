// =============================================================================
// EXCEL GRID — Grade embutida estilo Excel para o BD
// =============================================================================

const EG = {
  cols: [
    'ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída',
    'VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM',
    'tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra',
    'NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto',
    'GRUPO PAI','subgrupo_produto','marca','familia_produto','classes'
  ],
  ROWS: 200,        // linhas visíveis iniciais
  data: [],         // array de arrays [linha][col]
  selectedRow: -1,
  selectedCol: -1,
  selStart: null,   // para seleção de range
  selEnd: null,
};

// Inicializa dados vazios
function egInitData() {
  EG.data = Array.from({length: EG.ROWS}, () => Array(EG.cols.length).fill(''));
  BD_DATA.headers = [...EG.cols];
  bdMapColumns();
}

// ── RENDERIZA A GRADE ─────────────────────────────────────────────────────────
function egRender() {
  const container = document.getElementById('excel-grid-container');
  if (!container) return;

  const colLetters = EG.cols.map((_,i) => colLetter(i));

  let html = `
    <div class="eg-toolbar">
      <div class="eg-cell-ref" id="eg-ref">A1</div>
      <div class="eg-formula-wrap">
        <input id="eg-formula-bar" class="eg-formula-bar" type="text" placeholder="Conteúdo da célula selecionada...">
      </div>
      <div class="eg-toolbar-btns">
        <button class="eg-btn eg-btn-primary" onclick="egProcess()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
          Processar Relatórios
        </button>
        <button class="eg-btn eg-btn-danger" onclick="egClearAll()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          Limpar
        </button>
        <button class="eg-btn" onclick="egAddRows(100)">+ 100 linhas</button>
        <span id="eg-status" class="eg-status"></span>
      </div>
    </div>

    <div class="eg-grid-wrap" id="eg-grid-wrap" tabindex="0">
      <table class="eg-table" id="eg-table">
        <thead>
          <tr>
            <th class="eg-corner"></th>
            ${colLetters.map((l,i) => `<th class="eg-col-header" data-col="${i}" id="eg-ch-${i}">${l}<div class="eg-col-name">${EG.cols[i]}</div></th>`).join('')}
          </tr>
        </thead>
        <tbody id="eg-tbody">
        </tbody>
      </table>
    </div>

    <div class="eg-footer">
      <span id="eg-rows-info">0 linhas com dados</span>
      <span>Cole com Ctrl+V a partir da célula selecionada</span>
    </div>
  `;

  container.innerHTML = html;
  egRenderRows();
  egBindEvents();
}

// Renderiza linhas do tbody
function egRenderRows() {
  const tbody = document.getElementById('eg-tbody');
  if (!tbody) return;
  let html = '';
  for (let r = 0; r < EG.data.length; r++) {
    html += `<tr id="eg-row-${r}">
      <td class="eg-row-num" data-row="${r}">${r+1}</td>
      ${EG.cols.map((_,c) =>
        `<td class="eg-cell" data-row="${r}" data-col="${c}" id="eg-${r}-${c}">${escHtml(EG.data[r][c])}</td>`
      ).join('')}
    </tr>`;
  }
  tbody.innerHTML = html;
  egUpdateFooter();
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Letra da coluna estilo Excel: 0→A, 1→B, 26→AA
function colLetter(i) {
  let s = '';
  i++;
  while (i > 0) {
    let m = (i-1) % 26;
    s = String.fromCharCode(65+m) + s;
    i = Math.floor((i-1)/26);
  }
  return s;
}

// ── EVENTOS ───────────────────────────────────────────────────────────────────
function egBindEvents() {
  const wrap = document.getElementById('eg-grid-wrap');
  if (!wrap) return;

  // Clique em célula
  wrap.addEventListener('mousedown', e => {
    const cell = e.target.closest('.eg-cell');
    if (!cell) return;
    egSelect(+cell.dataset.row, +cell.dataset.col);
  });

  // Teclado
  wrap.addEventListener('keydown', e => {
    if (EG.selectedRow < 0) return;
    const r = EG.selectedRow, c = EG.selectedCol;
    if (e.key === 'ArrowRight') { e.preventDefault(); egSelect(r, Math.min(c+1, EG.cols.length-1)); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); egSelect(r, Math.max(c-1, 0)); }
    if (e.key === 'ArrowDown' || e.key === 'Enter')  { e.preventDefault(); egSelect(Math.min(r+1, EG.data.length-1), c); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); egSelect(Math.max(r-1, 0), c); }
    if (e.key === 'Tab')       { e.preventDefault(); egSelect(r, Math.min(c+1, EG.cols.length-1)); }
    if (e.key === 'Delete' || e.key === 'Backspace') { egClearCell(r,c); }
  });

  // Paste
  wrap.addEventListener('paste', e => {
    e.preventDefault();
    if (EG.selectedRow < 0) egSelect(0, 0);
    const text = e.clipboardData.getData('text/plain');
    egPasteAt(EG.selectedRow, EG.selectedCol, text);
  });

  // Fórmula bar
  const fb = document.getElementById('eg-formula-bar');
  if (fb) {
    fb.addEventListener('input', () => {
      if (EG.selectedRow >= 0) {
        EG.data[EG.selectedRow][EG.selectedCol] = fb.value;
        const cell = document.getElementById(`eg-${EG.selectedRow}-${EG.selectedCol}`);
        if (cell) cell.textContent = fb.value;
        egUpdateFooter();
      }
    });
    fb.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        wrap.focus();
        egSelect(Math.min(EG.selectedRow+1, EG.data.length-1), EG.selectedCol);
      }
    });
  }
}

// ── SELECIONA CÉLULA ──────────────────────────────────────────────────────────
function egSelect(r, c) {
  // Remove highlight anterior
  if (EG.selectedRow >= 0) {
    document.getElementById(`eg-${EG.selectedRow}-${EG.selectedCol}`)?.classList.remove('eg-selected');
    document.getElementById(`eg-ch-${EG.selectedCol}`)?.classList.remove('eg-col-active');
    document.getElementById(`eg-row-${EG.selectedRow}`)?.querySelector('.eg-row-num')?.classList.remove('eg-row-active');
  }

  EG.selectedRow = r;
  EG.selectedCol = c;

  // Aplica highlight
  document.getElementById(`eg-${r}-${c}`)?.classList.add('eg-selected');
  document.getElementById(`eg-ch-${c}`)?.classList.add('eg-col-active');
  document.getElementById(`eg-row-${r}`)?.querySelector('.eg-row-num')?.classList.add('eg-row-active');

  // Atualiza ref e formula bar
  const ref = `${colLetter(c)}${r+1}`;
  const refEl = document.getElementById('eg-ref');
  if (refEl) refEl.textContent = ref;
  const fb = document.getElementById('eg-formula-bar');
  if (fb) fb.value = EG.data[r]?.[c] ?? '';

  // Scrolla para a célula
  document.getElementById(`eg-${r}-${c}`)?.scrollIntoView({block:'nearest', inline:'nearest'});

  document.getElementById('eg-grid-wrap')?.focus();
}

// ── COLA DADOS A PARTIR DE UMA CÉLULA ────────────────────────────────────────
function egPasteAt(startRow, startCol, text) {
  const lines = text.split('\n');
  let addedRows = 0;

  // Verifica se primeira linha é cabeçalho
  const firstCells = lines[0].split('\t');
  let dataLines = lines;
  let isHeader = firstCells.some(c =>
    ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR'].some(k => c.toUpperCase().includes(k))
  );

  if (isHeader && startRow === 0 && startCol === 0) {
    // Cola cabeçalho na linha 0 → ignora (já temos os cabeçalhos fixos)
    dataLines = lines.slice(1);
    startRow = 0; // dados começam na linha 0
  }

  // Expande linhas se necessário
  const needed = startRow + dataLines.length;
  while (EG.data.length < needed) {
    EG.data.push(Array(EG.cols.length).fill(''));
    addedRows++;
  }
  if (addedRows > 0) EG.ROWS = EG.data.length;

  // Preenche células
  dataLines.forEach((line, ri) => {
    const row = startRow + ri;
    const cells = line.split('\t');
    cells.forEach((val, ci) => {
      const col = startCol + ci;
      if (col < EG.cols.length) {
        EG.data[row][col] = val.trim();
      }
    });
  });

  // Re-renderiza só as linhas afetadas (performance)
  egRenderRows();
  egSelect(startRow, startCol);
  egUpdateFooter();

  // Atualiza status
  const count = dataLines.filter(l => l.trim()).length;
  const status = document.getElementById('eg-status');
  if (status) {
    status.textContent = `+${count.toLocaleString('pt-BR')} linhas coladas`;
    status.style.color = 'var(--success)';
    setTimeout(() => status.textContent = '', 3000);
  }
}

function egClearCell(r, c) {
  EG.data[r][c] = '';
  const cell = document.getElementById(`eg-${r}-${c}`);
  if (cell) cell.textContent = '';
  const fb = document.getElementById('eg-formula-bar');
  if (fb && EG.selectedRow === r && EG.selectedCol === c) fb.value = '';
  egUpdateFooter();
}

function egAddRows(n) {
  for (let i = 0; i < n; i++) EG.data.push(Array(EG.cols.length).fill(''));
  EG.ROWS = EG.data.length;
  egRenderRows();
}

function egClearAll() {
  if (!confirm('Limpar todos os dados do BD?')) return;
  egInitData();
  egRenderRows();
  egSelect(0, 0);
  BD_DATA.rows = [];
  BD_DATA.count = 0;
  document.getElementById('eg-status').textContent = 'BD limpo';
}

function egUpdateFooter() {
  const filledRows = EG.data.filter(r => r.some(c => c !== '')).length;
  const info = document.getElementById('eg-rows-info');
  if (info) info.textContent = `${filledRows.toLocaleString('pt-BR')} linhas com dados de ${EG.data.length.toLocaleString('pt-BR')} total`;
}

// ── PROCESSA — alimenta BD e relatórios ──────────────────────────────────────
function egProcess() {
  BD_DATA.headers = [...EG.cols];
  BD_DATA.rows = EG.data.filter(r => r[0] || r[1] || r[2]); // só linhas com algum dado
  BD_DATA.count = BD_DATA.rows.length;
  bdMapColumns();
  bdUpdateAllTabs();

  const status = document.getElementById('eg-status');
  if (status) {
    status.textContent = `✓ ${BD_DATA.count.toLocaleString('pt-BR')} linhas processadas — relatórios atualizados!`;
    status.style.color = 'var(--success)';
  }
}

// Inicializa quando a aba BD é ativada
function egInit() {
  if (!document.getElementById('excel-grid-container')) return;
  if (EG.data.length === 0) egInitData();
  egRender();
}

document.addEventListener('DOMContentLoaded', () => {
  // Inicializa quando usuário clica na aba BD pela primeira vez
  document.addEventListener('click', e => {
    const tab = e.target.closest('.av-tab[data-target="av-tab-bd"]');
    if (tab) setTimeout(egInit, 50);
  });
  // Inicializa se já estiver na aba BD
  if (document.getElementById('excel-grid-container')) egInit();
});