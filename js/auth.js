// =============================================================================
// AUTH.JS — Login, sessão, sync API e salvar dados manuais
// =============================================================================
console.log('%c[RESUTE] auth.js v43 carregado', 'color:#1C64C0;font-weight:bold;font-size:14px');

const SUPA_URL = 'https://glfzevdsmmdvrwhplzkc.supabase.co';
const SUPA_KEY = '__SERVER_ONLY__';
const SVC_KEY  = '__SERVER_ONLY__';
// API URL vem de EMPRESA_ATIVA.api_url (configurada por empresa no admin)

const NATIVE_FETCH = window.fetch.bind(window);

function _getSessionToken() {
  if (SESSION && SESSION.token) return SESSION.token;
  var parsed = _readStoredSession();
  if (parsed && parsed.token) {
    SESSION = parsed;
    return parsed.token;
  }
  return '';
}

function _getVisualCodigoEmpresa() {
  var sources = [EMPRESA_ATIVA, SESSION];
  for (var i = 0; i < sources.length; i += 1) {
    var src = sources[i] || {};
    var code = src.visual_codigo_empresa
      || src.empresa_codigo
      || src.empresa_id
      || src.codigo_empresa
      || src.codigo_cliente_id
      || src.codigo_cliente
      || src.codigoEmpresa
      || src.codigoClienteID
      || src.codigoCliente
      || src.visual_codigo_cliente;
    if (code !== undefined && code !== null && String(code).trim()) {
      return String(code).trim();
    }
  }
  return '';
}

function _normalizeFetchHeaders(headers) {
  if (!headers) return {};
  if (headers instanceof Headers) {
    var out = {};
    headers.forEach(function(value, key) { out[key] = value; });
    return out;
  }
  return headers;
}

async function _fetchApiProxy(apiUrl, path, token, extraHeaders) {
  var headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  var codigoEmpresa = _getVisualCodigoEmpresa();
  if (codigoEmpresa) headers['x-visual-codigo-empresa'] = codigoEmpresa;

  var normalized = _normalizeFetchHeaders(extraHeaders || {});
  Object.keys(normalized).forEach(function(key) {
    if (normalized[key] !== undefined && normalized[key] !== null) {
      headers[key] = normalized[key];
    }
  });

  return NATIVE_FETCH('/api/secure-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-token': _getSessionToken(),
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({
      url: apiUrl + path,
      method: 'GET',
      headers: headers,
      body: null,
      empresa_id: EMPRESA_ATIVA ? EMPRESA_ATIVA.empresa_id : null
    })
  });
}

async function _fetchApiDirect(apiUrl, path, token, extraHeaders) {
  var headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  var codigoEmpresa = _getVisualCodigoEmpresa();
  if (codigoEmpresa) headers['x-visual-codigo-empresa'] = codigoEmpresa;

  var normalized = _normalizeFetchHeaders(extraHeaders || {});
  Object.keys(normalized).forEach(function(key) {
    if (normalized[key] !== undefined && normalized[key] !== null) {
      headers[key] = normalized[key];
    }
  });

  return NATIVE_FETCH(apiUrl + path, {
    method: 'GET',
    headers: headers
  });
}

window.fetch = function(input, init) {
  var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
  var opts = init || {};

  if (url === SUPA_URL + '/auth/v1/token?grant_type=password') {
    return NATIVE_FETCH('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body
    });
  }

  var _activeApiUrl = EMPRESA_ATIVA && EMPRESA_ATIVA.api_url ? EMPRESA_ATIVA.api_url : null;
  if (
    url.indexOf(SUPA_URL + '/rest/v1/') === 0 ||
    url.indexOf(SUPA_URL + '/functions/v1/') === 0 ||
    (_activeApiUrl && url.indexOf(_activeApiUrl + '/') === 0)
  ) {
    _touchSession();
    var proxyOpts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': _getSessionToken(),
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        url: url,
        method: opts.method || 'GET',
        headers: _normalizeFetchHeaders(opts.headers),
        body: opts.body || null
      })
    };
    if (opts.signal) proxyOpts.signal = opts.signal;
    return NATIVE_FETCH('/api/secure-proxy', proxyOpts);
  }

  return NATIVE_FETCH(input, init);
};

var SESSION  = null;
var EMPRESAS = [];
var SESSION_KEY = 'resute_session';
var SESSION_TTL_MS = 1000 * 60 * 90;

function _clearStoredSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}

function _sessionTick() {
  if (!SESSION || !SESSION.token) return;
  if (!SESSION.expires_at || SESSION.expires_at < Date.now()) {
    toast('Sessão expirada. Faça login novamente.', 'warn', 5000);
    fazerLogout();
    return;
  }
}

setInterval(_sessionTick, 60000);
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') _sessionTick();
});
['click', 'keydown', 'mousemove', 'touchstart'].forEach(function(evt) {
  document.addEventListener(evt, function() {
    if (SESSION && SESSION.token) _touchSession();
  }, { passive: true });
});

function _touchSession() {
  if (!SESSION || !SESSION.token) return;
  SESSION.expires_at = Date.now() + SESSION_TTL_MS;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION)); } catch (e) {}
}

function _readStoredSession() {
  try {
    var saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return null;
    var parsed = JSON.parse(saved);
    if (!parsed || !parsed.token) return null;
    if (!parsed.expires_at || parsed.expires_at < Date.now()) {
      _clearStoredSession();
      return null;
    }
    parsed.expires_at = Date.now() + SESSION_TTL_MS;
    localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    _clearStoredSession();
    return null;
  }
}

function _saveSession(sessionData) {
  SESSION = sessionData;
  _touchSession();
}

// ── NOMES DE LOJAS (populado dinamicamente) ───────────────────────────────────
var LOJA_NOMES = {};
var ADMIN_PREVIEW_COMPANIES = [];

function abrirAnaliseVendas() {
  SESSION = _readStoredSession();
  if (!SESSION || !SESSION.token) {
    _mostrarLogin();
    return;
  }
  if (SESSION.papel === 'cliente') {
    _abrirModuloPadrao();
    return;
  }
  abrirSeletorEmpresasCliente();
}

/** Abre o painel do cliente no módulo contratado (comercial e/ou financeiro). */
function _abrirModuloPadrao(empresaIdPreview) {
  if (typeof abrirModulo === 'function' && typeof moduloPadrao === 'function') {
    abrirModulo(moduloPadrao(), { empresaIdPreview: empresaIdPreview || null });
    return;
  }
  // Fallback defensivo: se js/modulos.js não carregou, mantém o comportamento antigo.
  _abrirDashCliente(empresaIdPreview);
}

function _adminPreviewEscape(value) {
  if (typeof escapeHtml === 'function') return escapeHtml(String(value == null ? '' : value));
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function abrirSeletorEmpresasCliente(force) {
  SESSION = _readStoredSession();
  if (!SESSION || !SESSION.token) {
    _mostrarLogin();
    return;
  }
  if (SESSION.papel !== 'super_admin') {
    _abrirModuloPadrao();
    return;
  }

  DC_ADMIN_PREVIEW = false;
  DC_ADMIN_PREVIEW_COMPANY = null;
  document.body.classList.remove('client-report-mode');
  document.body.classList.add('bpo-admin-mode');

  if (typeof financeiroDestruir === 'function') financeiroDestruir();
  if (typeof dreDestruir === 'function') dreDestruir();
  if (typeof MODULO_ATIVO !== 'undefined') MODULO_ATIVO = null;
  ['view-dash-cliente', 'view-dash-financeiro', 'view-dash-dre'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var sidebar = document.getElementById('sidebar');
  var wrapper = document.getElementById('cui-wrapper');
  if (sidebar) sidebar.style.display = 'flex';
  if (wrapper) wrapper.style.display = 'flex';
  if (typeof switchView === 'function') switchView('view-client-access');

  var breadcrumb = document.getElementById('breadcrumb-text');
  if (breadcrumb) breadcrumb.textContent = 'Análise de Vendas';
  document.querySelectorAll('.cui-nav-item').forEach(function(item) {
    item.classList.remove('active', 'is-active');
  });

  var grid = document.getElementById('admin-client-grid');
  var count = document.getElementById('admin-client-count');
  if (grid) {
    grid.innerHTML = '<div class="admin-client-loading"><span></span><strong>Carregando empresas ativas...</strong></div>';
  }
  if (count) count.textContent = 'Carregando empresas...';

  try {
    if (force || !ADMIN_PREVIEW_COMPANIES.length) {
      await _adminCarregarEmpresasMeta();
      ADMIN_PREVIEW_COMPANIES = (EMPRESAS_ADMIN || []).filter(function(empresa) {
        return empresa && empresa.empresa_id && empresa.ativo !== false;
      });
      ADMIN_PREVIEW_COMPANIES.forEach(function(empresa) {
        LOJA_NOMES[empresa.empresa_id] = empresa.nome || 'Empresa';
      });
    }
    renderEmpresasParaVisualizacao(ADMIN_PREVIEW_COMPANIES);
  } catch (error) {
    console.error('[ADMIN PREVIEW]', error);
    if (grid) {
      grid.innerHTML = '<div class="admin-client-empty"><strong>Não foi possível carregar as empresas.</strong><span>'
        + _adminPreviewEscape(error.message || 'Tente atualizar a lista.')
        + '</span></div>';
    }
    if (count) count.textContent = 'Falha ao carregar';
  }
}

function renderEmpresasParaVisualizacao(empresas) {
  var grid = document.getElementById('admin-client-grid');
  var count = document.getElementById('admin-client-count');
  if (!grid) return;

  var lista = Array.isArray(empresas) ? empresas : [];
  if (count) {
    count.textContent = lista.length + (lista.length === 1 ? ' empresa disponível' : ' empresas disponíveis');
  }
  if (!lista.length) {
    grid.innerHTML = '<div class="admin-client-empty"><strong>Nenhuma empresa ativa encontrada.</strong><span>Cadastre ou ative uma empresa no painel administrativo.</span></div>';
    return;
  }

  grid.innerHTML = lista.map(function(empresa) {
    var nome = empresa.nome || 'Empresa';
    var origem = String(empresa.exibir_origem || (empresa.tem_api ? 'api' : 'manual')).toLowerCase();
    var integracao = empresa.tem_api ? (empresa.sistema || 'API configurada') : 'Operação manual';
    var inicial = nome.trim().charAt(0).toUpperCase() || 'E';
    return '<article class="admin-client-card" data-company-name="' + _adminPreviewEscape(nome.toLowerCase()) + '">'
      + '<div class="admin-client-card-top">'
      + '<span class="admin-client-initial">' + _adminPreviewEscape(inicial) + '</span>'
      + '<span class="admin-client-status"><i></i>Ativa</span>'
      + '</div>'
      + '<div class="admin-client-card-copy">'
      + '<h2>' + _adminPreviewEscape(nome) + '</h2>'
      + '<p>Visualize indicadores, filtros e relatórios exatamente como aparecem para este cliente.</p>'
      + '</div>'
      + '<div class="admin-client-card-meta">'
      + '<span>' + _adminPreviewEscape(origem === 'api' ? 'Dados via API' : 'Dados manuais') + '</span>'
      + '<span>' + _adminPreviewEscape(integracao) + '</span>'
      + '</div>'
      + '<button type="button" class="admin-client-open" data-company-id="' + _adminPreviewEscape(empresa.empresa_id) + '">'
      + '<span>Abrir painel do cliente</span>'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M13 5l7 7-7 7"/></svg>'
      + '</button>'
      + '</article>';
  }).join('');

  grid.querySelectorAll('.admin-client-open').forEach(function(button) {
    button.addEventListener('click', function() {
      abrirPainelClienteAdmin(this.getAttribute('data-company-id'));
    });
  });
}

function filtrarEmpresasParaVisualizacao() {
  var input = document.getElementById('admin-client-search');
  var termo = input ? input.value.trim().toLowerCase() : '';
  var filtradas = ADMIN_PREVIEW_COMPANIES.filter(function(empresa) {
    return !termo || String(empresa.nome || '').toLowerCase().indexOf(termo) !== -1;
  });
  renderEmpresasParaVisualizacao(filtradas);
}

function abrirPainelClienteAdmin(empresaId) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  var empresa = ADMIN_PREVIEW_COMPANIES.find(function(item) {
    return item.empresa_id === empresaId;
  });
  if (!empresa) {
    var grid = document.getElementById('admin-client-grid');
    if (grid) {
      grid.insertAdjacentHTML('afterbegin', '<div class="admin-client-empty"><strong>Empresa não encontrada.</strong><span>Atualize a lista e tente novamente.</span></div>');
    }
    return;
  }

  DC_ADMIN_PREVIEW = true;
  DC_ADMIN_PREVIEW_COMPANY = empresa;
  DC_LOAD_SEQUENCE += 1;
  DC_ACTIVE_COMPANY = '';
  DC_IS_LOADING = false;
  DC_RAW = [];
  DC_DATA = [];
  Object.keys(DC_CHARTS || {}).forEach(function(key) {
    try { if (DC_CHARTS[key] && typeof DC_CHARTS[key].destroy === 'function') DC_CHARTS[key].destroy(); } catch (e) {}
    delete DC_CHARTS[key];
  });
  if (DC_ABORT_CONTROLLER) { try { DC_ABORT_CONTROLLER.abort(); } catch (e) {} DC_ABORT_CONTROLLER = null; }
  dcLoading(false);
  _abrirModuloPadrao(empresaId);
}

function dcVoltarAoAdmin() {
  if (!SESSION || SESSION.papel !== 'super_admin' || !DC_ADMIN_PREVIEW) return;
  DC_LOAD_SEQUENCE += 1;
  DC_ACTIVE_COMPANY = '';
  DC_IS_LOADING = false;
  DC_RAW = [];
  DC_DATA = [];
  dcLoading(false);
  Object.keys(DC_CHARTS || {}).forEach(function(key) {
    try {
      if (DC_CHARTS[key] && typeof DC_CHARTS[key].destroy === 'function') DC_CHARTS[key].destroy();
    } catch (e) {}
  });
  DC_CHARTS = {};
  DC_ADMIN_PREVIEW = false;
  DC_ADMIN_PREVIEW_COMPANY = null;
  abrirSeletorEmpresasCliente();
}

function _limparBlocosInstitucionaisAntigos() {
  var staleSelectors = [
    '.lp-hero-highlights',
    '.lp-hero-cta',
    '.lp-form-assurance',
    '.lp-service-icon-img'
  ];
  staleSelectors.forEach(function(selector) {
    document.querySelectorAll(selector).forEach(function(node) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
  });
}

function _normalizarTelaInicial() {
  var hero = document.querySelector('#view-login-page .lp-hero');
  if (hero) {
    hero.innerHTML = ''
      + '<div class="lp-hero-kicker">Plataforma SaaS · Multi-empresa</div>'
      + '<h1 class="lp-hero-title">Operação comercial<br/><span class="lp-hero-accent">com controle real</span></h1>'
      + '<p class="lp-hero-sub">Painel executivo para acompanhar vendas, mix de produtos, clientes, representantes e sincronizações por empresa — seguro e organizado.</p>'
      + '<div class="lp-form-wrap">'
      +   '<div class="lp-form-box">'
      +     '<div class="lp-form-chip">Ambiente corporativo RESUTE</div>'
      +     '<div class="lp-form-title">Acessar a plataforma</div>'
      +     '<div class="lp-form-sub">Entre com suas credenciais para abrir o painel e continuar o trabalho da empresa no mesmo ambiente.</div>'
      +     '<div class="lp-field">'
      +       '<label class="lp-label">E-mail</label>'
      +       '<input id="login-email" type="email" class="lp-input" placeholder="nome@empresa.com.br" autocomplete="username" />'
      +     '</div>'
      +     '<div class="lp-field">'
      +       '<label class="lp-label">Senha</label>'
      +       '<input id="login-senha" type="password" class="lp-input" placeholder="Digite sua senha" autocomplete="current-password" />'
      +     '</div>'
      +     '<div id="login-erro" class="lp-erro"></div>'
      +     '<button id="login-btn" class="lp-btn" onclick="fazerLogin()">'
      +       'Entrar'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16"><path d="M5 12h14M13 5l7 7-7 7"/></svg>'
      +     '</button>'
      +     '<div class="lp-footer">RESUTE · Gestao Comercial © 2026</div>'
      +   '</div>'
      + '</div>';
  }

  document.querySelectorAll('#lp-about-page .lp-service-icon-img').forEach(function(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  SESSION = null;
  dcLoading(false);
  _mostrarLogin();
});

function _mostrarLogin() {
  _normalizarTelaInicial();
  _limparBlocosInstitucionaisAntigos();
  var modal = document.getElementById('login-modal');
  if (modal) modal.style.display = 'none';
  var lp = document.getElementById('view-login-page');
  if (lp) lp.style.display = 'flex';
  var about = document.getElementById('lp-about-page');
  if (about) about.style.display = 'none';
  document.body.style.overflow = '';
  var sb = document.getElementById('sidebar');
  if (sb) sb.style.display = 'none';
  var wr = document.getElementById('cui-wrapper');
  if (wr) wr.style.display = 'none';
  var ov = document.getElementById('sidebar-overlay');
  if (ov) ov.classList.remove('active');
  var vc = document.getElementById('view-dash-cliente');
  if (vc) vc.style.display = 'none';
  document.body.classList.remove('client-report-mode');
  document.body.classList.remove('bpo-admin-mode');
  setTimeout(function(){
    var email = document.getElementById('login-email');
    if (email) email.focus();
  }, 100);
}

function fecharLogin() {
  // Fecha modal antigo (se existir)
  var m = document.getElementById('login-modal');
  if (m) m.style.display = 'none';
  // Esconde a página de login nova
  var lp = document.getElementById('view-login-page');
  if (lp) lp.style.display = 'none';
}

function abrirSaibaMaisResute() {
  var about = document.getElementById('lp-about-page');
  if (about) about.style.display = 'block';
  document.body.classList.add('lp-about-open');
  document.querySelectorAll('.lp-nav-more').forEach(function(btn) {
    btn.textContent = 'Voltar ao login';
  });
  document.body.style.overflow = 'hidden';
}

function fecharSaibaMaisResute() {
  var about = document.getElementById('lp-about-page');
  if (about) about.style.display = 'none';
  document.body.classList.remove('lp-about-open');
  document.querySelectorAll('.lp-nav-more').forEach(function(btn) {
    btn.textContent = 'Saiba mais';
  });
  document.body.style.overflow = '';
}

function alternarSaibaMaisResute(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (document.body.classList.contains('lp-about-open')) {
    fecharSaibaMaisResute();
  } else {
    abrirSaibaMaisResute();
  }
}

function _loginModalVisivel() {
  var modal = document.getElementById('login-modal');
  return !!(modal && modal.style.display !== 'none');
}

function _loginCampo(mainId, modalId) {
  if (_loginModalVisivel()) {
    var modalEl = document.getElementById(modalId);
    if (modalEl) return modalEl;
  }
  return document.getElementById(mainId);
}

async function fazerLogin() {
  var emailEl = _loginCampo('login-email', 'login-modal-email');
  var senhaEl = _loginCampo('login-senha', 'login-modal-senha');
  var erro  = _loginCampo('login-erro', 'login-modal-erro');
  var btn   = _loginCampo('login-btn', 'login-modal-btn');
  var email = emailEl ? emailEl.value.trim() : '';
  var senha = senhaEl ? senhaEl.value : '';

  if (erro) erro.textContent = '';
  if (!email || !senha) {
    if (erro) erro.textContent = 'Preencha email e senha.';
    return;
  }
  if (btn) btn.disabled = true;
  if (btn) btn.innerHTML = '<span class="auth-spin">⟳</span> Entrando...';

  try {
    // Login via proxy seguro (/api/login) — chaves ficam no servidor
    var r = await NATIVE_FETCH('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: senha })
    });
    var d = await r.json();
    if (!r.ok || !d.token) throw new Error(d.erro || 'Email ou senha incorretos.');

    // Proxy já retorna dados do usuário — não precisa segunda chamada
    var empresaIds = d.empresa_ids;
    if (empresaIds && typeof empresaIds === 'string') {
      try { empresaIds = JSON.parse(empresaIds); } catch(e2) { empresaIds = null; }
    }

    SESSION = {
      token:       d.token,
      nome:        d.nome || email,
      email:       email.toLowerCase(),
      papel:       d.papel || 'cliente',
      empresa_id:  d.empresa_id || null,
      empresa_ids: empresaIds || (d.empresa_id ? [d.empresa_id] : null),
      empresa_nome:d.empresa_nome || 'RESUTE',
      empresa_slug:d.empresa_slug || null,
      empresa_codigo:d.empresa_codigo || null,
      // Módulos SaaS contratados. Só orientam a UI — o gate real é a RLS +
      // o secure-proxy. Ver o aviso no topo de js/modulos.js.
      modulos:     Array.isArray(d.modulos) && d.modulos.length ? d.modulos : ['comercial'],
      modulo_padrao: d.modulo_padrao || 'comercial'
    };
    _saveSession(SESSION);
    fecharLogin();
    _abrirApp();

  } catch(e) {
    console.error('Login erro:', e);
    if (erro) erro.textContent = e.message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Entrar <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
    }
  }
}


function fazerLogout() {
  SESSION = null; EMPRESAS = [];
  _clearStoredSession();
  if (DC_ABORT_CONTROLLER) { try { DC_ABORT_CONTROLLER.abort(); } catch (e) {} DC_ABORT_CONTROLLER = null; }
  DC_LOAD_SEQUENCE += 1;
  DC_ACTIVE_COMPANY = '';
  DC_IS_LOADING = false;
  DC_RAW = [];
  DC_DATA = [];
  DC_ADMIN_PREVIEW = false;
  DC_ADMIN_PREVIEW_COMPANY = null;
  ADMIN_PREVIEW_COMPANIES = [];
  dcLoading(false);
  if (typeof switchView === 'function') switchView('view-home');
  ['sync-area','header-user','sidebar-user'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (typeof resetarModulos === 'function') resetarModulos();
  ['view-dash-cliente', 'view-dash-financeiro', 'view-dash-dre'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  _mostrarLogin();
}

function _abrirApp() {
  _touchSession();
  if (typeof dreFechar === 'function') dreFechar();
  ['view-dash-cliente', 'view-dash-financeiro', 'view-dash-dre'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var ov = document.getElementById('sidebar-overlay');
  if (ov) ov.classList.remove('active');
  document.body.classList.remove('client-report-mode');
  document.body.classList.remove('bpo-admin-mode');

  // Sempre esconde a login page primeiro
  var lp = document.getElementById('view-login-page');
  if (lp) lp.style.display = 'none';

  // Cliente → painel executivo do módulo contratado
  if (SESSION.papel === 'cliente') {
    _abrirModuloPadrao();
    return;
  }

  document.body.classList.add('bpo-admin-mode');

  // Super admin → mostra sidebar e wrapper
  var sb = document.getElementById('sidebar');     if (sb) sb.style.display = 'flex';
  var wr = document.getElementById('cui-wrapper'); if (wr) wr.style.display = 'flex';

  var campos = {
    'user-nome': SESSION.nome, 'user-empresa': 'RESUTE Admin',
    'sidebar-user-nome': SESSION.nome, 'sidebar-user-empresa': 'RESUTE Admin'
  };
  Object.keys(campos).forEach(function(id){
    var el = document.getElementById(id); if (el) el.textContent = campos[id];
  });
  ['header-user','sidebar-user'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.style.display = 'flex';
  });
  // Esconde o botão Sincronizar do header (cada empresa tem o seu)
  var syncArea = document.getElementById('sync-area');
  if (syncArea) syncArea.style.display = 'none';

  var adminNav = document.querySelector('.admin-console-nav');
  if (adminNav) adminNav.style.display = SESSION.papel === 'super_admin' ? '' : 'none';

  if (SESSION.papel === 'super_admin' && typeof adminConsoleAbrir === 'function') {
    adminConsoleAbrir('overview');
    if (typeof adminConsoleInicializar === 'function') adminConsoleInicializar();
  } else {
    if (typeof switchView === 'function') switchView('view-app');
    if (typeof adminInicializar === 'function') adminInicializar();
  }
}

// ── PERMISSÕES — Cliente vê só relatórios ────────────────────────────────────
function _aplicarPermissoes() {
  if (!SESSION) return;
  var ehCliente = SESSION.papel === 'cliente';

  // Esconde botão "BD & CADASTROS" para clientes
  var btnsBd = document.querySelectorAll('[onclick="avShowBD()"]');
  btnsBd.forEach(function(b){ b.style.display = ehCliente ? 'none' : ''; });

  // Esconde botão "Processar" (manual) para clientes
  var btnsProc = document.querySelectorAll('[onclick="jssProcess()"]');
  btnsProc.forEach(function(b){ b.style.display = ehCliente ? 'none' : ''; });

  // Esconde botão "Colar por Coluna" para clientes
  var btnsCol = document.querySelectorAll('[onclick^="lgOpenColModal"]');
  btnsCol.forEach(function(b){ b.style.display = ehCliente ? 'none' : ''; });

  // Esconde botão "Limpar" do BD
  var btnsClear = document.querySelectorAll('[onclick^="jssClearGrid"]');
  btnsClear.forEach(function(b){ b.style.display = ehCliente ? 'none' : ''; });

  // Esconde área de BD se cliente acidentalmente entrar
  if (ehCliente) {
    var bdArea = document.getElementById('av-bd-area');
    if (bdArea) bdArea.style.display = 'none';
  }
}

// ── CARREGA EMPRESAS COM API ─────────────────────────────────────────────────
async function _carregarEmpresasComAPI() {
  _setStatus('⏳ Carregando empresas...', '');
  try {
    var eR = await fetch(SUPA_URL + '/rest/v1/empresas?select=*&ativo=eq.true', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    });
    var empresas = await eR.json();

    var aR = await fetch(SUPA_URL + '/rest/v1/api_config?select=empresa_id,sistema,api_url&ativo=eq.true', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    });
    var apiConfigs = await aR.json();

    EMPRESAS = (empresas || []).map(function(emp) {
      var api = (apiConfigs || []).find(function(a){ return a.empresa_id === emp.id; });
      var origem = String(emp.exibir_origem || 'manual').toLowerCase();
      var temApi = !!api && origem === 'api';
      if (!temApi) return null;
      return Object.assign({}, emp, {
        empresa_id: emp.id || emp.empresa_id,
        nome: emp.nome,
        slug: emp.slug,
        sistema: api.sistema || 'api',
        api_url: api.api_url || ''
      });
    }).filter(Boolean);

    // Cliente: filtra só a empresa dele
    var lista = EMPRESAS;
    if (SESSION.papel !== 'super_admin' && SESSION.empresa_id) {
      lista = EMPRESAS.filter(function(e){ return e.empresa_id === SESSION.empresa_id; });
    }

    var sel = document.getElementById('sync-empresa-select');

    if (!lista.length) {
      if (sel) sel.style.display = 'none';
      _setStatus('⚠ Sem empresa com API configurada.', '');
      return;
    }

    if (sel) {
      if (lista.length === 1) {
        sel.style.display = 'none';
        sel.innerHTML = '<option value="'+lista[0].empresa_id+'">'+lista[0].nome+'</option>';
        sel.value = lista[0].empresa_id;
        _setStatus('✓ ' + lista[0].nome + ' — clique Sincronizar', 'ok');
        await carregarDadosDoSupabase(lista[0].empresa_id);
      } else {
        sel.style.display = 'block';
        sel.innerHTML = '<option value="">— Selecione a empresa —</option>';
        lista.forEach(function(e) {
          sel.innerHTML += '<option value="'+e.empresa_id+'">'+e.nome+'</option>';
        });
        sel.onchange = function() { if (sel.value) carregarDadosDoSupabase(sel.value); };
      }
    }
  } catch(e) {
    console.error(e);
    _setStatus('✗ ' + e.message, 'erro');
  }
}

// ── SINCRONIZAR API ───────────────────────────────────────────────────────────
async function sincronizarAPI() {
  var empresa_id = null;
  var sel = document.getElementById('sync-empresa-select');
  if (sel && sel.value) empresa_id = sel.value;
  else if (SESSION.empresa_id) empresa_id = SESSION.empresa_id;
  else if (EMPRESAS.length === 1) empresa_id = EMPRESAS[0].empresa_id;

  if (!empresa_id) { _setStatus('⚠ Selecione uma empresa.', ''); return; }

  var emp = EMPRESAS.find(function(e){ return e.empresa_id === empresa_id; }) || { nome: 'Empresa' };
  var btn = document.getElementById('btn-sync');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spin">⟳</span> Sincronizando...'; }

  try {
    var logR = await fetch(
      SUPA_URL + '/rest/v1/sync_log?empresa_id=eq.' + empresa_id + '&select=ultima_data',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    var logD = await logR.json();
    var ultima = (logD && logD[0] && logD[0].ultima_data)
      ? new Date(logD[0].ultima_data).toLocaleDateString('pt-BR') : 'nunca';
    _setStatus('⏳ ' + emp.nome + ' — último sync: ' + ultima, '');

    // TODO: substituir edge function por dispatcher genérico quando outros sistemas forem integrados
    var r = await fetch(SUPA_URL + '/functions/v1/sync-visual-saef', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SVC_KEY },
      body: JSON.stringify({ empresa_id: empresa_id })
    });
    var d = await r.json();
    if (!r.ok || d.erro) throw new Error(d.erro || 'Erro na sincronização.');

    _setStatus('✓ ' + (d.mensagem || d.novos + ' registros importados'), 'ok');
    if ((d.novos || 0) > 0) await carregarDadosDoSupabase(empresa_id);

  } catch(e) {
    console.error(e);
    _setStatus('✗ ' + e.message, 'erro');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg> Sincronizar';
    }
  }
}

