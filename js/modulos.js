// =============================================================================
// MODULOS — Camada unica de decisao sobre quais modulos a sessao pode usar
// =============================================================================
//
// AVISO DE SEGURANCA — leia antes de confiar em qualquer funcao deste arquivo.
//
// O gating feito aqui e UX, NAO seguranca. SESSION vive em localStorage e e
// totalmente editavel pelo usuario: qualquer pessoa pode abrir o devtools e
// injetar 'financeiro' em SESSION.modulos para fazer a aba aparecer.
//
// A garantia real de acesso a dado esta em dois lugares, e so neles:
//   1. RLS no Supabase (docs/supabase-modulos.sql e docs/supabase-financeiro.sql)
//   2. api/secure-proxy.js — valida a sessao no servidor e exige filtro por
//      empresa_id em toda tabela fin_*
//
// Nunca use temModulo() como unica barreira para proteger dado. Use so para
// mostrar/esconder tela.
// =============================================================================

var MODULOS = {
  COMERCIAL:  'comercial',
  FINANCEIRO: 'financeiro'
};

/** Ordem de prioridade quando a empresa contrata mais de um modulo */
var MODULOS_PRIORIDADE = [MODULOS.COMERCIAL, MODULOS.FINANCEIRO];

var MODULO_META = {
  comercial: {
    slug:       'comercial',
    nome:       'Relatórios Comercial',
    curto:      'Comercial',
    view:       'view-dash-cliente',
    disponivel: true,
    icone:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>'
  },
  financeiro: {
    slug:       'financeiro',
    nome:       'Relatórios Financeiro',
    curto:      'Financeiro',
    view:       'view-dash-financeiro',
    disponivel: false, // FASE 1: placeholder. Vira true quando o modulo existir.
    icone:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
  }
};

/** Modulo em uso na tela agora (null quando nenhum painel esta aberto) */
var MODULO_ATIVO = null;

// ── LEITURA DA SESSAO ────────────────────────────────────────────────────────

/** Slugs de modulo que a sessao atual pode usar. Fallback: ['comercial']. */
function sessaoModulos() {
  if (typeof SESSION === 'undefined' || !SESSION) return [MODULOS.COMERCIAL];

  // super_admin enxerga todos os modulos de todas as empresas
  if (SESSION.papel === 'super_admin') return MODULOS_PRIORIDADE.slice();

  var lista = Array.isArray(SESSION.modulos) ? SESSION.modulos : null;
  if (!lista || !lista.length) return [MODULOS.COMERCIAL];

  // Mantem apenas slugs conhecidos e aplica a ordem de prioridade
  var validos = lista.filter(function(slug) { return !!MODULO_META[slug]; });
  if (!validos.length) return [MODULOS.COMERCIAL];

  return MODULOS_PRIORIDADE.filter(function(slug) {
    return validos.indexOf(slug) !== -1;
  });
}

/** Unica funcao consultada para exibir/ocultar qualquer coisa de modulo. */
function temModulo(slug) {
  if (!slug || !MODULO_META[slug]) return false;
  if (typeof SESSION !== 'undefined' && SESSION && SESSION.papel === 'super_admin') return true;
  return sessaoModulos().indexOf(slug) !== -1;
}

/** Modulo que deve abrir logo apos o login. */
function moduloPadrao() {
  var disponiveis = sessaoModulos();
  var sugerido = (typeof SESSION !== 'undefined' && SESSION) ? SESSION.modulo_padrao : null;
  if (sugerido && disponiveis.indexOf(sugerido) !== -1) return sugerido;
  return disponiveis[0] || MODULOS.COMERCIAL;
}

// ── NAVEGACAO ENTRE MODULOS ──────────────────────────────────────────────────

/**
 * Abre um modulo do painel do cliente.
 * @param {string} slug              'comercial' | 'financeiro'
 * @param {object} [opts]            { empresaIdPreview } — preview do super_admin
 */
function abrirModulo(slug, opts) {
  opts = opts || {};

  if (!temModulo(slug)) {
    if (typeof toast === 'function') toast('Módulo não contratado para esta empresa.', 'warn', 4000);
    var alternativo = moduloPadrao();
    if (alternativo !== slug) abrirModulo(alternativo, opts);
    return;
  }

  var anterior = MODULO_ATIVO;
  if (anterior && anterior !== slug) _fecharModulo(anterior);

  MODULO_ATIVO = slug;

  if (slug === MODULOS.FINANCEIRO) {
    if (typeof financeiroAbrir === 'function') financeiroAbrir(opts);
  } else {
    if (typeof _abrirDashCliente === 'function') _abrirDashCliente(opts.empresaIdPreview);
  }

  renderizarSeletorModulos();
}

/** Fecha o painel de um modulo (esconde view e libera recursos). */
function _fecharModulo(slug) {
  if (slug === MODULOS.FINANCEIRO) {
    if (typeof financeiroFechar === 'function') financeiroFechar();
    return;
  }
  var vc = document.getElementById('view-dash-cliente');
  if (vc) vc.style.display = 'none';
}

/** Limpa o estado de modulo (chamado no logout). */
function resetarModulos() {
  if (MODULO_ATIVO === MODULOS.FINANCEIRO && typeof financeiroDestruir === 'function') {
    financeiroDestruir();
  }
  MODULO_ATIVO = null;
  ['dc-modulos', 'fin-modulos'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.innerHTML = ''; el.style.display = 'none'; }
  });
}

// ── SELETOR VISUAL ───────────────────────────────────────────────────────────

/**
 * Renderiza a troca de modulos no header do cliente.
 * Aparece apenas quando a empresa tem mais de um modulo contratado — nao
 * polui a tela com uma aba unica.
 */
function renderizarSeletorModulos() {
  var disponiveis = sessaoModulos();
  var mostrar = disponiveis.length > 1;

  ['dc-modulos', 'fin-modulos'].forEach(function(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!mostrar) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.innerHTML = disponiveis.map(function(slug) {
      var meta = MODULO_META[slug];
      var ativo = (slug === MODULO_ATIVO) ? ' active' : '';
      var tagWip = meta.disponivel ? '' : '<em class="dc-modulos-wip">em breve</em>';
      return '<button type="button" class="dc-modulos-btn' + ativo + '" data-modulo="' + slug + '">'
           + meta.icone + '<span>' + meta.nome + '</span>' + tagWip
           + '</button>';
    }).join('');
    container.style.display = 'flex';

    container.querySelectorAll('.dc-modulos-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var destino = this.dataset.modulo;
        if (destino === MODULO_ATIVO) return;
        abrirModulo(destino, {
          empresaIdPreview: (typeof DC_ADMIN_PREVIEW !== 'undefined' && DC_ADMIN_PREVIEW
            && typeof DC_ADMIN_PREVIEW_COMPANY !== 'undefined' && DC_ADMIN_PREVIEW_COMPANY)
            ? DC_ADMIN_PREVIEW_COMPANY.empresa_id
            : null
        });
      });
    });
  });
}
