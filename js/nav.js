// =============================================================================
// NAV — Navegação entre views, ripple e contadores animados
// =============================================================================

/** Troca a view ativa e atualiza sidebar + breadcrumb */
function switchView(viewId) {
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  const nav = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (nav) nav.classList.add('active');
  document.getElementById('breadcrumbCurrent').textContent = BREADCRUMB[viewId] || 'Início';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Listeners de navegação — sidebar
document.querySelectorAll('.nav-item[data-view]').forEach(item => {
  item.addEventListener('click', () => switchView(item.dataset.view));
});

// Botões com data-nav (hero, cards)
document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', (e) => { e.stopPropagation(); switchView(el.dataset.nav); });
});

// Cards de ferramenta ativos
document.querySelectorAll('.tool-card[data-status="active"][data-nav]').forEach(card => {
  card.addEventListener('click', () => switchView(card.dataset.nav));
});

// ── Efeito ripple nos botões ──────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  btn.style.setProperty('--rx', `${e.clientX - rect.left}px`);
  btn.style.setProperty('--ry', `${e.clientY - rect.top}px`);
  btn.classList.remove('ripple');
  void btn.offsetWidth;
  btn.classList.add('ripple');
  setTimeout(() => btn.classList.remove('ripple'), 400);
});

// ── Contadores animados [data-count] ─────────────────────────────────────────
function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const target   = parseInt(el.dataset.count);
    const prefix   = el.dataset.prefix || '';
    const suffix   = el.dataset.suffix || '';
    const duration = 1400;
    const start    = performance.now();
    function tick(now) {
      const p      = Math.min((now - start) / duration, 1);
      const eased  = 1 - Math.pow(1 - p, 3);
      el.textContent = `${prefix}${Math.floor(target * eased)}${suffix}`;
      if (p < 1) requestAnimationFrame(tick);
      else {
        if (prefix === 'v' && target === 0) el.textContent = 'v1.0';
        else el.textContent = `${prefix}${target}${suffix}`;
      }
    }
    requestAnimationFrame(tick);
  });
}
setTimeout(animateCounters, 300);

// ── Atalho de teclado ⌘K / Ctrl+K ────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const s = document.querySelector('.topbar-search');
    s.style.borderColor = 'var(--brand-red)';
    setTimeout(() => s.style.borderColor = '', 800);
  }
});
