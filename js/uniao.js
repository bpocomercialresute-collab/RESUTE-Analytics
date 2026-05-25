// =============================================================================
// UNIAO — Ferramenta de União de Planilhas
// =============================================================================

const uniaoState = {
  files:        [],   // [{ id, name, size, ext, data, headers, dateCol, firstDate, lastDate, error }]
  consolidated: [],   // linhas consolidadas (já ordenadas)
  headers:      [],   // cabeçalhos da primeira planilha
  dateColName:  null,
  sortByDate:   true,
  fileCounter:  0
};

// ── Leitura de arquivo individual ────────────────────────────────────────────

function uniaoLerArquivo(file) {
  return new Promise(resolve => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target.result;
        Papa.parse(text, {
          header: true, skipEmptyLines: 'greedy',
          delimiter: text.includes(';') ? ';' : ',',
          transformHeader: h => h ? h.trim().replace(/^"|"$/g, '') : '',
          complete: res => resolve({ ok: true, data: res.data, ext })
        });
      };
      reader.onerror = () => resolve({ ok: false, error: 'Erro ao ler arquivo' });
      reader.readAsText(file, 'windows-1252');
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
          resolve({ ok: true, data, ext });
        } catch (err) {
          resolve({ ok: false, error: 'Formato inválido' });
        }
      };
      reader.onerror = () => resolve({ ok: false, error: 'Erro ao ler arquivo' });
      reader.readAsArrayBuffer(file);
    } else {
      resolve({ ok: false, error: 'Extensão não suportada' });
    }
  });
}

// ── Detecção de coluna de data ───────────────────────────────────────────────

function uniaoDetectarColunaData(headers, data) {
  if (!data.length || !headers.length) return null;
  const DATE_REGEX = /(\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{4}-\d{1,2}-\d{1,2})|(\d{1,2}-\d{1,2}-\d{2,4})|(\d{1,2}\.\d{1,2}\.\d{2,4})/;
  let bestCol = null, bestScore = 0;

  headers.forEach(header => {
    const values  = data.slice(0, 50).map(row => row[header]);
    let dateCount = 0, nonEmpty = 0;
    values.forEach(v => {
      if (v === null || v === undefined || v === '') return;
      nonEmpty++;
      if (v instanceof Date) { dateCount++; return; }
      if (typeof v === 'number' && v > 20000 && v < 60000) { dateCount++; return; }
      if (DATE_REGEX.test(String(v))) dateCount++;
    });
    if (!nonEmpty) return;
    const ratio = dateCount / nonEmpty;
    let score   = ratio * 100;
    const hNorm = normalizeKey(header).replace(/[\s_\-\.\/]/g, '');
    if (HEADER_HINTS.DATA && HEADER_HINTS.DATA.includes(hNorm)) score += 30;
    if (score > bestScore && ratio >= 0.5) { bestScore = score; bestCol = header; }
  });
  return bestCol;
}

// ── Parse e formatação de datas ──────────────────────────────────────────────

