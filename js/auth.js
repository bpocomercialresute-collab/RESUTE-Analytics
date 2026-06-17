// =============================================================================
// AUTH.JS — Login, sessão e sync automático com API
// =============================================================================

const SUPA_URL  = 'https://glfzevdsmmdvrwhplzkc.supabase.co';
const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZnpldmRzbW1kdnJ3aHBsemtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzU4NzMsImV4cCI6MjA5NzExMTg3M30.GEcGhBdW9whsdikO181Uvv2rpzXfvyntTHzPKots4bE';
const SYNC_URL  = SUPA_URL + '/functions/v1/sync-visual-saef';

var SESSION = null;

// ── ABRE ANÁLISE DE VENDAS (chamado pelo card) ───────────────────────────────
function abrirAnaliseVendas() {
  var saved = localStorage.getItem('resute_session');
  if (saved) {
    try { SESSION = JSON.parse(saved); } catch(e) { SESSION = null; }
  }
  if (SESSION && SESSION.token) {
    _abrirApp();
  } else {
    _mostrarLogin();
  }
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ email: email, password: senha })
    });
    var d = await r.json();
    if (!r.ok || !d.access_token) throw new Error('Email ou senha incorretos.');

    // Busca dados do usuário
    var uR = await fetch(SUPA_URL + '/rest/v1/usuarios?email=eq.' + encodeURIComponent(email) + '&select=*,empresas(id,nome,slug)', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + d.access_token }
    });
    var users = await uR.json();
    if (!users || !users.length) throw new Error('Usuário não cadastrado.');
    var u = users[0];

    SESSION = {
      token:        d.access_token,
      nome:         u.nome,
      email:        u.email,
      papel:        u.papel,
      empresa_id:   u.empresa_id || null,
      empresa_nome: u.empresas ? u.empresas.nome : 'RESUTE',
      empresa_slug: u.empresas ? u.empresas.slug : null
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
  SESSION = null;
  localStorage.removeItem('resute_session');
  // Volta para ferramentas
  if (typeof switchView === 'function') switchView('view-tools');
}

// ── ABRE O APP ────────────────────────────────────────────────────────────────
function _abrirApp() {
  // Atualiza header
  var nomeEl    = document.getElementById('user-nome');
  var empresaEl = document.getElementById('user-empresa');
  if (nomeEl)    nomeEl.textContent    = SESSION.nome;
  if (empresaEl) empresaEl.textContent = SESSION.empresa_nome;

  // Mostra/oculta botão sync (clientes podem sincronizar)
  // Sync area
  var syncArea = document.getElementById('sync-area');
  if (syncArea) syncArea.style.display = 'flex';
  // Header user
  var headerUser = document.getElementById('header-user');
  if (headerUser) headerUser.style.display = 'flex';
  // Sidebar user
  var sidebarUser = document.getElementById('sidebar-user');
  if (sidebarUser) sidebarUser.style.display = 'flex';
  var sbNome = document.getElementById('sidebar-user-nome');
  var sbEmp  = document.getElementById('sidebar-user-empresa');
  if (sbNome) sbNome.textContent = SESSION.nome;
  if (sbEmp)  sbEmp.textContent  = SESSION.empresa_nome;

  // Vai para o app
  if (typeof switchView === 'function') switchView('view-app');

  // Carrega dados do Supabase automaticamente
  carregarDadosDoSupabase();
}