// ── CARREGA DADOS → BD_DATA → RELATÓRIOS ─────────────────────────────────────
async function carregarDadosDoSupabase(empresa_id) {
  if (!empresa_id) return;
  _setStatus('⏳ Carregando dados...', '');
  try {
    var r = await fetch(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + empresa_id + '&select=*&order=dt_saida.asc',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    var vendas = await r.json();
    if (!Array.isArray(vendas) || !vendas.length) {
      dcLimparPainelVazio('Nenhum dado disponivel ainda', 'Sincronize a API no painel admin ou confirme se a empresa esta configurada para exibir API.');
      dcLoading(false);
      _setStatus('⚠ Sem dados no banco. Clique Sincronizar.', '');
      return;
    }

    var rows = vendas.map(function(v) {
      return [
        v.id_externo||'', v.num_pedido||'', v.produto||'', String(v.qtd||''),
        v.dt_emissao||'', v.dt_saida||'', String(v.valor||''),
        v.vendedor||'', v.industria||'', v.cliente||'',
        v.ano?String(v.ano):'', v.mes||'', v.grupo||'', v.semana||'',
        v.tipo_mercado||'', v.setor||'', v.cidade||'', v.uf||'',
        v.tipo_vendedor||'', '', '', '', '',
        v.empresa_nome||'', v.cnpj||'', v.grupo_produto||'', v.grupo_pai||'',
        v.subgrupo||'', v.marca||'', v.familia||'', v.classes||''
      ];
    });

    BD_DATA.headers = ['ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída',
      'VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM',
      'tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra',
      'NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto','GRUPO PAI',
      'subgrupo_produto','marca','familia_produto','classes'];
    BD_DATA.rows = rows; BD_DATA.count = rows.length;
    if (typeof FULL_DATA !== 'undefined') FULL_DATA.bd = rows;

    try { bdMapColumns(); }    catch(e){ console.error(e); }
    try { bdAutoFill(); }      catch(e){ console.error(e); }
    try { bdUpdateAllTabs(); } catch(e){ console.error(e); }

    // Salva automaticamente no Supabase após carregar dados da API
    // (dados manuais usam o botão "Salvar no Banco" separado)

    if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
      GRIDS.bd.allData = rows; GRIDS.bd.filtered = null;
      GRIDS.bd.page = 0; GRIDS.bd._render();
    }

    _setStatus('✓ ' + rows.length.toLocaleString('pt-BR') + ' vendas carregadas!', 'ok');

    // Se cliente → abre relatórios automaticamente
    if (SESSION && SESSION.papel === 'cliente') {
      setTimeout(function(){
        if (typeof avShowRel === 'function') avShowRel('relat-produtos');
      }, 300);
    }
  } catch(e) {
    console.error(e);
    _setStatus('✗ ' + e.message, 'erro');
  }
}

// ── SALVAR DADOS MANUAIS NO SUPABASE ─────────────────────────────────────────
async function salvarDadosManuaisNoSupabase(silent) {
  if (!SESSION || SESSION.papel !== 'super_admin') {
    alert('Apenas super_admin pode salvar dados manualmente.');
    return;
  }
  var sel = document.getElementById('sync-empresa-select');
  var empresa_id = (sel && sel.value) || (EMPRESAS[0] && EMPRESAS[0].empresa_id);
  if (!empresa_id) { alert('Selecione uma empresa.'); return; }

  var rows = (typeof FULL_DATA !== 'undefined' && FULL_DATA.bd) ? FULL_DATA.bd : [];
  rows = rows.filter(function(r){ return r && r.some(function(c){ return c!==''&&c!==null; }); });
  if (!rows.length) { alert('Sem dados para salvar. Cole no BD primeiro.'); return; }

  _setStatus('⏳ Salvando ' + rows.length + ' linhas no Supabase...', '');

  // Converte rows → registros do Supabase
  var registros = rows.map(function(r) {
    return {
      empresa_id:    empresa_id,
      id_externo:    'manual_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
      num_pedido:    r[1] || null,
      produto:       r[2] || null,
      qtd:           parseFloat(r[3]) || null,
      dt_emissao:    r[4] || null,
      dt_saida:      r[5] || null,
      valor:         parseFloat(String(r[6]).replace(',','.')) || null,
      vendedor:      r[7] || null,
      industria:     r[8] || null,
      cliente:       r[9] || null,
      ano:           parseInt(r[10]) || null,
      mes:           r[11] || null,
      grupo:         r[12] || null,
      cidade:        r[16] || null,
      uf:            r[17] || null,
      empresa_nome:  r[23] || null,
      cnpj:          r[24] || null,
      marca:         r[28] || null
    };
  });

  try {
    // Upload em lotes de 500
    var lote = 500;
    for (var i = 0; i < registros.length; i += lote) {
      var batch = registros.slice(i, i + lote);
      var r = await fetch(SUPA_URL + '/rest/v1/vendas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + SVC_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(batch)
      });
      if (!r.ok) {
        var err = await r.text();
        throw new Error('Erro ao salvar: ' + err.slice(0, 200));
      }
      _setStatus('⏳ ' + Math.min(i + lote, registros.length) + '/' + registros.length + ' salvos...', '');
    }
    _setStatus('✓ ' + registros.length + ' linhas salvas no banco!', 'ok');
    if (!silent) alert('✅ ' + registros.length + ' linhas salvas no Supabase!');
  } catch(e) {
    console.error(e);
    _setStatus('✗ ' + e.message, 'erro');
    if (!silent) alert('❌ Erro ao salvar: ' + e.message);
  }
}

function _setStatus(msg, tipo) {
  var el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'cui-sync-status' + (tipo ? ' sync-' + tipo : '');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var modal = document.getElementById('login-modal');
    var loginPage = document.getElementById('view-login-page');
    if ((modal && modal.style.display !== 'none') || (loginPage && loginPage.style.display !== 'none')) fazerLogin();
  }
});

// ── DASHBOARD CLIENTE (unido aqui para evitar 404) ──────────────────────────
var DC_DATA  = [];  // dados filtrados
var DC_RAW   = [];  // todos os dados do banco
var DC_CHARTS = {}; // instâncias Chart.js
var DC_LOAD_SEQUENCE = 0;
var DC_ACTIVE_COMPANY = '';
var DC_LOADING_TIMER = null;
var DC_IS_LOADING = false;
var DC_ADMIN_PREVIEW = false;
var DC_ADMIN_PREVIEW_COMPANY = null;
var DC_ABORT_CONTROLLER = null; // cancela fetches obsoletos ao trocar empresa
var DC_CLI_CAD_TOTAL = null;    // total de clientes cadastrados (clientes_cad)
var DC_PROD_TOTAL    = null;    // total de produtos cadastrados (produtos)
var DC_REP_TOTAL     = null;    // total de representantes cadastrados (representantes)
var DC_CLI_LISTA     = [];      // nomes de todos os clientes do cadastro (clientes_cad)
var DC_REP_LISTA     = [];      // nomes de todos os representantes do cadastro (representantes)

var MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
var MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── ABRE O DASHBOARD ──────────────────────────────────────────────────────────
function _abrirDashCliente(empresaIdPreview) {
  var previewAdmin = SESSION && SESSION.papel === 'super_admin' && !!empresaIdPreview;
  var empresaPreview = previewAdmin
    ? (ADMIN_PREVIEW_COMPANIES || []).find(function(item) { return item.empresa_id === empresaIdPreview; })
    : null;
  DC_ADMIN_PREVIEW = previewAdmin;
  DC_ADMIN_PREVIEW_COMPANY = empresaPreview || null;
  if (typeof MODULOS !== 'undefined') MODULO_ATIVO = MODULOS.COMERCIAL;
  var vf = document.getElementById('view-dash-financeiro');
  if (vf) vf.style.display = 'none';
  // dreFechar desmonta o HTML do DRE: os ids sao os mesmos do painel financeiro.
  if (typeof dreFechar === 'function') dreFechar();
  document.body.classList.remove('bpo-admin-mode');
  // Esconde login page e layout admin
  var lp = document.getElementById('view-login-page');
  if (lp) lp.style.display = 'none';
  ['sidebar','cui-wrapper'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var ov = document.getElementById('sidebar-overlay');
  if (ov) ov.classList.remove('active');

  // Mostra dashboard
  var vc = document.getElementById('view-dash-cliente');
  if (vc) vc.style.display = 'flex';

  // Seletor de módulos (só aparece quando a empresa contratou mais de um)
  if (typeof renderizarSeletorModulos === 'function') renderizarSeletorModulos();

  // Multi-loja: monta seletor se houver mais de uma empresa
  var ids = previewAdmin ? [empresaIdPreview] : SESSION.empresa_ids;
  var sel = document.getElementById('dc-loja-selector');
  var logo = document.querySelector('.dc-client-logo');
  var eidAtual = (ids && ids[0]) || SESSION.empresa_id;
  var botaoVoltar = document.getElementById('dc-admin-back');
  var previewBadge = document.getElementById('dc-admin-preview-badge');
  if (botaoVoltar) botaoVoltar.style.display = previewAdmin ? 'inline-flex' : 'none';
  if (previewBadge) previewBadge.style.display = previewAdmin ? 'inline-flex' : 'none';
  if (logo) {
    var eObj = empresaPreview
      || (ADMIN_PREVIEW_COMPANIES || []).find(function(e){ return e.empresa_id === eidAtual; })
      || (EMPRESAS_ADMIN || []).find(function(e){ return e.empresa_id === eidAtual; });
    var logoSrc = (eObj && eObj.logo_url)
      || ((eObj && eObj.slug) ? 'assets/' + eObj.slug + '-logo.png' : null)
      || ((SESSION && SESSION.empresa_slug) ? 'assets/' + SESSION.empresa_slug + '-logo.png' : null);
    if (logoSrc) {
      logo.src = logoSrc;
      logo.alt = eObj ? (eObj.nome || '') : '';
      logo.style.display = '';
      logo.onerror = function() { this.style.display = 'none'; };
    } else {
      logo.removeAttribute('src');
      logo.style.display = 'none';
    }
  }

  if (ids && ids.length > 1) {
    // Renderiza botões de loja
    if (sel) {
      sel.innerHTML = ids.map(function(id) {
        return '<button class="dc-loja-btn" data-id="' + id + '">'
             + (LOJA_NOMES[id] || id.slice(0, 8))
             + '</button>';
      }).join('');
      sel.style.display = 'flex';
      sel.querySelectorAll('.dc-loja-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { dcSelecionarLoja(this.dataset.id); });
      });
    }
    // Carrega a primeira loja por padrão
    dcSelecionarLoja(ids[0]);
  } else {
    // Loja única
    if (sel) sel.style.display = 'none';
    var eid = (ids && ids[0]) || SESSION.empresa_id;
    var badge = document.getElementById('dc-empresa');
    if (badge) {
      badge.textContent = (empresaPreview && empresaPreview.nome)
        || LOJA_NOMES[eid]
        || SESSION.empresa_nome
        || 'Empresa';
    }
    if (eid) dcCarregarDados(eid);
    else dcStatus('⚠ Empresa não configurada.');
  }

  // Botão de sync/atualizar no header do dashboard
  var atualizarBtn = document.getElementById('dc-btn-atualizar');
  var atualizarLabel = document.getElementById('dc-btn-atualizar-label');
  if (atualizarBtn) {
    atualizarBtn.style.display = 'inline-flex';
    if (atualizarLabel) {
      atualizarLabel.textContent = (previewAdmin && empresaPreview && empresaPreview.tem_api)
        ? 'Sincronizar' : 'Atualizar';
    }
  }
}

