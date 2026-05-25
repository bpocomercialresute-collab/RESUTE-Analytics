// =============================================================================
// MAPPING — Interface de mapeamento de colunas (grid excel + scroll + wizard)
// =============================================================================

// ── Wizard: transições entre steps ───────────────────────────────────────────

function setStep(stepNum) {
  document.querySelectorAll('.step').forEach(el => {
    const n = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (n < stepNum) el.classList.add('done');
    else if (n === stepNum) el.classList.add('active');
  });
  document.querySelectorAll('.step-bar').forEach(el => {
    el.classList.toggle('done', parseInt(el.dataset.bar) < stepNum);
  });

  ['step-upload', 'step-mapping', 'step-dashboard'].forEach((id, i) => {
    $(id).style.display = (i + 1 === stepNum) ? 'block' : 'none';
  });

  // Barra fixa: só aparece no step 2
  const bar = $('fixedActionBar');
  if (bar) bar.classList.toggle('visible', stepNum === 2);

  // Padding inferior para não sobrepor a barra fixa
  const content = document.querySelector('.content');
  if (content) content.style.paddingBottom = (stepNum === 2) ? '100px' : '';
}

function goToUpload()    { setStep(1); }
function goToDashboard() { setStep(3); }

function goToMapping() {
  if (!state.pedidos.raw.length) { toast('Carregue a planilha de pedidos primeiro', 'warn'); return; }
  renderMappingUI();
  setStep(2);
}

// ── Legenda de papéis ─────────────────────────────────────────────────────────

function renderRoleLegend() {
  const roles = ['DATA','PEDIDO','SKU','PRODUTO','QTD','VALOR','COR','TAMANHO','ESTAMPA','STATUS','CUSTOM'];
  $('roleLegend').innerHTML = roles.map(r => {
    const role = ROLES[r];
    return `<span class="role-legend-item">
      <span class="role-legend-dot" style="background:${role.color};"></span>
      ${role.label}
    </span>`;
  }).join('');
}

// ── Grid estilo Excel ─────────────────────────────────────────────────────────

function renderSheetGrid(kind, containerId) {
  const d         = state[kind];
  const container = $(containerId);
  if (!d.raw.length || !container) return;

  const cols        = d.headers.length;
  const ignoredSet  = state.explicitIgnored[kind] || new Set();

  container.style.gridTemplateColumns = `44px repeat(${cols}, 145px)`;

  const colLetter = n => {
    let s = '';
    while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
    return s;
  };

  let html = '';

  // Header
  html += `<div class="sheet-header-cell row-num">#</div>`;
  d.headers.forEach((header, idx) => {
    const currentRole   = state.mapping[kind][header] || 'IGNORAR';
    const isUnmapped    = currentRole === 'IGNORAR';
    const isIgnored     = ignoredSet.has(header);
    const cls           = [isUnmapped ? 'col-unmapped' : '', isIgnored ? 'col-ignored' : ''].filter(Boolean).join(' ');

    const roleOptions = Object.keys(ROLES)
      .filter(r => !(r === 'STATUS' && !state.statusEnabled))
      .map(r => `<option value="${r}" ${r === currentRole ? 'selected' : ''}>${ROLES[r].label}</option>`)
      .join('');

    html += `
      <div class="sheet-header-cell ${cls}" data-role="${currentRole !== 'IGNORAR' ? currentRole : ''}" data-col="${idx}" data-header="${escapeAttr(header)}">
        <div class="sheet-col-letter">Coluna ${colLetter(idx)}${isIgnored ? ' · ignorada' : ''}</div>
        <div class="sheet-col-name" title="${escapeAttr(header)}">${escapeHtml(header)}</div>
        <select class="role-select" data-kind="${kind}" data-header="${escapeAttr(header)}" onchange="onRoleChange(this)">
          ${roleOptions}
        </select>
      </div>`;
  });

  // Linhas de dados
  d.sample.forEach((row, rowIdx) => {
    html += `<div class="sheet-cell row-num">${rowIdx + 1}</div>`;
    d.headers.forEach(header => {
      const currentRole = state.mapping[kind][header] || 'IGNORAR';
      const isUnmapped  = currentRole === 'IGNORAR';
      const isIgnored   = ignoredSet.has(header);
      const cls         = [isUnmapped ? 'col-unmapped' : '', isIgnored ? 'col-ignored' : ''].filter(Boolean).join(' ');
      const val         = row[header];
      const display     = (val === null || val === undefined || val === '') ? '—' : String(val);
      const truncated   = display.length > 40 ? display.substring(0, 40) + '…' : display;
      html += `<div class="sheet-cell ${cls}" data-role="${currentRole !== 'IGNORAR' ? currentRole : ''}" title="${escapeAttr(display)}">${escapeHtml(truncated)}</div>`;
    });
  });

  container.innerHTML = html;
  container.dataset.view = state.gridView[kind] || 'all';
  setTimeout(() => updateScrollIndicators(kind), 50);
}