function uniaoParseData(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y = y < 50 ? 2000 + y : 1900 + y; return new Date(y, +m[2]-1, +m[1]); }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y = y < 50 ? 2000 + y : 1900 + y; return new Date(y, +m[2]-1, +m[1]); }
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y = y < 50 ? 2000 + y : 1900 + y; return new Date(y, +m[2]-1, +m[1]); }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function uniaoFmtData(d)  { if (!d) return '—'; const p = n => String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`; }
function uniaoFmtBytes(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b/1024).toFixed(1) + ' KB'; return (b/1048576).toFixed(1) + ' MB'; }

// ── Processamento de múltiplos arquivos ──────────────────────────────────────

async function uniaoProcessarArquivos(fileList) {
  showLoader(true, 'Lendo planilhas…');
  const filesArr = Array.from(fileList);

  for (let i = 0; i < filesArr.length; i++) {
    const file = filesArr[i];
    $('loaderMsg').textContent = `Lendo ${i+1}/${filesArr.length}: ${file.name}`;
    const result = await uniaoLerArquivo(file);
    uniaoState.fileCounter++;

    const fileObj = {
      id: 'f_' + uniaoState.fileCounter,
      name: file.name, size: file.size,
      ext: file.name.split('.').pop().toLowerCase(),
      error: null, data: [], headers: [],
      dateCol: null, firstDate: null, lastDate: null
    };

    if (!result.ok) {
      fileObj.error = result.error;
    } else {
      fileObj.data    = result.data.filter(r => Object.values(r).some(v => v !== null && v !== undefined && v !== ''));
      fileObj.headers = fileObj.data.length ? Object.keys(fileObj.data[0]).filter(h => h && h.trim()) : [];
    }
    uniaoState.files.push(fileObj);
  }

  showLoader(false);
  uniaoProcessarConsolidado();
}

// ── Consolidação central ─────────────────────────────────────────────────────

function uniaoProcessarConsolidado() {
  const validFiles = uniaoState.files.filter(f => !f.error && f.data.length);

  if (!validFiles.length) {
    uniaoState.consolidated = [];
    uniaoState.headers      = [];
    uniaoState.dateColName  = null;
    uniaoRenderFilesList();
    ['uniaoSummary','uniaoPreviewSection','uniaoActions'].forEach(id => $(id).style.display = 'none');
    return;
  }

  const master        = validFiles[0];
  const masterHeaders = master.headers.slice();
  uniaoState.headers  = masterHeaders;

  const dateCol          = uniaoDetectarColunaData(masterHeaders, master.data);
  uniaoState.dateColName = dateCol;

  const warnings = [];

  validFiles.forEach((f, idx) => {
    if (idx === 0) {
      f.rowsToUse = f.data.slice();
    } else {
      const sameHeaders = f.headers.length === masterHeaders.length && f.headers.every((h, i) => h === masterHeaders[i]);
      if (sameHeaders) {
        f.rowsToUse = f.data.slice();
      } else {
        f.rowsToUse = f.data.map(row => {
          const newRow = {};
          masterHeaders.forEach((mh, i) => { newRow[mh] = f.headers[i] !== undefined ? row[f.headers[i]] : ''; });
          return newRow;
        });
        warnings.push({ type: 'warn', msg: `<strong>${f.name}</strong> tem cabeçalhos diferentes da primeira planilha. As colunas foram mapeadas por posição.` });
      }
    }

    if (dateCol) {
      let minD = null, maxD = null;
      f.rowsToUse.forEach(row => {
        const d = uniaoParseData(row[dateCol]);
        if (d) { if (!minD || d < minD) minD = d; if (!maxD || d > maxD) maxD = d; }
      });
      f.firstDate = minD; f.lastDate = maxD; f.dateCol = dateCol;
    }
  });

  const consolidated = [];
  validFiles.forEach(f => {
    f.rowsToUse.forEach(row => {
      const cleanRow = {};
      masterHeaders.forEach(h => { cleanRow[h] = row[h] !== undefined ? row[h] : ''; });
      consolidated.push(cleanRow);
    });
  });

  if (uniaoState.sortByDate && dateCol) {
    consolidated.sort((a, b) => {
      const da = uniaoParseData(a[dateCol]), db = uniaoParseData(b[dateCol]);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
  }

  uniaoState.consolidated = consolidated;

  uniaoRenderFilesList();
  uniaoRenderSummary(validFiles, warnings);
  uniaoRenderPreview();

  $('uniaoActions').style.display = 'flex';
  const actSub = $('uniaoActionsSub');
  if (actSub) actSub.textContent = `${consolidated.length.toLocaleString('pt-BR')} linhas consolidadas · ${validFiles.length} arquivo${validFiles.length > 1 ? 's' : ''}`;
}

// ── Renderização: lista de arquivos ──────────────────────────────────────────

function uniaoRenderFilesList() {
  const container = $('uniaoFilesList');
  const countEl   = $('uniaoCount');
  const section   = $('uniaoFilesSection');

  if (!uniaoState.files.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  countEl.textContent   = uniaoState.files.length;

  let oldestId = null, newestId = null;
  if (uniaoState.dateColName) {
    let oldD = null, newD = null;
    uniaoState.files.forEach(f => {
      if (f.firstDate && (!oldD || f.firstDate < oldD)) { oldD = f.firstDate; oldestId = f.id; }
      if (f.lastDate  && (!newD || f.lastDate  > newD)) { newD = f.lastDate;  newestId = f.id; }
    });
  }

  const validFiles = uniaoState.files.filter(f => !f.error);
  const primaryId  = validFiles.length ? validFiles[0].id : null;

  const html = uniaoState.files.map(f => {
    const iconClass = f.error ? 'error' : (f.ext === 'csv' ? 'csv' : 'xlsx');
    const iconSvg   = f.error
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

    const meta = [];
    if (f.error) {
      meta.push(`<span style="color: var(--danger);">${escapeHtml(f.error)}</span>`);
    } else {
      meta.push(`<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/><path d="M7 12l4 4 6-6"/></svg>${fmtInt(f.data.length)} linhas</span>`);
      meta.push(`<span>${f.headers.length} colunas</span>`);
      meta.push(`<span>${uniaoFmtBytes(f.size)}</span>`);
      if (f.firstDate && f.lastDate) meta.push(`<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${uniaoFmtData(f.firstDate)} → ${uniaoFmtData(f.lastDate)}</span>`);
    }

    const badges = [];
    if (f.id === primaryId && !f.error) badges.push('<span class="uniao-file-badge primary">Cabeçalho mestre</span>');
    if (f.id === oldestId && oldestId !== newestId) badges.push('<span class="uniao-file-badge oldest">Mais antigo</span>');
    if (f.id === newestId && oldestId !== newestId) badges.push('<span class="uniao-file-badge newest">Mais recente</span>');

    return `
      <div class="uniao-file-item" data-id="${f.id}">
        <div class="uniao-file-icon ${iconClass}">${iconSvg}</div>
        <div class="uniao-file-info">
          <div class="uniao-file-name" title="${escapeAttr(f.name)}">${escapeHtml(f.name)}</div>
          <div class="uniao-file-meta">${meta.join('')}</div>
        </div>
        <div style="display:flex; gap:4px;">${badges.join('')}</div>
        <button class="uniao-file-remove" onclick="uniaoRemoverArquivo('${f.id}')" title="Remover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
  }).join('');

  container.innerHTML = html;
}