async function dcSincronizarOuAtualizar() {
  var btn = document.getElementById('dc-btn-atualizar');
  var label = document.getElementById('dc-btn-atualizar-label');
  if (btn) btn.disabled = true;
  try {
    if (DC_ADMIN_PREVIEW && DC_ADMIN_PREVIEW_COMPANY) {
      var empresa = DC_ADMIN_PREVIEW_COMPANY;
      if (empresa.tem_api && typeof adminSincronizar === 'function') {
        EMPRESA_ATIVA = empresa;
        await adminSincronizar();
        DC_ACTIVE_COMPANY = '';
        await dcCarregarDados(empresa.empresa_id);
      } else {
        DC_ACTIVE_COMPANY = '';
        await dcCarregarDados(empresa.empresa_id);
      }
    } else {
      var eid = SESSION && SESSION.empresa_id;
      if (eid) { DC_ACTIVE_COMPANY = ''; await dcCarregarDados(eid); }
    }
  } catch(e) {
    dcStatus('✗ ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── CARREGA DADOS DO SUPABASE ─────────────────────────────────────────────────

function cliAba(btn, id) {
  // Remove active de todas as abas
  var tabs = document.querySelectorAll('.dc-tab');
  tabs.forEach(function(t) { t.classList.remove('active'); });
  // Esconde todos os painéis
  var panes = document.querySelectorAll('.dc-pane');
  panes.forEach(function(p) { p.classList.remove('active'); p.style.display = 'none'; });
  // Ativa aba e painel clicados
  if (btn) btn.classList.add('active');
  var pane = document.getElementById(id);
  if (pane) { pane.classList.add('active'); pane.style.display = 'block'; }
}

// =============================================================================
// PAGINAÇÃO — busca TODOS os registros do Supabase em lotes de 1000
// =============================================================================
async function _fetchAll(baseUrl, headers, signal) {
  var all = [];
  var from = 0;
  var pageSize = 1000;
  var tentativas = 0;
  var maxPaginas = 200; // limite de segurança: 200k registros
  var esperas = 0;
  var maxEsperas = 3;   // repetições após 429 antes de desistir

  while (tentativas < maxPaginas) {
    var fetchOpts = {
      headers: Object.assign({}, headers, {
        'Range': from + '-' + (from + pageSize - 1),
        'Range-Unit': 'items'
      })
    };
    if (signal) fetchOpts.signal = signal;

    var r = await fetch(baseUrl, fetchOpts);

    // 429 = rate limit do secure-proxy. Carregar 50k+ registros gasta dezenas
    // de requisições; se o usuário recarregar o painel duas vezes no mesmo
    // minuto, o teto estoura no meio da paginação. Espera e repete a mesma
    // página em vez de devolver dado pela metade.
    if (r.status === 429) {
      if (esperas >= maxEsperas) {
        throw new Error('O servidor limitou as requisições. Aguarde 1 minuto e atualize a página.');
      }
      esperas++;
      var segundos = parseInt(r.headers.get('retry-after') || '0', 10) || (5 * esperas);
      console.warn('[fetchAll] 429 na página ' + tentativas + ' — repetindo em ' + segundos + 's');
      if (typeof dcStatus === 'function') {
        dcStatus('⏳ Limite de requisições atingido. Retomando em ' + segundos + 's...');
      }
      await new Promise(function(resolve) { setTimeout(resolve, segundos * 1000); });
      continue; // repete a MESMA página, sem avançar o offset
    }

    if (!r.ok && r.status !== 206) {
      // Antes isto era um `break` silencioso: o painel mostrava os registros
      // já baixados como se fossem o total, ou nada, sem explicar o motivo.
      console.error('[fetchAll] Erro HTTP', r.status, 'na página', tentativas);
      throw new Error('Falha ao carregar os registros (HTTP ' + r.status + ')'
        + (all.length ? ' após ' + all.length.toLocaleString('pt-BR') + ' registros.' : '.'));
    }

    var batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;

    all = all.concat(batch);
    tentativas++;

    // Se veio menos que pageSize, chegou ao fim
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  if (tentativas >= maxPaginas) {
    console.warn('[fetchAll] Limite de ' + maxPaginas + ' páginas atingido (' + all.length + ' registros). Empresa pode ter mais de 200k registros — dados parciais.');
    if (typeof toast === 'function') {
      toast('⚠ Carregamento parcial: mais de 200k registros. Entre em contato com o suporte.', 'warn', 8000);
    }
  }

  return all;
}

function dcComTimeout(promise, timeoutMs, mensagem) {
  var timer;
  return Promise.race([
    promise,
    new Promise(function(_, reject) {
      timer = setTimeout(function() {
        reject(new Error(mensagem || 'Tempo limite excedido ao carregar os dados.'));
      }, timeoutMs);
    })
  ]).finally(function() {
    clearTimeout(timer);
  });
}

function dcPreencherFiltroAnos(rows) {
  var vendas = Array.isArray(rows) ? rows : [];
  var anos = [...new Set(vendas.map(function(v){
    var data = dcDataValor(v);
    return data ? data.getFullYear() : parseInt(v.ano, 10);
  }).filter(Boolean))].sort();
  var selAno = document.getElementById('dc-filtro-ano');
  if (selAno) {
    selAno.innerHTML = '<option value="0">Todos os anos</option>';
    anos.forEach(function(a){ selAno.innerHTML += '<option value="'+a+'">'+a+'</option>'; });
  }
}

function _dcAtualizarKpiCard(label, total) {
  var kEl = document.getElementById('dc-kpis');
  if (!kEl) return;
  kEl.querySelectorAll('.dc-kpi-card').forEach(function(card) {
    var lbl = card.querySelector('.dc-kpi-label');
    var val = card.querySelector('.dc-kpi-value');
    if (lbl && val && lbl.textContent.trim() === label) {
      val.textContent = total.toLocaleString('pt-BR');
    }
  });
}

async function _dcFetchRepresentantesLista(eid) {
  DC_REP_LISTA = [];
  var from = 0, pageSize = 1000, pages = 0;
  while (pages < 10) {
    var resp = await fetch(
      SUPA_URL + '/rest/v1/representantes?empresa_id=eq.' + encodeURIComponent(eid) + '&select=nome&order=nome.asc',
      { headers: { 'Range': from + '-' + (from + pageSize - 1) } }
    );
    if (!resp.ok && resp.status !== 206) break;
    var batch = await resp.json();
    if (!Array.isArray(batch) || !batch.length) break;
    batch.forEach(function(item) {
      var n = String(item.nome || '').trim().toUpperCase();
      if (n) DC_REP_LISTA.push(n);
    });
    pages++;
    if (batch.length < pageSize) break;
    from += pageSize;
  }
}

async function _dcFetchClientesLista(eid) {
  DC_CLI_LISTA = [];
  var from = 0, pageSize = 1000, pages = 0;
  while (pages < 10) {
    var resp = await fetch(
      SUPA_URL + '/rest/v1/clientes_cad?empresa_id=eq.' + encodeURIComponent(eid) + '&select=nome,razao_social&order=nome.asc',
      { headers: { 'Range': from + '-' + (from + pageSize - 1) } }
    );
    if (!resp.ok && resp.status !== 206) break;
    var batch = await resp.json();
    if (!Array.isArray(batch) || !batch.length) break;
    batch.forEach(function(item) {
      var n = String(item.nome || item.razao_social || '').trim().toUpperCase();
      if (n) DC_CLI_LISTA.push(n);
    });
    pages++;
    if (batch.length < pageSize) break;
    from += pageSize;
  }
}

async function _dcFetchCadastroCount(tabela, eid) {
  try {
    var resp = await fetch(
      SUPA_URL + '/rest/v1/' + tabela + '?empresa_id=eq.' + encodeURIComponent(eid) + '&select=id',
      { headers: { 'Prefer': 'count=exact', 'Range': '0-0' } }
    );
    var range = resp.headers.get('content-range');
    if (range && range.includes('/')) {
      var total = parseInt(range.split('/')[1], 10);
      return Number.isFinite(total) && total >= 0 ? total : null;
    }
  } catch (e) {}
  return null;
}

async function _dcCarregarTotaisCadastros(eid) {
  DC_CLI_CAD_TOTAL = null;
  DC_PROD_TOTAL    = null;
  DC_REP_TOTAL     = null;
  var results = await Promise.all([
    _dcFetchCadastroCount('clientes_cad',  eid),
    _dcFetchCadastroCount('produtos',       eid),
    _dcFetchCadastroCount('representantes', eid)
  ]);
  if (results[0] !== null) { DC_CLI_CAD_TOTAL = results[0]; _dcAtualizarKpiCard('Clientes',        results[0]); }
  if (results[1] !== null) { DC_PROD_TOTAL    = results[1]; _dcAtualizarKpiCard('Produtos',         results[1]); }
  if (results[2] !== null) { DC_REP_TOTAL     = results[2]; _dcAtualizarKpiCard('Representantes',   results[2]); }
  _dcFetchClientesLista(eid).then(function() {
    _dcTabelaTicketCliente();
    dcTabelaInativos();
    _dcTabelaNovosClientes();
  }).catch(function(){});
  _dcFetchRepresentantesLista(eid).then(function() { _dcTabelaPositivacao(); }).catch(function(){});
}

function dcAplicarVendasCarregadas(vendas) {
  DC_RAW = Array.isArray(vendas) ? vendas : [];
  dcPreencherFiltroAnos(DC_RAW);
  dcDefinirPeriodoInicial(DC_RAW);
  if (DC_ACTIVE_COMPANY) _dcCarregarTotaisCadastros(DC_ACTIVE_COMPANY).catch(function(){});
  dcAplicarFiltro();
}

async function dcTentarSnapshotCliente(eid, origem) {
  if (!window.ReportCache) return null;
  var cache = await window.ReportCache.getLatest(eid, 'dashboard_cliente', window.ReportCache.cacheKey(origem));
  if (!cache || !cache.dados || !Array.isArray(cache.dados.vendas) || !cache.dados.vendas.length) return null;
  return cache;
}

// ── IndexedDB cache (sem limite de tamanho, leitura ~10ms) ────────────────────
var _DC_IDB_NAME = 'resute_dc';
var _DC_IDB_STORE = 'cache';

function _dcIdbOpen() {
  return new Promise(function(resolve) {
    try {
      var req = indexedDB.open(_DC_IDB_NAME, 1);
      req.onupgradeneeded = function(e) {
        try { e.target.result.createObjectStore(_DC_IDB_STORE); } catch (_e) {}
      };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function() { resolve(null); };
    } catch (e) { resolve(null); }
  });
}

async function _dcIdbGet(key) {
  var db = await _dcIdbOpen();
  if (!db) return null;
  return new Promise(function(resolve) {
    try {
      var tx = db.transaction(_DC_IDB_STORE, 'readonly');
      var req = tx.objectStore(_DC_IDB_STORE).get(key);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { resolve(null); };
    } catch (e) { resolve(null); }
  });
}

async function _dcIdbSet(key, value) {
  var db = await _dcIdbOpen();
  if (!db) return;
  return new Promise(function(resolve) {
    try {
      var tx = db.transaction(_DC_IDB_STORE, 'readwrite');
      tx.objectStore(_DC_IDB_STORE).put(value, key);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { resolve(); };
    } catch (e) { resolve(); }
  });
}

async function _dcIdbDelete(key) {
  var db = await _dcIdbOpen();
  if (!db) return;
  return new Promise(function(resolve) {
    try {
      var tx = db.transaction(_DC_IDB_STORE, 'readwrite');
      tx.objectStore(_DC_IDB_STORE).delete(key);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { resolve(); };
    } catch (e) { resolve(); }
  });
}
// ─────────────────────────────────────────────────────────────────────────────

var _DC_SLIM_FIELDS = ['id_externo','num_pedido','produto','qtd','dt_emissao','dt_saida',
  'valor','vendedor','industria','cliente','grupo','grupo_produto','marca','familia',
  'uf','cidade','ano','mes'];

function _dcSlimVenda(v) {
  var out = {};
  _DC_SLIM_FIELDS.forEach(function(k) {
    if (v[k] !== undefined && v[k] !== null && v[k] !== '') out[k] = v[k];
  });
  return out;
}

async function dcSalvarSnapshotCliente(eid, origem, vendas, periodoInicio, periodoFim) {
  if (!window.ReportCache || !eid || !Array.isArray(vendas) || !vendas.length) return false;
  var slim = vendas.map(_dcSlimVenda);
  return window.ReportCache.save({
    empresa_id: eid,
    tipo: 'dashboard_cliente',
    cache_key: window.ReportCache.cacheKey(origem),
    origem: origem || 'manual',
    periodo_inicio: periodoInicio || null,
    periodo_fim: periodoFim || null,
    total_registros: slim.length,
    dados: {
      vendas: slim,
      origem: origem || 'manual',
      total_registros: slim.length,
      gerado_em: new Date().toISOString()
    }
  });
}

async function _dcAtualizarCacheBackground(eid, lsKey, localGeradoEm, loadSequence) {
  try {
    var snap = window.ReportCache
      ? await window.ReportCache.getLatest(eid, 'dashboard_cliente', null)
      : null;
    if (loadSequence !== DC_LOAD_SEQUENCE || eid !== DC_ACTIVE_COMPANY) return;
    if (!snap || !snap.dados || !Array.isArray(snap.dados.vendas) || !snap.dados.vendas.length) return;
    var remoteEm = snap.dados.gerado_em || '';
    if (remoteEm <= (localGeradoEm || '')) return;
    var novas = snap.dados.vendas;
    _dcIdbSet(lsKey, { gerado_em: remoteEm, vendas: novas });
    DC_RAW = [];
    DC_DATA = [];
    dcAplicarVendasCarregadas(novas);
    if ((DC_DATA || []).length) {
      dcStatus('OK ' + DC_DATA.length.toLocaleString('pt-BR') + ' registros atualizados', true);
    }
  } catch (e) {
    console.warn('[dcAtualizarCacheBackground]', e);
  }
}

async function dcCarregarDados(empresa_id_param) {
  var eid = empresa_id_param || SESSION.empresa_id;
  if (!eid) { dcStatus('⚠ Empresa não selecionada.'); return; }
  if (DC_IS_LOADING && DC_ACTIVE_COMPANY === eid) return;
  if (!DC_IS_LOADING && DC_ACTIVE_COMPANY === eid && DC_RAW.length) {
    dcAplicarFiltro();
    dcLoading(false);
    return;
  }
  if (DC_ACTIVE_COMPANY && DC_ACTIVE_COMPANY !== eid) {
    DC_RAW = [];
    DC_DATA = [];
  }

  // Cancela fetch anterior ao trocar de empresa
  if (DC_ABORT_CONTROLLER) {
    try { DC_ABORT_CONTROLLER.abort(); } catch (e) {}
  }
  DC_ABORT_CONTROLLER = new AbortController();
  var currentSignal = DC_ABORT_CONTROLLER.signal;

  var loadSequence = ++DC_LOAD_SEQUENCE;
  DC_ACTIVE_COMPANY = eid;
  DC_IS_LOADING = true;

  var _dcLsKey = 'resute_dc_cache_' + eid;

  try {
    // 1. IndexedDB — leitura local ~10ms, sem limite de tamanho
    var _idbData = await _dcIdbGet(_dcLsKey);
    if (_idbData && Array.isArray(_idbData.vendas) && _idbData.vendas.length) {
      if (loadSequence !== DC_LOAD_SEQUENCE || eid !== DC_ACTIVE_COMPANY) return;
      dcAplicarVendasCarregadas(_idbData.vendas);
      if ((DC_DATA || []).length) {
        dcStatus('OK ' + DC_DATA.length.toLocaleString('pt-BR') + ' registros no recorte atual', true);
      }
      dcCarregarUltimaSync(eid).catch(function() {});
      _dcAtualizarCacheBackground(eid, _dcLsKey, _idbData.gerado_em || '', loadSequence);
      return;
    }

    // 2. Sem IndexedDB — tenta Supabase cache (sem overlay, mostra esqueleto)
    if (loadSequence !== DC_LOAD_SEQUENCE || eid !== DC_ACTIVE_COMPANY) return;
    dcMostrarEsqueleto();
    dcStatus('⏳ Abrindo painel...');
    var snapshotRapido = window.ReportCache
      ? await window.ReportCache.getLatest(eid, 'dashboard_cliente', null)
      : null;
    if (loadSequence !== DC_LOAD_SEQUENCE || eid !== DC_ACTIVE_COMPANY) return;
    if (snapshotRapido && snapshotRapido.dados && Array.isArray(snapshotRapido.dados.vendas) && snapshotRapido.dados.vendas.length) {
      var _supaVendas = snapshotRapido.dados.vendas;
      var _supaEm = snapshotRapido.dados.gerado_em || new Date().toISOString();
      _dcIdbSet(_dcLsKey, { gerado_em: _supaEm, vendas: _supaVendas });
      dcAplicarVendasCarregadas(_supaVendas);
      dcCarregarUltimaSync(eid).catch(function() {});
      if ((DC_DATA || []).length) {
        dcStatus('OK ' + DC_DATA.length.toLocaleString('pt-BR') + ' registros no recorte atual', true);
      }
      return;
    }

    // 3. Cache miss — busca tudo do banco (sem overlay)
    dcMostrarEsqueleto();
    dcStatus('⏳ Buscando dados...');
    dcSetUltimaSync('Conferindo ultima sincronizacao...', false);
    // Busca qual origem o admin configurou para este cliente ver
    var origemR = await dcComTimeout(
      fetch(SUPA_URL + '/rest/v1/empresas?id=eq.' + eid + '&select=exibir_origem',
        { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }, signal: currentSignal }),
      20000,
      'A consulta da empresa demorou mais que o esperado.'
    );
    var origemD = await origemR.json();
    var exibir  = (origemD && origemD[0] && origemD[0].exibir_origem) || 'manual';
    await dcComTimeout(
      dcCarregarUltimaSync(eid),
      20000,
      'A consulta da ultima sincronizacao demorou mais que o esperado.'
    );

    // Paginação: busca TODOS os registros em lotes (sem limite de 1000)
    dcStatus('⏳ Carregando dados...');
    var vendas = await dcComTimeout(
      _fetchAll(
        SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + encodeURIComponent(eid) + '&origem=eq.' + encodeURIComponent(exibir) + '&select=*&order=dt_saida.asc',
        { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY },
        currentSignal
      ),
      60000,
      'O carregamento dos registros demorou mais de 60 segundos.'
    );

    if (loadSequence !== DC_LOAD_SEQUENCE || eid !== DC_ACTIVE_COMPANY) return;

    if (!Array.isArray(vendas) || !vendas.length) {
      dcLimparPainelVazio('Nenhum dado disponivel ainda', 'Sincronize a API no painel admin ou confirme se a empresa esta configurada para exibir API.');
      dcStatus('⚠ Nenhum dado disponível ainda.');
      return;
    }

    dcStatus('⏳ ' + vendas.length.toLocaleString('pt-BR') + ' registros — gerando relatórios...');

    DC_RAW = vendas;

    // Preenche filtro de anos
    var anos = [...new Set(vendas.map(function(v){
      var data = dcDataValor(v);
      return data ? data.getFullYear() : parseInt(v.ano, 10);
    }).filter(Boolean))].sort();
    var selAno = document.getElementById('dc-filtro-ano');
    if (selAno) {
      selAno.innerHTML = '<option value="0">Todos os anos</option>';
      anos.forEach(function(a){ selAno.innerHTML += '<option value="'+a+'">'+a+'</option>'; });
    }

    dcDefinirPeriodoInicial(vendas);

    dcAplicarFiltro();
    dcSalvarSnapshotCliente(eid, exibir, vendas).catch(function(e) {
      console.warn('[ReportCache] Snapshot do cliente nao foi salvo:', e);
    });
    if ((DC_DATA || []).length) {
      dcStatus('OK ' + DC_DATA.length.toLocaleString('pt-BR') + ' registros no recorte atual', true);
    }
    dcStatus('✓ ' + vendas.length.toLocaleString('pt-BR') + ' registros carregados', true);

  } catch(e) {
    if (e && e.name === 'AbortError') return; // fetch cancelado por nova requisição — silencioso
    dcStatus('✗ ' + e.message);
    console.error(e);
  } finally {
    if (loadSequence === DC_LOAD_SEQUENCE) {
      DC_IS_LOADING = false;
      dcLoading(false);
    }
  }
}

// ── FILTRO DE PERÍODO ─────────────────────────────────────────────────────────
function dcDataValor(v) {
  var raw = v && (v.dt_saida || v.dt_emissao);
  if (raw) {
    var texto = String(raw).trim();
    var partesBR = texto.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    var d = partesBR ? new Date(Number(partesBR[3]), Number(partesBR[2]) - 1, Number(partesBR[1])) : new Date(texto);
    if (!isNaN(d.getTime())) return d;
  }
  var ano = parseInt(v && v.ano, 10);
  var mes = dcMesNumero(v && v.mes);
  if (ano && mes) return new Date(ano, mes - 1, 1);
  return null;
}

function dcPedidoChave(v) {
  if (!v) return '';
  var num = String(v.num_pedido || '').trim();
  if (num) return 'pedido:' + num;
  var ext = String(v.id_externo || '').trim();
  if (ext) return 'externo:' + ext;
  var data = String(v.dt_saida || v.dt_emissao || '').trim();
  var cli = String(v.cliente || '').trim();
  var prod = String(v.produto || '').trim();
  var vend = String(v.vendedor || '').trim();
  return ['fallback', cli, vend, data, prod, String(v.qtd || ''), String(v.valor || '')].join('|');
}

function dcContarPedidosUnicos(rows) {
  var set = new Set();
  (rows || []).forEach(function(r) {
    var chave = dcPedidoChave(r);
    if (chave) set.add(chave);
  });
  return set.size;
}

function dcIsoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dcLoading(show, msg) {
  var el = document.getElementById('dc-loading');
  if (!el) return;
  var txt = el.querySelector('[data-dc-loading-text]');
  if (txt && msg) txt.textContent = msg;
  if (DC_LOADING_TIMER) {
    clearTimeout(DC_LOADING_TIMER);
    DC_LOADING_TIMER = null;
  }
  el.style.display = show ? 'grid' : 'none';
  el.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (show) {
    DC_LOADING_TIMER = setTimeout(function() {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
      DC_LOADING_TIMER = null;
      dcStatus('O carregamento demorou mais que o esperado. Tente atualizar os dados.', false);
    }, 75000);
  }
}

function dcSetUltimaSync(texto, ok) {
  var badge = document.getElementById('dc-sync-badge');
  var footer = document.getElementById('dc-last-update');
  var valor = texto || 'Sync pendente';
  if (badge) {
    badge.textContent = valor;
    badge.classList.toggle('ok', !!ok);
  }
  if (footer) footer.textContent = valor;
}

async function dcCarregarUltimaSync(eid) {
  if (!eid) {
    dcSetUltimaSync('Empresa nao selecionada', false);
    return;
  }
  try {
    var r = await fetch(
      SUPA_URL + '/rest/v1/sync_log?empresa_id=eq.' + eid + '&select=ultima_sync,ultima_data,total_registros,status&order=ultima_sync.desc&limit=1',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    if (!r.ok) throw new Error('sync_log HTTP ' + r.status);
    var data = await r.json();
    var log = Array.isArray(data) ? data[0] : null;
    if (!log || (!log.ultima_sync && !log.ultima_data)) {
      dcSetUltimaSync('Nenhum sync registrado', false);
      return;
    }
    var quando = log.ultima_sync ? new Date(log.ultima_sync) : null;
    var label = quando && !isNaN(quando.getTime())
      ? 'Ultimo sync: ' + quando.toLocaleString('pt-BR')
      : 'Ultimo sync ate ' + String(log.ultima_data || '').split('-').reverse().join('/');
    if (log.total_registros) label += ' - ' + Number(log.total_registros).toLocaleString('pt-BR') + ' registros';
    dcSetUltimaSync(label, String(log.status || '').toLowerCase() !== 'erro');
  } catch (e) {
    console.warn('[dcCarregarUltimaSync]', e);
    dcSetUltimaSync('Sync nao confirmado', false);
  }
}

function dcLimparPainelVazio(titulo, detalhe) {
  var kEl = document.getElementById('dc-kpis');
  var html = '<div class="dc-empty-panel">'
    + '<strong>' + (titulo || 'Nenhum dado encontrado') + '</strong>'
    + '<span>' + (detalhe || 'Selecione outro periodo ou sincronize a API no painel admin.') + '</span>'
    + '</div>';
  if (kEl) kEl.innerHTML = html;
  ['dc-chart-evolucao','dc-chart-trimestre','dc-chart-ano','dc-chart-diasem','dc-chart-produtos','dc-chart-prodqtd','dc-chart-grupos','dc-chart-marca'].forEach(function(id) {
    if (typeof dcDestroyChart === 'function') dcDestroyChart(id);
  });
  ['dc-tab-reps','dc-tab-positiv','dc-tab-ufs','dc-tab-cidades','dc-tab-cli','dc-tab-inat','dc-tab-novos','dc-tab-ticket'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="dc-empty">Sem dados para este recorte.</div>';
  });
}

function dcDefinirPeriodoInicial(rows) {
  var datas = (rows || []).map(dcDataValor).filter(Boolean).sort(function(a, b) { return a - b; });
  if (!datas.length) return;
  var hoje = new Date();
  var alvoAno = hoje.getFullYear();
  var alvoMes = hoje.getMonth() + 1;
  var existeMesAtual = datas.some(function(d) {
    return d.getFullYear() === alvoAno && d.getMonth() + 1 === alvoMes;
  });
  if (!existeMesAtual) {
    var ultima = datas[datas.length - 1];
    alvoAno = ultima.getFullYear();
    alvoMes = ultima.getMonth() + 1;
  }
  var inicio = new Date(alvoAno, alvoMes - 1, 1);
  var fim = new Date(alvoAno, alvoMes, 0);
  var selAno = document.getElementById('dc-filtro-ano');
  var selMes = document.getElementById('dc-filtro-mes');
  var dtIni = document.getElementById('dc-filtro-inicio');
  var dtFim = document.getElementById('dc-filtro-fim');
  if (selAno) selAno.value = String(alvoAno);
  if (selMes) selMes.value = String(alvoMes);
  if (dtIni) dtIni.value = dcIsoDate(inicio);
  if (dtFim) dtFim.value = dcIsoDate(fim);
  dcAtualizarEstadoPeriodo();
}

function dcAtualizarEstadoPeriodo() {
  var selMes = document.getElementById('dc-filtro-mes');
  var dtIni = document.getElementById('dc-filtro-inicio');
  var dtFim = document.getElementById('dc-filtro-fim');
  var mes = selMes ? parseInt(selMes.value, 10) || 0 : 0;
  if (dtIni) dtIni.disabled = !!mes;
  if (dtFim) dtFim.disabled = !!mes;
}

function dcSincronizarPeriodoMes() {
  var selAno = document.getElementById('dc-filtro-ano');
  var selMes = document.getElementById('dc-filtro-mes');
  var dtIni = document.getElementById('dc-filtro-inicio');
  var dtFim = document.getElementById('dc-filtro-fim');
  var ano = selAno ? parseInt(selAno.value, 10) || 0 : 0;
  var mes = selMes ? parseInt(selMes.value, 10) || 0 : 0;
  if (!dtIni || !dtFim) return;
  if (!mes) {
    dtIni.value = '';
    dtFim.value = '';
    dcAtualizarEstadoPeriodo();
    return;
  }
  if (ano) {
    dtIni.value = dcIsoDate(new Date(ano, mes - 1, 1));
    dtFim.value = dcIsoDate(new Date(ano, mes, 0));
  } else {
    dtIni.value = '';
    dtFim.value = '';
  }
  dcAtualizarEstadoPeriodo();
}

function dcFiltroAnoAlterado() {
  var selMes = document.getElementById('dc-filtro-mes');
  var dtIni = document.getElementById('dc-filtro-inicio');
  var dtFim = document.getElementById('dc-filtro-fim');
  if (selMes && parseInt(selMes.value, 10)) {
    dcSincronizarPeriodoMes();
  } else {
    if (dtIni) dtIni.value = '';
    if (dtFim) dtFim.value = '';
    dcAtualizarEstadoPeriodo();
  }
  dcAplicarFiltro();
}

function dcFiltroMesAlterado() {
  dcSincronizarPeriodoMes();
  dcAplicarFiltro();
}

function dcFiltroPeriodoAlterado() {
  var selMes = document.getElementById('dc-filtro-mes');
  var selAno = document.getElementById('dc-filtro-ano');
  var dtIni = document.getElementById('dc-filtro-inicio');
  var dtFim = document.getElementById('dc-filtro-fim');
  if (selMes) selMes.value = '0';
  if (selAno && dtIni && dtFim && dtIni.value && dtFim.value) {
    var anoIni = parseInt(dtIni.value.slice(0, 4), 10);
    var anoFim = parseInt(dtFim.value.slice(0, 4), 10);
    selAno.value = anoIni && anoIni === anoFim ? String(anoIni) : '0';
  }
  dcAtualizarEstadoPeriodo();
  dcAplicarFiltro();
}

function dcAplicarFiltro() {
  var ano = parseInt(document.getElementById('dc-filtro-ano').value) || 0;
  var mes = parseInt(document.getElementById('dc-filtro-mes').value) || 0;
  var inicioEl = document.getElementById('dc-filtro-inicio');
  var fimEl = document.getElementById('dc-filtro-fim');
  var inicio = inicioEl && inicioEl.value ? new Date(inicioEl.value + 'T00:00:00') : null;
  var fim = fimEl && fimEl.value ? new Date(fimEl.value + 'T23:59:59') : null;
  dcAtualizarEstadoPeriodo();

  DC_DATA = DC_RAW.filter(function(v){
    var data = dcDataValor(v);
    var anoReal = data ? data.getFullYear() : parseInt(v.ano, 10);
    var mesReal = data ? data.getMonth() + 1 : dcMesNumero(v.mes);
    if (ano && anoReal !== ano) return false;
    if (mes && mesReal !== mes) return false;
    if ((inicio || fim) && !data) return false;
    if (inicio && data && data < inicio) return false;
    if (fim && data && data > fim) return false;
    return true;
  });

  dcRenderizar();
  if ((DC_DATA || []).length) {
    dcStatus('OK ' + DC_DATA.length.toLocaleString('pt-BR') + ' registros no recorte atual', true);
  }
}

function dcMesNumero(valor) {
  if (!valor) return 0;
  var numero = parseInt(valor, 10);
  if (numero >= 1 && numero <= 12) return numero;
  var txt = String(valor).trim().toLowerCase();
  var idx = ['janeiro','fevereiro','março','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
    .indexOf(txt);
  if (idx >= 0) return idx + 1;
  var curto = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'].indexOf(txt.slice(0,3));
  return curto >= 0 ? curto + 1 : 0;
}

function dcAtualizarPeriodoLabel(rows) {
  var el = document.getElementById('dc-periodo-label');
  if (!el) return;
  var ano = parseInt(document.getElementById('dc-filtro-ano').value, 10) || 0;
  var mes = parseInt(document.getElementById('dc-filtro-mes').value, 10) || 0;
  var inicioEl = document.getElementById('dc-filtro-inicio');
  var fimEl = document.getElementById('dc-filtro-fim');
  var partes = [];
  if (mes && ano) partes.push(MESES_FULL[mes - 1] + ' ' + ano);
  else if (ano) partes.push(String(ano));
  else partes.push('Todos os períodos');
  partes.push((rows || []).length.toLocaleString('pt-BR') + ' registros');
  el.textContent = partes.join(' · ');
}

function dcPrepararDadosRelatorios(rows) {
  var fonte = Array.isArray(rows) ? rows : DC_RAW;
  var headers = ['ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída','VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM','tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra','NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto','GRUPO PAI','subgrupo_produto','marca','familia_produto','classes'];
  var tabela = fonte.map(function(r) {
    return [
      r.id_externo || '', r.num_pedido || '', r.produto || '', String(r.qtd || ''),
      r.dt_emissao || '', r.dt_saida || '', String(r.valor || ''),
      r.vendedor || '', r.industria || '', r.cliente || '',
      r.ano ? String(r.ano) : '', r.mes || '', r.grupo || '', r.semana || '',
      r.tipo_mercado || '', r.setor || '', r.cidade || '', r.uf || '',
      r.tipo_vendedor || '', r.dias_sem_compra || '', r.nota_f || '', r.rota || '', r.desconto || '',
      r.empresa_nome || '', r.cnpj || '', r.grupo_produto || '', r.grupo_pai || '',
      r.subgrupo || '', r.marca || '', r.familia || '', r.classes || ''
    ];
  });
  if (typeof BD_DATA !== 'undefined') {
    BD_DATA.headers = headers;
    BD_DATA.rows = tabela;
    BD_DATA.count = tabela.length;
  }
  if (typeof FULL_DATA !== 'undefined') FULL_DATA.bd = tabela;
  try { if (typeof bdMapColumns === 'function') bdMapColumns(); } catch (e) { console.error(e); }
  try { if (typeof bdAutoFill === 'function') bdAutoFill(); } catch (e) { console.error(e); }
  try { if (typeof bdUpdateAllTabs === 'function') bdUpdateAllTabs(); } catch (e) { console.error(e); }
}

function dcAbrirRelatorio(tipo) {
  var rows = Array.isArray(DC_DATA) ? DC_DATA : DC_RAW;
  if (!rows || !rows.length) {
    dcStatus('⚠ Nenhum dado disponível para abrir o relatório.');
    return;
  }

  dcLoading(true, 'Montando relatorio selecionado...');
  try {
    dcPrepararDadosRelatorios(rows);

    var dash = document.getElementById('view-dash-cliente');
    if (dash) dash.style.display = 'none';

    var wrapper = document.getElementById('cui-wrapper');
    if (wrapper) wrapper.style.display = 'flex';
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = 'none';
    var app = document.getElementById('view-app');
    if (app) app.style.display = 'block';
    document.body.classList.add('client-report-mode');
    document.body.classList.remove('bpo-admin-mode');
    if (typeof switchView === 'function') switchView('view-app');

    var campos = {
      'user-nome': SESSION.nome,
      'user-empresa': document.getElementById('dc-empresa') ? document.getElementById('dc-empresa').textContent : (SESSION.empresa_nome || 'Empresa'),
      'sidebar-user-nome': SESSION.nome,
      'sidebar-user-empresa': document.getElementById('dc-empresa') ? document.getElementById('dc-empresa').textContent : (SESSION.empresa_nome || 'Empresa')
    };
    Object.keys(campos).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.textContent = campos[id];
    });
    ['header-user'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'flex';
    });

    if (typeof avShowRel === 'function') avShowRel(tipo);
  } catch (e) {
    console.error('[relatorio cliente]', e);
    dcStatus('Erro ao abrir o relatorio: ' + (e && e.message ? e.message : e));
    var dashFallback = document.getElementById('view-dash-cliente');
    if (dashFallback) dashFallback.style.display = 'flex';
  } finally {
    setTimeout(function() { dcLoading(false); }, 150);
  }
}

function dcNumeroBase(valor) {
  if (valor && typeof valor === 'object') {
    if (typeof valor.raw !== 'undefined') return dcNumeroBase(valor.raw);
    if (typeof valor.parsed !== 'undefined') return dcNumeroBase(valor.parsed);
    if (typeof valor.y !== 'undefined') return dcNumeroBase(valor.y);
    if (typeof valor.x !== 'undefined') return dcNumeroBase(valor.x);
    return 0;
  }
  try {
    return typeof parseSmartNumber === 'function' ? parseSmartNumber(valor) : Number(valor || 0);
  } catch (e) {
    return 0;
  }
}

function dcNumeroLimpo(valor, maxCasas) {
  var n = dcNumeroBase(valor);
  if (!Number.isFinite(n)) n = 0;
  var casas = typeof maxCasas === 'number' ? maxCasas : 0;
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: casas
  });
}

function dcMoedaLimpa(valor) {
  return dcNumeroLimpo(valor, 0);
}

function dcValorLinha(row) {
  return dcNumeroBase(row && row.valor);
}

function dcQtdLinha(row) {
  return dcNumeroBase(row && row.qtd);
}

function dcTextoValor(valor) {
  if (valor === null || typeof valor === 'undefined') return '';
  if (valor && typeof valor === 'object') {
    var chaves = ['nome', 'descricao', 'descricaoItem', 'produto', 'label', 'valor', 'codigo'];
    for (var i = 0; i < chaves.length; i++) {
      if (typeof valor[chaves[i]] !== 'undefined' && valor[chaves[i]] !== null) {
        return dcTextoValor(valor[chaves[i]]);
      }
    }
    try { return JSON.stringify(valor); } catch (e) { return ''; }
  }
  try { return String(valor); } catch (e) { return ''; }
}

function dcTextoCurto(texto, limite) {
  var s = dcTextoValor(texto).trim();
  var max = limite || 28;
  return s.length > max ? s.slice(0, max - 1) + '...' : s;
}

function dcCampoTexto(row, campos, fallback) {
  for (var i = 0; i < campos.length; i++) {
    var valor = dcTextoValor(row && row[campos[i]]).trim();
    if (valor) return valor;
  }
  return fallback || '';
}

function dcProdutoNome(row) {
  return dcCampoTexto(row, [
    'produto', 'produto_nome', 'nome_produto', 'descricao_produto',
    'descricao_item', 'descricaoItem', 'descricaoitem', 'nome',
    'cod_prod', 'codigo_item', 'codigoItem', 'codigo', 'id_externo'
  ], 'Sem produto').toUpperCase();
}

function dcGrupoNome(row) {
  return dcCampoTexto(row, [
    'grupo', 'grupo_produto', 'grupo_pai', 'grupoPai', 'subgrupo',
    'familia', 'familia_produto', 'classes', 'classe'
  ], 'Sem grupo');
}

function dcMarcaNome(row) {
  return dcCampoTexto(row, [
    'marca', 'industria', 'fabricante', 'familia', 'familia_produto',
    'classes', 'classe'
  ], 'Sem marca');
}

function dcRepresentanteNome(row) {
  return dcCampoTexto(row, [
    'vendedor', 'representante', 'nome_vendedor', 'vendedor_nome',
    'nome_representante', 'representante_nome'
  ], 'Sem representante').toUpperCase();
}

function dcClienteNome(row) {
  return dcCampoTexto(row, [
    'cliente', 'nome_cliente', 'cliente_nome', 'razao_social',
    'razaoSocial', 'fantasia', 'nome_fantasia'
  ], 'Sem cliente').toUpperCase();
}

function dcCidadeNome(row) {
  return dcCampoTexto(row, ['cidade', 'municipio', 'cidade_cliente'], 'Sem cidade');
}

function dcUfNome(row) {
  return dcCampoTexto(row, ['uf', 'estado', 'uf_cliente'], '');
}

function dcCampoRelatorio(row, campo) {
  if (campo === 'produto') return dcProdutoNome(row);
  if (campo === 'grupo') return dcGrupoNome(row);
  if (campo === 'marca') return dcMarcaNome(row);
  if (campo === 'vendedor') return dcRepresentanteNome(row);
  if (campo === 'cliente') return dcClienteNome(row);
  if (campo === 'cidade') return dcCidadeNome(row);
  if (campo === 'uf') return dcUfNome(row) || 'Sem UF';
  return dcTextoValor(row && row[campo]).trim();
}

