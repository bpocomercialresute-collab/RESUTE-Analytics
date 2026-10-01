// =============================================================================
// UTILS — Funções utilitárias usadas em todos os módulos
// =============================================================================

/** Atalho para document.getElementById */
const $ = id => document.getElementById(id);

function parseSmartNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let raw = String(value).trim();
  if (!raw) return 0;

  // Excel/contabilidade costuma representar negativos como (1.234,56),
  // 1.234,56- ou -R$ 1.234,56. Sem preservar o sinal, devolucoes/descontos
  // viravam receita positiva e inflavam o total.
  let negative = /^\(.*\)$/.test(raw);
  raw = raw.replace(/[()]/g, '').replace(/[−–—]/g, '-');
  // O sinal pode vir em qualquer posicao, inclusive DEPOIS do "R$"
  // ("R$ -101,00") — nao so no inicio/fim da string inteira.
  if (raw.indexOf('-') !== -1) negative = true;

  raw = raw
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/[^\d,.-]/g, '');

  raw = raw.replace(/-/g, '');

  const hasComma = raw.indexOf(',') >= 0;
  const hasDot = raw.indexOf('.') >= 0;

  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    raw = lastComma > lastDot
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (hasComma) {
    const parts = raw.split(',');
    // No padrao brasileiro uma unica virgula e sempre decimal, inclusive em
    // quantidades com 3 casas (1,234). Varias virgulas em grupos de 3 sao o
    // formato de milhar americano (1,234,567).
    const gruposMilhar = parts.length > 2 && parts.slice(1).every(function(p) { return p.length === 3; });
    raw = gruposMilhar ? parts.join('') : (parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]);
  } else if (hasDot) {
    const parts = raw.split('.');
    const tail = parts[parts.length - 1] || '';
    raw = (parts.length > 2 || tail.length === 3)
      ? raw.replace(/\./g, '')
      : raw;
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  return negative ? -Math.abs(num) : num;
}

/** Formata número sem centavos */
const fmtValor = v => {
  const n = parseSmartNumber(v);
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.round(n));
};

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
