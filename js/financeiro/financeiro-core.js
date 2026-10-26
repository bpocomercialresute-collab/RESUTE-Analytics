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
  // Mesma tela de carregamento do painel DRE do admin (js/dre/dre-view.js) —
  // sem isso a area de conteudo fica em branco enquanto os dados carregam.
  if (typeof _dreMostrarCarregando === 'function') {
    _dreMostrarCarregando(document.querySelector('#view-dash-financeiro .fin-main') || view, 'Carregando painel...');
  }

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
    // Mesma regra do dashboard comercial (js/auth.js): so a logo cadastrada
    // pela propria empresa, ou o nome dela em texto (.dc-client-logo-texto).
    var logoTexto = document.querySelector('#view-dash-financeiro .fin-client-logo-texto');
    var nomeEmpresa = (empresaPreview && empresaPreview.nome)
      || ((typeof SESSION !== 'undefined' && SESSION) ? (SESSION.empresa_nome || '') : '')
      || 'Empresa';
    var logoSrc = (empresaPreview && empresaPreview.logo_url)
      || ((typeof SESSION !== 'undefined' && SESSION) ? SESSION.empresa_logo_url : null)
      || null;
    var mostrarTexto = function() {
      logo.style.display = 'none';
      logo.removeAttribute('src');
      if (logoTexto) { logoTexto.hidden = false; logoTexto.textContent = nomeEmpresa; }
    };
    if (logoSrc) {
      logo.src = logoSrc;
      logo.alt = nomeEmpresa;
      logo.style.display = '';
      if (logoTexto) logoTexto.hidden = true;
      logo.onerror = mostrarTexto;
    } else {
      mostrarTexto();
    }
  }

  var voltar = document.getElementById('fin-admin-back');
  var previewBadge = document.getElementById('fin-admin-preview-badge');
  // Tambem aparece pro admin da empresa abrindo o proprio painel real (nao
  // e preview de super_admin) — ver finVoltarAoAdmin.
  if (voltar) voltar.style.display = (previewAdmin || (typeof SESSION !== 'undefined' && SESSION && SESSION.papel === 'admin')) ? 'inline-flex' : 'none';
  if (previewBadge) previewBadge.style.display = previewAdmin ? 'inline-flex' : 'none';

  if (typeof renderizarSeletorModulos === 'function') renderizarSeletorModulos();
}

function finStatus(msg) {
  var el = document.getElementById('fin-status');
  if (el) el.textContent = msg || '';
}

// ── CARGA DE DADOS ───────────────────────────────────────────────────────────

/**
 * Carrega o financeiro do cliente mostrando a mesma aba Resultados do DRE
 * que o admin usa (motor js/dre/dre-engine.js, objeto global DRE).
 * Mesmas tabelas fin_dre_plano_contas / fin_dre_lancamentos que o painel
 * DRE do admin le (fetch monkey-patched em auth.js redireciona pra
 * /api/secure-proxy, que exige empresa_id=eq.<id> em toda tabela fin_*).
 * Escrita continua bloqueada pro cliente no proprio secure-proxy (so
 * super_admin pode alterar dado financeiro) — o cliente so ve, nao edita.
 */
async function _finBuscarDoSupabase(empresaId, signal) {
  var qs = '?empresa_id=eq.' + encodeURIComponent(empresaId) + '&select=*';
  var headers = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY };
  // O Supabase capa cada resposta em ~1000 linhas (Max Rows do projeto),
  // mesmo com &limit=100000 na URL — precisa paginar por Range pra trazer
  // tudo. _fetchAll (js/auth.js) ja faz isso (429/erro incluso).
  var dados;
  try {
    dados = await Promise.all([
      _fetchAll(SUPA_URL + '/rest/v1/fin_dre_plano_contas' + qs + '&order=criado_em.asc,id.asc', headers, signal),
      _fetchAll(SUPA_URL + '/rest/v1/fin_dre_lancamentos' + qs + '&order=criado_em.asc,id.asc', headers, signal)
    ]);
  } catch (fetchErr) {
    if (fetchErr && fetchErr.name === 'AbortError') throw fetchErr;
    var fmsg = String(fetchErr && fetchErr.message || '');
    throw new Error(fmsg.indexOf('HTTP 403') >= 0
      ? 'Acesso negado aos dados do DRE desta empresa.'
      : 'Falha ao carregar os dados do DRE: ' + fmsg);
  }
  var plano = Array.isArray(dados[0]) ? dados[0] : [];
  var lancamentos = (Array.isArray(dados[1]) ? dados[1] : []).map(function(l) {
    return Object.assign({}, l, { cnpj: 1 }); // ver DRE.init(): sempre cnpj fixo, multiempresa ja e por empresa_id
  });
  return { plano: plano, lancamentos: lancamentos };
}

