// =============================================================================
// AUTH.JS — Login, sessão, sync API e salvar dados manuais
// =============================================================================

const SUPA_URL = 'https://glfzevdsmmdvrwhplzkc.supabase.co';
const SUPA_KEY = '__SERVER_ONLY__';
const SVC_KEY  = '__SERVER_ONLY__';
const VISUAL_SAEF_API_URL = 'https://api-plastrio.visualsaef.com';

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

function _normalizeFetchHeaders(headers) {
  if (!headers) return {};
  if (headers instanceof Headers) {
    var out = {};
    headers.forEach(function(value, key) { out[key] = value; });
    return out;
  }
  return headers;
}

async function _fetchVisualSaefProxy(path, token, extraHeaders) {
  var headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;

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
      'x-session-token': _getSessionToken()
    },
    body: JSON.stringify({
      url: VISUAL_SAEF_API_URL + path,
      method: 'GET',
      headers: headers,
      body: null
    })
  });
}

async function _fetchVisualSaefDirect(path, token, extraHeaders) {
  var headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;

  var normalized = _normalizeFetchHeaders(extraHeaders || {});
  Object.keys(normalized).forEach(function(key) {
    if (normalized[key] !== undefined && normalized[key] !== null) {
      headers[key] = normalized[key];
    }
  });

  return NATIVE_FETCH(VISUAL_SAEF_API_URL + path, {
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

  if (
    url.indexOf(SUPA_URL + '/rest/v1/') === 0 ||
    url.indexOf(SUPA_URL + '/functions/v1/') === 0 ||
    url.indexOf(VISUAL_SAEF_API_URL + '/') === 0
  ) {
    _touchSession();
    return NATIVE_FETCH('/api/secure-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': _getSessionToken()
      },
      body: JSON.stringify({
        url: url,
        method: opts.method || 'GET',
        headers: _normalizeFetchHeaders(opts.headers),
        body: opts.body || null
      })
    });
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
    alert('Sua sessão expirou. Faça login novamente.');
    fazerLogout();
    _mostrarLogin();
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

// ── MULTI-LOJA (Llamenina Matriz / Mega) ──────────────────────────────────────
var LOJA_NOMES = {
  'dff89ea1-0c33-48d1-84d7-1fc7826654b8': 'Llamenina Matriz',
  'af44d320-d663-48ff-b58f-31c5011ad7ba': 'Llamenina Mega',
  'af3b599b-65c5-4868-b8bf-a5934da84f0d': 'Varremaster'
};

function abrirAnaliseVendas() {
  SESSION = _readStoredSession();
  if (SESSION && SESSION.token) { _abrirApp(); } else { _mostrarLogin(); }
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
  _normalizarTelaInicial();
  _limparBlocosInstitucionaisAntigos();
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
  document.body.style.overflow = 'hidden';
}

function fecharSaibaMaisResute() {
  var about = document.getElementById('lp-about-page');
  if (about) about.style.display = 'none';
  document.body.style.overflow = '';
}

async function fazerLogin() {
  var email = document.getElementById('login-email').value.trim();
  var senha = document.getElementById('login-senha').value.trim();
  var erro  = document.getElementById('login-erro');
  var btn   = document.getElementById('login-btn');

  erro.textContent = '';
  if (!email || !senha) { erro.textContent = 'Preencha email e senha.'; return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="auth-spin">⟳</span> Entrando...';

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
      empresa_nome:d.empresa_nome || 'RESUTE'
    };
    _saveSession(SESSION);
    fecharLogin();
    _abrirApp();

  } catch(e) {
    console.error('Login erro:', e);
    erro.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Entrar <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
  }
}


function fazerLogout() {
  SESSION = null; EMPRESAS = [];
  _clearStoredSession();

// ── MULTI-LOJA (Llamenina Matriz / Mega) ──────────────────────────────────────
var LOJA_NOMES = {
  'dff89ea1-0c33-48d1-84d7-1fc7826654b8': 'Llamenina Matriz',
  'af44d320-d663-48ff-b58f-31c5011ad7ba': 'Llamenina Mega',
  'af3b599b-65c5-4868-b8bf-a5934da84f0d': 'Varremaster'
};
  if (typeof switchView === 'function') switchView('view-home');
  ['sync-area','header-user','sidebar-user'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var vc = document.getElementById('view-dash-cliente');
  if (vc) vc.style.display = 'none';
  _mostrarLogin();
}

function _abrirApp() {
  _touchSession();
  var vc = document.getElementById('view-dash-cliente');
  if (vc) vc.style.display = 'none';
  var ov = document.getElementById('sidebar-overlay');
  if (ov) ov.classList.remove('active');
  document.body.classList.remove('client-report-mode');

  // Sempre esconde a login page primeiro
  var lp = document.getElementById('view-login-page');
  if (lp) lp.style.display = 'none';

  // Cliente → dashboard executivo
  if (SESSION.papel === 'cliente') {
    _abrirDashCliente();
    return;
  }

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

  if (typeof switchView === 'function') switchView('view-app');

  // Inicializa painel multi-empresa
  if (typeof adminInicializar === 'function') adminInicializar();
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
    var eR = await fetch(SUPA_URL + '/rest/v1/empresas?select=id,nome,slug&ativo=eq.true', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    });
    var empresas = await eR.json();

    var aR = await fetch(SUPA_URL + '/rest/v1/api_config?select=empresa_id,sistema,api_url&ativo=eq.true', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    });
    var apiConfigs = await aR.json();

    EMPRESAS = (empresas || []).map(function(emp) {
      var api = (apiConfigs || []).find(function(a){ return a.empresa_id === emp.id; });
      if (!api) return null;
      return { empresa_id: emp.id, nome: emp.nome, slug: emp.slug, sistema: api.sistema || 'api' };
    }).filter(Boolean);

    // Cliente: filtra só a empresa dele
    var lista = EMPRESAS;
    if (SESSION.papel !== 'super_admin' && SESSION.empresa_id) {
      lista = EMPRESAS.filter(function(e){ return e.empresa_id === SESSION.empresa_id; });
    }

    var sel = document.getElementById('sync-empresa-select');

    if (!lista.length) {
      // Fallback Varremaster (super_admin)
      if (SESSION.papel === 'super_admin') {
        lista = [{ empresa_id: 'af3b599b-65c5-4868-b8bf-a5934da84f0d', nome: 'Varremaster', slug: 'varremaster', sistema: 'visual_saef' }];
        EMPRESAS = lista;
      } else {
        if (sel) sel.style.display = 'none';
        _setStatus('⚠ Sem empresa com API configurada.', '');
        return;
      }
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

var MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
var MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── ABRE O DASHBOARD ──────────────────────────────────────────────────────────
function _abrirDashCliente() {
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

  // Multi-loja: monta seletor se houver mais de uma empresa
  var ids = SESSION.empresa_ids;
  var sel = document.getElementById('dc-loja-selector');
  var logo = document.querySelector('.dc-client-logo');
  var eidAtual = (ids && ids[0]) || SESSION.empresa_id;
  if (logo) {
    if (eidAtual === 'af3b599b-65c5-4868-b8bf-a5934da84f0d') {
      logo.src = 'assets/varremaster-logo.png';
      logo.alt = 'Varremaster';
      logo.style.display = '';
    } else {
      logo.removeAttribute('src');
      logo.alt = 'Empresa';
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
    if (badge) badge.textContent = LOJA_NOMES[eid] || SESSION.empresa_nome || 'Empresa';
    if (eid) dcCarregarDados(eid);
    else dcStatus('⚠ Empresa não configurada.');
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

var DC_RAW = [];
var DC_DATA = [];


// =============================================================================
// PAGINAÇÃO — busca TODOS os registros do Supabase em lotes de 1000
// =============================================================================
async function _fetchAll(baseUrl, headers) {
  var all = [];
  var from = 0;
  var pageSize = 1000;
  var tentativas = 0;
  var maxPaginas = 200; // limite de segurança: 200k registros

  while (tentativas < maxPaginas) {
    var r = await fetch(baseUrl, {
      headers: Object.assign({}, headers, {
        'Range': from + '-' + (from + pageSize - 1),
        'Range-Unit': 'items'
      })
    });

    if (!r.ok && r.status !== 206) {
      console.error('[fetchAll] Erro HTTP', r.status, 'na página', tentativas);
      break;
    }

    var batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;

    all = all.concat(batch);
    tentativas++;

    // Se veio menos que pageSize, chegou ao fim
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function dcCarregarDados(empresa_id_param) {
  var eid = empresa_id_param || SESSION.empresa_id;
  if (!eid) { dcStatus('⚠ Empresa não selecionada.'); return; }

  try {
    dcLoading(true, 'Buscando dados e preparando os relatorios...');
    // Busca qual origem o admin configurou para este cliente ver
    var origemR = await fetch(SUPA_URL + '/rest/v1/empresas?id=eq.' + eid + '&select=exibir_origem',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } });
    var origemD = await origemR.json();
    var exibir  = (origemD && origemD[0] && origemD[0].exibir_origem) || 'manual';

    // Paginação: busca TODOS os registros em lotes (sem limite de 1000)
    dcStatus('⏳ Carregando dados...');
    var vendas = await _fetchAll(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + eid + '&origem=eq.' + exibir + '&select=*&order=dt_saida.asc',
      { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    );

    if (!Array.isArray(vendas) || !vendas.length) {
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
    setTimeout(function() {
      if ((DC_DATA || []).length) {
        dcStatus('OK ' + DC_DATA.length.toLocaleString('pt-BR') + ' registros no recorte atual', true);
      }
      dcLoading(false);
    }, 0);
    dcStatus('✓ ' + vendas.length.toLocaleString('pt-BR') + ' registros carregados', true);

  } catch(e) {
    dcStatus('✗ ' + e.message);
    console.error(e);
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
  el.style.display = show ? 'grid' : 'none';
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
  partes.push(ano ? 'Ano ' + ano : 'Todos os anos');
  partes.push(mes ? MESES_FULL[mes - 1] : 'Todos os meses');
  if (inicioEl && inicioEl.value && fimEl && fimEl.value) {
    partes.push(inicioEl.value.split('-').reverse().join('/') + ' a ' + fimEl.value.split('-').reverse().join('/'));
  }
  partes.push((rows || []).length.toLocaleString('pt-BR') + ' registros no recorte');
  el.textContent = partes.join(' • ');
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
  setTimeout(function() { dcLoading(false); }, 150);
}

// ── RENDERIZA TUDO ────────────────────────────────────────────────────────────
function dcRenderizar() {
  var rows = Array.isArray(DC_DATA) ? DC_DATA : DC_RAW;
  dcAtualizarPeriodoLabel(rows || []);
  if (!rows || !rows.length) {
    dcStatus('⚠ Nenhum dado disponível para esse filtro.');
    var kEl = document.getElementById('dc-kpis');
    if (kEl) kEl.innerHTML = '<div class="dc-kpi-empty">Nenhum registro encontrado para o período selecionado.</div>';
    ['dc-chart-evolucao','dc-chart-trimestre','dc-chart-ano','dc-chart-diasem','dc-chart-produtos','dc-chart-prodqtd','dc-chart-grupos','dc-chart-marca'].forEach(function(id) {
      if (typeof dcDestroyChart === 'function') dcDestroyChart(id);
    });
    ['dc-tab-reps','dc-tab-positiv','dc-tab-ufs','dc-tab-cidades','dc-tab-cli','dc-tab-inat','dc-tab-novos','dc-tab-ticket'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="dc-empty">Sem dados para este recorte.</div>';
    });
    return;
  }

  // ── KPIs principais ──
  var fat = rows.reduce(function(s,r){ return s+(parseFloat(r.valor)||0); }, 0);
  var ped = dcContarPedidosUnicos(rows);
  var cli = new Set(rows.map(function(r){ return r.cliente; }).filter(Boolean)).size;
  var prd = new Set(rows.map(function(r){ return r.produto; }).filter(Boolean)).size;
  var rep = new Set(rows.map(function(r){ return r.vendedor; }).filter(Boolean)).size;
  var tick = ped ? fat/ped : 0;
  function fmt(v){ return typeof fmtValor === 'function' ? fmtValor(v) : 'R$ '+Number(v || 0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:2}); }

  var kEl = document.getElementById('dc-kpis');
  if (kEl) kEl.innerHTML = [
    { ico:'💰', val:fmt(fat),                       lbl:'Faturamento Total' },
    { ico:'📋', val:ped.toLocaleString('pt-BR'),    lbl:'Pedidos' },
    { ico:'🎯', val:fmt(tick),                      lbl:'Ticket Médio' },
    { ico:'🏢', val:cli.toLocaleString('pt-BR'),    lbl:'Clientes Ativos' },
    { ico:'📦', val:prd.toLocaleString('pt-BR'),    lbl:'Produtos' },
    { ico:'👥', val:rep.toLocaleString('pt-BR'),    lbl:'Representantes' }
  ].map(function(k){
    return '<div class="dc-kpi-card">'
         + '<div class="dc-kpi-icon">'+k.ico+'</div>'
         + '<div class="dc-kpi-value">'+k.val+'</div>'
         + '<div class="dc-kpi-label">'+k.lbl+'</div>'
         + '</div>';
  }).join('');

  // ── Gráficos ──
  _dcChartEvolucao(rows);
  _dcChartTrim(rows);
  _dcChartAno(rows);
  _dcChartDiaSemana(rows);
  _dcChartProd(rows);
  _dcChartProdQtd(rows);
  _dcChartGrupo(rows);
  _dcChartMarca(rows);

  // ── Tabelas ──
  _dcTabela('dc-tab-reps',     'vendedor', rows, fat, 'Representante');
  _dcTabelaPositivacao(rows);
  _dcTabela('dc-tab-ufs',      'uf',       rows, fat, 'Estado');
  _dcTabela('dc-tab-cidades',  'cidade',   rows, fat, 'Cidade');
  _dcTabela('dc-tab-cli',      'cliente',  rows, fat, 'Cliente');
  _dcTabelaInativos(rows);
  _dcTabelaNovosClientes(rows);
  _dcTabelaTicketCliente(rows);

  // ── Última atualização ──
  var lu = document.getElementById('dc-last-update');
  if (lu) lu.textContent = 'Atualizado em ' + new Date().toLocaleString('pt-BR');
}

// Novos gráficos
function _dcChartAno(rows) {
  var porAno = {};
  rows.forEach(function(r) {
    var data = dcDataValor(r);
    var ano = data ? data.getFullYear() : parseInt(r.ano, 10);
    if (ano) porAno[ano] = (porAno[ano] || 0) + (parseFloat(r.valor) || 0);
  });
  var anos = Object.keys(porAno).sort();
  _dcDestroy('dc-chart-ano');
  var ctx = document.getElementById('dc-chart-ano'); if (!ctx) return;
  DC_CHARTS['ano'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: anos, datasets: [{ data: anos.map(function(a){return porAno[a];}), backgroundColor: '#3b82f6', borderRadius: 6 }] },
    options: _dcOpts(false)
  });
}

function _dcChartDiaSemana(rows) {
  var dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  var mp = [0,0,0,0,0,0,0];
  rows.forEach(function(r) {
    if (!r.dt_saida) return;
    var d = new Date(r.dt_saida);
    if (!isNaN(d.getTime())) mp[d.getDay()] += (parseFloat(r.valor) || 0);
  });
  _dcDestroy('dc-chart-diasem');
  var ctx = document.getElementById('dc-chart-diasem'); if (!ctx) return;
  DC_CHARTS['diasem'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: dias, datasets: [{ data: mp, backgroundColor: '#8b5cf6', borderRadius: 6 }] },
    options: _dcOpts(false)
  });
}

function _dcChartProdQtd(rows) {
  var m = {};
  rows.forEach(function(r){ var k=r.produto||'—'; m[k]=(m[k]||0)+(parseFloat(r.qtd)||0); });
  var s = Object.entries(m).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
  _dcDestroy('dc-chart-prodqtd');
  var ctx = document.getElementById('dc-chart-prodqtd'); if (!ctx) return;
  DC_CHARTS['prodqtd'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: s.map(function(e){return e[0].length>22?e[0].slice(0,22)+'…':e[0];}),
            datasets: [{ data: s.map(function(e){return e[1];}), backgroundColor: '#22c55e', borderRadius: 4 }] },
    options: Object.assign(_dcOpts(false), { indexAxis: 'y' })
  });
}