// ── Renderização: resumo ─────────────────────────────────────────────────────

function uniaoRenderSummary(validFiles, warnings) {
  $('summaryArquivos').textContent  = fmtInt(validFiles.length);
  $('summaryLinhas').textContent    = fmtInt(uniaoState.consolidated.length);
  $('summaryColunas').textContent   = fmtInt(uniaoState.headers.length);
  $('summaryDataCol').textContent   = uniaoState.dateColName || 'Não detectada';
  $('summaryDataCol').style.color   = uniaoState.dateColName ? 'var(--success)' : 'var(--text-tertiary)';

  if (uniaoState.dateColName && uniaoState.consolidated.length) {
    const col  = uniaoState.dateColName;
    const fRow = uniaoState.consolidated[0];
    const lRow = uniaoState.consolidated[uniaoState.consolidated.length - 1];
    const fD   = uniaoParseData(fRow[col]);
    const lD   = uniaoParseData(lRow[col]);
    $('summaryPeriodo').textContent = (fD || lD) ? `${uniaoFmtData(fD)} → ${uniaoFmtData(lD)}` : '—';
  } else {
    $('summaryPeriodo').textContent = 'Sem ordenação por data';
  }

  const wHtml = [];
  if (!uniaoState.dateColName) {
    wHtml.push(`<div class="uniao-warning info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><div><strong>Coluna de data não detectada.</strong> As linhas foram concatenadas na ordem dos arquivos.</div></div>`);
  }
  warnings.forEach(w => {
    wHtml.push(`<div class="uniao-warning"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div>${w.msg}</div></div>`);
  });
  $('uniaoWarnings').innerHTML = wHtml.join('');
  $('uniaoSummary').style.display = 'block';
}

// ── Renderização: preview do consolidado ─────────────────────────────────────