async function _finAplicarDadosCarregados(plano, lancamentos) {
  if (typeof _dreInjetarCSS === 'function') await _dreInjetarCSS();
  if (typeof DRE === 'undefined') throw new Error('Motor do DRE (js/dre/dre-engine.js) não carregou.');

  DRE.init({
    plano: plano,
    lancamentos: lancamentos,
    empresa: (typeof SESSION !== 'undefined' && SESSION) ? SESSION.empresa_nome : '',
    cnpj: 1,
    ano: null
  });

  _finLigarResumoFiltroDRE();
  finAtualizarResumoFiltroDRE();

  finStatus(lancamentos.length
    ? String.fromCharCode(10003) + ' ' + lancamentos.length.toLocaleString('pt-BR') + ' lancamentos'
    : 'Nenhum lancamento cadastrado.');

  var atualizado = document.getElementById('fin-last-update');
  if (atualizado) atualizado.textContent = 'Atualizado em ' + new Date().toLocaleString('pt-BR');
}

/**
 * Cache local (IndexedDB) primeiro — mesma chave que js/dre/dre-view.js usa
 * (resute_dre_cache_<empresaId>, via _dreCacheKey/_dreCacheLer/_dreCacheSalvar),
 * pra quem edita no admin e quem so ve aqui compartilharem o mesmo cache.
 * Sem cache: mostra a tela de carregamento e busca tudo do Supabase (igual
 * ao painel Comercial, js/auth.js dcCarregarDados). Com cache: mostra na
 * hora e atualiza em segundo plano — aqui e so leitura, sem risco de perder
 * edicao em andamento, entao pode re-renderizar se os dados mudaram.
 */
async function finCarregarDados(empresaId) {
  if (!empresaId) { finStatus('Empresa não configurada.'); return; }

  var sequencia = ++FIN_LOAD_SEQUENCE;
  FIN_ACTIVE_COMPANY = empresaId;
  FIN_IS_LOADING = true;
  finStatus('Carregando...');

  if (FIN_ABORT_CONTROLLER) { try { FIN_ABORT_CONTROLLER.abort(); } catch (e) {} }
  FIN_ABORT_CONTROLLER = new AbortController();
  var signal = FIN_ABORT_CONTROLLER.signal;
  var mainEl = document.querySelector('#view-dash-financeiro .fin-main');

  try {
    var cache = (typeof _dreCacheLer === 'function') ? await _dreCacheLer(empresaId) : null;
    if (sequencia !== FIN_LOAD_SEQUENCE) return;

    if (cache) {
      await _finAplicarDadosCarregados(cache.plano, cache.lancamentos);
      if (typeof _dreEsconderCarregando === 'function') _dreEsconderCarregando(mainEl);

      _finBuscarDoSupabase(empresaId, signal).then(function(fresco) {
        if (sequencia !== FIN_LOAD_SEQUENCE) return;
        if (typeof _dreCacheSalvar === 'function') _dreCacheSalvar(empresaId, fresco.plano, fresco.lancamentos);
        var mudou = (typeof _dreAssinatura === 'function')
          ? _dreAssinatura(fresco) !== _dreAssinatura(cache)
          : (fresco.lancamentos.length !== cache.lancamentos.length || fresco.plano.length !== cache.plano.length);
        if (mudou) _finAplicarDadosCarregados(fresco.plano, fresco.lancamentos);
      }).catch(function(e) {
        if (e && e.name === 'AbortError') return;
        console.warn('[FIN] Atualizacao de cache em segundo plano falhou:', e);
      });
      return;
    }

    var dados = await _finBuscarDoSupabase(empresaId, signal);
    if (sequencia !== FIN_LOAD_SEQUENCE) return;
    if (typeof _dreCacheSalvar === 'function') _dreCacheSalvar(empresaId, dados.plano, dados.lancamentos);
    await _finAplicarDadosCarregados(dados.plano, dados.lancamentos);
    if (typeof _dreEsconderCarregando === 'function') _dreEsconderCarregando(mainEl);

  } catch (e) {
    if (typeof _dreEsconderCarregando === 'function') _dreEsconderCarregando(mainEl);
    if (e && e.name === 'AbortError') return;
    if (sequencia !== FIN_LOAD_SEQUENCE) return;
    console.error('[FIN] Erro ao carregar DRE:', e);
    finStatus('Erro: ' + e.message);
  } finally {
    if (sequencia === FIN_LOAD_SEQUENCE) FIN_IS_LOADING = false;
  }
}