function _dcChartMarca(rows) {
  var m = {};
  rows.forEach(function(r){ var k=r.marca||r.industria||'Sem marca'; if(k&&k.trim()) m[k]=(m[k]||0)+(parseFloat(r.valor)||0); });
  var s = Object.entries(m).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  _dcDestroy('dc-chart-marca');
  var ctx = document.getElementById('dc-chart-marca'); if (!ctx) return;
  DC_CHARTS['marca'] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: s.map(function(e){return e[0];}),
            datasets: [{ data: s.map(function(e){return e[1];}),
              backgroundColor: ['#3b82f6','#22c55e','#f59e0b','#ec4899','#8b5cf6','#14b8a6','#fb923c','#64748b'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#64748b', font: { size: 10 }, boxWidth: 10 } },
                 tooltip: { callbacks: { label: function(c){ return ' R$ '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:0}); } } } } }
  });
}

// Tabelas novas
function _dcTabelaPositivacao(rows) {
  var mp = {};
  rows.forEach(function(r) {
    var v = r.vendedor || '—';
    if (!mp[v]) mp[v] = { clientes: new Set(), pedidos: new Set() };
    mp[v].clientes.add(r.cliente || 'x');
    mp[v].pedidos.add(dcPedidoChave(r));
  });
  var arr = Object.entries(mp).map(function(e){ return { nome:e[0], cli:e[1].clientes.size, ped:e[1].pedidos.size }; }).sort(function(a,b){return b.cli-a.cli;}).slice(0,12);
  var max = arr.length ? arr[0].cli : 1;
  var h = '<table class="dc-tabela"><thead><tr><th>#</th><th>Representante</th><th>Clientes unicos</th><th>Pedidos unicos</th><th>Cobertura</th></tr></thead><tbody>';
  arr.forEach(function(e,i){
    var bar = (e.cli/max*100).toFixed(0);
    h+='<tr><td class="pos">'+(i+1)+'</td><td>'+e.nome+'</td><td class="num">'+e.cli+'</td><td>'+e.ped+'</td>'
      +'<td><div class="dc-bar-track" style="width:90px"><div class="dc-bar-fill" style="width:'+bar+'%"></div></div></td></tr>';
  });
  var el = document.getElementById('dc-tab-positiv');
  if (el) el.innerHTML = h+'</tbody></table>';
}