function uniaoRenderPreview() {
  const data    = uniaoState.consolidated;
  const headers = uniaoState.headers;
  const section = $('uniaoPreviewSection');
  const countEl = $('uniaoPreviewCount');
  const grid    = $('uniaoPreviewGrid');

  if (!data.length || !headers.length) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  countEl.textContent   = `${fmtInt(data.length)} linhas · ${headers.length} colunas`;

  const PREVIEW_ROWS = 20;
  const showFirst    = data.slice(0, PREVIEW_ROWS);
  const showLast     = data.length > PREVIEW_ROWS * 2 ? data.slice(-PREVIEW_ROWS) : [];
  const skipCount    = data.length - (showFirst.length + showLast.length);

  grid.style.gridTemplateColumns = `56px repeat(${headers.length}, 145px)`;

  const colLetter = n => { let s = ''; while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } return s; };

  let html = `<div class="sheet-header-cell row-num" style="min-width:56px;max-width:56px;">#</div>`;
  headers.forEach((h, i) => {
    const isDateCol = h === uniaoState.dateColName;
    html += `<div class="sheet-header-cell" ${isDateCol ? 'data-role="DATA"' : ''}>
      <div class="sheet-col-letter">${colLetter(i)}${isDateCol ? ' · DATA' : ''}</div>
      <div class="sheet-col-name" title="${escapeAttr(h)}">${escapeHtml(h)}</div>
    </div>`;
  });

  const renderRow = (row, idx) => {
    let r = `<div class="sheet-cell row-num" style="min-width:56px;max-width:56px;">${idx}</div>`;
    headers.forEach(h => {
      const v        = row[h];
      const display  = (v === null || v === undefined || v === '') ? '—' : String(v);
      const truncated = display.length > 40 ? display.substring(0, 40) + '…' : display;
      r += `<div class="sheet-cell" ${h === uniaoState.dateColName ? 'data-role="DATA"' : ''} title="${escapeAttr(display)}">${escapeHtml(truncated)}</div>`;
    });
    return r;
  };

  showFirst.forEach((row, i) => { html += renderRow(row, i + 1); });

  if (skipCount > 0) {
    html += `<div class="sheet-cell row-num" style="min-width:56px;max-width:56px;color:var(--text-disabled);">⋯</div>`;
    headers.forEach((h, i) => {
      html += `<div class="sheet-cell" style="color:var(--text-disabled);text-align:${i===0?'left':'center'};">${i===0 ? `... ${fmtInt(skipCount)} linhas ocultas ...` : '⋯'}</div>`;
    });
  }

  if (showLast.length) {
    showLast.forEach((row, i) => { html += renderRow(row, data.length - showLast.length + i + 1); });
  }

  grid.innerHTML = html;
  setTimeout(() => { uniaoBindPreviewScroll(); uniaoUpdateMinimap(); }, 50);
}

// ── Scroll do preview ────────────────────────────────────────────────────────

function uniaoBindPreviewScroll() {
  const c     = $('uniaoPreviewContainer');
  const ts    = $('uniaoTopscroll');
  const inner = $('uniaoTopscrollInner');
  if (!c || c._uniaoBound) return;
  c._uniaoBound = true;
  if (inner) inner.style.width = c.scrollWidth + 'px';

  c.addEventListener('scroll', () => {
    if (ts && !ts._syncing) { ts._syncing = true; ts.scrollLeft = c.scrollLeft; requestAnimationFrame(() => ts._syncing = false); }
    uniaoUpdateMinimap();
  }, { passive: true });

  if (ts) {
    ts.addEventListener('scroll', () => {
      if (c._syncing) return;
      c._syncing = true; c.scrollLeft = ts.scrollLeft; requestAnimationFrame(() => c._syncing = false);
    }, { passive: true });
  }
}

function uniaoUpdateMinimap() {
  const c     = $('uniaoPreviewContainer');
  const thumb = $('uniaoMinimapThumb');
  const label = $('uniaoMinimapLabel');
  if (!c || !thumb) return;
  const maxScroll      = Math.max(0, c.scrollWidth - c.clientWidth);
  const ratioVisible   = c.scrollWidth > 0 ? Math.min(1, c.clientWidth / c.scrollWidth) : 1;
  const ratioScroll    = maxScroll > 0 ? c.scrollLeft / maxScroll : 0;
  const thumbWidth     = Math.max(10, ratioVisible * 100);
  const availableSpace = 100 - thumbWidth;
  thumb.style.width    = thumbWidth + '%';
  thumb.style.left     = (ratioScroll * availableSpace) + '%';
  if (label) {
    const total        = uniaoState.headers.length;
    const colsVisible  = Math.ceil(c.clientWidth / 145) - 1;
    const firstVisible = Math.floor(c.scrollLeft / 145);
    const lastVisible  = Math.min(total, firstVisible + colsVisible);
    label.textContent  = total > 0 ? `Col. ${firstVisible+1}–${lastVisible} de ${total}` : '—';
  }
}

function uniaoJumpScroll(event) {
  const c = $('uniaoPreviewContainer');
  if (!c) return;
  const rect     = event.currentTarget.getBoundingClientRect();
  const ratio    = (event.clientX - rect.left) / rect.width;
  const maxScroll = c.scrollWidth - c.clientWidth;
  c.scrollTo({ left: maxScroll * ratio, behavior: 'smooth' });
}

