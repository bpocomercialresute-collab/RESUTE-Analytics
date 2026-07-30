// =============================================================================
// FINANCEIRO — CORE (FASE 1: espaco reservado)
// =============================================================================
// Boot do modulo, estado e carga de dados.
//
// FASE 1  : abre a view e mostra o estado "em construcao". Nao le banco.
// FASE 2  : trocar finCarregarDados() pela leitura real via /api/secure-proxy,
//           SEMPRE filtrando empresa_id da sessao, e marcar
//           MODULO_META.financeiro.disponivel = true em js/modulos.js.
//
// Prefixos reservados deste modulo: fin- (CSS/IDs) e financeiro*/fin* (funcoes).
// Nao colidir com dc-, av-, relat-.
// =============================================================================

var FIN_RAW  = [];    // dados crus vindos do banco
var FIN_DATA = [];    // dados apos filtro de periodo
var FIN_CHARTS = {};  // instancias Chart.js — destruidas em financeiroDestruir()
var FIN_ACTIVE_COMPANY = '';
var FIN_IS_LOADING = false;
var FIN_LOAD_SEQUENCE = 0;
var FIN_ABORT_CONTROLLER = null;
var FIN_ADMIN_PREVIEW = false;
var FIN_ADMIN_PREVIEW_COMPANY = null;

// ── ABRE O PAINEL FINANCEIRO ─────────────────────────────────────────────────

/**
 * @param {object} [opts] { empresaIdPreview } — preview supervisionado do super_admin
 */