function dcValorCompacto(valor) {
  var n = dcNumeroBase(valor);
  if (!Number.isFinite(n)) n = 0;
  var abs = Math.abs(n);
  if (abs >= 1000000) return dcNumeroLimpo(n / 1000000, 0) + ' mi';
  if (abs >= 1000) return dcNumeroLimpo(n / 1000, 0) + ' mil';
  return dcNumeroLimpo(n, 0);
}

function dcOrdenacaoAtual() {
  var el = document.getElementById('dc-ordem-tabelas');
  return el ? String(el.value || 'desc') : 'desc';
}

function dcOrdenarItens(lista, campoValor) {
  var modo = dcOrdenacaoAtual();
  return lista.sort(function(a, b) {
    if (modo === 'az') return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    var av = Number(a[campoValor] || 0);
    var bv = Number(b[campoValor] || 0);
    return modo === 'asc' ? av - bv : bv - av;
  });
}

function dcOrdenacaoRelatorio(id) {
  var el = document.getElementById('dc-ordem-' + id);
  return el ? String(el.value || 'desc') : dcOrdenacaoAtual();
}

function dcOrdenarItensRelatorio(lista, id) {
  var modo = dcOrdenacaoRelatorio(id);
  return lista.sort(function(a, b) {
    if (modo === 'az') return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    if (modo === 'pedidos') return Number(b.pedidos || b.ped || 0) - Number(a.pedidos || a.ped || 0);
    var av = Number(a.fat || 0);
    var bv = Number(b.fat || 0);
    return modo === 'asc' ? av - bv : bv - av;
  });
}

function dcPeriodoAtualDatas() {
  var inicioEl = document.getElementById('dc-filtro-inicio');
  var fimEl = document.getElementById('dc-filtro-fim');
  var anoEl = document.getElementById('dc-filtro-ano');
  var mesEl = document.getElementById('dc-filtro-mes');
  var inicio = inicioEl && inicioEl.value ? new Date(inicioEl.value + 'T00:00:00') : null;
  var fim = fimEl && fimEl.value ? new Date(fimEl.value + 'T23:59:59') : null;
  var ano = anoEl ? parseInt(anoEl.value || '0', 10) : 0;
  var mes = mesEl ? parseInt(mesEl.value || '0', 10) : 0;
  if (!inicio && !fim && ano) {
    if (mes) {
      inicio = new Date(ano, mes - 1, 1, 0, 0, 0);
      fim = new Date(ano, mes, 0, 23, 59, 59);
    } else {
      inicio = new Date(ano, 0, 1, 0, 0, 0);
      fim = new Date(ano, 11, 31, 23, 59, 59);
    }
  }
  return {
    inicio: inicio,
    fim: fim
  };
}

function dcAtualizarFiltroUfCidade(rows) {
  var sel = document.getElementById('dc-filtro-uf-cidade');
  if (!sel) return;
  var atual = sel.value || '';
  var ufs = Array.from(new Set((rows || []).map(function(r) {
    return dcUfNome(r).trim().toUpperCase();
  }).filter(Boolean))).sort();
  sel.innerHTML = '<option value="">Todos os estados</option>' + ufs.map(function(uf) {
    return '<option value="' + escapeHtml(uf) + '">' + escapeHtml(uf) + '</option>';
  }).join('');
  if (atual && ufs.indexOf(atual) >= 0) sel.value = atual;
}

function dcFiltrarCidadesPorUf(rows) {
  var sel = document.getElementById('dc-filtro-uf-cidade');
  var uf = sel ? String(sel.value || '').trim().toUpperCase() : '';
  if (!uf) return rows || [];
  return (rows || []).filter(function(r) {
    return dcUfNome(r).trim().toUpperCase() === uf;
  });
}

function dcSomarValor(rows) {
  return (rows || []).reduce(function(s, r) { return s + dcValorLinha(r); }, 0);
}

function dcTopAgrupado(rows, getter, tipo) {
  var mapa = {};
  (rows || []).forEach(function(r) {
    var nome = getter(r);
    if (!nome) return;
    if (!mapa[nome]) mapa[nome] = { nome: nome, fat: 0, qtd: 0, pedidos: new Set(), clientes: new Set() };
    mapa[nome].fat += dcValorLinha(r);
    mapa[nome].qtd += dcQtdLinha(r);
    mapa[nome].pedidos.add(dcPedidoChave(r));
    mapa[nome].clientes.add(dcClienteNome(r));
  });
  var arr = Object.keys(mapa).map(function(k) {
    var item = mapa[k];
    item.ped = item.pedidos.size;
    item.cli = item.clientes.size;
    return item;
  });
  var campo = tipo || 'fat';
  return arr.sort(function(a, b) { return Number(b[campo] || 0) - Number(a[campo] || 0); })[0] || null;
}

function dcPeriodoAnteriorRows() {
  var periodo = dcPeriodoAtualDatas();
  if (!periodo.inicio || !periodo.fim || !(Array.isArray(DC_RAW) && DC_RAW.length)) return [];
  var duracao = periodo.fim.getTime() - periodo.inicio.getTime();
  if (!Number.isFinite(duracao) || duracao <= 0) return [];
  var fimAnterior = new Date(periodo.inicio.getTime() - 1);
  var inicioAnterior = new Date(fimAnterior.getTime() - duracao);
  return DC_RAW.filter(function(r) {
    var d = dcDataValor(r);
    return d && !isNaN(d.getTime()) && d >= inicioAnterior && d <= fimAnterior;
  });
}

function dcVariacaoAtualAnterior(atual, anterior) {
  if (!anterior) return { texto: 'sem base anterior', classe: 'neutro', pct: null };
  var pct = ((atual - anterior) / anterior) * 100;
  return {
    texto: (pct >= 0 ? '+' : '') + dcNumeroLimpo(pct, 1) + '% vs periodo anterior',
    classe: pct >= 0 ? 'positivo' : 'negativo',
    pct: pct
  };
}

function dcMetricasDashboard(rows) {
  var fat = dcSomarValor(rows);
  var pedidos = dcContarPedidosUnicos(rows);
  // Clientes/Produtos/Representantes: totais das tabelas de cadastro (API externa),
  // independentes do filtro de período — fallback conta únicos em vendas
  var clientes = (DC_CLI_CAD_TOTAL !== null) ? DC_CLI_CAD_TOTAL
    : new Set(rows.map(function(r){ return dcClienteNome(r); }).filter(function(v){ return v && v !== 'Sem cliente'; })).size;
  var produtos = (DC_PROD_TOTAL !== null) ? DC_PROD_TOTAL
    : new Set(rows.map(function(r){ return dcProdutoNome(r); }).filter(function(v){ return v && v !== 'Sem produto'; })).size;
  var representantes = (DC_REP_TOTAL !== null) ? DC_REP_TOTAL
    : new Set(rows.map(function(r){ return dcRepresentanteNome(r); }).filter(function(v){ return v && v !== 'Sem representante'; })).size;
  var anterior = dcPeriodoAnteriorRows();
  var fatAnterior = dcSomarValor(anterior);
  return {
    fat: fat,
    pedidos: pedidos,
    clientes: clientes,
    produtos: produtos,
    representantes: representantes,
    ticket: pedidos ? fat / pedidos : 0,
    fatAnterior: fatAnterior,
    pedidosAnterior: dcContarPedidosUnicos(anterior),
    variacaoFat: dcVariacaoAtualAnterior(fat, fatAnterior),
    variacaoPedidos: dcVariacaoAtualAnterior(pedidos, dcContarPedidosUnicos(anterior)),
    topProduto: dcTopAgrupado(rows, dcProdutoNome, 'fat'),
    topRepresentante: dcTopAgrupado(rows, dcRepresentanteNome, 'fat'),
    topCidade: dcTopAgrupado(rows, dcCidadeNome, 'fat')
  };
}

function dcRenderResumoExecutivo(rows, m) {
  var el = document.getElementById('dc-executive-summary');
  if (!el) return;
  var produto = m.topProduto ? m.topProduto.nome + ' (' + dcMoedaLimpa(m.topProduto.fat) + ')' : 'sem produto lider';
  var rep = m.topRepresentante ? m.topRepresentante.nome + ' (' + dcMoedaLimpa(m.topRepresentante.fat) + ')' : 'sem representante lider';
  el.innerHTML = '<div class="dc-summary-card">'
    + '<strong>Resumo executivo</strong>'
    + '<span>Faturamento de '+dcMoedaLimpa(m.fat)+' em '+m.pedidos.toLocaleString('pt-BR')+' pedidos, com ticket medio de '+dcMoedaLimpa(m.ticket)+'.</span>'
    + '</div>'
    + '<div class="dc-summary-card">'
    + '<strong>Produto lider</strong>'
    + '<span>'+escapeHtml(produto)+'</span>'
    + '</div>'
    + '<div class="dc-summary-card">'
    + '<strong>Representante lider</strong>'
    + '<span>'+escapeHtml(rep)+'</span>'
    + '</div>';
}

function dcRenderAlertasExecutivos(rows, m) {
  var el = document.getElementById('dc-alertas');
  if (!el) return;
  var shareProduto = m.topProduto && m.fat ? (m.topProduto.fat / m.fat * 100) : 0;
  var ticketVar = dcVariacaoAtualAnterior(m.ticket, m.pedidosAnterior ? (m.fatAnterior / m.pedidosAnterior) : 0);
  var cards = [
    { titulo: 'Faturamento vs anterior', valor: m.variacaoFat.texto, classe: m.variacaoFat.classe, desc: 'Comparacao com periodo imediatamente anterior.' },
    { titulo: 'Pedidos vs anterior', valor: m.variacaoPedidos.texto, classe: m.variacaoPedidos.classe, desc: 'Volume comercial no mesmo intervalo anterior.' },
    { titulo: 'Ticket medio', valor: ticketVar.texto, classe: ticketVar.classe, desc: 'Mudanca do valor medio por pedido.' },
    { titulo: 'Concentracao do produto lider', valor: dcNumeroLimpo(shareProduto, 1) + '% do faturamento', classe: shareProduto >= 35 ? 'atencao' : 'positivo', desc: 'Quanto o principal produto pesa no resultado.' }
  ];
  el.innerHTML = cards.map(function(c) {
    return '<div class="dc-alert-card '+c.classe+'">'
      + '<strong>'+escapeHtml(c.titulo)+'</strong>'
      + '<span>'+escapeHtml(c.valor)+'</span>'
      + '</div>';
  }).join('');
}

var DC_VALUE_LABEL_PLUGIN = {
  id: 'dcValueLabels',
  afterDatasetsDraw: function(chart) {
    try {
      var pluginOpts = chart.options && chart.options.plugins && chart.options.plugins.dcValueLabels;
      if (!pluginOpts || pluginOpts.display === false) return;
      var ctx = chart.ctx;
      var horizontal = chart.options && chart.options.indexAxis === 'y';
      ctx.save();
      ctx.font = (pluginOpts.fontWeight || '700') + ' ' + (pluginOpts.fontSize || 10) + 'px sans-serif';
      ctx.fillStyle = pluginOpts.color || '#0A2F2F';
      ctx.textBaseline = 'middle';
      chart.data.datasets.forEach(function(ds, datasetIndex) {
        var meta = chart.getDatasetMeta(datasetIndex);
        if (!meta || meta.hidden) return;
        meta.data.forEach(function(element, index) {
          var valor = dcNumeroBase(ds.data[index]);
          if (!valor || !Number.isFinite(valor)) return;
          var label = typeof pluginOpts.formatter === 'function' ? pluginOpts.formatter(valor, chart.data.labels[index], index) : dcNumeroLimpo(valor, 0);
          label = dcTextoValor(label);
          if (!label || !element) return;
          // Usa element.x / element.y diretamente — compatível Chart.js v3 e v4
          var ex = typeof element.x === 'number' ? element.x : 0;
          var ey = typeof element.y === 'number' ? element.y : 0;
          ctx.textAlign = horizontal ? 'left' : 'center';
          // Horizontal: label à direita da barra (ex = borda direita)
          // Vertical:   label acima da barra (ey = topo)
          ctx.fillText(label, horizontal ? ex + 6 : ex, horizontal ? ey : ey - 9);
        });
      });
      ctx.restore();
    } catch (e) {
      try { if (chart && chart.ctx) chart.ctx.restore(); } catch (ignore) {}
      console.warn('[dcValueLabels]', e);
    }
  }
};

function dcRenderGraficoSeguro(nome, fn) {
  try {
    fn();
  } catch (e) {
    console.error('[dashboard chart]', nome, e);
    dcStatus('Erro ao renderizar ' + nome + ': ' + (e && e.message ? e.message : e));
  }
}

// Esqueleto de KPIs enquanto dados carregam — sem overlay, sem "Gerando relatórios"
function dcMostrarEsqueleto() {
  var kEl = document.getElementById('dc-kpis');
  if (!kEl) return;
  var lbls = ['Faturamento','Pedidos','Ticket Médio','Clientes','Produtos','Representantes'];
  kEl.innerHTML = lbls.map(function(lbl) {
    return '<div class="dc-kpi-card">'
         + '<div class="dc-kpi-label">' + lbl + '</div>'
         + '<div class="dc-kpi-value" style="opacity:.35">—</div>'
         + '</div>';
  }).join('');
}

// ── RENDERIZA TUDO ────────────────────────────────────────────────────────────
function dcRenderizar() {
  var rows = Array.isArray(DC_DATA) ? DC_DATA : DC_RAW;
  dcAtualizarPeriodoLabel(rows || []);
  if (!rows || !rows.length) {
    dcStatus('⚠ Nenhum dado disponível para esse filtro.');
    var kEl = document.getElementById('dc-kpis');
    if (kEl) kEl.innerHTML = '<div class="dc-kpi-empty">Nenhum registro encontrado para o período selecionado.</div>';
    var resumoEl = document.getElementById('dc-executive-summary');
    if (resumoEl) resumoEl.innerHTML = '';
    var alertasEl = document.getElementById('dc-alertas');
    if (alertasEl) alertasEl.innerHTML = '';
    ['dc-chart-evolucao','dc-chart-trimestre','dc-chart-ano','dc-chart-diasem','dc-chart-produtos','dc-chart-prodqtd','dc-chart-grupos','dc-chart-marca'].forEach(function(id) {
      if (typeof dcDestroyChart === 'function') dcDestroyChart(id);
    });
    ['dc-tab-reps','dc-tab-positiv','dc-tab-ufs','dc-tab-cidades','dc-tab-cli','dc-tab-ticket'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="dc-empty">Sem dados para este recorte.</div>';
    });
    _dcTabelaInativos(rows);       // usa DC_RAW independente do período
    _dcTabelaNovosClientes(rows);  // usa DC_RAW + DC_CLI_LISTA independente do período
    return;
  }

  // ── KPIs principais ──
  var metricas = dcMetricasDashboard(rows);
  var fat = metricas.fat;
  var ped = metricas.pedidos;
  var cli = metricas.clientes;
  var prd = metricas.produtos;
  var rep = metricas.representantes;
  var tick = metricas.ticket;
  dcRenderResumoExecutivo(rows, metricas);
  dcRenderAlertasExecutivos(rows, metricas);

  var kEl = document.getElementById('dc-kpis');
  if (kEl) kEl.innerHTML = [
    { val:dcMoedaLimpa(fat),             lbl:'Faturamento' },
    { val:ped.toLocaleString('pt-BR'),    lbl:'Pedidos' },
    { val:dcMoedaLimpa(tick),             lbl:'Ticket Médio' },
    { val:cli.toLocaleString('pt-BR'),    lbl:'Clientes' },
    { val:prd.toLocaleString('pt-BR'),    lbl:'Produtos' },
    { val:rep.toLocaleString('pt-BR'),    lbl:'Representantes' }
  ].map(function(k){
    return '<div class="dc-kpi-card">'
         + '<div class="dc-kpi-label">'+k.lbl+'</div>'
         + '<div class="dc-kpi-value">'+k.val+'</div>'
         + '</div>';
  }).join('');

  // ── Gráficos ──
  dcRenderGraficoSeguro('Evolução mensal', function(){ _dcChartEvolucao(rows); });
  dcRenderGraficoSeguro('Por trimestre', function(){ _dcChartTrim(rows); });
  dcRenderGraficoSeguro('Comparativo anual', function(){ _dcChartAno(rows); });
  dcRenderGraficoSeguro('Dia da semana', function(){ _dcChartDiaSemana(rows); });
  dcRenderGraficoSeguro('Produtos por faturamento', function(){ _dcChartProd(rows); });
  dcRenderGraficoSeguro('Produtos por quantidade', function(){ _dcChartProdQtd(rows); });
  dcRenderGraficoSeguro('Grupos', function(){ _dcChartGrupo(rows); });
  dcRenderGraficoSeguro('Marcas', function(){ _dcChartMarca(rows); });

  // ── Tabelas ──
  dcAtualizarFiltroUfCidade(rows);
  _dcTabela('dc-tab-reps',     'vendedor', rows, fat, 'Representante');
  _dcTabelaPositivacao();
  _dcTabela('dc-tab-ufs',      'uf',       rows, fat, 'Estado');
  _dcTabela('dc-tab-cidades',  'cidade',   dcFiltrarCidadesPorUf(rows), fat, 'Cidade');
  _dcTabela('dc-tab-cli',      'cliente',  rows, fat, 'Cliente');
  _dcTabelaInativos(rows);
  _dcTabelaNovosClientes(rows);
  _dcTabelaTicketCliente();

  // ── Última atualização ──
  var lu = document.getElementById('dc-last-update');
  if (lu && !lu.textContent) lu.textContent = 'Dados renderizados em ' + new Date().toLocaleString('pt-BR');
}

// Novos gráficos
function _dcChartAno(rows) {
  var fonte = Array.isArray(DC_RAW) && DC_RAW.length ? DC_RAW : rows;
  var porAno = {};
  fonte.forEach(function(r) {
    var data = dcDataValor(r);
    var ano = data ? data.getFullYear() : parseInt(r.ano, 10);
    if (ano) porAno[ano] = (porAno[ano] || 0) + dcValorLinha(r);
  });
  var anos = Object.keys(porAno).sort();
  _dcDestroy('dc-chart-ano');
  var ctx = document.getElementById('dc-chart-ano'); if (!ctx) return;
  DC_CHARTS['ano'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: anos, datasets: [{ data: anos.map(function(a){return porAno[a];}), backgroundColor: '#1C64C0', borderRadius: 6 }] },
    options: _dcOptsLabels(false, function(v){ return dcValorCompacto(v); }, { top: 28 }),
    plugins: [DC_VALUE_LABEL_PLUGIN]
  });
}

function _dcDiaSemFiltroChange() {
  var mes = document.getElementById('dc-diasem-mes');
  var sem = document.getElementById('dc-diasem-sem');
  if (sem) sem.disabled = !mes || !mes.value;
  _dcChartDiaSemana([]);
}

function _dcDiaSemLocalDate(str) {
  // Parse ISO date string as local date (avoids UTC midnight timezone shift)
  var p = String(str || '').split('-');
  return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date(str);
}

function _dcChartDiaSemana(rows) {
  var anoSel = document.getElementById('dc-diasem-ano');
  var mesSel = document.getElementById('dc-diasem-mes');
  var semSel = document.getElementById('dc-diasem-sem');

  // Chart uses DC_RAW as source — independent of top period filter
  var source = Array.isArray(DC_RAW) && DC_RAW.length ? DC_RAW : rows;

  // Populate year dropdown from source, preserving current selection
  var anosMap = {};
  source.forEach(function(r) {
    if (!r.dt_saida) return;
    var yr = +String(r.dt_saida).split('-')[0];
    if (yr > 1900) anosMap[yr] = true;
  });
  if (anoSel) {
    var prevAno = anoSel.value;
    anoSel.innerHTML = '<option value="">Todos os anos</option>'
      + Object.keys(anosMap).sort().map(function(a) {
          return '<option value="'+a+'"'+(a===prevAno?' selected':'')+'>'+a+'</option>';
        }).join('');
  }

  var anoFilter = anoSel ? anoSel.value : '';
  var mesFilter = mesSel ? mesSel.value : '';
  var semFilter = semSel ? semSel.value : '';
  if (semSel) semSel.disabled = !mesFilter;

  var filtered = source.filter(function(r) {
    if (!r.dt_saida) return false;
    var p = String(r.dt_saida).split('-');
    if (p.length < 3) return false;
    var yr = +p[0], mo = +p[1] - 1, dy = +p[2];
    if (anoFilter && yr !== parseInt(anoFilter, 10)) return false;
    if (mesFilter !== '' && mo !== parseInt(mesFilter, 10)) return false;
    if (semFilter && mesFilter !== '' && Math.ceil(dy / 7) !== parseInt(semFilter, 10)) return false;
    return true;
  });

  var dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  var mp = [0,0,0,0,0,0,0];
  filtered.forEach(function(r) {
    var d = _dcDiaSemLocalDate(r.dt_saida);
    if (!isNaN(d.getTime())) mp[d.getDay()] += dcValorLinha(r);
  });
  _dcDestroy('dc-chart-diasem');
  var ctx = document.getElementById('dc-chart-diasem'); if (!ctx) return;
  DC_CHARTS['diasem'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: dias, datasets: [{ data: mp, backgroundColor: '#1C64C0', borderRadius: 6 }] },
    options: _dcOptsLabels(false, function(v){ return dcValorCompacto(v); }, { top: 28 }),
    plugins: [DC_VALUE_LABEL_PLUGIN]
  });
}

function _dcOptsLabels(horizontal, fmtFn, pad) {
  var o = _dcOpts(horizontal);
  o.plugins.dcValueLabels = { formatter: fmtFn, color: '#1C1C1E', fontSize: 10, fontWeight: '700' };
  if (pad) o.layout = { padding: pad };
  return o;
}

function _dcOpts(horizontal) {
  return {
    responsive: true, maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { display: false },
      tooltip: { callbacks: { label: function(c){ return ' ' + dcNumeroLimpo(c.raw, 0); } } },
      dcValueLabels: { formatter: function(v){ return dcValorCompacto(v); }, color: '#1C1C1E' } },
    scales: {
      x: { ticks: { color: '#4A4A4C', font: { size: 10 }, callback: function(v){ return this && this.type === 'category' ? this.getLabelForValue(v) : (typeof v==='number' ? dcValorCompacto(v) : v); } }, grid: { color: '#E2E8F0' } },
      y: { ticks: { color: '#4A4A4C', font: { size: 10 },
            callback: function(v){ return this && this.type === 'category' ? this.getLabelForValue(v) : (typeof v==='number' ? dcValorCompacto(v) : v); } },
           grid: { color: '#E2E8F0' } }
    }
  };
}

// ── EVOLUÇÃO MENSAL ───────────────────────────────────────────────────────────
function _dcDestroy(id) {
  if (typeof dcDestroyChart === 'function') dcDestroyChart(id);
}

function _dcChartEvolucao(rows) {
  if (typeof dcChartEvolucao === 'function') dcChartEvolucao(rows);
}

function _dcChartTrim(rows) {
  if (typeof dcChartTrimestre === 'function') dcChartTrimestre(rows);
}

function _dcChartProd(rows) {
  if (typeof dcChartProdutos === 'function') dcChartProdutos(rows);
}

function _dcChartGrupo(rows) {
  if (typeof dcChartGrupos === 'function') dcChartGrupos(rows);
}

function _dcTabelaInativos(rows) {
  if (typeof dcTabelaInativos === 'function') dcTabelaInativos(rows);
}

function dcChartEvolucao(rows) {
  var fonte = Array.isArray(DC_RAW) && DC_RAW.length ? DC_RAW : rows;
  var porAnoMes = {};
  fonte.forEach(function(r) {
    var data = dcDataValor(r);
    var ano = data ? data.getFullYear() : parseInt(r.ano, 10);
    var m = data ? data.getMonth() + 1 : dcMesNumero(r.mes);
    if (!ano || m < 1 || m > 12) return;
    if (!porAnoMes[ano]) porAnoMes[ano] = {};
    porAnoMes[ano][m] = (porAnoMes[ano][m] || 0) + dcValorLinha(r);
  });
  var anos = Object.keys(porAnoMes).sort();
  var cores = ['#1C64C0','#E53935','#F9A825','#2E7D32','#7B1FA2','#0E1424','#FF6F00','#00838F'];
  var datasets = anos.map(function(ano, i) {
    var d = [];
    for (var m = 1; m <= 12; m++) d.push(porAnoMes[ano][m] || 0);
    return {
      label: String(ano),
      data: d,
      borderColor: cores[i % cores.length],
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.35,
      pointBackgroundColor: cores[i % cores.length],
      pointRadius: 3,
      borderWidth: 2
    };
  });
  dcDestroyChart('dc-chart-evolucao');
  var ctx = document.getElementById('dc-chart-evolucao');
  if (!ctx) return;
  DC_CHARTS['evolucao'] = new Chart(ctx, {
    type: 'line',
    data: { labels: MESES, datasets: datasets },
    options: Object.assign(dcChartOpts(''), {
      layout: { padding: { top: 56, right: 8, left: 8 } },
      plugins: {
        legend: { display: true, position: 'top', labels: { color: '#334155', font: { size: 11, weight: 700 }, padding: 16 } },
        tooltip: { callbacks: { label: function(c){ return c.dataset.label + ': ' + dcValorCompacto(c.raw); } } },
        dcValueLabels: { display: false }
      }
    }),
    plugins: [{
      id: 'evoLabels',
      afterDraw: function(chart) {
        var c = chart.ctx;
        c.save();
        c.font = 'bold 9px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        chart.data.datasets.forEach(function(ds, di) {
          var meta = chart.getDatasetMeta(di);
          if (!meta || meta.hidden) return;
          c.fillStyle = String(ds.borderColor || '#1C64C0');
          var offset = 8 + di * 14;
          var minY = chart.chartArea.top + 4;
          meta.data.forEach(function(pt, i) {
            var v = Number(ds.data[i]);
            if (!v || !isFinite(v)) return;
            var labelY = Math.max(pt.y - offset, minY);
            c.fillText(dcValorCompacto(v), pt.x, labelY);
          });
        });
        c.restore();
      }
    }]
  });
}

// ── TRIMESTRES ────────────────────────────────────────────────────────────────
function dcChartTrimestre(rows) {
  var fonte = Array.isArray(DC_RAW) && DC_RAW.length ? DC_RAW : rows;
  var trim = [0, 0, 0, 0];
  fonte.forEach(function(r) {
    var data = dcDataValor(r);
    var m = data ? data.getMonth() + 1 : dcMesNumero(r.mes);
    if (!m) return;
    var v = dcValorLinha(r);
    if (m <= 3) trim[0] += v; else if (m <= 6) trim[1] += v; else if (m <= 9) trim[2] += v; else trim[3] += v;
  });
  dcDestroyChart('dc-chart-trimestre');
  var ctx = document.getElementById('dc-chart-trimestre');
  if (!ctx) return;
  DC_CHARTS['trimestre'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Jan-Mar', 'Abr-Jun', 'Jul-Set', 'Out-Dez'],
      datasets: [{ data: trim, backgroundColor: '#1C64C0', borderWidth: 0, borderRadius: 8 }]
    },
    options: _dcOpts(false),
    plugins: [DC_VALUE_LABEL_PLUGIN]
  });
}

