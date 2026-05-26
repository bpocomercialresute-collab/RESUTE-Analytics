// =============================================================================
// NAV — Navegação entre views, ripple e contadores animados
// =============================================================================

/** Troca a view ativa e atualiza topnav */
function switchView(viewId) {
  // Esconde todas as views via style direto (garante funcionamento mesmo sem CSS)
  document.querySelectorAll('.page-view').forEach(v => {
    v.style.display = 'none';
    v.classList.remove('active');
  });
  document.querySelectorAll('.topnav-link').forEach(n => n.classList.remove('active'));

  // Mostra a view correta
  const view = document.getElementById(viewId);
  if (view) {
    view.style.display = 'block';
    view.classList.add('active');
  }
  const nav = document.querySelector(`.topnav-link[data-view="${viewId}"]`);
  if (nav) nav.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Inicializa: esconde todas e mostra só view-home
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.page-view').forEach(v => { v.style.display = 'none'; });
  const home = document.getElementById('view-home');
  if (home) home.style.display = 'block';
});

// Listeners de navegação — topnav
document.querySelectorAll('.topnav-link[data-view]').forEach(item => {
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
      else el.textContent = `${prefix}${target}${suffix}`;
    }
    requestAnimationFrame(tick);
  });
}
setTimeout(animateCounters, 300);