function _dcTabelaNovosClientes(rows) {
  // Cliente cuja primeira compra está no período visualizado
  var primeira = {};
  rows.forEach(function(r) {
    var c = r.cliente || '—';
    var d = r.dt_saida ? new Date(r.dt_saida) : null;
    if (!d) return;
    if (!primeira[c] || d < primeira[c]) primeira[c] = d;
  });
  // Considera "novos" os 10 mais recentes
  var arr = Object.entries(primeira).map(function(e){ return { nome:e[0], dt:e[1] }; })
    .sort(function(a,b){return b.dt-a.dt;}).slice(0,10);
  var el = document.getElementById('dc-tab-novos');
  if (!el) return;
  if (!arr.length) { el.innerHTML = '<div style="color:#475569;font-size:13px;padding:20px;text-align:center">Nenhum cliente novo no período.</div>'; return; }
  var h = '<table class="dc-tabela"><thead><tr><th>Cliente</th><th style="text-align:right">Primeira compra</th></tr></thead><tbody>';
  arr.forEach(function(e){
    h+='<tr><td>'+e.nome+'</td><td style="text-align:right;color:#22c55e;font-weight:700">'+e.dt.toLocaleDateString('pt-BR')+'</td></tr>';
  });
  el.innerHTML = h+'</tbody></table>';
}

function _dcTabelaTicketCliente(rows) {
  var mp = {};
  rows.forEach(function(r) {
    var c = r.cliente || '—';
    if (!mp[c]) mp[c] = { fat:0, pedidos:new Set() };
    mp[c].fat += (parseFloat(r.valor) || 0);
    mp[c].pedidos.add(dcPedidoChave(r));
  });
  var arr = Object.entries(mp).map(function(e){ return { nome:e[0], fat:e[1].fat, ped:e[1].pedidos.size, tick:e[1].pedidos.size ? e[1].fat/e[1].pedidos.size : 0 }; })
    .filter(function(e){ return e.ped >= 2; }).sort(function(a,b){return b.tick-a.tick;}).slice(0,10);
  var el = document.getElementById('dc-tab-ticket');
  if (!el) return;
  if (!arr.length) { el.innerHTML = '<div style="color:#475569;font-size:13px;padding:20px;text-align:center">Sem dados suficientes.</div>'; return; }
  var h = '<table class="dc-tabela"><thead><tr><th>#</th><th>Cliente</th><th>Pedidos</th><th class="num">Ticket</th></tr></thead><tbody>';
  arr.forEach(function(e,i){
    h+='<tr><td class="pos">'+(i+1)+'</td><td>'+e.nome+'</td><td>'+e.ped+'</td><td class="num">R$ '+e.tick.toLocaleString('pt-BR',{minimumFractionDigits:0})+'</td></tr>';
  });
  el.innerHTML = h+'</tbody></table>';
}