// ── UTILITÁRIOS ───────────────────────────────────────────────────────────────
function dcDestroyChart(id) {
  var key = id.replace('dc-chart-','');
  if (DC_CHARTS[key]) { try{ DC_CHARTS[key].destroy(); }catch(e){} delete DC_CHARTS[key]; }
  var canvas = document.getElementById(id);
  Object.keys(DC_CHARTS || {}).forEach(function(k) {
    try {
      if (DC_CHARTS[k] && DC_CHARTS[k].canvas === canvas) {
        DC_CHARTS[k].destroy();
        delete DC_CHARTS[k];
      }
    } catch (e) {
      delete DC_CHARTS[k];
    }
  });
}

function dcChartOpts(prefix) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: function(c){ return ' ' + dcNumeroLimpo(c.raw, 0); } } },
      dcValueLabels: { formatter: function(v){ return dcValorCompacto(v); }, color: '#1C1C1E' }
    },
    scales: {
      x: { ticks: { color: '#4A4A4C', font: { size: 10 }, callback: function(v){ return this && this.type === 'category' ? this.getLabelForValue(v) : (typeof v === 'number' ? dcValorCompacto(v) : v); } }, grid: { color: '#E2E8F0' } },
      y: { ticks: { color: '#4A4A4C', font: { size: 10 }, callback: function(v){ return this && this.type === 'category' ? this.getLabelForValue(v) : (typeof v === 'number' ? dcValorCompacto(v) : v); } }, grid: { color: '#E2E8F0' } }
    }
  };
}

// Relatorios do painel inicial usando nomes oficiais e alternativos da API.
function _dcChartProdQtd(rows) {
  var m = {};
  rows.forEach(function(r){ var k = dcProdutoNome(r); m[k] = (m[k] || 0) + dcQtdLinha(r); });
  var s = Object.entries(m).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
  _dcDestroy('dc-chart-prodqtd');
  var ctx = document.getElementById('dc-chart-prodqtd'); if (!ctx) return;
  DC_CHARTS['prodqtd'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: s.map(function(e){return dcTextoCurto(e[0], 34);}),
            datasets: [{ data: s.map(function(e){return e[1];}), backgroundColor: '#1C64C0', borderRadius: 4 }] },
    options: _dcOptsLabels(true, function(v){ return dcNumeroLimpo(v, 0); }, { right: 70 }),
    plugins: [DC_VALUE_LABEL_PLUGIN]
  });
}

function _dcChartMarca(rows) {
  var m = {};
  rows.forEach(function(r){ var k = dcMarcaNome(r); if (k && k.trim()) m[k] = (m[k] || 0) + dcValorLinha(r); });
  var s = Object.entries(m).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  _dcDestroy('dc-chart-marca');
  var ctx = document.getElementById('dc-chart-marca'); if (!ctx) return;
  DC_CHARTS['marca'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: s.map(function(e){return dcTextoCurto(e[0], 24);}),
            datasets: [{ data: s.map(function(e){return e[1];}),
              backgroundColor: '#1C64C0', borderWidth: 0, borderRadius: 6 }] },
    options: _dcOptsLabels(true, function(v){ return dcValorCompacto(v); }, { right: 80 }),
    plugins: [DC_VALUE_LABEL_PLUGIN]
  });
}

function _dcSparkline(points, w, h, color) {
  var width = w || 80, height = h || 24, clr = color || '#1C64C0';
  if (!points || !points.length) return '<span style="color:#cbd5e1;font-size:10px">—</span>';
  if (points.length === 1) {
    return '<svg width="' + width + '" height="' + height + '" style="display:block">'
      + '<circle cx="' + (width / 2) + '" cy="' + (height / 2) + '" r="3" fill="' + clr + '"/></svg>';
  }
  var max = Math.max.apply(null, points);
  var min = Math.min.apply(null, points);
  var range = max - min || 1;
  var pad = 3;
  var pts = points.map(function(v, i) {
    var x = pad + (i / (points.length - 1)) * (width - pad * 2);
    var y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  return '<svg width="' + width + '" height="' + height + '" style="display:block">'
    + '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + clr + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>'
    + '</svg>';
}

function _dcPositivFiltroChange() {
  var mes = document.getElementById('dc-positiv-mes');
  var sem = document.getElementById('dc-positiv-sem');
  if (sem) sem.disabled = !mes || !mes.value;
  _dcTabelaPositivacao();
}

function _dcTabelaPositivacao() {
  var anoSel = document.getElementById('dc-positiv-ano');
  var mesSel = document.getElementById('dc-positiv-mes');
  var semSel = document.getElementById('dc-positiv-sem');

  // Popula anos a partir de DC_RAW, preservando seleção
  var anosMap = {};
  DC_RAW.forEach(function(r) {
    if (!r.dt_saida) return;
    var yr = +String(r.dt_saida).split('-')[0];
    if (yr > 1900) anosMap[yr] = true;
  });
  if (anoSel) {
    var prevAno = anoSel.value;
    anoSel.innerHTML = '<option value="">Todos os anos</option>'
      + Object.keys(anosMap).sort().map(function(a) {
          return '<option value="' + a + '"' + (a === prevAno ? ' selected' : '') + '>' + a + '</option>';
        }).join('');
  }

  var anoFilter = anoSel ? anoSel.value : '';
  var mesFilter = mesSel ? mesSel.value : '';
  var semFilter = semSel ? semSel.value : '';
  if (semSel) semSel.disabled = !mesFilter;

  var source = DC_RAW.filter(function(r) {
    if (!r.dt_saida) return false;
    var p = String(r.dt_saida).split('-');
    if (p.length < 3) return false;
    var yr = +p[0], mo = +p[1] - 1, dy = +p[2];
    if (anoFilter && yr !== parseInt(anoFilter, 10)) return false;
    if (mesFilter !== '' && mo !== parseInt(mesFilter, 10)) return false;
    if (semFilter && mesFilter !== '' && Math.ceil(dy / 7) !== parseInt(semFilter, 10)) return false;
    return true;
  });

  // Mapa de vendas + dados mensais para sparkline
  var mp = {}, monthData = {}, monthSet = new Set();
  source.forEach(function(r) {
    var rep = dcRepresentanteNome(r);
    var cli = dcClienteNome(r);
    var d   = dcDataValor(r);
    if (!mp[rep]) mp[rep] = { clientes: new Set(), pedidos: new Set() };
    mp[rep].clientes.add(cli);
    mp[rep].pedidos.add(dcPedidoChave(r));
    if (d) {
      var mkey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      monthSet.add(mkey);
      if (!monthData[rep]) monthData[rep] = {};
      if (!monthData[rep][mkey]) monthData[rep][mkey] = new Set();
      monthData[rep][mkey].add(cli);
    }
  });

  var allMonths = Array.from(monthSet).sort();

  // Merge com todo o cadastro de representantes
  var repSet = new Set(DC_REP_LISTA);
  var todos = DC_REP_LISTA.slice();
  Object.keys(mp).forEach(function(nome) { if (!repSet.has(nome)) todos.push(nome); });
  if (!todos.length) todos = Object.keys(mp);

  var arr = todos.map(function(nome) {
    var d = mp[nome] || { clientes: new Set(), pedidos: new Set() };
    var spark = allMonths.map(function(m) {
      return monthData[nome] && monthData[nome][m] ? monthData[nome][m].size : 0;
    });
    return { nome: nome, cli: d.clientes.size, ped: d.pedidos.size, spark: spark };
  });

  // Busca
  var busca = String((document.getElementById('dc-positiv-busca') || {}).value || '').trim().toUpperCase();
  if (busca) arr = arr.filter(function(e) { return e.nome.indexOf(busca) >= 0; });

  // Ordenação
  var modo = String((document.getElementById('dc-ordem-positiv') || {}).value || 'clientes');
  arr.sort(function(a, b) {
    if (modo === 'az')      return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    if (modo === 'pedidos') return b.ped - a.ped;
    return b.cli - a.cli;
  });

  var el = document.getElementById('dc-tab-positiv');
  if (!el) return;
  if (!arr.length) { el.innerHTML = '<div class="dc-empty">Sem dados.</div>'; return; }

  var visible = arr.slice(0, 200);
  var h = '<table class="dc-tabela"><thead><tr>'
    + '<th>#</th><th>Representante</th><th class="num">Clientes únicos</th>'
    + '<th class="num">Pedidos únicos</th><th style="min-width:88px">Evolução</th>'
    + '</tr></thead><tbody>';
  visible.forEach(function(e, i) {
    h += '<tr><td class="pos">' + (i + 1) + '</td>'
      + '<td>' + escapeHtml(e.nome) + '</td>'
      + '<td class="num">' + e.cli + '</td>'
      + '<td class="num">' + e.ped + '</td>'
      + '<td>' + _dcSparkline(e.spark, 80, 24, '#1C64C0') + '</td></tr>';
  });
  if (arr.length > 200) {
    h += '<tr><td colspan="5" style="text-align:center;color:#7f8ba3;font-size:11px;padding:8px">'
      + 'Exibindo 200 de ' + arr.length.toLocaleString('pt-BR') + ' representantes.</td></tr>';
  }
  el.innerHTML = h + '</tbody></table>';
}

function _dcTabelaNovosClientes(rows) {
  var el = document.getElementById('dc-tab-novos');
  if (!el) return;

  var fonte = Array.isArray(DC_RAW) && DC_RAW.length ? DC_RAW : (Array.isArray(rows) ? rows : []);

  // Filtros próprios do card
  var inicioVal = (document.getElementById('dc-novos-inicio') || {}).value || '';
  var fimVal    = (document.getElementById('dc-novos-fim')    || {}).value || '';
  var dtIni = inicioVal ? new Date(inicioVal + 'T00:00:00') : null;
  var dtFim = fimVal    ? new Date(fimVal    + 'T23:59:59') : null;
  var busca = String((document.getElementById('dc-novos-busca') || {}).value || '').trim().toUpperCase();

  // Primeira compra por cliente em todo DC_RAW
  var primeira = {};
  fonte.forEach(function(r) {
    var c = dcClienteNome(r);
    if (!c || c === 'SEM CLIENTE') return;
    var d = dcDataValor(r);
    if (!d || isNaN(d.getTime())) return;
    if (!primeira[c] || d < primeira[c].dt) {
      primeira[c] = { dt: d, cidade: dcCidadeNome(r), uf: dcUfNome(r), representante: dcRepresentanteNome(r), valor: dcValorLinha(r) };
    }
  });

  // Base: todo DC_CLI_LISTA + clientes de DC_RAW não cadastrados
  var cadSet = new Set();
  var todos = [];
  if (DC_CLI_LISTA.length) {
    DC_CLI_LISTA.forEach(function(n) { if (n) { cadSet.add(n); todos.push(n); } });
    Object.keys(primeira).forEach(function(n) { if (!cadSet.has(n)) todos.push(n); });
  } else {
    todos = Object.keys(primeira);
  }

  var arr = todos.map(function(nome) {
    var p = primeira[nome];
    if (!p) return { nome: nome, dt: null, ultimaStr: '—', uf: '', cidade: '', representante: '—', valor: 0, semHistorico: true };
    return { nome: nome, dt: p.dt, ultimaStr: p.dt.toLocaleDateString('pt-BR'), uf: p.uf || '', cidade: p.cidade || '', representante: p.representante || '—', valor: p.valor, semHistorico: false };
  });

  // Filtro de período (primeira compra dentro do range; sem filtro = exibe tudo)
  if (dtIni || dtFim) {
    arr = arr.filter(function(e) {
      if (e.semHistorico) return false;
      if (dtIni && e.dt < dtIni) return false;
      if (dtFim && e.dt > dtFim) return false;
      return true;
    });
  }

  // Busca por nome
  if (busca) arr = arr.filter(function(e) { return e.nome.indexOf(busca) >= 0; });

  // Ordenação
  var modo = String((document.getElementById('dc-ordem-novos') || {}).value || 'recente');
  arr.sort(function(a, b) {
    if (modo === 'maior') return b.valor - a.valor;
    var da = a.semHistorico ? (modo === 'antigo' ? new Date(9999,0) : new Date(0)) : a.dt;
    var db = b.semHistorico ? (modo === 'antigo' ? new Date(9999,0) : new Date(0)) : b.dt;
    return modo === 'antigo' ? da - db : db - da;
  });

  if (!arr.length) {
    el.innerHTML = '<div class="dc-empty">Nenhum cliente no período selecionado.</div>';
    return;
  }

  var h = '<table class="dc-tabela"><thead><tr>'
    + '<th>#</th><th>Cliente</th><th>Representante</th><th>UF/Cidade</th>'
    + '<th class="num">Primeira compra</th><th class="num">Valor</th>'
    + '</tr></thead><tbody>';
  arr.forEach(function(e, i) {
    h += '<tr>'
      + '<td class="pos">' + (i + 1) + '</td>'
      + '<td>' + escapeHtml(e.nome) + '</td>'
      + '<td style="font-size:11px;color:#5A7A74">' + escapeHtml(e.representante) + '</td>'
      + '<td>' + escapeHtml([e.uf, e.cidade].filter(Boolean).join(' / ') || '—') + '</td>'
      + '<td class="num">' + e.ultimaStr + '</td>'
      + '<td class="num">' + (e.semHistorico ? '—' : dcMoedaLimpa(e.valor)) + '</td>'
      + '</tr>';
  });
  el.innerHTML = h + '</tbody></table>';
}

function _dcTabelaTicketCliente() {
  var inicio = (document.getElementById('dc-ticket-inicio') || {}).value || '';
  var fim    = (document.getElementById('dc-ticket-fim')    || {}).value || '';
  var busca  = String((document.getElementById('dc-ticket-busca') || {}).value || '').trim().toUpperCase();

  // Filtrar DC_RAW pelo período próprio do relatório (independente do filtro global)
  var source = DC_RAW;
  if (inicio || fim) {
    var dtIni = inicio ? new Date(inicio + 'T00:00:00') : null;
    var dtFim = fim    ? new Date(fim    + 'T23:59:59') : null;
    source = DC_RAW.filter(function(r) {
      var d = dcDataValor(r);
      if (!d) return false;
      if (dtIni && d < dtIni) return false;
      if (dtFim && d > dtFim) return false;
      return true;
    });
  }

  // Mapa de vendas: nome do cliente → {fat, pedidos}
  var mp = {};
  source.forEach(function(r) {
    var c = dcClienteNome(r);
    if (!mp[c]) mp[c] = { fat: 0, pedidos: new Set() };
    mp[c].fat += dcValorLinha(r);
    mp[c].pedidos.add(dcPedidoChave(r));
  });

  // Base: todos do cadastro + clientes em vendas não presentes no cadastro
  var cadSet = new Set(DC_CLI_LISTA);
  var todos = DC_CLI_LISTA.slice();
  Object.keys(mp).forEach(function(nome) {
    if (!cadSet.has(nome)) todos.push(nome);
  });
  if (!todos.length) todos = Object.keys(mp);

  var arr = todos.map(function(nome) {
    var d = mp[nome];
    var fat = d ? d.fat : 0;
    var ped = d ? d.pedidos.size : 0;
    return { nome: nome, fat: fat, ped: ped, tick: ped ? fat / ped : 0 };
  });

  // Filtro de busca por nome
  if (busca) {
    arr = arr.filter(function(e) { return e.nome.indexOf(busca) >= 0; });
  }

  // Ordenação
  var modo = String((document.getElementById('dc-ordem-ticket') || {}).value || 'ticket');
  arr.sort(function(a, b) {
    if (modo === 'az')      return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    if (modo === 'fat')     return b.fat - a.fat;
    if (modo === 'pedidos') return b.ped - a.ped;
    return b.tick - a.tick;
  });

  var el = document.getElementById('dc-tab-ticket');
  if (!el) return;
  if (!arr.length) { el.innerHTML = '<div class="dc-empty">Sem dados.</div>'; return; }

  var visible = arr.slice(0, 300);
  var h = '<table class="dc-tabela"><thead><tr>'
    + '<th>#</th><th>Cliente</th><th>Pedidos</th>'
    + '<th class="num">Faturamento</th><th class="num">Ticket Médio</th>'
    + '</tr></thead><tbody>';
  visible.forEach(function(e, i) {
    h += '<tr><td class="pos">' + (i + 1) + '</td>'
      + '<td>' + escapeHtml(e.nome) + '</td>'
      + '<td>' + e.ped + '</td>'
      + '<td class="num">' + dcMoedaLimpa(e.fat) + '</td>'
      + '<td class="num">' + dcMoedaLimpa(e.tick) + '</td></tr>';
  });
  if (arr.length > 300) {
    h += '<tr><td colspan="5" style="text-align:center;color:#7f8ba3;font-size:11px;padding:8px">'
      + 'Exibindo 300 de ' + arr.length.toLocaleString('pt-BR') + ' clientes. Use a busca para filtrar.'
      + '</td></tr>';
  }
  el.innerHTML = h + '</tbody></table>';
}

function _dcTabela(id, campo, rows, fatTotal, label) {
  var map = {};
  rows.forEach(function(r) {
    var key = dcCampoRelatorio(r, campo) || 'Sem ' + dcTextoValor(label || 'dado').toLowerCase();
    if (!map[key]) map[key] = { fat: 0, pedidos: new Set() };
    map[key].fat += dcValorLinha(r);
    map[key].pedidos.add(dcPedidoChave(r));
  });
  var lista = Object.entries(map)
    .map(function(e) { return { nome: e[0], fat: e[1].fat, pedidos: e[1].pedidos.size }; });
  dcOrdenarItensRelatorio(lista, id);
  lista = lista.slice(0, 12);
  var max = lista.length ? lista[0].fat : 1;
  var listaTotal = lista.reduce(function(s, e) { return s + e.fat; }, 0) || 1;
  var html = '<table class="dc-tabela"><thead><tr><th>#</th><th>' + (label || 'Item') + '</th><th>Pedidos</th><th class="num">Faturamento</th><th class="num">%</th></tr></thead><tbody>';
  lista.forEach(function(item, idx) {
    var pct = item.fat / listaTotal * 100;
    var bar = item.fat / max * 100;
    html += '<tr><td class="pos">' + (idx + 1) + '</td><td>' + escapeHtml(item.nome) + '</td><td class="num">' + item.pedidos + '</td>'
      + '<td class="num">' + dcMoedaLimpa(item.fat) + '</td>'
      + '<td class="num" style="min-width:64px">'
      +   '<span style="font-size:11px;font-weight:700">' + dcNumeroLimpo(pct, 1) + '%</span>'
      +   '<div style="height:3px;background:#e2e8f0;border-radius:2px;margin-top:4px">'
      +     '<div style="height:3px;width:' + bar.toFixed(0) + '%;background:#1C64C0;border-radius:2px"></div>'
      +   '</div>'
      + '</td></tr>';
  });
  html += '</tbody></table>';
  var el = document.getElementById(id);
  if (el) el.innerHTML = lista.length ? html : '<div class="dc-empty">Sem dados para este recorte.</div>';
}

function dcChartProdutos(rows) {
  var map = {};
  rows.forEach(function(r){ var k = dcProdutoNome(r); map[k] = (map[k] || 0) + dcValorLinha(r); });
  var sorted = Object.entries(map).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
  dcDestroyChart('dc-chart-produtos');
  var ctx = document.getElementById('dc-chart-produtos');
  if (!ctx) return;
  DC_CHARTS['produtos'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: sorted.map(function(e){ return dcTextoCurto(e[0], 36); }), datasets:[{label:'Faturamento',data:sorted.map(function(e){ return e[1]; }),backgroundColor:'#1C64C0',borderRadius:4}] },
    options: _dcOptsLabels(true, function(v){ return dcValorCompacto(v); }, { right: 80 }),
    plugins: [DC_VALUE_LABEL_PLUGIN]
  });
}

function dcChartGrupos(rows) {
  var map = {};
  rows.forEach(function(r){ var k = dcGrupoNome(r); if (k && k.trim()) map[k] = (map[k] || 0) + dcValorLinha(r); });
  var sorted = Object.entries(map).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  dcDestroyChart('dc-chart-grupos');
  var ctx = document.getElementById('dc-chart-grupos');
  if (!ctx) return;
  DC_CHARTS['grupos'] = new Chart(ctx, {
    type: 'bar',
    data: { labels:sorted.map(function(e){return dcTextoCurto(e[0], 22);}), datasets:[{data:sorted.map(function(e){return e[1];}),backgroundColor:'#1C64C0',borderWidth:0,borderRadius:8}] },
    options: Object.assign(_dcOpts(false), { indexAxis: 'y' }),
    plugins: [DC_VALUE_LABEL_PLUGIN]
  });
}

function _dcInatNorm(s) {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function dcTabelaInativos(rows) {
  var el    = document.getElementById('dc-tab-inat') || document.getElementById('dc-tabela-inativos');
  var elRes = document.getElementById('dc-inat-resumo');
  if (!el) return;

  var fonte = Array.isArray(DC_RAW) && DC_RAW.length ? DC_RAW : (Array.isArray(rows) ? rows : []);
  if (!fonte.length) {
    el.innerHTML = '<div class="dc-empty">Sem dados carregados.</div>';
    if (elRes) elRes.style.display = 'none';
    return;
  }

  var hoje = new Date();

  // Popula select de representante com reps únicos de DC_RAW
  var repSel = document.getElementById('dc-inat-rep');
  if (repSel) {
    var repSet = new Set();
    fonte.forEach(function(r) {
      var rep = dcRepresentanteNome(r);
      if (rep && rep !== 'SEM REPRESENTANTE') repSet.add(rep);
    });
    var savedRep = repSel.value;
    repSel.innerHTML = '<option value="">Todos os representantes</option>'
      + Array.from(repSet).sort().map(function(rep) {
          return '<option value="' + escapeHtml(rep) + '"'
            + (rep === savedRep ? ' selected' : '') + '>'
            + escapeHtml(rep) + '</option>';
        }).join('');
  }

  // Filtro de representante: restringe fonte às linhas do rep selecionado
  var repFiltro = repSel ? _dcInatNorm(repSel.value || '') : '';
  var fonteRep = repFiltro
    ? fonte.filter(function(r) { return _dcInatNorm(dcRepresentanteNome(r)) === repFiltro; })
    : fonte;

  // Valor total por pedido (restrito ao rep se filtrado)
  var pedidoValores = {};
  fonteRep.forEach(function(r) {
    var pk = dcPedidoChave(r);
    if (pk) pedidoValores[pk] = (pedidoValores[pk] || 0) + dcValorLinha(r);
  });

  // Mapa por cliente: última data e pedido chave (restrito ao rep se filtrado)
  var mapa = {};
  fonteRep.forEach(function(r) {
    var k = dcClienteNome(r);
    var d = dcDataValor(r);
    if (!k || k === 'SEM CLIENTE' || !d || isNaN(d.getTime())) return;
    if (!mapa[k] || d > mapa[k].ultimaData) {
      mapa[k] = { ultimaData: d, ultimaPedidoKey: dcPedidoChave(r), ultimaRep: dcRepresentanteNome(r) };
    }
  });

  // DEPARA: DC_RAW primário, DC_CLI_LISTA suplementa (apenas sem filtro de rep)
  var mapaKeys = Object.keys(mapa);
  var normParaChave = {};
  mapaKeys.forEach(function(n) { normParaChave[_dcInatNorm(n)] = true; });
  var extras = [];
  if (!repFiltro) {
    DC_CLI_LISTA.forEach(function(n) {
      if (n && !normParaChave[_dcInatNorm(n)]) extras.push(n);
    });
  }
  var todos = mapaKeys.concat(extras);

  // Montar registros
  var arr = todos.map(function(nome) {
    var d = mapa[nome];
    if (!d) return { nome: nome, rep: '—', ultimaStr: '—', dias: -1, valorUltima: 0, semHistorico: true };
    var dias = Math.floor((hoje.getTime() - d.ultimaData.getTime()) / 86400000);
    return {
      nome: nome,
      rep: d.ultimaRep || '—',
      ultimaStr: d.ultimaData.toLocaleDateString('pt-BR'),
      dias: Math.max(0, dias),
      valorUltima: pedidoValores[d.ultimaPedidoKey] || 0,
      semHistorico: false
    };
  });

  // Threshold:
  //   vazio / 0 → mostrar todos (com histórico + sem histórico)
  //   N > 0     → mostrar APENAS clientes com compras que não compraram há N+ dias
  //               (sem histórico OCULTOS pois não têm dias calculáveis)
  var threshRaw = String((document.getElementById('dc-inat-dias') || {}).value || '').trim();
  var threshold = threshRaw === '' ? 0 : Math.max(0, parseInt(threshRaw) || 0);
  if (threshold > 0) {
    arr = arr.filter(function(e) { return !e.semHistorico && e.dias >= threshold; });
  }

  // Busca
  var busca = _dcInatNorm((document.getElementById('dc-inat-busca') || {}).value || '');
  if (busca) arr = arr.filter(function(e) { return _dcInatNorm(e.nome).indexOf(busca) >= 0; });

  // Ordenação por dias sem compra
  var modo = String((document.getElementById('dc-inat-ordem') || {}).value || 'dias_asc');
  arr.sort(function(a, b) {
    var da = a.semHistorico ? 999999 : a.dias;
    var db = b.semHistorico ? 999999 : b.dias;
    return modo === 'dias_asc' ? da - db : db - da;
  });

  if (!arr.length) {
    el.innerHTML = '<div class="dc-empty">Nenhum cliente' + (threshold > 0 ? ' sem compra há ' + threshold + '+ dias' : '') + '.</div>';
    if (elRes) elRes.style.display = 'none';
    return;
  }

  // Resumo (fora do tabela-wrap para não entrar no scroll)
  var cnt90 = 0, cnt60 = 0, cnt30 = 0, cntSem = 0;
  arr.forEach(function(e) {
    if (e.semHistorico)    cntSem++;
    else if (e.dias >= 90) cnt90++;
    else if (e.dias >= 60) cnt60++;
    else                   cnt30++;
  });
  if (elRes) {
    elRes.style.display = 'flex';
    elRes.innerHTML = [
      { n: arr.length, label: 'Total',         c: '#1C64C0' },
      { n: cnt90,      label: 'Crítico 90+d',  c: '#DC2626' },
      { n: cnt60,      label: 'Atenção 60+d',  c: '#D97706' },
      { n: cnt30,      label: 'Monitorar',     c: '#059669' },
      { n: cntSem,     label: 'Sem histórico', c: '#6B7280' }
    ].map(function(item) {
      return '<div style="border:1px solid #1a2640;border-radius:8px;padding:6px 12px;min-width:70px;text-align:center">'
        + '<strong style="display:block;font-size:18px;font-weight:900;color:' + item.c + '">' + item.n + '</strong>'
        + '<span style="font-size:9px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em">' + item.label + '</span>'
        + '</div>';
    }).join('');
  }

  // Tabela
  var h = '<table class="dc-tabela dc-inactive-table"><thead><tr>'
    + '<th>#</th><th>Cliente</th><th>Rep</th><th>Última compra</th>'
    + '<th class="num">Dias sem compra</th><th class="num">Valor última compra</th><th>Status</th>'
    + '</tr></thead><tbody>';
  arr.forEach(function(e, i) {
    var status, classe;
    if (e.semHistorico)    { status = 'Sem histórico'; classe = 'ok'; }
    else if (e.dias >= 90) { status = 'Crítico';       classe = 'critico'; }
    else if (e.dias >= 60) { status = 'Atenção';       classe = 'atencao'; }
    else                   { status = 'Monitorar';     classe = 'ok'; }
    var diasStr = e.semHistorico ? '—' : (e.dias + ' dias');
    h += '<tr><td class="pos">' + (i + 1) + '</td>'
      + '<td>' + escapeHtml(e.nome) + '</td>'
      + '<td style="font-size:11px;color:#5A7A74">' + escapeHtml(e.rep) + '</td>'
      + '<td>' + e.ultimaStr + '</td>'
      + '<td class="num"><strong>' + diasStr + '</strong></td>'
      + '<td class="num">' + (e.semHistorico ? '—' : dcMoedaLimpa(e.valorUltima)) + '</td>'
      + '<td><span class="dc-inactive-badge ' + classe + '">' + status + '</span></td></tr>';
  });
  el.innerHTML = h + '</tbody></table>';
}

function dcStatus(msg, ok) {
  var el = document.getElementById('dc-status');
  var texto = String(msg || '');
  if (texto.indexOf('Nenhum') >= 0 || texto.indexOf('Erro') >= 0 || texto.indexOf('âœ') >= 0 || texto.charAt(0) === '✗') {
    dcLoading(false);
  }
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? '#059669' : (msg.startsWith('✗') ? '#DC2626' : '#5A7A74');
}
// =============================================================================
// ADMIN MULTI-EMPRESA — Abas · Sincronizar · Processar · Salvar · Limpar
// =============================================================================

var EMPRESA_ATIVA = null;
var EMPRESAS_ADMIN_BASE = [];
var EMPRESAS_ADMIN = [];

async function _adminCarregarEmpresasMeta() {
  try {
    var empresasResp = await fetch(SUPA_URL + '/rest/v1/empresas?select=*&ativo=eq.true', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    });
    var empresas = await empresasResp.json();

    var apiResp = await fetch(SUPA_URL + '/rest/v1/api_config?select=empresa_id,sistema,api_url,ativo', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    });
    var apiConfigs = await apiResp.json();

    // Contratos de módulo — falha aqui não pode derrubar o painel admin
    var modulosPorEmpresa = {};
    try {
      var modResp = await fetch(SUPA_URL + '/rest/v1/empresa_modulos?select=empresa_id,modulo,ativo,expira_em', {
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
      });
      var modRows = await modResp.json();
      if (Array.isArray(modRows)) {
        var agora = Date.now();
        modRows.forEach(function(row) {
          if (!row || row.ativo !== true) return;
          if (row.expira_em && new Date(row.expira_em).getTime() <= agora) return;
          if (!modulosPorEmpresa[row.empresa_id]) modulosPorEmpresa[row.empresa_id] = [];
          modulosPorEmpresa[row.empresa_id].push(row.modulo);
        });
      }
    } catch (e) {
      console.warn('[ADMIN] Contratos de módulo indisponíveis:', e && e.message);
    }

    if (!Array.isArray(empresas)) throw new Error('Resposta invalida ao carregar empresas.');
    EMPRESAS_ADMIN = empresas.map(function(empresaDb) {
      var apiCfg = (apiConfigs || []).find(function(cfg) {
        return cfg.empresa_id === (empresaDb.id || empresaDb.empresa_id) && cfg.ativo !== false;
      }) || null;
      var origem = String(empresaDb.exibir_origem || 'manual').toLowerCase();
      return Object.assign({}, empresaDb, {
        empresa_id: empresaDb.id || empresaDb.empresa_id,
        nome: empresaDb.nome || 'Empresa',
        slug: empresaDb.slug || null,
        tem_api: !!apiCfg && origem === 'api',
        sistema: apiCfg && apiCfg.sistema ? apiCfg.sistema : (empresaDb.sistema || null),
        api_url: apiCfg && apiCfg.api_url ? apiCfg.api_url : (empresaDb.api_url || ''),
        modulos: modulosPorEmpresa[empresaDb.id || empresaDb.empresa_id] || [],
        empresa_codigo: empresaDb.codigo_empresa
          || empresaDb.codigo_cliente
          || empresaDb.codigo_cliente_id
          || empresaDb.visual_codigo_empresa
          || empresaDb.visual_codigo_cliente
          || null
      });
    }).filter(function(empresa) {
      return !!empresa.empresa_id;
    });
    EMPRESAS_ADMIN.forEach(function(e) { if (e.empresa_id && e.nome) LOJA_NOMES[e.empresa_id] = e.nome; });
  } catch (e) {
    console.warn('[ADMIN] Falha ao carregar metadados das empresas:', e);
  }
}