// ── SINCRONIZAR API → SUPABASE ────────────────────────────────────────────────
async function sincronizarAPI() {
  if (!SESSION || !SESSION.empresa_id) {
    alert('Nenhuma empresa vinculada à sua conta.');
    return;
  }
  var btn    = document.getElementById('btn-sync');
  var status = document.getElementById('sync-status');

  btn.disabled = true;
  btn.innerHTML = '<span class="auth-spin">⟳</span> Sincronizando...';
  _setStatus('⏳ Conectando à API da ' + SESSION.empresa_nome + '...', '');

  try {
    // Verifica última data sincronizada para sync incremental
    var logR = await fetch(SUPA_URL + '/rest/v1/sync_log?empresa_id=eq.' + SESSION.empresa_id + '&select=ultima_data,ultima_sync', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SESSION.token }
    });
    var logData = await logR.json();
    var ultimaData = logData && logData[0] && logData[0].ultima_data ? logData[0].ultima_data : null;
    var ultimaSync = logData && logData[0] && logData[0].ultima_sync ? new Date(logData[0].ultima_sync).toLocaleDateString('pt-BR') : 'nunca';
    _setStatus('⏳ Último sync: ' + ultimaSync + ' — buscando novos dados...', '');

    var r = await fetch(SYNC_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ empresa_id: SESSION.empresa_id })
    });
    var d = await r.json();
    if (!r.ok || d.erro) throw new Error(d.erro || 'Erro na sincronização.');

    _setStatus('✓ ' + (d.mensagem || d.novos + ' registros importados'), 'ok');

    // Se vieram novos dados, recarrega
    if (d.novos > 0) {
      await carregarDadosDoSupabase();
    }
  } catch(e) {
    _setStatus('✗ ' + e.message, 'erro');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg> Sincronizar';
  }
}

// ── CARREGA DADOS DO SUPABASE → BD_DATA → RELATÓRIOS ─────────────────────────
async function carregarDadosDoSupabase() {
  if (!SESSION || !SESSION.empresa_id) return;
  _setStatus('⏳ Carregando dados...', '');

  try {
    var r = await fetch(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + SESSION.empresa_id +
      '&select=*&order=dt_saida.asc&limit=50000',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SESSION.token } }
    );
    var vendas = await r.json();

    if (!Array.isArray(vendas) || !vendas.length) {
      _setStatus('⚠ Nenhuma venda no banco. Clique em Sincronizar.', '');
      return;
    }

    // Converte para o formato BD_DATA (array de arrays)
    var rows = vendas.map(function(v) {
      return [
        v.id_externo||'', v.num_pedido||'', v.produto||'', String(v.qtd||''),
        v.dt_emissao||'', v.dt_saida||'', String(v.valor||''),
        v.vendedor||'', v.industria||'', v.cliente||'',
        v.ano?String(v.ano):'', v.mes||'', v.grupo||'', v.semana||'',
        v.tipo_mercado||'', v.setor||'', v.cidade||'', v.uf||'',
        v.tipo_vendedor||'', '', '', v.rota||'', v.desconto||'',
        v.empresa_nome||'', v.cnpj||'', v.grupo_produto||'', v.grupo_pai||'',
        v.subgrupo||'', v.marca||'', v.familia||'', v.classes||''
      ];
    });

    // Alimenta BD_DATA
    BD_DATA.headers = ['ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída',
      'VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM',
      'tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra',
      'NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto','GRUPO PAI',
      'subgrupo_produto','marca','familia_produto','classes'];
    BD_DATA.rows  = rows;
    BD_DATA.count = rows.length;
    if (typeof FULL_DATA !== 'undefined') FULL_DATA.bd = rows;

    // Processa
    try { bdMapColumns(); }    catch(e){ console.error(e); }
    try { bdAutoFill(); }      catch(e){ console.error(e); }
    try { bdUpdateAllTabs(); } catch(e){ console.error(e); }

    // Atualiza grade visual
    if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
      GRIDS.bd.allData = rows; GRIDS.bd.filtered = null;
      GRIDS.bd.page = 0; GRIDS.bd._render();
    }

    _setStatus('✓ ' + rows.length.toLocaleString('pt-BR') + ' vendas — relatórios gerados!', 'ok');

  } catch(e) {
    _setStatus('✗ Erro: ' + e.message, 'erro');
    console.error(e);
  }
}

function _setStatus(msg, tipo) {
  var el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'sync-status' + (tipo ? ' sync-' + tipo : '');
}

// Enter no campo de senha faz login
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var modal = document.getElementById('login-modal');
    if (modal && modal.style.display !== 'none') fazerLogin();
  }
});