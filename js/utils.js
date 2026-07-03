// =============================================================================
// UTILS — Funções utilitárias usadas em todos os módulos
// =============================================================================

/** Atalho para document.getElementById */
const $ = id => document.getElementById(id);

/** Formata número como moeda brasileira sem forçar ,00 quando não houver centavos */
const fmtValor = v => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
}).format(Number(v) || 0);

/** Formata número inteiro com separador de milhar */
const fmtInt = v => new Intl.NumberFormat('pt-BR').format(v || 0);

/** Exibe ou oculta o loader global */
function showLoader(show, msg) {
  $('loader').style.display = show ? 'flex' : 'none';
  if (msg) $('loaderMsg').textContent = msg;
}

/** Normaliza string: maiúsculo, sem acento, trim */
function normalizeKey(s) {
  return String(s || '').toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Escapa caracteres HTML perigosos */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/** Alias para uso em atributos HTML */
function escapeAttr(s) { return escapeHtml(s); }

/** Exibe uma notificação toast temporária */
function toast(msg, type = 'info', duration = 3500) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = {
    error:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--danger)"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--success)"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    warn:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--warning)"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  t.innerHTML = `${icons[type] || icons.info}<span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut 240ms forwards';
    setTimeout(() => t.remove(), 240);
  }, duration);
}