function _dcOpts(horizontal) {
  return {
    responsive: true, maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { display: false },
      tooltip: { callbacks: { label: function(c){ return ' R$ '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:0}); } } } },
    scales: {
      x: { ticks: { color: '#475569', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#475569', font: { size: 10 },
            callback: function(v){ return typeof v==='number' ? 'R$'+v.toLocaleString('pt-BR',{minimumFractionDigits:0}) : v; } },
           grid: { color: 'rgba(255,255,255,0.04)' } }
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

function _dcTabela(id, campo, rows, fatTotal, label) {
  var map = {};
  rows.forEach(function(r) {
    var key = String(r[campo] || '').trim() || 'Sem ' + String(label || 'dado').toLowerCase();
    if (!map[key]) map[key] = { fat: 0, pedidos: new Set() };
    map[key].fat += parseFloat(r.valor) || 0;
    map[key].pedidos.add(dcPedidoChave(r));
  });
  var lista = Object.entries(map)
    .map(function(e) { return { nome: e[0], fat: e[1].fat, pedidos: e[1].pedidos.size }; })
    .sort(function(a, b) { return b.fat - a.fat; })
    .slice(0, 12);
  var max = lista.length ? lista[0].fat : 1;
  var html = '<table class="dc-tabela"><thead><tr><th>#</th><th>' + (label || 'Item') + '</th><th>Pedidos</th><th class="num">Faturamento</th><th>%</th></tr></thead><tbody>';
  lista.forEach(function(item, idx) {
    var pct = fatTotal ? (item.fat / fatTotal * 100) : 0;
    var bar = max ? (item.fat / max * 100) : 0;
    html += '<tr><td class="pos">' + (idx + 1) + '</td><td>' + item.nome + '</td><td>' + item.pedidos + '</td>'
      + '<td class="num">R$ ' + item.fat.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + '</td>'
      + '<td><div style="font-size:10px;color:#7f8ba3;margin-bottom:3px">' + pct.toFixed(1) + '%</div>'
      + '<div class="dc-bar-wrap"><div class="dc-bar" style="width:' + bar.toFixed(0) + '%"></div></div></td></tr>';
  });
  html += '</tbody></table>';
  var el = document.getElementById(id);
  if (el) el.innerHTML = lista.length ? html : '<div class="dc-empty">Sem dados para este recorte.</div>';
}

function _dcTabelaInativos(rows) {
  if (typeof dcTabelaInativos === 'function') dcTabelaInativos(rows);
}

function dcChartEvolucao(rows) {
  var por_mes = {};
  MESES.forEach(function(m,i){ por_mes[i+1] = 0; });
  rows.forEach(function(r){
    var data = dcDataValor(r);
    var m = data ? data.getMonth() + 1 : dcMesNumero(r.mes);
    if (m >= 1 && m <= 12) por_mes[m] = (por_mes[m]||0) + (parseFloat(r.valor)||0);
  });
  var labels = MESES;
  var data   = Object.values(por_mes);

  dcDestroyChart('dc-chart-evolucao');
  var ctx = document.getElementById('dc-chart-evolucao');
  if (!ctx) return;
  DC_CHARTS['evolucao'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Faturamento',
        data: data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#3b82f6',
        pointRadius: 4
      }]
    },
    options: dcChartOpts('R$ ')
  });
}

// ── TRIMESTRES ────────────────────────────────────────────────────────────────
function dcChartTrimestre(rows) {
  var trim = {Q1:0,Q2:0,Q3:0,Q4:0};
  rows.forEach(function(r){
    var data = dcDataValor(r);
    var m = data ? data.getMonth() + 1 : dcMesNumero(r.mes);
    if (!m) return;
    var v = parseFloat(r.valor)||0;
    if (m<=3) trim.Q1+=v; else if(m<=6) trim.Q2+=v; else if(m<=9) trim.Q3+=v; else trim.Q4+=v;
  });
  dcDestroyChart('dc-chart-trimestre');
  var ctx = document.getElementById('dc-chart-trimestre');
  if (!ctx) return;
  DC_CHARTS['trimestre'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Q1 Jan-Mar','Q2 Abr-Jun','Q3 Jul-Set','Q4 Out-Dez'],
      datasets: [{ data: Object.values(trim), backgroundColor: ['#3b82f6','#22c55e','#f59e0b','#ec4899'], borderWidth: 0 }]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:'bottom',labels:{color:'#64748b',font:{size:10}}}, tooltip:{callbacks:{label:function(c){ return ' R$ '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:0}); }}} } }
  });
}

// ── TOP PRODUTOS ──────────────────────────────────────────────────────────────
function dcChartProdutos(rows) {
  var map = {};
  rows.forEach(function(r){ var k=r.produto||'—'; map[k]=(map[k]||0)+(parseFloat(r.valor)||0); });
  var sorted = Object.entries(map).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
  var labels = sorted.map(function(e){ return e[0].length>25?e[0].slice(0,25)+'…':e[0]; });
  var data   = sorted.map(function(e){ return e[1]; });

  dcDestroyChart('dc-chart-produtos');
  var ctx = document.getElementById('dc-chart-produtos');
  if (!ctx) return;
  DC_CHARTS['produtos'] = new Chart(ctx, {
    type: 'bar',
    data: { labels:labels, datasets:[{label:'Faturamento',data:data,backgroundColor:'rgba(59,130,246,0.7)',borderRadius:4}] },
    options: Object.assign(dcChartOpts('R$ '),{indexAxis:'y'})
  });
}

// ── GRUPOS ────────────────────────────────────────────────────────────────────
function dcChartGrupos(rows) {
  var map = {};
  rows.forEach(function(r){ var k=r.grupo||r.grupo_produto||'Sem grupo'; if(k&&k.trim()) map[k]=(map[k]||0)+(parseFloat(r.valor)||0); });
  var sorted = Object.entries(map).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  var cores = ['#3b82f6','#22c55e','#f59e0b','#ec4899','#8b5cf6','#14b8a6','#fb923c','#64748b'];

  dcDestroyChart('dc-chart-grupos');
  var ctx = document.getElementById('dc-chart-grupos');
  if (!ctx) return;
  DC_CHARTS['grupos'] = new Chart(ctx, {
    type: 'pie',
    data: { labels:sorted.map(function(e){return e[0];}), datasets:[{data:sorted.map(function(e){return e[1];}),backgroundColor:cores,borderWidth:0}] },
    options: { responsive:true,maintainAspectRatio:false, plugins:{ legend:{position:'right',labels:{color:'#64748b',font:{size:10},boxWidth:10}}, tooltip:{callbacks:{label:function(c){return ' R$ '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:0})+' ('+((c.raw/(DC_DATA.reduce(function(s,r){return s+(parseFloat(r.valor)||0);},0))||0)*100).toFixed(1)+'%)';}}} } }
  });
}

