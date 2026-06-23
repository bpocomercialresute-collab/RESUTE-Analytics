// =============================================================================
// AUTH.JS — Login, sessão e sync
// =============================================================================

const SUPA_URL = 'https://glfzevdsmmdvrwhplzkc.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZnpldmRzbW1kdnJ3aHBsemtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzU4NzMsImV4cCI6MjA5NzExMTg3M30.GEcGhBdW9whsdikO181Uvv2rpzXfvyntTHzPKots4bE';
const SVC_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZnpldmRzbW1kdnJ3aHBsemtjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTUzNTg3MywiZXhwIjoyMDk3MTExODczfQ.SA-rCZ9A6qXkY1lfYW65OjpTVUGSOLFXTb50s9R9nN0';

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
    // 1. Autentica no Supabase Auth
    var r = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ email: email, password: senha })
    });
    var d = await r.json();
    if (!r.ok || !d.access_token) {
      throw new Error(d.error_description || d.message || 'Email ou senha incorretos.');
    }

    // 2. Busca dados do usuário na tabela usuarios
    var uR = await fetch(
      SUPA_URL + '/rest/v1/usuarios?email=eq.' + encodeURIComponent(email) + '&select=*',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + d.access_token } }
    );
    var users = await uR.json();

    // Se não achou na tabela usuarios, usa dados básicos do Auth
    var u = (users && users.length) ? users[0] : { nome: email, papel: 'cliente', empresa_id: null };

    SESSION = {
      token:        d.access_token,
      nome:         u.nome || email,
      email:        email,
      papel:        u.papel || 'cliente',
      empresa_id:   u.empresa_id || null,
      empresa_nome: 'RESUTE'
    };
    localStorage.setItem('resute_session', JSON.stringify(SESSION));
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
  localStorage.removeItem('resute_session');
  if (typeof switchView === 'function') switchView('view-home');
  ['sync-area','header-user','sidebar-user'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function _abrirApp() {
  var campos = {
    'user-nome': SESSION.nome, 'user-empresa': SESSION.empresa_nome,
    'sidebar-user-nome': SESSION.nome, 'sidebar-user-empresa': SESSION.empresa_nome
  };
  Object.keys(campos).forEach(function(id){
    var el = document.getElementById(id); if (el) el.textContent = campos[id];
  });
  ['sync-area','header-user','sidebar-user'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.style.display = 'flex';
  });
  if (typeof switchView === 'function') switchView('view-app');
  _carregarEmpresasComAPI();
}

// ── CARREGA EMPRESAS COM API ─────────────────────────────────────────────────
async function _carregarEmpresasComAPI() {
  _setStatus('⏳ Carregando empresas...', '');
  try {
    // Query 1: todas as empresas
    var eR = await fetch(SUPA_URL + '/rest/v1/empresas?select=id,nome,slug&ativo=eq.true', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    });
    var empresas = await eR.json();
    console.log('Empresas:', empresas);

    // Query 2: api_config com api_key preenchida
    var aR = await fetch(SUPA_URL + '/rest/v1/api_config?select=empresa_id,sistema,api_url&ativo=eq.true', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    });
    var apiConfigs = await aR.json();
    console.log('API Configs:', apiConfigs);

    // Junta as duas listas
    EMPRESAS = (empresas || []).map(function(emp) {
      var api = (apiConfigs || []).find(function(a){ return a.empresa_id === emp.id; });
      if (!api) return null;
      return { empresa_id: emp.id, nome: emp.nome, slug: emp.slug, sistema: api.sistema || 'api' };
    }).filter(Boolean);

    console.log('EMPRESAS com API:', EMPRESAS);

    var sel = document.getElementById('sync-empresa-select');

    // Se super_admin: mostra dropdown com todas as empresas
    // Se cliente: usa só a empresa dele
    var lista = EMPRESAS;
    if (SESSION.papel !== 'super_admin' && SESSION.empresa_id) {
      lista = EMPRESAS.filter(function(e){ return e.empresa_id === SESSION.empresa_id; });
    }

    if (!lista.length) {
      if (sel) sel.style.display = 'none';
      _setStatus('⚠ Nenhuma empresa com API configurada.', '');
      return;
    }

    if (sel) {
      if (lista.length === 1) {
        // Só uma empresa: esconde dropdown, usa ela
        sel.style.display = 'none';
        sel.innerHTML = '<option value="' + lista[0].empresa_id + '">' + lista[0].nome + '</option>';
        sel.value = lista[0].empresa_id;
        _setStatus('✓ ' + lista[0].nome + ' — clique Sincronizar para buscar dados.', 'ok');
        // Carrega dados já existentes
        await carregarDadosDoSupabase(lista[0].empresa_id);
      } else {
        // Múltiplas: mostra dropdown
        sel.style.display = 'block';
        sel.innerHTML = '<option value="">— Selecione a empresa —</option>';
        lista.forEach(function(e) {
          sel.innerHTML += '<option value="' + e.empresa_id + '">' + e.nome + ' (' + e.sistema + ')</option>';
        });
        sel.onchange = function() { if (sel.value) carregarDadosDoSupabase(sel.value); };
        _setStatus('Selecione uma empresa.', '');
      }
    }
  } catch(e) {
    console.error('Erro _carregarEmpresasComAPI:', e);
    _setStatus('✗ Erro ao carregar empresas: ' + e.message, 'erro');
  }
}