/** Mantem o chip recolhido do mobile sincronizado com
 *  o filtro de ano/mes do proprio DRE (que ja tem seu handler de recalculo
 *  via DRE.init -> montarFiltros — os listeners sao marcados no proprio
 *  elemento para acompanhar remontagens sem duplicar handlers). */
function _finLigarResumoFiltroDRE() {
  ['fin-filtro-ano', 'fin-filtro-mes'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el || el.dataset.finResumoListener === '1') return;
    el.addEventListener('change', finAtualizarResumoFiltroDRE);
    el.dataset.finResumoListener = '1';
  });
  var btn = document.getElementById('fin-btn-atualizar');
  if (btn && btn.dataset.finResumoListener !== '1') {
    btn.addEventListener('click', finAtualizarResumoFiltroDRE);
    btn.dataset.finResumoListener = '1';
  }
}

function finAtualizarResumoFiltroDRE() {
  var el = document.getElementById('fin-filtro-resumo-texto');
  if (!el) return;
  var selAno = document.getElementById('fin-filtro-ano');
  var selMes = document.getElementById('fin-filtro-mes');
  var ano = selAno ? parseInt(selAno.value, 10) || 0 : 0;
  var mes = selMes && selMes.value !== '' ? parseInt(selMes.value, 10) : null;
  var partes = [];
  if (mes !== null && ano) partes.push(MESES[mes] + '/' + ano);
  else if (ano) partes.push(String(ano));
  else partes.push('Todos os períodos');
  el.textContent = partes.join(' · ');
}

function finToggleFiltrosMobile() {
  var grupo = document.getElementById('fin-filtros-grupo');
  var btn = document.getElementById('fin-filtro-resumo');
  if (!grupo || !btn) return;
  var aberto = grupo.classList.toggle('aberto');
  btn.setAttribute('aria-expanded', aberto ? 'true' : 'false');
}

/** Alterna entre as abas "Resultados" e "Laudo Grupo" do financeiro do cliente. */
function finAbrirAbaCliente(paneId, btn) {
  document.querySelectorAll('.fin-tabs-cliente .fin-tab').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.fin-pane-cliente').forEach(function(p) { p.style.display = 'none'; });
  if (btn) btn.classList.add('active');
  var pane = document.getElementById(paneId);
  if (pane) pane.style.display = '';
}

function finVoltarAoAdmin() {
  if (typeof SESSION === 'undefined' || !SESSION || (SESSION.papel !== 'super_admin' && SESSION.papel !== 'admin')) return;
  financeiroDestruir();
  MODULO_ATIVO = null;
  // Admin da empresa abrindo o proprio painel real (via "Ver painel da
  // empresa") nao e preview de super_admin — devolve direto pro painel de
  // gestao dele, sem a logica de DC_ADMIN_PREVIEW_VOLTAR (so faz sentido
  // pra quem entrou via o console do super_admin).
  if (SESSION.papel === 'admin') {
    ['view-dash-cliente', 'view-dash-financeiro', 'view-dash-dre'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    if (typeof abrirAreaComercialAdmin === 'function') abrirAreaComercialAdmin();
    return;
  }
  // adminConsoleAbrir() so esconde .page-view; os overlays fixos do dashboard
  // (view-dash-cliente/financeiro/dre) nao tem essa classe — garante que
  // nenhum fique visivel por cima da secao do console (mesmo raciocinio de
  // dcVoltarAoAdmin em js/auth.js).
  ['view-dash-cliente', 'view-dash-financeiro', 'view-dash-dre'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // Mesma logica de dcVoltarAoAdmin (js/auth.js): respeita de onde o preview
  // foi aberto (Usuarios > Entrar como, Modulos > Ver painel do cliente...)
  // em vez de sempre voltar pro card da empresa em Comercial.
  var voltarPara = (typeof DC_ADMIN_PREVIEW_VOLTAR !== 'undefined') ? DC_ADMIN_PREVIEW_VOLTAR : null;
  if (typeof DC_ADMIN_PREVIEW_VOLTAR !== 'undefined') DC_ADMIN_PREVIEW_VOLTAR = null;
  if (voltarPara && voltarPara !== 'comercial' && typeof adminConsoleAbrir === 'function') {
    adminConsoleAbrir(voltarPara);
    return;
  }
  if (typeof abrirSeletorEmpresasCliente === 'function') abrirSeletorEmpresasCliente();
}
