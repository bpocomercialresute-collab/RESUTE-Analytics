// =============================================================================
// AUTH.JS — Login, sessão e sync
// =============================================================================

const SUPA_URL  = 'https://glfzevdsmmdvrwhplzkc.supabase.co';
const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZnpldmRzbW1kdnJ3aHBsemtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzU4NzMsImV4cCI6MjA5NzExMTg3M30.GEcGhBdW9whsdikO181Uvv2rpzXfvyntTHzPKots4bE';

var SESSION  = null;
var EMPRESAS = [];

function abrirAnaliseVendas() {
  var saved = localStorage.getItem('resute_session');
  if (saved) { try { SESSION = JSON.parse(saved); } catch(e) { SESSION = null; } }
  if (SESSION && SESSION.token) { _abrirApp(); } else { _mostrarLogin(); }
}

function _mostrarLogin() {
  document.getElementById('login-modal').style.display = 'flex';
  setTimeout(function(){ document.getElementById('login-email').focus(); }, 100);
}

function fecharLogin() {
  document.getElementById('login-modal').style.display = 'none';
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
    // Autentica no Supabase
    var r = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body:    JSON.stringify({ email: email, password: senha })
    });
    var d = await r.json();
    if (!r.ok || !d.access_token) throw new Error('Email ou senha incorretos.');

    // Busca dados do usuário
    var uR = await fetch(SUPA_URL + '/rest/v1/usuarios?email=eq.' + encodeURIComponent(email) + '&select=*,empresas(id,nome,slug)', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + d.access_token }
    });
    var users = await uR.json();
    if (!users || !users.length) throw new Error('Usuário não encontrado no sistema.');

    var u = users[0];
    SESSION = {
      token:        d.access_token,
      nome:         u.nome,
      email:        u.email,
      papel:        u.papel,
      empresa_id:   u.empresa_id || null,
      empresa_nome: u.empresas ? u.empresas.nome : 'RESUTE'
    };
    localStorage.setItem('resute_session', JSON.stringify(SESSION));
    fecharLogin();
    _abrirApp();

  } catch(e) {
    erro.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Entrar <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
  }
}

function fazerLogout() {
  SESSION = null; EMPRESAS = [];
  localStorage.removeItem('resute_session');
  if (typeof switchView === 'function') switchView('view-home');
  ['sync-area','header-user','sidebar-user'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function _abrirApp() {
  // Atualiza UI
  var campos = {
    'user-nome': SESSION.nome, 'user-empresa': SESSION.empresa_nome,
    'sidebar-user-nome': SESSION.nome, 'sidebar-user-empresa': SESSION.empresa_nome
  };
  Object.keys(campos).forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.textContent = campos[id];
  });
  ['sync-area','header-user','sidebar-user'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  });

  if (typeof switchView === 'function') switchView('view-app');

  if (SESSION.papel === 'super_admin') {
    _carregarEmpresasComAPI();
  } else {
    carregarDadosDoSupabase(SESSION.empresa_id);
  }
}

// ── CARREGA EMPRESAS COM API (super_admin) ────────────────────────────────────
async function _carregarEmpresasComAPI() {
  try {
    var r = await fetch(
      SUPA_URL + '/rest/v1/api_config?select=empresa_id,sistema,api_url,empresas(nome,slug)&ativo=eq.true',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SESSION.token } }
    );
    var data = await r.json();

    EMPRESAS = (data || []).filter(function(d){ return d.empresas; }).map(function(d){
      return { empresa_id: d.empresa_id, nome: d.empresas.nome, slug: d.empresas.slug, sistema: d.sistema, api_url: d.api_url };
    });

    var sel = document.getElementById('sync-empresa-select');
    if (!sel) return;

    if (EMPRESAS.length === 0) {
      sel.style.display = 'none';
      _setStatus('⚠ Nenhuma empresa com API configurada.', '');
      return;
    }

    sel.style.display = 'block';
    sel.innerHTML = EMPRESAS.length > 1 ? '<option value="">— Selecione a empresa —</option>' : '';
    EMPRESAS.forEach(function(e) {
      var opt = document.createElement('option');
      opt.value = e.empresa_id;
      opt.textContent = e.nome + ' (' + e.sistema + ')';
      sel.appendChild(opt);
    });

    // Se só tem 1, seleciona e carrega automaticamente
    if (EMPRESAS.length === 1) {
      sel.value = EMPRESAS[0].empresa_id;
      _setStatus('✓ ' + EMPRESAS[0].nome + ' pronta para sincronizar', 'ok');
    }

    sel.addEventListener('change', function() {
      if (sel.value) carregarDadosDoSupabase(sel.value);
    });

  } catch(e) {
    console.error('Erro ao carregar empresas:', e);
    _setStatus('✗ Erro: ' + e.message, 'erro');
  }
}