function financeiroAbrir(opts) {
  opts = opts || {};
  if (typeof _touchSession === 'function') _touchSession();

  var empresaIdPreview = opts.empresaIdPreview || null;
  var previewAdmin = !!(typeof SESSION !== 'undefined' && SESSION
    && SESSION.papel === 'super_admin' && empresaIdPreview);

  FIN_ADMIN_PREVIEW = previewAdmin;
  FIN_ADMIN_PREVIEW_COMPANY = previewAdmin
    ? (typeof ADMIN_PREVIEW_COMPANIES !== 'undefined' ? (ADMIN_PREVIEW_COMPANIES || []) : [])
        .find(function(item) { return item.empresa_id === empresaIdPreview; }) || null
    : null;

  document.body.classList.remove('bpo-admin-mode');

  // Esconde login, layout admin e o painel comercial
  var lp = document.getElementById('view-login-page');
  if (lp) lp.style.display = 'none';
  ['sidebar', 'cui-wrapper', 'view-dash-cliente'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var ov = document.getElementById('sidebar-overlay');
  if (ov) ov.classList.remove('active');

  var view = document.getElementById('view-dash-financeiro');
  if (view) view.style.display = 'flex';

  _finMontarHeader();

  var eid = previewAdmin
    ? empresaIdPreview
    : ((typeof SESSION !== 'undefined' && SESSION)
        ? ((SESSION.empresa_ids && SESSION.empresa_ids[0]) || SESSION.empresa_id)
        : null);

  if (eid) finCarregarDados(eid);
  else finStatus('⚠ Empresa não configurada.');
}

/** Esconde o painel sem destruir o estado (troca de modulo). */
function financeiroFechar() {
  var view = document.getElementById('view-dash-financeiro');
  if (view) view.style.display = 'none';
}

/**
 * Libera recursos do modulo. Destruir os graficos aqui e obrigatorio:
 * sem isso o Chart.js vaza memoria a cada alternancia de modulo.
 */
function financeiroDestruir() {
  financeiroFechar();
  FIN_LOAD_SEQUENCE += 1;
  if (FIN_ABORT_CONTROLLER) {
    try { FIN_ABORT_CONTROLLER.abort(); } catch (e) {}
    FIN_ABORT_CONTROLLER = null;
  }
  Object.keys(FIN_CHARTS || {}).forEach(function(key) {
    try {
      if (FIN_CHARTS[key] && typeof FIN_CHARTS[key].destroy === 'function') FIN_CHARTS[key].destroy();
    } catch (e) {}
    delete FIN_CHARTS[key];
  });
  FIN_CHARTS = {};
  FIN_RAW = [];
  FIN_DATA = [];
  FIN_ACTIVE_COMPANY = '';
  FIN_IS_LOADING = false;
  FIN_ADMIN_PREVIEW = false;
  FIN_ADMIN_PREVIEW_COMPANY = null;
}

// ── HEADER ───────────────────────────────────────────────────────────────────

function _finMontarHeader() {
  var previewAdmin = FIN_ADMIN_PREVIEW;
  var empresaPreview = FIN_ADMIN_PREVIEW_COMPANY;

  var badge = document.getElementById('fin-empresa');
  if (badge) {
    badge.textContent = (empresaPreview && empresaPreview.nome)
      || ((typeof SESSION !== 'undefined' && SESSION) ? SESSION.empresa_nome : '')
      || 'Empresa';
  }

  var logo = document.querySelector('#view-dash-financeiro .fin-client-logo');
  if (logo) {
    var slug = (empresaPreview && empresaPreview.slug)
      || ((typeof SESSION !== 'undefined' && SESSION) ? SESSION.empresa_slug : null);
    var logoSrc = (empresaPreview && empresaPreview.logo_url)
      || (slug ? 'assets/' + slug + '-logo.png' : null);
    if (logoSrc) {
      logo.src = logoSrc;
      logo.style.display = '';
      logo.onerror = function() { this.style.display = 'none'; };
    } else {
      logo.removeAttribute('src');
      logo.style.display = 'none';
    }
  }

  var voltar = document.getElementById('fin-admin-back');
  var previewBadge = document.getElementById('fin-admin-preview-badge');
  if (voltar) voltar.style.display = previewAdmin ? 'inline-flex' : 'none';
  if (previewBadge) previewBadge.style.display = previewAdmin ? 'inline-flex' : 'none';

  if (typeof renderizarSeletorModulos === 'function') renderizarSeletorModulos();
}

function finStatus(msg) {
  var el = document.getElementById('fin-status');
  if (el) el.textContent = msg || '';
}

// ── CARGA DE DADOS ───────────────────────────────────────────────────────────

/**
 * FASE 1: stub. Nao consulta o banco — as tabelas fin_* ainda nao existem.
 *
 * FASE 2: substituir pelo fetch real. O proxy ja aceita /rest/v1/fin_* e ja
 * EXIGE o filtro empresa_id=eq.<id>; requisicao sem esse filtro recebe 403.
 * Use FIN_LOAD_SEQUENCE + FIN_ABORT_CONTROLLER para descartar respostas
 * obsoletas ao trocar de empresa, como dcCarregarDados() ja faz no comercial.
 */
async function finCarregarDados(empresaId) {
  FIN_ACTIVE_COMPANY = empresaId || '';
  FIN_RAW = [];
  FIN_DATA = [];
  finStatus('');
  if (typeof finRenderizar === 'function') finRenderizar();
}

/** Reprocessa o recorte atual. FASE 2: aplicar filtros de periodo. */
function finFiltrarPeriodo() {
  FIN_DATA = FIN_RAW.slice();
  if (typeof finRenderizar === 'function') finRenderizar();
}

/** Botao "Atualizar" do header. */
async function finAtualizar() {
  var btn = document.getElementById('fin-btn-atualizar');
  if (btn) btn.disabled = true;
  try {
    if (FIN_ACTIVE_COMPANY) await finCarregarDados(FIN_ACTIVE_COMPANY);
  } catch (e) {
    finStatus('✗ ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** Volta ao console admin a partir do preview supervisionado. */
function finVoltarAoAdmin() {
  if (typeof SESSION === 'undefined' || !SESSION || SESSION.papel !== 'super_admin') return;
  financeiroDestruir();
  MODULO_ATIVO = null;
  if (typeof abrirSeletorEmpresasCliente === 'function') abrirSeletorEmpresasCliente();
}