// ── TABELA REPRESENTANTES ─────────────────────────────────────────────────────
function dcTabelaReps(rows, fatTotal) {
  var map = {};
  rows.forEach(function(r){ var k=r.vendedor||'—'; if(!map[k]) map[k]={fat:0,ped:0}; map[k].fat+=(parseFloat(r.valor)||0); map[k].ped++; });
  var sorted = Object.entries(map).sort(function(a,b){return b[1].fat-a[1].fat;});
  var max = sorted.length ? sorted[0][1].fat : 1;

  var html = '<table class="dc-tabela"><thead><tr><th>#</th><th>Representante</th><th>Pedidos</th><th style="text-align:right">Faturamento</th><th>%</th></tr></thead><tbody>';
  sorted.forEach(function(e,i){
    var pct = (e[1].fat/fatTotal*100).toFixed(1);
    var bar = (e[1].fat/max*100).toFixed(0);
    html += '<tr><td class="pos">'+(i+1)+'</td><td>'+e[0]+'</td><td>'+e[1].ped+'</td>'
          + '<td class="num">R$ '+e[1].fat.toLocaleString('pt-BR',{minimumFractionDigits:0})+'</td>'
          + '<td style="min-width:80px"><div style="font-size:10px;color:#475569;margin-bottom:2px">'+pct+'%</div>'
          + '<div class="dc-bar-wrap"><div class="dc-bar" style="width:'+bar+'%"></div></div></td></tr>';
  });
  html += '</tbody></table>';
  var el = document.getElementById('dc-tabela-reps');
  if (el) el.innerHTML = html;
}

// ── TABELA UFs ────────────────────────────────────────────────────────────────
function dcTabelaUFs(rows, fatTotal) {
  var map = {};
  rows.forEach(function(r){ var k=(r.uf||'—').trim()||'—'; map[k]=(map[k]||0)+(parseFloat(r.valor)||0); });
  var sorted = Object.entries(map).sort(function(a,b){return b[1]-a[1];});
  var max = sorted.length ? sorted[0][1] : 1;

  var html = '<table class="dc-tabela"><thead><tr><th>#</th><th>Estado</th><th style="text-align:right">Faturamento</th><th>Participação</th></tr></thead><tbody>';
  sorted.forEach(function(e,i){
    var pct = (e[1]/fatTotal*100).toFixed(1);
    var bar = (e[1]/max*100).toFixed(0);
    html += '<tr><td class="pos">'+(i+1)+'</td><td>'+e[0]+'</td>'
          + '<td class="num">R$ '+e[1].toLocaleString('pt-BR',{minimumFractionDigits:0})+'</td>'
          + '<td style="min-width:80px"><div style="font-size:10px;color:#475569;margin-bottom:2px">'+pct+'%</div>'
          + '<div class="dc-bar-wrap"><div class="dc-bar" style="width:'+bar+'%;background:linear-gradient(90deg,#22c55e,#4ade80)"></div></div></td></tr>';
  });
  html += '</tbody></table>';
  var el = document.getElementById('dc-tabela-ufs');
  if (el) el.innerHTML = html;
}

// ── TOP CLIENTES ──────────────────────────────────────────────────────────────
function dcTabelaClientes(rows, fatTotal) {
  var map = {};
  rows.forEach(function(r){ var k=r.cliente||'—'; if(!map[k]) map[k]={fat:0,ped:0}; map[k].fat+=(parseFloat(r.valor)||0); map[k].ped++; });
  var sorted = Object.entries(map).sort(function(a,b){return b[1].fat-a[1].fat;}).slice(0,10);

  var html = '<table class="dc-tabela"><thead><tr><th>#</th><th>Cliente</th><th>Pedidos</th><th style="text-align:right">Faturamento</th></tr></thead><tbody>';
  sorted.forEach(function(e,i){
    html += '<tr><td class="pos">'+(i+1)+'</td><td>'+e[0]+'</td><td>'+e[1].ped+'</td>'
          + '<td class="num">R$ '+e[1].fat.toLocaleString('pt-BR',{minimumFractionDigits:0})+'</td></tr>';
  });
  html += '</tbody></table>';
  var el = document.getElementById('dc-tabela-clientes');
  if (el) el.innerHTML = html;
}

// ── CLIENTES INATIVOS ─────────────────────────────────────────────────────────
function dcTabelaInativos(rows) {
  // Pega a data mais recente de compra por cliente
  var mapa = {};
  rows.forEach(function(r){
    var k = r.cliente||'—';
    var d = r.dt_saida ? new Date(r.dt_saida) : null;
    if (d && (!mapa[k] || d > mapa[k].ultima)) {
      mapa[k] = { ultima: d, fat: (mapa[k]?mapa[k].fat:0)+(parseFloat(r.valor)||0) };
    }
  });
  var hoje = new Date();
  var inativos = Object.entries(mapa).map(function(e){
    var dias = Math.floor((hoje - e[1].ultima) / 86400000);
    return { nome: e[0], dias: dias, ultima: e[1].ultima.toLocaleDateString('pt-BR'), fat: e[1].fat };
  }).filter(function(e){ return e.dias >= 30; }).sort(function(a,b){ return b.dias-a.dias; }).slice(0,10);

  if (!inativos.length) {
    var el = document.getElementById('dc-tabela-inativos');
    if (el) el.innerHTML = '<div style="color:#475569;font-size:13px;padding:20px;text-align:center">Nenhum cliente inativo no período ✓</div>';
    return;
  }

  var html = '<table class="dc-tabela"><thead><tr><th>Cliente</th><th style="text-align:right">Dias sem compra</th><th>Última compra</th></tr></thead><tbody>';
  inativos.forEach(function(e){
    var cor = e.dias > 90 ? '#ef4444' : e.dias > 60 ? '#f59e0b' : '#94a3b8';
    html += '<tr><td>'+e.nome+'</td>'
          + '<td style="text-align:right;font-weight:800;color:'+cor+'">'+e.dias+' dias</td>'
          + '<td style="color:#475569">'+e.ultima+'</td></tr>';
  });
  html += '</tbody></table>';
  var el = document.getElementById('dc-tabela-inativos');
  if (el) el.innerHTML = html;
}

// ── UTILITÁRIOS ───────────────────────────────────────────────────────────────
function dcDestroyChart(id) {
  var key = id.replace('dc-chart-','');
  if (DC_CHARTS[key]) { try{ DC_CHARTS[key].destroy(); }catch(e){} delete DC_CHARTS[key]; }
}