// ── SINCRONIZAR API ───────────────────────────────────────────────────────────
async function sincronizarAPI() {
  var empresa_id = null;

  if (SESSION.papel === 'super_admin') {
    var sel = document.getElementById('sync-empresa-select');
    empresa_id = sel ? sel.value : null;
    if (!empresa_id) { _setStatus('⚠ Selecione uma empresa para sincronizar.', ''); return; }
  } else {
    empresa_id = SESSION.empresa_id;
  }

  if (!empresa_id) { _setStatus('⚠ Nenhuma empresa encontrada.', ''); return; }

  var btn = document.getElementById('btn-sync');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spin">⟳</span> Sincronizando...'; }

  // Nome da empresa
  var nomeEmp = SESSION.empresa_nome;
  if (SESSION.papel === 'super_admin') {
    var emp = EMPRESAS.find(function(e){ return e.empresa_id === empresa_id; });
    if (emp) nomeEmp = emp.nome;
  }

  try {
    // Verifica último sync
    var logR = await fetch(
      SUPA_URL + '/rest/v1/sync_log?empresa_id=eq.' + empresa_id + '&select=ultima_data,ultima_sync,status',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SESSION.token } }
    );
    var logD = await logR.json();
    var ultima = logD && logD[0] && logD[0].ultima_data
      ? new Date(logD[0].ultima_data).toLocaleDateString('pt-BR')
      : 'nunca sincronizado';
    _setStatus('⏳ ' + nomeEmp + ' — último sync: ' + ultima, '');

    // Chama Edge Function do Supabase (já deployada e funcional)
    var r = await fetch(
      SUPA_URL + '/functions/v1/sync-visual-saef',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SESSION.token },
        body:    JSON.stringify({ empresa_id: empresa_id })
      }
    );
    var d = await r.json();
    if (!r.ok || d.erro) throw new Error(d.erro || 'Erro na sincronização.');

    _setStatus('✓ ' + (d.mensagem || d.novos + ' registros importados'), 'ok');
    if ((d.novos || 0) > 0) await carregarDadosDoSupabase(empresa_id);

  } catch(e) {
    _setStatus('✗ ' + e.message, 'erro');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg> Sincronizar';
    }
  }
}

// ── CARREGA DADOS SUPABASE → BD_DATA → RELATÓRIOS ────────────────────────────
async function carregarDadosDoSupabase(empresa_id) {
  if (!empresa_id) return;
  _setStatus('⏳ Carregando dados...', '');

  try {
    var r = await fetch(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + empresa_id + '&select=*&order=dt_saida.asc&limit=50000',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SESSION.token } }
    );
    var vendas = await r.json();

    if (!Array.isArray(vendas) || !vendas.length) {
      _setStatus('⚠ Sem dados. Clique em Sincronizar para buscar da API.', '');
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
    BD_DATA.rows  = rows;
    BD_DATA.count = rows.length;
    if (typeof FULL_DATA !== 'undefined') FULL_DATA.bd = rows;

    try { bdMapColumns(); }    catch(e){ console.error(e); }
    try { bdAutoFill(); }      catch(e){ console.error(e); }
    try { bdUpdateAllTabs(); } catch(e){ console.error(e); }

    if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
      GRIDS.bd.allData = rows; GRIDS.bd.filtered = null;
      GRIDS.bd.page = 0; GRIDS.bd._render();
    }

    _setStatus('✓ ' + rows.length.toLocaleString('pt-BR') + ' vendas carregadas — relatórios atualizados!', 'ok');

  } catch(e) {
    _setStatus('✗ ' + e.message, 'erro');
    console.error(e);
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
    if (modal && modal.style.display !== 'none') fazerLogin();
  }
});