// ── Indicadores de scroll (sombras, minimap, botões) ────────────────────────

function updateScrollIndicators(kind) {
  const vpId     = kind === 'pedidos' ? 'viewportPed'       : 'viewportProd';
  const cId      = kind === 'pedidos' ? 'containerPed'      : 'containerProd';
  const tsInnId  = kind === 'pedidos' ? 'topscrollInnerPed' : 'topscrollInnerProd';
  const thumbId  = kind === 'pedidos' ? 'minimapThumbPed'   : 'minimapThumbProd';
  const labelId  = kind === 'pedidos' ? 'minimapLabelPed'   : 'minimapLabelProd';

  const vp = $(vpId), c = $(cId), tsInner = $(tsInnId), thumb = $(thumbId), label = $(labelId);
  if (!vp || !c) return;

  const maxScroll = Math.max(0, c.scrollWidth - c.clientWidth);
  vp.dataset.canScrollLeft  = (c.scrollLeft > 4)            ? 'true' : 'false';
  vp.dataset.canScrollRight = (c.scrollLeft < maxScroll - 4) ? 'true' : 'false';

  if (tsInner && c.firstElementChild) tsInner.style.width = c.scrollWidth + 'px';

  if (thumb && c.scrollWidth > 0) {
    const ratioVisible  = Math.min(1, c.clientWidth / c.scrollWidth);
    const ratioScroll   = maxScroll > 0 ? c.scrollLeft / maxScroll : 0;
    const thumbWidth    = Math.max(10, ratioVisible * 100);
    thumb.style.width   = thumbWidth + '%';
    thumb.style.left    = (ratioScroll * (100 - thumbWidth)) + '%';
  }

  if (label) {
    const headers = state[kind]?.headers || [];
    const total   = headers.length;
    if (total > 0) {
      const colsVisible   = Math.ceil(c.clientWidth / 145) - 1;
      const firstVisible  = Math.floor(c.scrollLeft / 145);
      const lastVisible   = Math.min(total, firstVisible + colsVisible);
      label.textContent   = `Col. ${firstVisible + 1}–${lastVisible} de ${total}`;
    }
  }
}

/** Rola o grid lateralmente (dir = -1 esquerda, +1 direita) */
function scrollSheet(kind, direction) {
  const c = $(kind === 'pedidos' ? 'containerPed' : 'containerProd');
  if (c) c.scrollBy({ left: direction * 145 * 3, behavior: 'smooth' });
}

/** Click no minimap → jump para aquela posição */
function jumpToScroll(kind, event) {
  const c = $(kind === 'pedidos' ? 'containerPed' : 'containerProd');
  if (!c) return;
  const rect     = event.currentTarget.getBoundingClientRect();
  const ratio    = (event.clientX - rect.left) / rect.width;
  c.scrollTo({ left: (c.scrollWidth - c.clientWidth) * ratio, behavior: 'smooth' });
}

/** Alterna entre "todas as colunas" e "só mapeadas" */
function setGridView(kind, view, btnEl) {
  state.gridView[kind] = view;
  const c = $(kind === 'pedidos' ? 'containerPed' : 'containerProd');
  if (c) c.dataset.view = view;
  const parent = btnEl.closest('.pill-group');
  if (parent) { parent.querySelectorAll('.pill').forEach(p => p.classList.remove('active')); btnEl.classList.add('active'); }
  setTimeout(() => updateScrollIndicators(kind), 50);
}