// ── Ações (remover, limpar, reprocessar) ─────────────────────────────────────

function uniaoRemoverArquivo(id) {
  uniaoState.files = uniaoState.files.filter(f => f.id !== id);
  uniaoProcessarConsolidado();
  toast('Arquivo removido', 'info', 2000);
}

function uniaoLimparTudo() {
  if (!uniaoState.files.length) return;
  uniaoState.files = []; uniaoState.consolidated = []; uniaoState.headers = []; uniaoState.dateColName = null;
  $('uniaoFiles').value = '';
  ['uniaoFilesSection','uniaoSummary','uniaoPreviewSection','uniaoActions'].forEach(id => $(id).style.display = 'none');
  toast('Tudo apagado', 'success');
}

function uniaoReprocessar() {
  uniaoState.sortByDate = $('toggleOrdenar').checked;
  uniaoProcessarConsolidado();
}

// ── Exportação ───────────────────────────────────────────────────────────────

function uniaoGerarNomeArquivo(ext) {
  const now = new Date(), pad = n => String(n).padStart(2,'0');
  const ts  = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  if (uniaoState.dateColName && uniaoState.consolidated.length) {
    const col  = uniaoState.dateColName;
    const fD   = uniaoParseData(uniaoState.consolidated[0][col]);
    const lD   = uniaoParseData(uniaoState.consolidated[uniaoState.consolidated.length - 1][col]);
    if (fD && lD) {
      const d1 = `${pad(fD.getDate())}-${pad(fD.getMonth()+1)}-${fD.getFullYear()}`;
      const d2 = `${pad(lD.getDate())}-${pad(lD.getMonth()+1)}-${lD.getFullYear()}`;
      return `uniao_planilhas_${d1}_a_${d2}.${ext}`;
    }
  }
  return `uniao_planilhas_${ts}.${ext}`;
}

function uniaoExportarXLSX() {
  if (!uniaoState.consolidated.length) { toast('Nenhum dado para exportar', 'warn'); return; }
  try {
    const headers  = uniaoState.headers;
    const dataRows = uniaoState.consolidated.map(row => headers.map(h => (row[h] === null || row[h] === undefined) ? '' : row[h]));
    const aoa      = [headers, ...dataRows];
    const ws       = XLSX.utils.aoa_to_sheet(aoa);
    const colWidths = headers.map((h, ci) => {
      let maxLen = String(h).length;
      for (let i = 0; i < Math.min(dataRows.length, 200); i++) { const l = dataRows[i][ci] !== null && dataRows[i][ci] !== undefined ? String(dataRows[i][ci]).length : 0; if (l > maxLen) maxLen = l; }
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
    });
    ws['!cols'] = colWidths;
    const wb   = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
    const fileName = uniaoGerarNomeArquivo('xlsx');
    XLSX.writeFile(wb, fileName);
    toast(`${fileName} exportado`, 'success');
  } catch (err) {
    console.error(err);
    toast('Erro ao exportar: ' + err.message, 'error', 5000);
  }
}

function uniaoExportarCSV() {
  if (!uniaoState.consolidated.length) { toast('Nenhum dado para exportar', 'warn'); return; }
  const csv  = Papa.unparse(uniaoState.consolidated, { delimiter: ';', columns: uniaoState.headers });
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href     = URL.createObjectURL(blob);
  link.download = uniaoGerarNomeArquivo('csv');
  link.click();
  toast('CSV exportado', 'success');
}

// ── Event Listeners ──────────────────────────────────────────────────────────

$('uniaoFiles').addEventListener('change', e => {
  if (e.target.files.length) { uniaoProcessarArquivos(e.target.files); e.target.value = ''; }
});

const uniaoDropzone = $('uniaoDropzone');
if (uniaoDropzone) {
  ['dragenter','dragover'].forEach(evt => {
    uniaoDropzone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); uniaoDropzone.classList.add('drag-over'); });
  });
  ['dragleave','drop'].forEach(evt => {
    uniaoDropzone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); uniaoDropzone.classList.remove('drag-over'); });
  });
  uniaoDropzone.addEventListener('drop', e => {
    if (e.dataTransfer.files.length) uniaoProcessarArquivos(e.dataTransfer.files);
  });
}