async function adminInicializar() {
  var sa = document.getElementById('sync-area'); if (sa) sa.style.display = 'none';
  await _adminCarregarEmpresasMeta();
  var allowedIds = SESSION && Array.isArray(SESSION.empresa_ids) ? SESSION.empresa_ids : null;
  var lista = (allowedIds && allowedIds.length)
    ? EMPRESAS_ADMIN.filter(function(e) { return allowedIds.indexOf(e.empresa_id) !== -1; })
    : EMPRESAS_ADMIN;
  if (!lista.length) lista = EMPRESAS_ADMIN;
  _adminRenderAbas(lista);
  _adminRenderSyncEmpresaSelect();
  var autoId = (SESSION && SESSION.empresa_id && lista.find(function(e) { return e.empresa_id === SESSION.empresa_id; }))
    ? SESSION.empresa_id
    : (lista[0] && lista[0].empresa_id);
  if (autoId) adminSelecionarEmpresa(autoId);
}

function _adminRenderAbas(lista) {
  var c = document.getElementById('admin-empresa-tabs'); if (!c) return;
  var items = Array.isArray(lista) ? lista : EMPRESAS_ADMIN;
  c.innerHTML = items.map(function(e) {
    var tag = e.tem_api ? '<span class="emp-tag tag-api">API</span>' : '<span class="emp-tag tag-manual">Manual</span>';
    var mods = (e.modulos || []).map(function(slug) {
      return '<span class="emp-tag tag-mod-' + slug + '">' + (slug === 'financeiro' ? 'FIN' : 'COM') + '</span>';
    }).join('');
    return '<button class="admin-emp-tab" data-id="' + e.empresa_id + '">' + e.nome + tag + mods + '</button>';
  }).join('');
  c.querySelectorAll('.admin-emp-tab').forEach(function(btn) {
    btn.addEventListener('click', function() { adminSelecionarEmpresa(this.dataset.id); });
  });
}

async function adminSelecionarEmpresa(id) {
  EMPRESA_ATIVA = EMPRESAS_ADMIN.find(function(e){ return e.empresa_id === id; });
  if (!EMPRESA_ATIVA) return;
  document.querySelectorAll('.admin-emp-tab').forEach(function(b){ b.classList.toggle('active', b.dataset.id === id); });
  var bar = document.getElementById('admin-action-bar'); if (bar) bar.style.display = 'flex';
  var nEl = document.getElementById('admin-emp-nome');   if (nEl) nEl.textContent = EMPRESA_ATIVA.nome;
  var bs  = document.getElementById('admin-btn-sync');   if (bs)  bs.style.display = EMPRESA_ATIVA.tem_api ? 'inline-flex' : 'none';
  if (typeof FULL_DATA !== 'undefined') FULL_DATA.bd = [];
  if (typeof BD_DATA   !== 'undefined') { BD_DATA.rows = []; BD_DATA.count = 0; }
  if (typeof GRIDS !== 'undefined' && GRIDS.bd) { GRIDS.bd.allData = []; GRIDS.bd.filtered = null; GRIDS.bd.page = 0; GRIDS.bd._render(); }
  _adminSetStatus('⏳ Carregando ' + EMPRESA_ATIVA.nome + '...');

  // Mostra modo correto
  _adminMostrarModo(EMPRESA_ATIVA.tem_api);

  // Atualiza select de empresa no painel de sync e carrega config de auto-sync
  _adminSyncAtualizarSelect(id);
  _adminAutoSyncCarregarConfig(id);

  // Carrega origem configurada e contagens
  await _adminCarregarOrigemEmpresa(id);
  await _adminAtualizarContagens();
  await _adminPreencherPeriodoSync(id);

  // Carrega dados existentes
  await _adminCarregar(id);
  await _adminCarregarCadastrosApiSalvos();
}

// ── AUTO-SYNC SCHEDULER ───────────────────────────────────────────────────────

var _AUTOSYNC_TICK_ID = null;
var _AUTOSYNC_INTERVAL_MIN = 0;
var _AUTOSYNC_NEXT_MS = 0;
var _AUTOSYNC_LS_KEY = 'resute_autosync_v1';

function adminAutoSyncConfigurar(intervalMin, empresaIdOverride) {
  if (_AUTOSYNC_TICK_ID) { clearInterval(_AUTOSYNC_TICK_ID); _AUTOSYNC_TICK_ID = null; }
  _AUTOSYNC_INTERVAL_MIN = parseInt(intervalMin) || 0;
  var empresaId = empresaIdOverride || (EMPRESA_ATIVA && EMPRESA_ATIVA.empresa_id) || '';
  try {
    var stored = JSON.parse(localStorage.getItem(_AUTOSYNC_LS_KEY) || '{}');
    stored[empresaId] = _AUTOSYNC_INTERVAL_MIN;
    localStorage.setItem(_AUTOSYNC_LS_KEY, JSON.stringify(stored));
  } catch(e) {}
  var statusEl = document.getElementById('adm-autosync-status');
  if (!_AUTOSYNC_INTERVAL_MIN || !empresaId) {
    if (statusEl) statusEl.style.display = 'none';
    return;
  }
  _AUTOSYNC_NEXT_MS = Date.now() + _AUTOSYNC_INTERVAL_MIN * 60 * 1000;
  if (statusEl) statusEl.style.display = 'flex';
  _AUTOSYNC_TICK_ID = setInterval(function() {
    var remaining = _AUTOSYNC_NEXT_MS - Date.now();
    var countdown = document.getElementById('adm-autosync-countdown');
    if (remaining <= 0) {
      clearInterval(_AUTOSYNC_TICK_ID); _AUTOSYNC_TICK_ID = null;
      var target = (EMPRESAS_ADMIN || []).find(function(e){ return e.empresa_id === empresaId; });
      if (target && target.tem_api) {
        if (countdown) countdown.textContent = 'Sincronizando...';
        if (EMPRESA_ATIVA && EMPRESA_ATIVA.empresa_id !== empresaId) EMPRESA_ATIVA = target;
        adminSincronizar().then(function() {
          adminAutoSyncConfigurar(_AUTOSYNC_INTERVAL_MIN, empresaId);
        }).catch(function() {
          adminAutoSyncConfigurar(_AUTOSYNC_INTERVAL_MIN, empresaId);
        });
      } else {
        adminAutoSyncConfigurar(_AUTOSYNC_INTERVAL_MIN, empresaId);
      }
      return;
    }
    var h = Math.floor(remaining / 3600000);
    var m = Math.floor((remaining % 3600000) / 60000);
    var s = Math.floor((remaining % 60000) / 1000);
    if (countdown) {
      countdown.textContent = 'Próximo sync em '
        + (h ? h + 'h ' : '')
        + String(m).padStart(2, '0') + 'min '
        + String(s).padStart(2, '0') + 's';
    }
  }, 1000);
}

function _adminAutoSyncCarregarConfig(empresaId) {
  if (!empresaId) return;
  try {
    var stored = JSON.parse(localStorage.getItem(_AUTOSYNC_LS_KEY) || '{}');
    var interval = stored[empresaId] || 0;
    var sel = document.getElementById('adm-autosync-interval');
    if (sel) sel.value = String(interval);
    if (interval) adminAutoSyncConfigurar(interval, empresaId);
    else {
      var statusEl = document.getElementById('adm-autosync-status');
      if (statusEl) statusEl.style.display = 'none';
    }
  } catch(e) {}
}

function _adminRenderSyncEmpresaSelect() {
  var sel = document.getElementById('adm-sync-empresa-select');
  var wrap = document.getElementById('adm-sync-empresa-wrap');
  if (!sel || !wrap) return;

  // Admin console context: usa ADMIN_CONSOLE.companies (todas as empresas)
  if (typeof ADMIN_CONSOLE !== 'undefined' && ADMIN_CONSOLE.companies && ADMIN_CONSOLE.companies.length) {
    var all = ADMIN_CONSOLE.companies.filter(function(c) { return c.ativo !== false; });
    wrap.style.display = '';
    sel.innerHTML = all.map(function(c) {
      var id = c.id || c.empresa_id;
      var hasApi = String(c.exibir_origem || '').toLowerCase() === 'api';
      return '<option value="' + id + '">' + (c.nome || id) + (hasApi ? '' : ' ·') + '</option>';
    }).join('');
    if (EMPRESA_ATIVA && EMPRESA_ATIVA.empresa_id) sel.value = EMPRESA_ATIVA.empresa_id;
    return;
  }

  // Contexto view-app: usa EMPRESAS_ADMIN (só APIs)
  var apis = (EMPRESAS_ADMIN || []).filter(function(e) { return e.tem_api; });
  if (apis.length <= 1) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  sel.innerHTML = apis.map(function(e) {
    return '<option value="' + e.empresa_id + '">' + (e.nome || e.empresa_id) + '</option>';
  }).join('');
  if (EMPRESA_ATIVA) sel.value = EMPRESA_ATIVA.empresa_id;
}

function _adminSyncAtualizarSelect(empresaId) {
  var sel = document.getElementById('adm-sync-empresa-select');
  if (sel && empresaId) sel.value = empresaId;
}

function admSyncAba(aba) {
  var panels = ['manual', 'auto'];
  panels.forEach(function(id) {
    var panel = document.getElementById('adm-tab-' + id);
    var btn = document.getElementById('adm-tab-' + id + '-btn');
    var active = id === aba;
    if (panel) panel.style.display = active ? '' : 'none';
    if (btn) {
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  });
}

async function _adminCarregar(empresa_id) {
  try {
    var v = await _fetchAll(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + empresa_id + '&select=*&order=dt_saida.asc',
      { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    );
    if (!Array.isArray(v) || !v.length) { _adminSetStatus('Sem dados. Cole na grade ou sincronize.'); return; }
    var headers = ['ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída','VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM','tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra','NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto','GRUPO PAI','subgrupo_produto','marca','familia_produto','classes'];
    var rows = v.map(function(r){ return [r.id_externo||'',r.num_pedido||'',r.produto||'',String(r.qtd||''),r.dt_emissao||'',r.dt_saida||'',String(r.valor||''),r.vendedor||'',r.industria||'',r.cliente||'',r.ano?String(r.ano):'',r.mes||'',r.grupo||'',r.semana||'',r.tipo_mercado||'',r.setor||'',r.cidade||'',r.uf||'',r.tipo_vendedor||'','','','','',r.empresa_nome||'',r.cnpj||'',r.grupo_produto||'',r.grupo_pai||'',r.subgrupo||'',r.marca||'',r.familia||'',r.classes||'']; });
    if (typeof BD_DATA   !== 'undefined') { BD_DATA.headers = headers; BD_DATA.rows = rows; BD_DATA.count = rows.length; }
    if (typeof FULL_DATA !== 'undefined') FULL_DATA.bd = rows;
    if (typeof GRIDS !== 'undefined' && GRIDS.bd) { GRIDS.bd.allData = rows; GRIDS.bd.filtered = null; GRIDS.bd.page = 0; GRIDS.bd._render(); }
    _adminSetStatus('✓ ' + rows.length.toLocaleString('pt-BR') + ' registros — ' + EMPRESA_ATIVA.nome, true);
  } catch(e) { _adminSetStatus('✗ ' + e.message); console.error(e); }
}

async function _adminPreencherPeriodoSync(empresa_id) {
  var inicioEl = document.getElementById('adm-sync-inicio');
  var fimEl = document.getElementById('adm-sync-fim');
  var resumo = document.getElementById('adm-periodo-resumo');
  if (!inicioEl || !fimEl) return;

  var hoje = new Date();
  var dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  try {
    var logR = await fetch(
      SUPA_URL + '/rest/v1/sync_log?empresa_id=eq.' + empresa_id + '&select=ultima_data',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    var logD = await logR.json();
    var ultimaData = logD && logD[0] && logD[0].ultima_data ? logD[0].ultima_data : null;
    if (ultimaData) {
      dataInicio = new Date(ultimaData);
      dataInicio.setDate(dataInicio.getDate() + 1);
    }
  } catch (e) {
    console.error(e);
  }

  function iso(d) { return d.toISOString().slice(0, 10); }
  inicioEl.value = iso(dataInicio);
  fimEl.value = iso(hoje);
  if (resumo) resumo.textContent = 'Período atual da sincronização: ' + dataInicio.toLocaleDateString('pt-BR') + ' até ' + hoje.toLocaleDateString('pt-BR');
}

function _adminObterPeriodoSync() {
  var inicioEl = document.getElementById('adm-sync-inicio');
  var fimEl = document.getElementById('adm-sync-fim');
  var resumo = document.getElementById('adm-periodo-resumo');
  var dataInicio = inicioEl && inicioEl.value ? new Date(inicioEl.value + 'T00:00:00') : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  var dataFim = fimEl && fimEl.value ? new Date(fimEl.value + 'T00:00:00') : new Date();
  if (dataInicio > dataFim) {
    var troca = dataInicio;
    dataInicio = dataFim;
    dataFim = troca;
  }
  if (resumo) resumo.textContent = 'Período atual da sincronização: ' + dataInicio.toLocaleDateString('pt-BR') + ' até ' + dataFim.toLocaleDateString('pt-BR');
  return { dataInicio: dataInicio, dataFim: dataFim };
}

var VS_ENDPOINTS = {
  // Endpoints dedicados de cadastro na Visual Saef
  clientes: ['/cadastrocliente'],
  produtos: ['/cadastroproduto'],
  representantes: ['/cadastrovendedor']
};

var CADASTRO_TABLES = {
  clientes: ['clientes_cad'],
  produtos: ['produtos'],
  representantes: ['representantes']
};

function _vsNormalizeMap(item) {
  var map = {};
  Object.keys(item || {}).forEach(function(key) {
    map[key.toLowerCase().replace(/[\s_\-./]/g, '')] = item[key];
  });
  return map;
}

function _vsPick(item, keys) {
  var map = _vsNormalizeMap(item);
  for (var i = 0; i < keys.length; i += 1) {
    var val = map[String(keys[i]).toLowerCase().replace(/[\s_\-./]/g, '')];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return null;
}

function _vsExtractList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  var keys = ['data', 'Data', 'items', 'Items', 'itens', 'Itens', 'result', 'Result', 'results', 'Results', 'resultado', 'Resultado', 'dados', 'Dados', 'registros', 'Registros', 'retorno', 'Retorno', 'value', 'Value'];
  for (var i = 0; i < keys.length; i += 1) {
    if (Array.isArray(payload[keys[i]])) return payload[keys[i]];
  }
  var values = Object.keys(payload).map(function(key) { return payload[key]; });
  for (var j = 0; j < values.length; j += 1) {
    if (Array.isArray(values[j])) return values[j];
  }
  return [];
}

function _vsToNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  var raw = String(value).trim();
  if (!raw) return 0;
  if (raw.indexOf(',') >= 0 && raw.indexOf('.') >= 0) raw = raw.replace(/\./g, '').replace(',', '.');
  else raw = raw.replace(',', '.');
  return Number(raw) || 0;
}

function _vsToBool(value) {
  if (typeof value === 'boolean') return value;
  var text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return ['1', 'true', 'sim', 's', 'ativo', 'a'].indexOf(text) >= 0;
}

async function _vsFetchCandidate(token, endpoint, params) {
  var qs = new URLSearchParams(params || {}).toString();
  var path = endpoint + (qs ? '?' + qs : '');
  // A Visual Saef responde corretamente no Swagger com Accept: text/plain
  // e o corpo ainda vem em JSON serializado. Mantemos esse formato aqui
  // para replicar exatamente a chamada validada manualmente.
  var codigoEmpresa = _getVisualCodigoEmpresa();
  var _vsApiUrl = (EMPRESA_ATIVA && EMPRESA_ATIVA.api_url || '').replace(/\/$/, '');
  var useProxyFirst = !!codigoEmpresa;
  var firstResp = null;
  var firstText = '';
  var firstPayload = null;
  var firstRunner = useProxyFirst ? _fetchApiProxy : _fetchApiDirect;
  var secondRunner = useProxyFirst ? _fetchApiDirect : _fetchApiProxy;

  try {
    firstResp = await firstRunner(_vsApiUrl, path, token, { Accept: 'text/plain' });
    firstText = await firstResp.text();
    try { firstPayload = firstText ? JSON.parse(firstText) : []; } catch (e) { firstPayload = firstText; }
    if (firstResp.ok) {
      return { ok: firstResp.ok, status: firstResp.status, endpoint: endpoint, payload: firstPayload, text: firstText };
    }
  } catch (e) {
    firstResp = null;
  }

  var resp = await secondRunner(_vsApiUrl, path, token, { Accept: 'text/plain' });
  var text = await resp.text();
  var payload = null;
  try { payload = text ? JSON.parse(text) : []; } catch (e) { payload = text; }
  return { ok: resp.ok, status: resp.status, endpoint: endpoint, payload: payload, text: text };
}

async function _vsFindEndpointData(token, candidates, params) {
  var attempts = [];
  var withoutDates = {};
  Object.keys(params || {}).forEach(function(key) {
    if (key !== 'DataInicio' && key !== 'DataTermino') withoutDates[key] = params[key];
  });

  for (var i = 0; i < candidates.length; i += 1) {
    var endpoint = candidates[i];

    // Alguns endpoints de cadastro da Visual Saef funcionam melhor sem o
    // filtro de período. Testamos primeiro a rota pura e, se não vier
    // conteúdo, repetimos com as datas.
    var first = await _vsFetchCandidate(token, endpoint, withoutDates);
    attempts.push({
      endpoint: endpoint + ' (sem período)',
      status: first.status,
      body: first.ok ? '' : String(first.text || '').slice(0, 140)
    });
    if (first.ok) {
      var list = _vsExtractList(first.payload);
      if (Array.isArray(list) && list.length) return { endpoint: endpoint, items: list, attempts: attempts };
      if (Array.isArray(first.payload) && !list.length) return { endpoint: endpoint, items: first.payload, attempts: attempts };
    }

    if (params && Object.keys(params).length) {
      var second = await _vsFetchCandidate(token, endpoint, params);
      attempts.push({
        endpoint: endpoint,
        status: second.status,
        body: second.ok ? '' : String(second.text || '').slice(0, 140)
      });
      if (second.ok) {
        var list2 = _vsExtractList(second.payload);
        if (Array.isArray(list2) && list2.length) return { endpoint: endpoint, items: list2, attempts: attempts };
        if (Array.isArray(second.payload) && !list2.length) return { endpoint: endpoint, items: second.payload, attempts: attempts };
      }
    }
  }

  return { endpoint: '', items: [], attempts: attempts };
}
function _vsResumoTentativas(attempts) {
  if (!Array.isArray(attempts) || !attempts.length) return '';
  return attempts.map(function(item) {
    var detail = item.body ? (' - ' + item.body.replace(/\s+/g, ' ').trim()) : '';
    return item.endpoint + ': HTTP ' + item.status + detail;
  }).join(' | ');
}

function _vsAllAttemptsStatus(attempts, status) {
  if (!Array.isArray(attempts) || !attempts.length) return false;
  return attempts.every(function(item) {
    return Number(item.status) === Number(status);
  });
}

async function _adminReplaceApiTable(table, rows) {
  var delResp = await fetch(SUPA_URL + '/rest/v1/' + table + '?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id, {
    method: 'DELETE',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SVC_KEY,
      'Prefer': 'return=minimal',
      'Content-Type': 'application/json'
    }
  });
  if (!delResp.ok) {
    var delText = await delResp.text();
    throw new Error('Falha ao limpar ' + table + ': HTTP ' + delResp.status + ' ' + delText.slice(0, 220));
  }

  if (!rows.length) return { count: 0, ok: true };

  var inserted = 0;
  for (var i = 0; i < rows.length; i += 300) {
    var batch = rows.slice(i, i + 300);
    var insResp = await fetch(SUPA_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SVC_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(batch)
    });
    var insText = await insResp.text();
    if (!insResp.ok) {
      throw new Error('Falha ao salvar ' + table + ': HTTP ' + insResp.status + ' ' + insText.slice(0, 220));
    }
    inserted += batch.length;
  }
  return { count: inserted, ok: true };
}

function _adminIsMissingTableError(message) {
  var text = String(message || '').toLowerCase();
  return text.indexOf('pgrst205') >= 0
    || text.indexOf('could not find the table') >= 0
    || text.indexOf('schema cache') >= 0
    || text.indexOf('perhaps you meant the table') >= 0;
}

async function _adminFetchCadastroTable(candidates) {
  var ultimoErro = null;
  var primeiraDisponivel = null;
  for (var i = 0; i < candidates.length; i += 1) {
    var table = candidates[i];
    try {
      var resp = await fetch(SUPA_URL + '/rest/v1/' + table + '?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id + '&select=*&limit=100000', {
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
      });
      if (!resp.ok) {
        ultimoErro = new Error('HTTP ' + resp.status + ' em ' + table);
        continue;
      }
      var data = await resp.json();
      var rows = Array.isArray(data) ? data : [];
      if (rows.length) return { table: table, rows: rows };
      if (!primeiraDisponivel) primeiraDisponivel = { table: table, rows: rows };
    } catch (e) {
      ultimoErro = e;
    }
    if (i === candidates.length - 1 && primeiraDisponivel) return primeiraDisponivel;
  }
  throw ultimoErro || new Error('Nenhuma tabela de cadastro disponível.');
}