/** Marca todas as colunas não mapeadas como ignoradas */
function ignorarRestante(kind) {
  const unmapped = state[kind].headers.filter(h => !state.mapping[kind][h]);
  if (!unmapped.length) { toast('Não há colunas a ignorar — todas já foram tratadas', 'info', 3000); return; }
  unmapped.forEach(h => state.explicitIgnored[kind].add(h));
  state.gridView[kind] = 'mapped-only';
  renderSheetGrid(kind, kind === 'pedidos' ? 'sheetGridPed' : 'sheetGridProd');
  const toolbar = $(kind === 'pedidos' ? 'mappingPedSection' : 'mappingProdSection')?.querySelector('.pill-group');
  if (toolbar) toolbar.querySelectorAll('.pill').forEach(p => { p.classList.toggle('active', p.dataset.view === 'mapped-only'); });
  updateMappedCount();
  toast(`${unmapped.length} coluna${unmapped.length > 1 ? 's' : ''} ignorada${unmapped.length > 1 ? 's' : ''}`, 'success');
}

/** Registra os listeners de scroll (sync topscroll, shift+wheel, teclado) */
function bindScrollIndicators() {
  ['pedidos', 'produtos'].forEach(k => {
    const c  = $(k === 'pedidos' ? 'containerPed' : 'containerProd');
    const ts = $(k === 'pedidos' ? 'topscrollPed' : 'topscrollProd');
    if (!c || c._bound) return;
    c._bound = true;

    c.addEventListener('scroll', () => {
      updateScrollIndicators(k);
      if (ts && !ts._syncing) { ts._syncing = true; ts.scrollLeft = c.scrollLeft; requestAnimationFrame(() => ts._syncing = false); }
    }, { passive: true });

    if (ts) {
      ts.addEventListener('scroll', () => {
        if (c._syncing) return;
        c._syncing = true; c.scrollLeft = ts.scrollLeft; requestAnimationFrame(() => c._syncing = false);
      }, { passive: true });
    }

    c.addEventListener('mouseenter', () => c._hovered = true);
    c.addEventListener('mouseleave', () => c._hovered = false);
  });

  if (!window._gridKbBound) {
    window._gridKbBound = true;
    window.addEventListener('keydown', e => {
      if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
      ['pedidos','produtos'].forEach(k => {
        const c = $(k === 'pedidos' ? 'containerPed' : 'containerProd');
        if (!c || !c._hovered) return;
        if (e.key === 'ArrowRight') { c.scrollBy({ left:  145, behavior: 'smooth' }); e.preventDefault(); }
        if (e.key === 'ArrowLeft')  { c.scrollBy({ left: -145, behavior: 'smooth' }); e.preventDefault(); }
        if (e.key === 'Home') { c.scrollTo({ left: 0,             behavior: 'smooth' }); e.preventDefault(); }
        if (e.key === 'End')  { c.scrollTo({ left: c.scrollWidth, behavior: 'smooth' }); e.preventDefault(); }
      });
    });
  }

  window.addEventListener('resize', () => { updateScrollIndicators('pedidos'); updateScrollIndicators('produtos'); });
}

/** Renderiza a UI completa de mapeamento */
function renderMappingUI() {
  renderRoleLegend();

  $('mappingPedSection').style.display = 'block';
  $('mappingPedInfo').textContent      = `${state.pedidos.fileName} — selecione o papel de cada coluna`;
  $('mappingPedTotalCols').textContent = state.pedidos.headers.length;
  $('mappingPedRows').textContent      = fmtInt(state.pedidos.raw.length);
  renderSheetGrid('pedidos', 'sheetGridPed');

  if (state.produtos.raw.length) {
    $('mappingProdSection').style.display = 'block';
    $('mappingProdInfo').textContent      = `${state.produtos.fileName} — mapeie SKU e Nome do produto`;
    $('mappingProdTotalCols').textContent = state.produtos.headers.length;
    $('mappingProdRows').textContent      = fmtInt(state.produtos.raw.length);
    renderSheetGrid('produtos', 'sheetGridProd');
  } else {
    $('mappingProdSection').style.display = 'none';
  }

  updateMappedCount();
  bindScrollIndicators();
}