// ── SINCRONIZAR API ───────────────────────────────────────────────────────────
async function sincronizarAPI() {
  var empresa_id = null;
  var sel = document.getElementById('sync-empresa-select');

  if (sel && sel.value) {
    empresa_id = sel.value;
  } else if (SESSION.empresa_id) {
    empresa_id = SESSION.empresa_id;
  } else if (EMPRESAS.length === 1) {
    empresa_id = EMPRESAS[0].empresa_id;
  }

  if (!empresa_id) {
    _setStatus('⚠ Selecione uma empresa antes de sincronizar.', '');
    return;
  }

  var emp = EMPRESAS.find(function(e){ return e.empresa_id === empresa_id; }) || { nome: 'Empresa' };
  var btn = document.getElementById('btn-sync');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spin">⟳</span> Sincronizando...'; }

  try {
    // Verifica último sync
    var logR = await fetch(
      SUPA_URL + '/rest/v1/sync_log?empresa_id=eq.' + empresa_id + '&select=ultima_data,status',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    var logD = await logR.json();
    var ultima = (logD && logD[0] && logD[0].ultima_data)
      ? new Date(logD[0].ultima_data).toLocaleDateString('pt-BR')
      : 'nunca';

    _setStatus('⏳ ' + emp.nome + ' — último sync: ' + ultima + '. Buscando dados novos...', '');

    // Chama Edge Function
    var r = await fetch(SUPA_URL + '/functions/v1/sync-visual-saef', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SVC_KEY },
      body:    JSON.stringify({ empresa_id: empresa_id })
    });
    var d = await r.json();
    console.log('Sync result:', d);

    if (!r.ok || d.erro) throw new Error(d.erro || 'Erro na sincronização.');

    _setStatus('✓ ' + (d.mensagem || d.novos + ' registros importados'), 'ok');
    if ((d.novos || 0) > 0) await carregarDadosDoSupabase(empresa_id);
    else _setStatus('✓ Dados já atualizados. ' + (d.mensagem || ''), 'ok');

  } catch(e) {
    console.error('Sync erro:', e);
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
  _setStatus('⏳ Carregando dados do banco...', '');
  try {
    var r = await fetch(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + empresa_id + '&select=*&order=dt_saida.asc&limit=50000',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    var vendas = await r.json();
    console.log('Vendas carregadas:', Array.isArray(vendas) ? vendas.length : vendas);

    if (!Array.isArray(vendas) || !vendas.length) {
      _setStatus('⚠ Sem vendas no banco. Clique em Sincronizar.', '');
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

    try { bdMapColumns(); }    catch(e){ console.error('bdMapColumns:', e); }
    try { bdAutoFill(); }      catch(e){ console.error('bdAutoFill:', e); }
    try { bdUpdateAllTabs(); } catch(e){ console.error('bdUpdateAllTabs:', e); }

    if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
      GRIDS.bd.allData = rows; GRIDS.bd.filtered = null;
      GRIDS.bd.page = 0; GRIDS.bd._render();
    }

    _setStatus('✓ ' + rows.length.toLocaleString('pt-BR') + ' vendas carregadas — relatórios gerados!', 'ok');

  } catch(e) {
    console.error('carregarDados erro:', e);
    _setStatus('✗ ' + e.message, 'erro');
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