async function _adminReplaceApiTableCandidates(candidates, rows) {
  var ultimoErro = null;
  for (var i = 0; i < candidates.length; i += 1) {
    var table = candidates[i];
    try {
      var save = await _adminReplaceApiTable(table, rows);
      return { table: table, count: save.count, ok: save.ok };
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw ultimoErro || new Error('Nenhuma tabela de cadastro pôde ser gravada.');
}

async function _adminLimparCadastrosApiSync() {
  var allTables = [];
  Object.keys(CADASTRO_TABLES).forEach(function(key) {
    (CADASTRO_TABLES[key] || []).forEach(function(table) {
      if (allTables.indexOf(table) < 0) allTables.push(table);
    });
  });

  for (var i = 0; i < allTables.length; i += 1) {
    try {
      await _adminReplaceApiTable(allTables[i], []);
    } catch (e) {
      if (_adminIsMissingTableError(e && e.message)) continue;
      throw e;
    }
  }
}

function _adminPadRows(rows, totalCols, minRows) {
  var filled = rows.slice();
  while (filled.length < minRows) {
    filled.push(Array(totalCols).fill(''));
  }
  return filled;
}

function _adminAplicarGridApi(kind, rows, totalCols, minRows) {
  var padded = _adminPadRows(rows, totalCols, minRows);
  FULL_DATA[kind] = rows.slice();
  GRID_DATA_STORE[kind] = rows.filter(function(r) {
    return r && r.some(function(c) { return c !== '' && c !== null && c !== undefined; });
  });
  if (GRIDS && GRIDS[kind]) GRIDS[kind].setData(padded);
}

function _adminMapClientesApi(items) {
  var seen = {};
  return items.map(function(item, idx) {
    var codigo = String(_vsPick(item, ['codigoCliente', 'id', 'codigo', 'codcliente', 'clienteid', 'idcliente']) || idx + 1).trim();
    var id = codigo || ('cli_' + (idx + 1));
    var base = id;
    var seq = 1;
    while (seen[id]) { seq += 1; id = base + '__' + seq; }
    seen[id] = true;
    return {
      empresa_id: EMPRESA_ATIVA.empresa_id,
      id_externo: id,
      nome: String(_vsPick(item, ['nomeCliente', 'nome', 'cliente', 'nomecliente', 'razaosocial']) || '').trim(),
      razao_social: String(_vsPick(item, ['nomeCliente', 'razaosocial', 'razao', 'nome']) || '').trim(),
      cnpj_cpf: String(_vsPick(item, ['cpfcnpj', 'cnpj', 'cpf', 'cnpjcpf', 'documento']) || '').trim(),
      cidade: String(_vsPick(item, ['cidade', 'municipio']) || '').trim(),
      uf: String(_vsPick(item, ['uf', 'estado']) || '').trim(),
      telefone: String(_vsPick(item, ['telefone', 'fone', 'celular']) || '').trim(),
      email: String(_vsPick(item, ['email', 'mail']) || '').trim(),
      endereco: String(_vsPick(item, ['endereco', 'logradouro', 'rua', 'bairro']) || '').trim(),
      grupo_cliente: String(_vsPick(item, ['grupocliente', 'grupo', 'categoria', 'tipo']) || '').trim(),
      vendedor: String(_vsPick(item, ['vendedor', 'representante', 'nomevendedor']) || '').trim(),
      data_cadastro: _cvData(_vsPick(item, ['datacadastro', 'cadastro', 'dtcadastro']))
    };
  });
}

function _adminMapProdutosApi(items) {
  var seen = {};
  return items.map(function(item, idx) {
    var codigoPermanente = String(_vsPick(item, ['codigoPermanente', 'codigopermanente', 'codigo_permanente']) || '').trim();
    var codigoItem = String(_vsPick(item, ['codigoItem', 'codigoitem', 'codigo_item', 'codigo', 'codproduto', 'id', 'idproduto']) || '').trim();
    var descricaoItem = String(_vsPick(item, ['descricaoItem', 'descricaoitem', 'descricaoproduto', 'descricao', 'produto', 'nome']) || '').trim();
    var unidade = String(_vsPick(item, ['unidade', 'un', 'unidademedida']) || '').trim();
    var cst = String(_vsPick(item, ['cst']) || '').trim();
    var codigo = codigoItem || codigoPermanente;
    var nome = descricaoItem || codigoItem || codigoPermanente || ('PRODUTO ' + (idx + 1));
    var id = codigo || nome || ('prd_' + (idx + 1));
    var base = id;
    var seq = 1;
    while (seen[id]) { seq += 1; id = base + '__' + seq; }
    seen[id] = true;
    return {
      empresa_id: EMPRESA_ATIVA.empresa_id,
      id_externo: id,
      codigo: codigo || id,
      nome: nome,
      codigo_permanente: codigoPermanente || codigo || id,
      codigo_item: codigoItem || codigo || id,
      descricao_item: descricaoItem || nome,
      grupo: String(_vsPick(item, ['grupo', 'grupoproduto', 'categoria']) || 'SEM GRUPO').trim() || 'SEM GRUPO',
      marca: String(_vsPick(item, ['marca', 'fabricante', 'industria']) || 'SEM MARCA').trim() || 'SEM MARCA',
      preco: _vsToNumber(_vsPick(item, ['preco', 'precovenda', 'valor', 'valorunitario', 'valorVenda'])),
      unidade: unidade || 'UN',
      cst: cst || '000',
      aliq_icms: _vsToNumber(_vsPick(item, ['aliqICMS', 'aliqicms', 'icms'])),
      aliq_ipi: _vsToNumber(_vsPick(item, ['aliqIPI', 'aliqipi', 'ipi'])),
      aliq_icms_st: _vsToNumber(_vsPick(item, ['aliqICMS_ST', 'aliqicms_st', 'aliqicmsst'])),
      percent_mva: _vsToNumber(_vsPick(item, ['percentMVA', 'percentmva', 'mva'])),
      valor_venda: _vsToNumber(_vsPick(item, ['valorVenda', 'valorvenda', 'preco', 'precovenda', 'valor', 'valorunitario'])),
      desconto_maximo: _vsToNumber(_vsPick(item, ['descontoMaximo', 'descontomaximo', 'desconto'])),
      ativo: _vsToBool(_vsPick(item, ['ativo', 'status', 'situacao']))
    };
  });
}

function _adminMapRepresentantesApi(items) {
  var seen = {};
  return items.map(function(item, idx) {
    var codigo = String(_vsPick(item, ['codigoVendedor', 'codigo', 'codrepresentante', 'codvendedor', 'id']) || '').trim();
    var nome = String(_vsPick(item, ['nomeVendedor', 'nome', 'representante', 'vendedor']) || '').trim();
    var id = codigo || nome || ('rep_' + (idx + 1));
    var base = id;
    var seq = 1;
    while (seen[id]) { seq += 1; id = base + '__' + seq; }
    seen[id] = true;
    return {
      empresa_id: EMPRESA_ATIVA.empresa_id,
      id_externo: id,
      codigo: codigo || id,
      nome: nome,
      regiao: String(_vsPick(item, ['codigoZonaVenda', 'regiao', 'zona', 'rota']) || '').trim(),
      uf: String(_vsPick(item, ['uf', 'estado']) || '').trim(),
      telefone: String(_vsPick(item, ['telefone', 'fone', 'celular']) || '').trim(),
      email: String(_vsPick(item, ['email', 'mail']) || '').trim(),
      ativo: _vsToBool(_vsPick(item, ['ativo', 'status', 'situacao']))
    };
  });
}

function _adminAplicarCadastrosApiNaInterface(summary) {
  var statusAtivo = function(row) {
    if (row.ativo_inat) return row.ativo_inat;
    if (row.ativo === false) return 'INATIVO';
    return 'ATIVO';
  };
  var cliSource = summary.clientes && summary.clientes.rows ? summary.clientes.rows : [];
  var cliRows = cliSource.map(function(row, idx) {
    return [
      String(idx + 1),
      row.cod_cli || row.id_externo || '',
      row.nome || row.razao_social || '',
      row.tipo || row.grupo_cliente || '',
      row.cnpj_cpf || '',
      '',
      row.cidade || '',
      row.uf || '',
      row.endereco || row.bairro || '',
      row.telefone || '',
      row.email || '',
      row.fantasia || row.razao_social || row.nome || '',
      row.vendedor || '',
      row.uf || '',
      '', '', '', '', row.data_cadastro || '', row.zona_venda || '', ''
    ];
  });
  _adminAplicarGridApi('clientes', cliRows, 21, 200);

  var repSource = summary.representantes && summary.representantes.rows ? summary.representantes.rows : [];
  var repRows = repSource.map(function(row, idx) {
    return [
      String(idx + 1),
      row.cod || row.codigo || row.id_externo || '',
      row.nome || '',
      row.tipo || statusAtivo(row),
      row.regiao || row.tipo_produto || '',
      row.telefone || row.fone || '',
      '',
      row.email || '',
      row.uf || '',
      row.regiao || row.tipo_produto || '',
      '', '', '', '', '', '', '', ''
    ];
  });
  _adminAplicarGridApi('representantes', repRows, 18, 120);

  var prodSource = summary.produtos && summary.produtos.rows ? summary.produtos.rows : [];
  var prodRows = prodSource.map(function(row, idx) {
    return [
      String(idx + 1),
      row.cod_prod || row.codigo || row.id_externo || '',
      row.descricao || row.nome || '',
      row.grupo || '',
      row.marca || '',
      row.unidade || '',
      statusAtivo(row),
      row.tipo_produto || row.marca || '',
      '', '', '', '', '', '', '', ''
    ];
  });
  _adminAplicarGridApi('produto', prodRows, 16, 200);
}

function _adminRenderApiModules(summary) {
  var host = document.getElementById('adm-api-modulos');
  if (!host) return;
  var modules = [
    { key: 'vendas', label: 'Vendas', fallback: 'Base principal sincronizada' },
    { key: 'clientes', label: 'Clientes', fallback: 'Cadastro para enriquecer cidade, setor e ciclo' },
    { key: 'produtos', label: 'Produtos', fallback: 'Cadastro para grupo, marca e mix' },
    { key: 'representantes', label: 'Representantes', fallback: 'Cadastro para cobertura comercial' }
  ];
  host.innerHTML = modules.map(function(mod) {
    var item = summary && summary[mod.key] ? summary[mod.key] : {};
    var count = Number(item.count || 0).toLocaleString('pt-BR');
    var isDerived = item.ok && item.endpoint && item.endpoint.indexOf('derivado') >= 0;
    var badgeClass = item.ok ? (isDerived ? 'derived' : 'ok') : '';
    var badge = item.ok
      ? (isDerived ? 'Derivado ✓' : '✓ Sincronizado')
      : (!item.pending ? '✗ Indisponível' : (item.count > 0 ? '⚠ Parcial' : '— Aguardando'));
    var meta = item.message || mod.fallback;
    var endpoint = item.endpoint ? ('Endpoint: ' + item.endpoint) : 'Endpoint: aguardando confirmação';
    return ''
      + '<div class="adm-module-card">'
      +   '<div class="adm-module-top">'
      +     '<div class="adm-module-name">' + mod.label + '</div>'
      +     '<span class="adm-module-badge ' + badgeClass + '">' + badge + '</span>'
      +   '</div>'
      +   '<div class="adm-module-count">' + count + '</div>'
      +   '<div class="adm-module-meta">' + meta + '</div>'
      +   '<div class="adm-module-endpoint">' + endpoint + '</div>'
      + '</div>';
  }).join('');
}

async function _adminCarregarCadastrosApiSalvos() {
  if (!EMPRESA_ATIVA || !EMPRESA_ATIVA.tem_api) {
    _adminRenderApiModules({});
    return;
  }

  var jobs = [
    { key: 'clientes', tables: CADASTRO_TABLES.clientes },
    { key: 'produtos', tables: CADASTRO_TABLES.produtos },
    { key: 'representantes', tables: CADASTRO_TABLES.representantes }
  ];
  var summary = {
    vendas: {
      ok: typeof BD_DATA !== 'undefined' && BD_DATA.rows && BD_DATA.rows.length > 0,
      pending: !(typeof BD_DATA !== 'undefined' && BD_DATA.rows && BD_DATA.rows.length > 0),
      count: typeof BD_DATA !== 'undefined' && BD_DATA.rows ? BD_DATA.rows.length : 0,
      endpoint: '/relacaovendaitem',
      message: 'Base principal pronta para gerar relatórios.'
    }
  };

  for (var i = 0; i < jobs.length; i += 1) {
    var job = jobs[i];
    try {
      var foundTable = await _adminFetchCadastroTable(job.tables);
      var data = foundTable.rows;
      summary[job.key] = {
        ok: Array.isArray(data) && data.length > 0,
        pending: !Array.isArray(data) || data.length === 0,
        count: Array.isArray(data) ? data.length : 0,
        endpoint: foundTable.table ? ('/' + foundTable.table) : '',
        rows: Array.isArray(data) ? data : [],
        message: Array.isArray(data) && data.length
          ? data.length + ' registros carregados do banco para enriquecer a visualização.'
          : 'Sem cadastros sincronizados ainda para este módulo.'
      };
    } catch (e) {
      summary[job.key] = {
        ok: false,
        pending: false,
        count: 0,
        endpoint: '',
        message: 'Tabela ainda não disponível ou sem acesso neste ambiente.'
      };
    }
  }

  _adminAplicarCadastrosApiNaInterface(summary);
  _adminRenderApiModules(summary);
}

async function _adminReplaceOrigemTable(table, rows) {
  if (!rows.length) return;
  // Apaga tudo da empresa nesta tabela
  var del = await fetch(SUPA_URL + '/rest/v1/' + table + '?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id, {
    method: 'DELETE',
    headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal', 'Content-Type': 'application/json' }
  });
  if (!del.ok) {
    var delErr = await del.text();
    throw new Error('Erro ao limpar ' + table + ': ' + delErr.slice(0,200));
  }
  // Insere em lotes
  for (var i = 0; i < rows.length; i += 500) {
    var batch = rows.slice(i, i+500);
    var r = await fetch(SUPA_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify(batch)
    });
    if (!r.ok) {
      var err = await r.text();
      throw new Error('Erro ao salvar ' + table + ': ' + err.slice(0,200));
    }
  }
}

async function _adminSincronizarCadastrosApi(token, dataInicio, dataFim) {
  var codigoEmpresaVisual = _getVisualCodigoEmpresa();
  var jobs = [
    { key: 'clientes', tables: CADASTRO_TABLES.clientes, candidates: VS_ENDPOINTS.clientes, mapper: _adminMapClientesApi },
    { key: 'produtos', tables: CADASTRO_TABLES.produtos, candidates: VS_ENDPOINTS.produtos, mapper: _adminMapProdutosApi },
    { key: 'representantes', tables: CADASTRO_TABLES.representantes, candidates: VS_ENDPOINTS.representantes, mapper: _adminMapRepresentantesApi }
  ];
  var summary = {};

  for (var i = 0; i < jobs.length; i += 1) {
    var job = jobs[i];
    try {
      var found = await _vsFindEndpointData(token, job.candidates, null);
      if (!found.items.length) {
        var endpointPrincipal = job.candidates[0] || found.endpoint || '';
        var bloqueado403 = _vsAllAttemptsStatus(found.attempts, 403);
        var ausente404 = _vsAllAttemptsStatus(found.attempts, 404);
        var mensagemErro = !codigoEmpresaVisual
          ? 'Codigo da empresa Visual Saef nao configurado. Cadastros bloqueados.'
          : (bloqueado403
            ? ('API bloqueou o endpoint ' + endpointPrincipal + ' (HTTP 403).')
            : (ausente404
              ? ('Endpoint ' + endpointPrincipal + ' nao encontrado na API (HTTP 404).')
              : (_vsResumoTentativas(found.attempts) || 'Nenhum endpoint confirmou dados neste ambiente.')));
        summary[job.key] = {
          ok: false,
          pending: !(bloqueado403 || ausente404),
          count: 0,
          endpoint: endpointPrincipal,
          message: mensagemErro
        };
        continue;
      }

      var mapped = job.mapper(found.items);
      var save = await _adminReplaceApiTableCandidates(job.tables, mapped);
      summary[job.key] = {
        ok: true,
        pending: false,
        count: save.count,
        endpoint: found.endpoint + ' -> ' + save.table,
        rows: mapped,
        message: save.count + ' registros sincronizados para enriquecer relatórios e cadastros.'
      };
    } catch (e) {
      summary[job.key] = {
        ok: false,
        pending: false,
        count: 0,
        endpoint: '',
        message: e.message
      };
    }
  }

  _adminAplicarCadastrosApiNaInterface(summary);
  return summary;
}


function adminProcessar() {
  if (!EMPRESA_ATIVA) { alert('Selecione uma empresa.'); return; }
  var src = (typeof FULL_DATA !== 'undefined' && FULL_DATA.bd && FULL_DATA.bd.length) ? FULL_DATA.bd : (typeof GRIDS !== 'undefined' && GRIDS.bd ? GRIDS.bd.getData() : []);
  var rows = src.filter(function(r){ return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; }); });
  if (!rows.length) { alert('Sem dados. Cole na grade ou sincronize.'); return; }
  _adminSetStatus('⏳ Processando ' + rows.length.toLocaleString('pt-BR') + ' linhas...');
  var headers = ['ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída','VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM','tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra','NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto','GRUPO PAI','subgrupo_produto','marca','familia_produto','classes'];
  if (typeof BD_DATA   !== 'undefined') { BD_DATA.headers = headers; BD_DATA.rows = rows; BD_DATA.count = rows.length; }
  if (typeof FULL_DATA !== 'undefined') FULL_DATA.bd = rows;
  setTimeout(function() {
    try { bdMapColumns(); } catch(e) { console.error(e); }
    try { bdAutoFill(); }   catch(e) { console.error(e); }
    try { bdUpdateAllTabs(); } catch(e) { console.error(e); }
    if (typeof GRIDS !== 'undefined' && GRIDS.bd) { GRIDS.bd.allData = BD_DATA.rows; GRIDS.bd.filtered = null; GRIDS.bd.page = 0; GRIDS.bd._render(); }
    _adminSetStatus('✓ ' + rows.length.toLocaleString('pt-BR') + ' linhas processadas — salvando no banco...', true);
    // Salva automaticamente no Supabase para o cliente ver
    adminSalvarBancoSilencioso(rows);
  }, 10);
}

async function adminSalvarBancoSilencioso(rowsParam) {
  if (!EMPRESA_ATIVA) return;
  var eid = EMPRESA_ATIVA.empresa_id, ts = Date.now();
  var rows = rowsParam || [];
  if (!rows.length) return;

  var regs = rows.map(function(r, i) {
    return { empresa_id:eid, id_externo:'manual_'+eid.slice(0,8)+'_'+ts+'_'+i,
      num_pedido:r[1]||null, produto:r[2]||null, qtd:parseFloat(r[3])||null,
      dt_emissao:r[4]||null, dt_saida:r[5]||null,
      valor:parseFloat(String(r[6]||'0').replace(',','.'))||null,
      vendedor:r[7]||null, industria:r[8]||null, cliente:r[9]||null,
      ano:parseInt(r[10])||null, mes:r[11]||null, grupo:r[12]||null,
      cidade:r[16]||null, uf:r[17]||null,
      empresa_nome:EMPRESA_ATIVA.nome, cnpj:r[24]||null, marca:r[28]||null };
  });

  try {
    // Remove manuais antigos e insere novos
    await fetch(SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + eid + '&id_externo=like.manual_*',
      { method:'DELETE', headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SVC_KEY} });

    for (var i = 0; i < regs.length; i += 500) {
      var batch = regs.slice(i, i+500);
      await fetch(SUPA_URL + '/rest/v1/vendas', {
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SVC_KEY,'Prefer':'return=minimal'},
        body:JSON.stringify(batch)
      });
      _adminSetStatus('⏳ Salvando... ' + Math.min(i+500,regs.length) + '/' + regs.length);
    }
    _adminSetStatus('✓ ' + regs.length.toLocaleString('pt-BR') + ' linhas salvas — cliente pode ver os relatórios!', true);
  } catch(e) {
    _adminSetStatus('⚠ Processado mas erro ao salvar: ' + e.message);
    console.error(e);
  }
}

async function adminSalvarBanco() {
  if (!EMPRESA_ATIVA) { alert('Selecione uma empresa.'); return; }
  var src = (typeof FULL_DATA !== 'undefined' && FULL_DATA.bd && FULL_DATA.bd.length) ? FULL_DATA.bd : (typeof GRIDS !== 'undefined' && GRIDS.bd ? GRIDS.bd.getData() : []);
  var rows = src.filter(function(r){ return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; }); });
  if (!rows.length) { alert('Sem dados para salvar.'); return; }
  if (!confirm('Salvar ' + rows.length.toLocaleString('pt-BR') + ' linhas para ' + EMPRESA_ATIVA.nome + '?')) return;
  var eid = EMPRESA_ATIVA.empresa_id, ts = Date.now();
  var regs = rows.map(function(r, i) {
    return { empresa_id:eid, id_externo:'manual_'+eid.slice(0,8)+'_'+ts+'_'+i,
      num_pedido:r[1]||null, produto:r[2]||null, qtd:parseFloat(r[3])||null,
      dt_emissao:r[4]||null, dt_saida:r[5]||null, valor:parseFloat(String(r[6]||'0').replace(',','.'))||null,
      vendedor:r[7]||null, industria:r[8]||null, cliente:r[9]||null,
      ano:parseInt(r[10])||null, mes:r[11]||null, grupo:r[12]||null,
      cidade:r[16]||null, uf:r[17]||null, empresa_nome:EMPRESA_ATIVA.nome, cnpj:r[24]||null, marca:r[28]||null };
  });
  try {
    await fetch(SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + eid + '&id_externo=like.manual_*',
      { method:'DELETE', headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SVC_KEY} });
    for (var i = 0; i < regs.length; i += 500) {
      var batch = regs.slice(i, i+500);
      var res = await fetch(SUPA_URL + '/rest/v1/vendas', {
        method:'POST', headers:{'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SVC_KEY,'Prefer':'return=minimal'},
        body:JSON.stringify(batch) });
      if (!res.ok) { var err = await res.text(); throw new Error(err.slice(0,200)); }
      _adminSetStatus('⏳ ' + Math.min(i+500,regs.length) + '/' + regs.length + ' salvos...');
    }
    _adminSetStatus('✓ ' + regs.length.toLocaleString('pt-BR') + ' linhas salvas para ' + EMPRESA_ATIVA.nome + '!', true);
  } catch(e) { _adminSetStatus('✗ ' + e.message); alert('Erro ao salvar: ' + e.message); }
}

async function adminLimparBanco() {
  if (!EMPRESA_ATIVA) return;
  if (!confirm('⚠️ APAGAR TODOS OS DADOS de ' + EMPRESA_ATIVA.nome + '?\nEssa ação não pode ser desfeita!')) return;
  if (!confirm('Confirme: Apagar TUDO de ' + EMPRESA_ATIVA.nome + '?')) return;
  _adminSetStatus('⏳ Limpando banco de ' + EMPRESA_ATIVA.nome + '...');
  try {
    await fetch(SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id,
      { method:'DELETE', headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SVC_KEY} });
    if (typeof FULL_DATA !== 'undefined') FULL_DATA.bd = [];
    if (typeof BD_DATA   !== 'undefined') { BD_DATA.rows = []; BD_DATA.count = 0; }
    if (typeof GRIDS !== 'undefined' && GRIDS.bd) { GRIDS.bd.allData = []; GRIDS.bd.filtered = null; GRIDS.bd.page = 0; GRIDS.bd._render(); }
    _adminSetStatus('✓ Banco de ' + EMPRESA_ATIVA.nome + ' limpo!', true);
  } catch(e) { _adminSetStatus('✗ ' + e.message); }
}

function _adminSetStatus(msg, ok) {
  var el = document.getElementById('admin-sync-status'); if (!el) return;
  el.textContent = msg;
  el.className = 'admin-sync-status' + (ok ? ' ok' : (msg.startsWith('✗') ? ' erro' : ''));
}

function dcSelecionarLoja(empresa_id) {
  // Destaca loja ativa
  document.querySelectorAll('.dc-loja-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.id === empresa_id);
  });
  // Atualiza badge
  var badge = document.getElementById('dc-empresa');
  if (badge) badge.textContent = LOJA_NOMES[empresa_id] || 'Empresa';
  // Carrega dados da loja selecionada
  dcCarregarDados(empresa_id);
}

function _montarSeletorLojas() {
  var ids = SESSION.empresa_ids;
  if (!ids || ids.length <= 1) return;
  var sel = document.getElementById('dc-loja-selector');
  if (!sel) return;
  sel.innerHTML = ids.map(function(id) {
    return '<button class="dc-loja-btn" data-id="'+id+'">'+(LOJA_NOMES[id]||id.slice(0,8))+'</button>';
  }).join('');
  sel.style.display = 'flex';
  sel.querySelectorAll('.dc-loja-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { dcSelecionarLoja(this.dataset.id); });
  });
  // Seleciona a primeira por padrão
  dcSelecionarLoja(ids[0]);
}
// =============================================================================
// SISTEMA MULTI-ORIGEM — API vs Manual · Toggle cliente
// =============================================================================

var EMPRESA_ORIGEM_ATIVA = 'api'; // sub-aba ativa no admin

async function _adminCarregarOrigemEmpresa(empresa_id) {
  try {
    var r = await fetch(SUPA_URL + '/rest/v1/empresas?id=eq.' + empresa_id + '&select=exibir_origem',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } });
    var d = await r.json();
    var origem = (d && d[0] && d[0].exibir_origem) || 'manual';
    if (EMPRESA_ATIVA) EMPRESA_ATIVA.exibir_origem = origem;
    // Atualiza toggle
    document.querySelectorAll('.adm-toggle-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.origem === origem);
    });
  } catch(e) { console.error(e); }
}

// ── SUB-ABA (API | Manual) ────────────────────────────────────────────────────
function adminSubAba(btn, sub) {
  EMPRESA_ORIGEM_ATIVA = sub;
  document.querySelectorAll('.admin-sub-tab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  var pApi = document.getElementById('admin-painel-api');
  var pMan = document.getElementById('admin-painel-manual');
  if (pApi) pApi.style.display = sub === 'api'    ? 'block' : 'none';
  if (pMan) pMan.style.display = sub === 'manual' ? 'block' : 'none';
  // Mostra/esconde o botão Sincronizar conforme sub-aba
  var bs = document.getElementById('admin-btn-sync');
  if (bs) bs.style.display = (sub === 'api' && EMPRESA_ATIVA && EMPRESA_ATIVA.tem_api) ? 'inline-flex' : 'none';
}

// ── TOGGLE — o que o cliente vê ───────────────────────────────────────────────
async function adminToggleOrigem(origem) {
  if (!EMPRESA_ATIVA) return;
  document.querySelectorAll('.adm-toggle-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.origem === origem);
  });
  try {
    var r = await fetch(SUPA_URL + '/rest/v1/empresas?id=eq.' + EMPRESA_ATIVA.empresa_id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ exibir_origem: origem })
    });
    if (r.ok) {
      _adminSetStatus('✓ Cliente verá dados ' + (origem === 'api' ? 'da API' : 'manuais') + ' da ' + EMPRESA_ATIVA.nome, true);
      EMPRESA_ATIVA.exibir_origem = origem;
    }
  } catch(e) { console.error(e); }
}