function dcChartOpts(prefix) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: function(c){ return ' '+(prefix||'')+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:0}); } } }
    },
    scales: {
      x: { ticks: { color: '#475569', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#475569', font: { size: 10 }, callback: function(v){ return 'R$'+v.toLocaleString('pt-BR',{minimumFractionDigits:0}); } }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  };
}

function dcStatus(msg, ok) {
  var el = document.getElementById('dc-status');
  var texto = String(msg || '');
  if (texto.indexOf('Nenhum') >= 0 || texto.indexOf('Erro') >= 0 || texto.indexOf('âœ') >= 0 || texto.charAt(0) === '✗') {
    dcLoading(false);
  }
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? '#22c55e' : (msg.startsWith('✗') ? '#ef4444' : '#475569');
}
// =============================================================================
// ADMIN MULTI-EMPRESA — Abas · Sincronizar · Processar · Salvar · Limpar
// =============================================================================

var EMPRESA_ATIVA = null;
var EMPRESAS_ADMIN = [
  { empresa_id: 'af3b599b-65c5-4868-b8bf-a5934da84f0d', nome: 'Varremaster',     tem_api: true  },
  { empresa_id: 'dff89ea1-0c33-48d1-84d7-1fc7826654b8', nome: 'Llamenina Matriz', tem_api: false },
  { empresa_id: 'af44d320-d663-48ff-b58f-31c5011ad7ba', nome: 'Llamenina Mega',   tem_api: false }
];

function adminInicializar() {
  var sa = document.getElementById('sync-area'); if (sa) sa.style.display = 'none';
  _adminRenderAbas();
  adminSelecionarEmpresa(EMPRESAS_ADMIN[0].empresa_id);
}

function _adminRenderAbas() {
  var c = document.getElementById('admin-empresa-tabs'); if (!c) return;
  c.innerHTML = EMPRESAS_ADMIN.map(function(e) {
    var tag = e.tem_api ? '<span class="emp-tag tag-api">API</span>' : '<span class="emp-tag tag-manual">Manual</span>';
    return '<button class="admin-emp-tab" data-id="' + e.empresa_id + '">' + e.nome + tag + '</button>';
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

  // Carrega origem configurada e contagens
  await _adminCarregarOrigemEmpresa(id);
  await _adminAtualizarContagens();
  await _adminPreencherPeriodoSync(id);

  // Carrega dados existentes
  await _adminCarregar(id);
  await _adminCarregarCadastrosApiSalvos();
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
  var directResp = null;
  var directText = '';
  try {
    directResp = await _fetchVisualSaefDirect(path, token, { Accept: 'text/plain' });
    directText = await directResp.text();
    var directPayload = null;
    try { directPayload = directText ? JSON.parse(directText) : []; } catch (e) { directPayload = directText; }
    if (directResp.ok) {
      return { ok: directResp.ok, status: directResp.status, endpoint: endpoint, payload: directPayload, text: directText };
    }
  } catch (e) {
    directResp = null;
  }

  var resp = await _fetchVisualSaefProxy(path, token, { Accept: 'text/plain' });
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
    var codigo = String(_vsPick(item, ['id', 'codigo', 'codcliente', 'clienteid', 'idcliente']) || idx + 1).trim();
    var id = codigo || ('cli_' + (idx + 1));
    var base = id;
    var seq = 1;
    while (seen[id]) { seq += 1; id = base + '__' + seq; }
    seen[id] = true;
    return {
      empresa_id: EMPRESA_ATIVA.empresa_id,
      id_externo: id,
      nome: String(_vsPick(item, ['nome', 'cliente', 'nomecliente', 'razaosocial']) || '').trim(),
      razao_social: String(_vsPick(item, ['razaosocial', 'razao', 'nome']) || '').trim(),
      cnpj_cpf: String(_vsPick(item, ['cnpj', 'cpf', 'cnpjcpf', 'documento']) || '').trim(),
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
    var codigo = String(_vsPick(item, ['codigo', 'codproduto', 'id', 'idproduto']) || '').trim();
    var nome = String(_vsPick(item, ['nome', 'descricao', 'produto', 'descricaoproduto']) || '').trim();
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
      grupo: String(_vsPick(item, ['grupo', 'grupoproduto', 'categoria']) || '').trim(),
      marca: String(_vsPick(item, ['marca', 'fabricante', 'industria']) || '').trim(),
      preco: _vsToNumber(_vsPick(item, ['preco', 'precovenda', 'valor', 'valorunitario'])),
      unidade: String(_vsPick(item, ['unidade', 'un', 'unidademedida']) || '').trim(),
      ativo: _vsToBool(_vsPick(item, ['ativo', 'status', 'situacao']))
    };
  });
}

function _adminMapRepresentantesApi(items) {
  var seen = {};
  return items.map(function(item, idx) {
    var codigo = String(_vsPick(item, ['codigo', 'codrepresentante', 'codvendedor', 'id']) || '').trim();
    var nome = String(_vsPick(item, ['nome', 'representante', 'vendedor']) || '').trim();
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
      regiao: String(_vsPick(item, ['regiao', 'zona', 'rota']) || '').trim(),
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
  var params = {
    DataInicio: String(dataInicio.getDate()).padStart(2, '0') + String(dataInicio.getMonth() + 1).padStart(2, '0') + String(dataInicio.getFullYear()),
    DataTermino: String(dataFim.getDate()).padStart(2, '0') + String(dataFim.getMonth() + 1).padStart(2, '0') + String(dataFim.getFullYear())
  };
  var jobs = [
    { key: 'clientes', tables: CADASTRO_TABLES.clientes, candidates: VS_ENDPOINTS.clientes, mapper: _adminMapClientesApi },
    { key: 'produtos', tables: CADASTRO_TABLES.produtos, candidates: VS_ENDPOINTS.produtos, mapper: _adminMapProdutosApi },
    { key: 'representantes', tables: CADASTRO_TABLES.representantes, candidates: VS_ENDPOINTS.representantes, mapper: _adminMapRepresentantesApi }
  ];
  var summary = {};

  for (var i = 0; i < jobs.length; i += 1) {
    var job = jobs[i];
    try {
      var found = await _vsFindEndpointData(token, job.candidates, params);
      if (!found.items.length) {
        var endpointPrincipal = job.candidates[0] || found.endpoint || '';
        var bloqueado403 = _vsAllAttemptsStatus(found.attempts, 403);
        var ausente404 = _vsAllAttemptsStatus(found.attempts, 404);
        summary[job.key] = {
          ok: false,
          pending: !(bloqueado403 || ausente404),
          count: 0,
          endpoint: endpointPrincipal,
          message: bloqueado403
            ? ('API bloqueou o endpoint ' + endpointPrincipal + ' (HTTP 403).')
            : (ausente404
              ? ('Endpoint ' + endpointPrincipal + ' não encontrado na API (HTTP 404).')
              : (_vsResumoTentativas(found.attempts) || 'Nenhum endpoint confirmou dados neste ambiente.'))
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

// ── SYNC VISUAL SAEF — via proxy seguro ───────────────────────────────────────
async function adminSincronizar() {
  if (!EMPRESA_ATIVA || !EMPRESA_ATIVA.tem_api) return;
  var btn = document.getElementById('admin-btn-sync');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spin">⟳</span> Sincronizando...'; }

  try {
    // Data de início: último sync ou 01/01/2025
    var logR = await fetch(
      SUPA_URL + '/rest/v1/sync_log?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id + '&select=ultima_data',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    var logD = await logR.json();
    var ultimaData = logD && logD[0] && logD[0].ultima_data ? logD[0].ultima_data : null;

    var dataInicio = ultimaData ? new Date(ultimaData) : new Date('2025-01-01');
    if (ultimaData) dataInicio.setDate(dataInicio.getDate() + 1);
    var dataFim = new Date();

    var fmt = function(d) {
      return String(d.getDate()).padStart(2,'0')
           + String(d.getMonth()+1).padStart(2,'0')
           + String(d.getFullYear());
    };
    var DI = fmt(dataInicio), DF = fmt(dataFim);
    _adminSetStatus('⏳ Conectando API Varremaster — período: ' + DI + ' a ' + DF);

    // 1. Login na Visual Saef via proxy seguro
    var lR = await _fetchVisualSaefProxy('/login', null, { Accept: 'application/json' });
    if (!lR.ok) throw new Error('Login API falhou: HTTP ' + lR.status);
    var lD = await lR.json();
    var token = lD.token || lD.Token || lD.access_token || lD.accessToken;
    if (!token) throw new Error('Token não retornado. Campos: ' + Object.keys(lD).join(','));
    _adminSetStatus('⏳ Login OK — buscando dados...');

    // 2. Busca vendas
    var dR = await _fetchVisualSaefProxy('/relacaovendaitem?DataInicio=' + DI + '&DataTermino=' + DF, token, { Accept: 'application/json' });
    if (!dR.ok) throw new Error('Busca dados falhou: HTTP ' + dR.status);
    var raw = await dR.json();
    var lista = Array.isArray(raw) ? raw
      : (raw.data || raw.itens || raw.items || raw.result || raw.dados || raw.registros || []);

    _adminSetStatus('⏳ API retornou ' + lista.length + ' registros — processando...');

    if (!lista.length) {
      _adminSetStatus('✓ Nenhum dado novo no período ' + DI + ' a ' + DF, true);
      _atualizarSyncLog(EMPRESA_ATIVA.empresa_id, dataFim, 0, 'Sem dados no período');
      return;
    }

    // 3. Mapeamento case-insensitive
    var get = function(item, keys) {
      var lw = {};
      Object.keys(item).forEach(function(k) { lw[k.toLowerCase().replace(/[\s_]/g,'')] = item[k]; });
      for (var i=0; i<keys.length; i++) {
        var v = lw[keys[i].toLowerCase().replace(/[\s_]/g,'')];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return null;
    };

    // Converte data DD/MM/YYYY ou qualquer formato → YYYY-MM-DD para o Supabase
    var cvData = function(v) {
      if (!v) return null;
      var s = String(v).trim();
      // Já em YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
      // DD/MM/YYYY ou DD-MM-YYYY
      var m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (m) return m[3] + '-' + m[2] + '-' + m[1];
      // Tenta via Date
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
        id_externo:   montarIdExternoSync(item, idx),
        num_pedido:   String(get(item,['numeropedido','numpedido','pedido','cdpedido','nrpedido']) || ''),
        produto:      String(get(item,['produto','descricao','descricaoproduto','descproduto','nmproduto','dsproduto','descitem']) || ''),
        qtd:          Number(get(item,['quantidadevenda','quantidadeVenda','quantidade','qtd','qtde']) || 0),
        dt_emissao:   cvData(get(item,['dataemissao','dtemissao','emissao'])),
        dt_saida:     cvData(get(item,['datafaturamento','dataFaturamento','dataatendimento','datasaida','dtsaida','datavenda'])),
        valor:        Number(get(item,['valortotal','valor','vltotal','totalitem','vlitem','valoritem','vlvenda']) || 0),
        vendedor:     String(get(item,['nomevendedor','nomeVendedor','vendedor','representante','nomerepresentante']) || ''),
        industria:    String(get(item,['industria','fabricante','fornecedor','marca']) || ''),
        cliente:      String(get(item,['nomecliente','nomeCliente','cliente','razaosocial']) || ''),
        grupo:        String(get(item,['nomadacategoria','nomeDaCategoria','grupocategoria','grupo','categoria']) || ''),
        uf:           String(get(item,['uf','estado','ufcliente','siglaestado']) || ''),
        cidade:       String(get(item,['cidade','municipio','nomecidade']) || ''),
        empresa_nome: 'Varremaster'
      };
    });

    // 4. Salva no Supabase em lotes de 500
    var inseridos = 0;
    // Limpa manuais antigos desta empresa (API sobrescreve)
    // Apaga TODOS os registros desta empresa antes de reinserir
    // Evita qualquer conflito de chave duplicada
    _adminSetStatus('⏳ Limpando registros anteriores...');
    var delR = await fetch(SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id,
      { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } });
    if (!delR.ok) {
      var delErr = await delR.text();
      throw new Error('Falha ao limpar dados antigos: HTTP ' + delR.status + ' ' + delErr.slice(0, 200));
    }

    // Loga o primeiro registro para debug
    if (regs.length > 0) {
      console.log('[SYNC] Primeiro registro a inserir:', JSON.stringify(regs[0]));
    }

    for (var i = 0; i < regs.length; i += 500) {
      var batch = regs.slice(i, i+500);
      var sR = await fetch(SUPA_URL + '/rest/v1/vendas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + SVC_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(batch)
      });
      var respBody = await sR.text();
      console.log('[SYNC] Lote', i, 'status:', sR.status, 'body:', respBody.slice(0,200));
      if (!sR.ok) {
        throw new Error('Erro HTTP ' + sR.status + ': ' + respBody.slice(0,300));
      }
      inseridos += batch.length;
      _adminSetStatus('⏳ Inserindo... ' + inseridos + '/' + regs.length);
    }

    // 5. Atualiza sync_log
    await _atualizarSyncLog(EMPRESA_ATIVA.empresa_id, dataFim, inseridos, inseridos + ' registros de ' + DI + ' a ' + DF);

    // 6. Recarrega dados e processa relatórios
    _adminSetStatus('✓ ' + inseridos + ' registros importados da Varremaster!', true);
    await _adminCarregar(EMPRESA_ATIVA.empresa_id);
    try { bdMapColumns(); } catch(e) { console.error(e); }
    try { bdAutoFill(); }   catch(e) { console.error(e); }
    try { bdUpdateAllTabs(); } catch(e) { console.error(e); }
    if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
      GRIDS.bd.allData = BD_DATA.rows; GRIDS.bd.filtered = null;
      GRIDS.bd.page = 0; GRIDS.bd._render();
    }
    adminProcessar();

  } catch(e) {
    _adminSetStatus('✗ ' + e.message);
    console.error('Sync error:', e);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="13" height="13"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg> Sincronizar API';
    }
  }
}

async function _atualizarSyncLog(empresa_id, dataFim, total, mensagem) {
  try {
    await fetch(SUPA_URL + '/rest/v1/sync_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY,
                 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        empresa_id:      empresa_id,
        ultima_sync:     new Date().toISOString(),
        ultima_data:     dataFim.toISOString().split('T')[0],
        total_registros: total,
        status:          'ok',
        mensagem:        mensagem
      })
    });
  } catch(e) { console.error('sync_log error:', e); }
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

// ── SYNC API — salva + gera relatórios ────────────────────────────────────────
// Substitui adminSincronizar com versão que gera relatórios após sync
var _syncOriginalFn = adminSincronizar;
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

  try {
    var periodo = _adminObterPeriodoSync();
    var dataInicio = periodo.dataInicio;
    var dataFim = periodo.dataFim;

    var fmt = function(d) {
      return String(d.getDate()).padStart(2,'0') + String(d.getMonth()+1).padStart(2,'0') + String(d.getFullYear());
    };
    var DI = fmt(dataInicio), DF = fmt(dataFim);
    _adminSetStatus('⏳ Conectando à API — período: ' + DI + ' → ' + DF);

    // Login Visual Saef via proxy seguro
    var lR = await _fetchVisualSaefProxy('/login', null, { Accept: 'application/json' });
    if (!lR.ok) throw new Error('Login API falhou: HTTP ' + lR.status);
    var lD = await lR.json();
    var token = lD.token || lD.Token || lD.access_token || lD.accessToken;
    if (!token) throw new Error('Token não retornado. Campos: ' + Object.keys(lD).join(','));
    _adminSetStatus('⏳ Login OK — buscando dados...');

    // Busca dados
    var dR = await _fetchVisualSaefProxy('/relacaovendaitem?DataInicio=' + DI + '&DataTermino=' + DF, token, { Accept: 'application/json' });
    if (!dR.ok) throw new Error('Busca falhou: HTTP ' + dR.status);
    var raw = await dR.json();
    var lista = Array.isArray(raw) ? raw : (raw.data || raw.itens || raw.items || raw.result || raw.dados || []);
    _adminSetStatus('⏳ ' + lista.length + ' registros recebidos — salvando...');

    if (!lista.length) {
      _adminSetStatus('✓ Nenhum dado novo no período.', true);
      _adminAtualizarUltimSync(dataFim, 0);
      return;
    }

    // Log dos campos do primeiro item (diagnóstico)
    console.log('[SYNC] Campos:', JSON.stringify(Object.keys(lista[0])));
    console.log('[SYNC] 1o item raw:', JSON.stringify(lista[0]));
    console.log('[SYNC] 2o item raw:', lista.length > 1 ? JSON.stringify(lista[1]) : 'N/A');
    // Salva amostra no banco para debug (consulte sync_log.mensagem)
    try {
      await fetch(SUPA_URL + '/rest/v1/sync_log?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ mensagem: 'CAMPOS_API:' + JSON.stringify(Object.keys(lista[0])) + ' | 1o:' + JSON.stringify(lista[0]).slice(0,500) })
      });
    } catch(e) { console.warn('debug log fail:', e); }
    console.log('[SYNC] 1º item:', JSON.stringify(lista[0]));

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
        empresa_nome: 'Varremaster'
      };
    });

    // Apaga TODOS os registros desta empresa (origem=api, manual ou NULL)
    // para evitar conflito de chave duplicada
    _adminSetStatus('⏳ Limpando dados anteriores...');
    var delAll = await fetch(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id,
      { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal', 'Content-Type': 'application/json' } }
    );
    console.log('[SYNC] DELETE status:', delAll.status);
    if (!delAll.ok) {
      var delBody = await delAll.text();
      throw new Error('Falha ao limpar dados antigos: HTTP ' + delAll.status + ': ' + delBody.slice(0,300));
    }

    // Insere
    var inseridos = 0;
    for (var i = 0; i < regs.length; i += 300) {
      var batch = regs.slice(i, i+300);
      var sR = await fetch(SUPA_URL + '/rest/v1/vendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal' },
        body: JSON.stringify(batch)
      });
      var body = await sR.text();
      console.log('[SYNC] Lote', i, 'status:', sR.status, body.slice(0,100));
      if (!sR.ok) throw new Error('HTTP ' + sR.status + ': ' + body.slice(0,300));
      inseridos += batch.length;
      _adminSetStatus('⏳ Inserindo... ' + inseridos + '/' + regs.length);
    }

    // Atualiza sync_log
    await _adminAtualizarUltimSync(dataFim, inseridos);
    await fetch(SUPA_URL + '/rest/v1/empresas?id=eq.' + EMPRESA_ATIVA.empresa_id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ exibir_origem: 'api' })
    });
    EMPRESA_ATIVA.exibir_origem = 'api';

    // Enriquecer a base com cadastros auxiliares vindos da API dedicada
    _adminSetStatus('⏳ Enriquecendo cadastros dedicados da API...');
    await _adminLimparCadastrosApiSync();
    var cadastrosResumo = await _adminSincronizarCadastrosApi(token, dataInicio, dataFim);

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

    // Gera relatórios automaticamente
    _adminSetStatus('⏳ Gerando relatórios...');
    await _adminCarregar(EMPRESA_ATIVA.empresa_id);

    try { bdMapColumns(); } catch(e) { console.error(e); }
    try { bdAutoFill(); }   catch(e) { console.error(e); }
    try { bdUpdateAllTabs(); } catch(e) { console.error(e); }
    if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
      GRIDS.bd.allData = BD_DATA.rows; GRIDS.bd.filtered = null;
      GRIDS.bd.page = 0; GRIDS.bd._render();
    }

    var relAviso = document.getElementById('adm-api-relatorios');
    if (relAviso) relAviso.style.display = 'block';

    await _adminAtualizarContagens();
    _adminSetStatus('✓ ' + inseridos.toLocaleString('pt-BR') + ' registros sincronizados — relatórios gerados!', true);

  } catch(e) {
    _adminSetStatus('✗ ' + e.message);
    console.error('[SYNC]', e);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg> Sincronizar API';
    }
  }
};