/** Callback do select de papel de cada coluna */
function onRoleChange(selectEl) {
  const kind    = selectEl.dataset.kind;
  const header  = selectEl.dataset.header;
  const newRole = selectEl.value;

  if (newRole === 'IGNORAR') {
    delete state.mapping[kind][header];
  } else {
    state.explicitIgnored[kind].delete(header);
    if (ROLES[newRole].unique) {
      for (const h in state.mapping[kind]) {
        if (state.mapping[kind][h] === newRole && h !== header) {
          delete state.mapping[kind][h];
          toast(`"${ROLES[newRole].label}" reatribuído de "${h}" para "${header}"`, 'info', 2500);
          break;
        }
      }
    }
    state.mapping[kind][header] = newRole;
  }

  renderSheetGrid(kind, kind === 'pedidos' ? 'sheetGridPed' : 'sheetGridProd');
  updateMappedCount();
}

/** Atualiza contadores e mensagem da barra fixa de ação */
function updateMappedCount() {
  const pedMapped = Object.keys(state.mapping.pedidos).length;
  const pedTotal  = state.pedidos.headers.length;

  $('mappingPedMapped').textContent = pedMapped;
  if ($('mapStatusPed')) { $('mapStatusPed').textContent = pedMapped; $('mapStatusPed').className = 'mapping-status-num ' + (pedMapped === 0 ? 'warn' : 'ok'); }
  if ($('mapTotalPed'))  $('mapTotalPed').textContent = pedTotal;

  if (state.produtos.raw.length) {
    const prodMapped = Object.keys(state.mapping.produtos).length;
    const prodTotal  = state.produtos.headers.length;
    $('mappingProdMapped').textContent = prodMapped;
    if ($('mapStatusProd')) { $('mapStatusProd').textContent = prodMapped; $('mapStatusProd').className = 'mapping-status-num ' + (prodMapped === 0 ? 'warn' : 'ok'); }
    if ($('mapTotalProd'))  $('mapTotalProd').textContent = prodTotal;
  }

  const btn    = $('btnConfirmMapping');
  const hasAny = pedMapped > 0;
  btn.disabled = !hasAny;

  const title = $('stickyTitle');
  const sub   = $('stickySub');
  if (!title || !sub) return;

  if (!hasAny) {
    title.textContent = 'Aguardando mapeamento';
    title.style.color = 'var(--text-primary)';
    sub.textContent   = 'Marque ao menos uma coluna na planilha de pedidos para continuar.';
    sub.style.color   = 'var(--text-tertiary)';
  } else {
    const hasQuant = Object.values(state.mapping.pedidos).some(r => r === 'VALOR' || r === 'QTD');
    const hasIdent = Object.values(state.mapping.pedidos).some(r => r === 'SKU'   || r === 'PRODUTO');
    title.textContent = `${pedMapped} coluna${pedMapped > 1 ? 's' : ''} mapeada${pedMapped > 1 ? 's' : ''}`;
    title.style.color = 'var(--success)';
    if (!hasIdent && !hasQuant) { sub.textContent = 'Dica: mapear Produto/SKU e Valor/Qtd deixa os relatórios mais completos.'; sub.style.color = 'var(--warning)'; }
    else if (!hasIdent)         { sub.textContent = 'Dica: marcar uma coluna de Produto ou SKU habilita o ranking de itens.';     sub.style.color = 'var(--warning)'; }
    else if (!hasQuant)         { sub.textContent = 'Dica: marcar uma coluna de Valor ou Quantidade habilita KPIs de faturamento.'; sub.style.color = 'var(--warning)'; }
    else                        { sub.textContent = 'Tudo certo — você pode finalizar e gerar os relatórios.';                     sub.style.color = 'var(--text-tertiary)'; }
  }
}