// ── PROCESSAR MANUAL + SALVAR ─────────────────────────────────────────────────
async function adminProcessarManual() {
  if (!EMPRESA_ATIVA) { alert('Selecione uma empresa.'); return; }

  var src = (typeof FULL_DATA !== 'undefined' && FULL_DATA.bd && FULL_DATA.bd.length)
    ? FULL_DATA.bd
    : (typeof GRIDS !== 'undefined' && GRIDS.bd ? GRIDS.bd.getData() : []);

  var rows = src.filter(function(r) {
    return r && r.some(function(c) { return c !== '' && c !== null && c !== undefined; });
  });

  if (!rows.length) { alert('Sem dados na grade. Cole do Excel primeiro (Ctrl+V na grade).'); return; }
  if (!confirm('Processar e salvar ' + rows.length.toLocaleString('pt-BR') + ' linhas manuais para ' + EMPRESA_ATIVA.nome + '?')) return;

  _adminSetStatus('⏳ Processando ' + rows.length.toLocaleString('pt-BR') + ' linhas...');

  // Gera relatórios
  var headers = ['ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída','VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM','tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra','NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto','GRUPO PAI','subgrupo_produto','marca','familia_produto','classes'];
  if (typeof BD_DATA !== 'undefined') { BD_DATA.headers = headers; BD_DATA.rows = rows; BD_DATA.count = rows.length; }
  if (typeof FULL_DATA !== 'undefined') FULL_DATA.bd = rows;

  setTimeout(function() {
    try { bdMapColumns(); } catch(e) {}
    try { bdAutoFill(); }   catch(e) {}
    try { bdUpdateAllTabs(); } catch(e) {}
    if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
      GRIDS.bd.allData = rows; GRIDS.bd.filtered = null; GRIDS.bd.page = 0; GRIDS.bd._render();
    }
  }, 10);

  // Salva no Supabase com origem = 'manual'
  var eid = EMPRESA_ATIVA.empresa_id;
  var ts  = Date.now();
  var regs = rows.map(function(r, i) {
    return {
      empresa_id:   eid,
      origem:       'manual',
      id_externo:   'manual_' + eid.slice(0,8) + '_' + ts + '_' + i,
      num_pedido:   r[1]||null, produto:   r[2]||null,
      qtd:          parseFloat(r[3])||null,
      dt_emissao:   _cvData(r[4]), dt_saida: _cvData(r[5]),
      valor:        parseFloat(String(r[6]||'0').replace(',','.'))||null,
      vendedor:     r[7]||null, industria: r[8]||null, cliente:   r[9]||null,
      ano:          parseInt(r[10])||null, mes: r[11]||null, grupo: r[12]||null,
      cidade:       r[16]||null, uf: r[17]||null,
      empresa_nome: EMPRESA_ATIVA.nome, cnpj: r[24]||null, marca: r[28]||null
    };
  });

  try {
    // Apaga manuais antigos desta empresa
    await fetch(SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + eid + '&origem=eq.manual', {
      method: 'DELETE',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal' }
    });

    // Insere em lotes
    var inseridos = 0;
    for (var i = 0; i < regs.length; i += 500) {
      var batch = regs.slice(i, i+500);
      var r = await fetch(SUPA_URL + '/rest/v1/vendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal' },
        body: JSON.stringify(batch)
      });
      if (!r.ok) { var e = await r.text(); throw new Error(e.slice(0,200)); }
      inseridos += batch.length;
      _adminSetStatus('⏳ Salvando... ' + inseridos + '/' + regs.length);
    }

    _adminSetStatus('✓ ' + inseridos.toLocaleString('pt-BR') + ' linhas manuais salvas para ' + EMPRESA_ATIVA.nome + '!', true);
    _adminAtualizarContagens();

  } catch(e) {
    _adminSetStatus('✗ ' + e.message);
    console.error(e);
  }
}

// ── LIMPAR ORIGEM ESPECÍFICA ──────────────────────────────────────────────────
async function adminLimparOrigem(origem) {
  if (!EMPRESA_ATIVA) return;
  var label = origem === 'api' ? 'dados da API' : 'dados manuais';
  if (!confirm('Apagar TODOS os ' + label + ' de ' + EMPRESA_ATIVA.nome + '?')) return;
  if (!confirm('Confirme: Apagar ' + label + ' de ' + EMPRESA_ATIVA.nome + '?')) return;
  _adminSetStatus('⏳ Apagando ' + label + '...');
  try {
    var r = await fetch(SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id + '&origem=eq.' + origem, {
      method: 'DELETE',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal' }
    });
    if (r.ok) {
      _adminSetStatus('✓ ' + label + ' de ' + EMPRESA_ATIVA.nome + ' apagados!', true);
      _adminAtualizarContagens();
    }
  } catch(e) { _adminSetStatus('✗ ' + e.message); }
}

// ── CONTAGENS POR ORIGEM ──────────────────────────────────────────────────────
async function _adminAtualizarContagens() {
  if (!EMPRESA_ATIVA) return;
  try {
    // Conta API
    var rA = await fetch(SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id + '&origem=eq.api&select=id',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'count=exact', 'Range': '0-0' } });
    var cA = rA.headers.get('content-range') || '0';
    var totalApi = cA.includes('/') ? cA.split('/')[1] : '0';

    // Conta Manual
    var rM = await fetch(SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id + '&origem=eq.manual&select=id',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'count=exact', 'Range': '0-0' } });
    var cM = rM.headers.get('content-range') || '0';
    var totalManual = cM.includes('/') ? cM.split('/')[1] : '0';

    var elA = document.getElementById('api-count');
    var elM = document.getElementById('manual-count');
    if (elA) elA.textContent = Number(totalApi).toLocaleString('pt-BR');
    if (elM) elM.textContent = Number(totalManual).toLocaleString('pt-BR');

    // Resumo API
    var resumo = document.getElementById('admin-api-resumo');
    if (resumo && Number(totalApi) > 0) {
      resumo.style.display = 'grid';
      resumo.innerHTML = '<div class="admin-api-stat"><div class="admin-api-stat-val">' + Number(totalApi).toLocaleString('pt-BR') + '</div><div class="admin-api-stat-lbl">Registros API</div></div>';
    }
  } catch(e) { console.error(e); }
}

// ── UTILITÁRIO CONVERSÃO DE DATA ───────────────────────────────────────────────
function _cvData(v) {
  if (!v) return null;
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  var m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}
// =============================================================================
// PAINEL ADMIN — Modo API vs Manual
// =============================================================================

function _adminMostrarModo(temApi) {
  var mApi = document.getElementById('adm-modo-api');
  var mMan = document.getElementById('adm-modo-manual');
  var btnSync = document.getElementById('admin-btn-sync');

  // Mostra o modo correto
  if (mApi) mApi.style.display = temApi ? 'block' : 'none';
  if (mMan) mMan.style.display = 'block'; // Manual sempre disponível
  if (btnSync) btnSync.style.display = temApi ? 'inline-flex' : 'none';

  // Se não tem API, esconde modo API
  if (!temApi && mApi) mApi.style.display = 'none';

  // Esconde toggle se não tem API (sem escolha)
  var tog = document.getElementById('toggle-origem');
  if (tog) tog.style.display = temApi ? 'flex' : 'none';
  var togLbl = document.querySelector('.adm-toggle-label');
  if (togLbl) togLbl.style.display = temApi ? '' : 'none';
}

// ── LOG DE OPERAÇÕES DE SYNC ──────────────────────────────────────────────────
function _syncLog(msg, type) {
  // type: 'info' | 'ok' | 'erro' | 'warn'  (default: 'info')
  var t = type || 'info';
  var panel = document.getElementById('adm-sync-log');
  var body  = document.getElementById('adm-sync-log-body');
  if (panel) panel.style.display = '';
  if (body) {
    var now = new Date();
    var ts = String(now.getHours()).padStart(2,'0') + ':' +
             String(now.getMinutes()).padStart(2,'0') + ':' +
             String(now.getSeconds()).padStart(2,'0');
    var icons = { ok: '✔', erro: '✘', warn: '⚠', info: '•' };
    var line = document.createElement('div');
    line.className = 'adm-log-line log-' + t;
    line.innerHTML =
      '<span class="adm-log-time">' + ts + '</span>' +
      '<span class="adm-log-icon">' + (icons[t] || '•') + '</span>' +
      '<span class="adm-log-msg">' + String(msg).replace(/</g,'&lt;') + '</span>';
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  }
  // Mantém status bar também
  if (t === 'ok')   _adminSetStatus('✓ ' + msg, true);
  else if (t === 'erro') _adminSetStatus('✗ ' + msg);
  else              _adminSetStatus('⏳ ' + msg);
}

// ── ADAPTERS DE INTEGRAÇÃO ─────────────────────────────────────────────────
// Para adicionar novo sistema: copie o bloco visual_saef, implemente login e fetchVendas.
var SYNC_ADAPTERS = {};

SYNC_ADAPTERS.visual_saef = {
  nome: 'Visual Saef',
  login: async function(apiUrl) {
    var r = await _fetchApiProxy(apiUrl, '/login', null, { Accept: 'application/json' });
    if (!r.ok) throw new Error('Login Visual Saef falhou: HTTP ' + r.status);
    var d = await r.json();
    var token = d.token || d.Token || d.access_token || d.accessToken;
    if (!token) throw new Error('Token não retornado. Campos: ' + Object.keys(d).join(','));
    return token;
  },
  fetchVendas: async function(apiUrl, token, DI, DF) {
    var r = await _fetchApiProxy(apiUrl, '/relacaovendaitem?DataInicio=' + DI + '&DataTermino=' + DF, token, { Accept: 'application/json' });
    if (!r.ok) throw new Error('Busca de vendas falhou: HTTP ' + r.status);
    var raw = await r.json();
    return Array.isArray(raw) ? raw : (raw.data || raw.itens || raw.items || raw.result || raw.dados || []);
  }
};

SYNC_ADAPTERS.bling = {
  nome: 'Bling',
  login: async function(apiUrl) {
    throw new Error('Bling: autenticação não implementada. Implemente SYNC_ADAPTERS.bling.login quando o cliente for integrado.');
  },
  fetchVendas: async function(apiUrl, token, DI, DF) {
    throw new Error('Bling: busca de vendas não implementada.');
  }
};

SYNC_ADAPTERS.winthor = {
  nome: 'Winthor',
  login: async function(apiUrl) {
    throw new Error('Winthor: autenticação não implementada.');
  },
  fetchVendas: async function(apiUrl, token, DI, DF) {
    throw new Error('Winthor: busca de vendas não implementada.');
  }
};

SYNC_ADAPTERS.omie = {
  nome: 'Omie',
  login: async function(apiUrl) {
    throw new Error('Omie: autenticação não implementada.');
  },
  fetchVendas: async function(apiUrl, token, DI, DF) {
    throw new Error('Omie: busca de vendas não implementada.');
  }
};

SYNC_ADAPTERS.totvs = {
  nome: 'TOTVS',
  login: async function(apiUrl) {
    throw new Error('TOTVS: autenticação não implementada.');
  },
  fetchVendas: async function(apiUrl, token, DI, DF) {
    throw new Error('TOTVS: busca de vendas não implementada.');
  }
};

// ── SYNC API — salva + gera relatórios ────────────────────────────────────────
adminSincronizar = async function() {
  if (!EMPRESA_ATIVA || !EMPRESA_ATIVA.tem_api) return;
  var btn = document.getElementById('admin-btn-sync');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spin">⟳</span> Sincronizando...'; }
  _adminRenderApiModules({
    vendas: { pending: true, count: 0, message: 'Sincronização iniciada para a base principal.' },
    clientes: { pending: true, count: 0, message: 'Preparando busca de cadastros auxiliares.' },
    produtos: { pending: true, count: 0, message: 'Preparando busca de produtos para enriquecer o mix.' },
    representantes: { pending: true, count: 0, message: 'Preparando busca da equipe comercial.' }
  });

  // Limpa log anterior e mostra painel
  var _logBody = document.getElementById('adm-sync-log-body');
  if (_logBody) _logBody.innerHTML = '';
  var _logPanel = document.getElementById('adm-sync-log');
  if (_logPanel) _logPanel.style.display = '';

  try {
    var periodo = _adminObterPeriodoSync();
    var dataInicio = periodo.dataInicio;
    var dataFim = periodo.dataFim;

    var fmt = function(d) {
      return String(d.getDate()).padStart(2,'0') + String(d.getMonth()+1).padStart(2,'0') + String(d.getFullYear());
    };
    var DI = fmt(dataInicio), DF = fmt(dataFim);
    var sistema = ((EMPRESA_ATIVA.sistema || 'visual_saef') + '').toLowerCase();
    var apiUrl  = (EMPRESA_ATIVA.api_url || '').replace(/\/$/, '');
    var adapter = SYNC_ADAPTERS[sistema];
    if (!adapter) throw new Error('Sistema "' + sistema + '" não tem adapter configurado. Adicione em SYNC_ADAPTERS.');
    if (!apiUrl) throw new Error('URL da API não configurada para esta empresa. Configure em Integrações.');

    _syncLog('Iniciando sincronização — ' + (adapter.nome || sistema) + ' — período: ' + DI + ' a ' + DF);
    _syncLog('API: ' + apiUrl);

    var token = await adapter.login(apiUrl);
    _syncLog('Login na API OK — buscando dados...');

    var lista = await adapter.fetchVendas(apiUrl, token, DI, DF);
    _syncLog(lista.length + ' registros recebidos da API');

    if (!lista.length) {
      _syncLog('Nenhum dado novo no período. Sync encerrado.', 'warn');
      _adminAtualizarUltimSync(dataFim, 0);
      return;
    }

    // Mapeamento
    var get = function(item, keys) {
      var lw = {};
      Object.keys(item).forEach(function(k) { lw[k.toLowerCase().replace(/[\s_\-]/g,'')] = item[k]; });
      for (var i=0; i<keys.length; i++) {
        var v = lw[keys[i].toLowerCase().replace(/[\s_\-]/g,'')];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return null;
    };

    var cvData = function(v) {
      if (!v) return null;
      var s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
      var m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (m) return m[3]+'-'+m[2]+'-'+m[1];
      var d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
    };

    var idsSync = {};
    function montarIdExternoSync(item, idx) {
      var pedidoBase = String(get(item,['numeropedido','numpedido','pedido','cdpedido','nrpedido','idvenda','codigo']) || '').trim();
      var itemBase = String(get(item,['iditem','codigoitem','seq','cditem','nritem','item']) || '').trim();
      var altBase = String(get(item,['id','chave']) || '').trim();
      var produtoBase = String(get(item,['descricaoitem','descricaoItem','descitem','produto','descricao','descricaoproduto','nmproduto']) || '').trim();
      var dataBase = String(cvData(get(item,['datafaturamento','dataFaturamento','dataatendimento','datasaida','dtsaida','datavenda'])) || '').trim();
      var baseId = [pedidoBase || altBase || 'api', itemBase, dataBase, produtoBase || String(idx + 1)]
        .filter(Boolean)
        .join('_')
        .replace(/[^\w.-]+/g, '_');
      if (!baseId) baseId = 'api_' + idx;
      var finalId = baseId;
      var n = 1;
      while (idsSync[finalId]) {
        n += 1;
        finalId = baseId + '__' + n;
      }
      idsSync[finalId] = true;
      return finalId;
    }

    var regs = lista.map(function(item, idx) {
      return {
        empresa_id:   EMPRESA_ATIVA.empresa_id,
        origem:       'api',
        id_externo:   montarIdExternoSync(item, idx),
        num_pedido:   String(get(item,['numeropedido','numpedido','pedido','cdpedido','nrpedido']) || ''),
        produto:      String(get(item,['descricaoitem','descricaoItem','descitem','produto','descricao','descricaoproduto','nmproduto']) || ''),
        qtd:          Number(get(item,['quantidadevenda','quantidadeVenda','quantidade','qtd','qtde']) || 0),
        dt_emissao:   cvData(get(item,['dataemissao','dtemissao','emissao'])),
        dt_saida:     cvData(get(item,['datafaturamento','dataFaturamento','dataatendimento','datasaida','dtsaida','datavenda'])),
        valor:        Number(String(get(item,['valortotal','valor','vltotal','totalitem','vlitem','valoritem']) || '0').replace(',','.')),
        vendedor:     String(get(item,['nomevendedor','nomeVendedor','vendedor','representante','nomerepresentante']) || ''),
        industria:    String(get(item,['industria','fabricante','fornecedor','marca']) || ''),
        cliente:      String(get(item,['nomecliente','nomeCliente','cliente','razaosocial']) || ''),
        grupo:        String(get(item,['nomadacategoria','nomeDaCategoria','grupocategoria','grupo','categoria']) || ''),
        uf:           String(get(item,['uf','estado','ufcliente','siglaestado']) || ''),
        cidade:       String(get(item,['cidade','municipio','nomecidade']) || ''),
        empresa_nome: EMPRESA_ATIVA ? EMPRESA_ATIVA.nome : ''
      };
    });

    // Apaga TODOS os registros desta empresa (origem=api, manual ou NULL)
    // para evitar conflito de chave duplicada
    _syncLog('Limpando dados anteriores do banco...');
    var delAll = await fetch(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id,
      { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal', 'Content-Type': 'application/json' } }
    );
    if (!delAll.ok) {
      var delBody = await delAll.text();
      throw new Error('Falha ao limpar dados antigos: HTTP ' + delAll.status + ': ' + delBody.slice(0,300));
    }
    _syncLog('Dados anteriores removidos com sucesso');
    if (window.ReportCache) {
      await window.ReportCache.clearEmpresa(EMPRESA_ATIVA.empresa_id);
    }
    _dcIdbDelete('resute_dc_cache_' + EMPRESA_ATIVA.empresa_id);

    // Insere
    var inseridos = 0;
    var totalLotes = Math.ceil(regs.length / 300);
    for (var i = 0; i < regs.length; i += 300) {
      var batch = regs.slice(i, i+300);
      var sR = await fetch(SUPA_URL + '/rest/v1/vendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal' },
        body: JSON.stringify(batch)
      });
      var body = await sR.text();
      if (!sR.ok) throw new Error('HTTP ' + sR.status + ': ' + body.slice(0,300));
      inseridos += batch.length;
      var loteNum = Math.floor(i/300) + 1;
      _syncLog('Lote ' + loteNum + '/' + totalLotes + ' inserido — ' + inseridos + ' de ' + regs.length + ' registros');
    }

    // Atualiza sync_log com resumo útil
    var periodoTexto = dataInicio.toLocaleDateString('pt-BR') + ' a ' + dataFim.toLocaleDateString('pt-BR');
    await _adminAtualizarUltimSync(dataFim, inseridos, inseridos + ' registros inseridos — período: ' + periodoTexto + '.');
    await fetch(SUPA_URL + '/rest/v1/empresas?id=eq.' + EMPRESA_ATIVA.empresa_id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ exibir_origem: 'api' })
    });
    EMPRESA_ATIVA.exibir_origem = 'api';

    // Enriquecer a base com cadastros auxiliares (somente Visual Saef por enquanto)
    var cadastrosResumo = {};
    if (sistema === 'visual_saef') {
      _syncLog('Sincronizando cadastros auxiliares (clientes, produtos, representantes)...');
      await _adminLimparCadastrosApiSync();
      cadastrosResumo = await _adminSincronizarCadastrosApi(token, dataInicio, dataFim);
    } else {
      _syncLog('Cadastros auxiliares disponíveis apenas para Visual Saef por enquanto.', 'warn');
    }

    // Mostra KPIs e módulos do sync
    _adminMostrarKpisSync(regs, cadastrosResumo);
    _adminRenderApiModules(Object.assign({
      vendas: {
        ok: true,
        count: inseridos,
        endpoint: '/relacaovendaitem',
        message: 'Base de vendas sincronizada para alimentar dashboards e relatórios.'
      }
    }, cadastrosResumo || {}));

    _syncLog('Cadastros auxiliares sincronizados');
    // Gera relatórios automaticamente
    _syncLog('Carregando dados do banco e gerando relatórios...');
    await _adminCarregar(EMPRESA_ATIVA.empresa_id);

    try { bdMapColumns(); } catch(e) { console.error(e); }
    try { bdAutoFill(); }   catch(e) { console.error(e); }
    try { bdUpdateAllTabs(); } catch(e) { console.error(e); }
    // Gera cache server-side (lê dados já enriquecidos do BD, sem trafegar pelo browser)
    _syncLog('Gerando cache de relatórios no servidor...');
    try {
      var pcController = new AbortController();
      var pcTimer = setTimeout(function() { pcController.abort(); }, 45000);
      var pcResp = await NATIVE_FETCH('/api/precache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-token': SESSION ? SESSION.token : '' },
        body: JSON.stringify({ empresa_id: EMPRESA_ATIVA.empresa_id }),
        signal: pcController.signal
      });
      clearTimeout(pcTimer);
      var pcData = await pcResp.json();
      if (pcData.ok) {
        _syncLog('Cache gerado: ' + pcData.total_registros.toLocaleString('pt-BR') + ' registros prontos para o cliente.', 'ok');
        // Pré-popula IndexedDB para que a próxima entrada do cliente seja instantânea
        try {
          var pcSnap = window.ReportCache
            ? await window.ReportCache.getLatest(EMPRESA_ATIVA.empresa_id, 'dashboard_cliente', null)
            : null;
          if (pcSnap && pcSnap.dados && Array.isArray(pcSnap.dados.vendas) && pcSnap.dados.vendas.length) {
            var pcLsKey = 'resute_dc_cache_' + EMPRESA_ATIVA.empresa_id;
            await _dcIdbSet(pcLsKey, {
              gerado_em: pcSnap.dados.gerado_em || new Date().toISOString(),
              vendas: pcSnap.dados.vendas
            });
            _syncLog('Cache local atualizado (' + pcSnap.dados.vendas.length.toLocaleString('pt-BR') + ' registros).', 'ok');
          }
        } catch (_pcLsErr) { _syncLog('Aviso: cache local nao atualizado.', 'warn'); }
      } else if (pcData.aviso) {
        _syncLog(pcData.aviso, 'warn');
      } else {
        _syncLog('Cache não gerado: ' + (pcData.erro || 'erro desconhecido'), 'warn');
      }
    } catch (pcErr) {
      if (pcErr && pcErr.name === 'AbortError') {
        _syncLog('Cache não gerado: timeout (empresa muito grande). O cliente carregará os dados na primeira entrada.', 'warn');
      } else {
        _syncLog('Cache não gerado (erro): ' + pcErr.message, 'warn');
      }
    }
    if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
      GRIDS.bd.allData = BD_DATA.rows; GRIDS.bd.filtered = null;
      GRIDS.bd.page = 0; GRIDS.bd._render();
    }

    var relAviso = document.getElementById('adm-api-relatorios');
    if (relAviso) relAviso.style.display = 'block';

    await _adminAtualizarContagens();
    _syncLog(inseridos.toLocaleString('pt-BR') + ' registros salvos no banco — relatórios atualizados!', 'ok');
    _adminConsoleRecarregarSyncLog();

  } catch(e) {
    _syncLog('ERRO: ' + e.message, 'erro');
    console.error('[SYNC]', e);
    // Registra erro no sync_log para aparecer no histórico
    if (EMPRESA_ATIVA) {
      try {
        await fetch(SUPA_URL + '/rest/v1/sync_log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ empresa_id: EMPRESA_ATIVA.empresa_id, ultima_sync: new Date().toISOString(), total_registros: 0, status: 'erro', mensagem: e.message })
        });
      } catch(_) {}
      _adminConsoleRecarregarSyncLog();
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg> Sincronizar, Salvar e Gerar Relatórios';
    }
  }
};

function _adminMostrarKpisSync(regs) {
  var fat = regs.reduce(function(s,r){ return s + dcValorLinha(r); }, 0);
  var cli = new Set(regs.map(function(r){ return r.cliente; }).filter(Boolean)).size;
  var prd = new Set(regs.map(function(r){ return r.produto; }).filter(Boolean)).size;
  var extra = arguments[1] || {};
  var kpis = [
    { val: regs.length.toLocaleString('pt-BR'), lbl: 'Registros' },
    { val: dcMoedaLimpa(fat),                   lbl: 'Faturamento' },
    { val: cli.toLocaleString('pt-BR'),         lbl: 'Clientes' },
    { val: prd.toLocaleString('pt-BR'),         lbl: 'Produtos' }
  ];
  if (extra.representantes && extra.representantes.count) {
    kpis.push({ val: Number(extra.representantes.count).toLocaleString('pt-BR'), lbl: 'Representantes API' });
  }
  var el = document.getElementById('adm-api-kpis');
  if (!el) return;
  el.innerHTML = kpis.map(function(k){
    return '<div class="adm-kpi"><div class="adm-kpi-val">'+k.val+'</div><div class="adm-kpi-lbl">'+k.lbl+'</div></div>';
  }).join('');
  el.style.display = 'grid';
}

function _adminConsoleRecarregarSyncLog() {
  // Re-busca sync_log e atualiza a tabela do histórico sem recarregar a página
  if (typeof adminConsoleFetch !== 'function' || typeof adminConsoleFiltrarSync !== 'function') return;
  adminConsoleFetch('/rest/v1/sync_log?select=*&order=ultima_sync.desc.nullslast')
    .then(function(res) {
      if (res && res.data) {
        if (typeof ADMIN_CONSOLE !== 'undefined') {
          ADMIN_CONSOLE.syncLogs = res.data;
          adminConsoleFiltrarSync();
        }
      }
    })
    .catch(function(e) { console.warn('Reload sync_log:', e); });
}

async function _adminAtualizarUltimSync(dataFim, total, mensagemExtra, statusVal) {
  try {
    var agora = new Date();
    var status = statusVal || 'ok';
    var dataFimStr = dataFim instanceof Date ? dataFim.toISOString().split('T')[0] : String(dataFim || '');
    var msg = mensagemExtra || (total + ' registros inseridos em ' + agora.toLocaleString('pt-BR') + '.');
    await fetch(SUPA_URL + '/rest/v1/sync_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ empresa_id: EMPRESA_ATIVA.empresa_id, ultima_sync: agora.toISOString(), ultima_data: dataFimStr, total_registros: total, status: status, mensagem: msg })
    });
    var el = document.getElementById('adm-api-ultima');
    if (el) el.textContent = 'Último sync: ' + agora.toLocaleString('pt-BR') + ' — ' + total.toLocaleString('pt-BR') + ' registros';
  } catch(e) { console.error(e); }
}