function _adminMostrarKpisSync(regs) {
  var fat = regs.reduce(function(s,r){ return s+(parseFloat(r.valor)||0); }, 0);
  var cli = new Set(regs.map(function(r){ return r.cliente; }).filter(Boolean)).size;
  var prd = new Set(regs.map(function(r){ return r.produto; }).filter(Boolean)).size;
  function fmt(v){ return typeof fmtValor === 'function' ? fmtValor(v) : 'R$ '+Number(v || 0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:2}); }
  var extra = arguments[1] || {};
  var kpis = [
    { val: regs.length.toLocaleString('pt-BR'), lbl: 'Registros' },
    { val: fmt(fat),                            lbl: 'Faturamento' },
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

async function _adminAtualizarUltimSync(dataFim, total) {
  try {
    await fetch(SUPA_URL + '/rest/v1/sync_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ empresa_id: EMPRESA_ATIVA.empresa_id, ultima_sync: new Date().toISOString(), ultima_data: dataFim.toISOString().split('T')[0], total_registros: total, status: 'ok' })
    });
    var el = document.getElementById('adm-api-ultima');
    if (el) el.textContent = 'Último sync: ' + new Date().toLocaleString('pt-BR') + ' — ' + total.toLocaleString('pt-BR') + ' registros';
  } catch(e) { console.error(e); }
}
