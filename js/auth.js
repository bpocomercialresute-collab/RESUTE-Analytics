// =============================================================================
// AUTH.JS — Login, sessão e sync via Vercel API (sem credenciais no browser)
// =============================================================================

// Sem mais credenciais aqui — tudo vai pelo backend /api/
var SESSION = null;

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
    // Chama a Vercel Function — sem credenciais no browser
    var r = await fetch('/api/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, senha })
    });
    var d = await r.json();
    if (!r.ok || d.erro) throw new Error(d.erro || 'Erro ao fazer login.');

    SESSION = d;
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
  if (typeof switchView === 'function') switchView('view-home');
  // Esconde elementos de usuário
  ['sync-area','header-user','sidebar-user','nav-user-info'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function _abrirApp() {
  // Atualiza UI com dados do usuário
  var ids = {
    'user-nome':             SESSION.nome,
    'user-empresa':          SESSION.empresa_nome,
    'sidebar-user-nome':     SESSION.nome,
    'sidebar-user-empresa':  SESSION.empresa_nome
  };
  Object.keys(ids).forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.textContent = ids[id];
  });

  // Mostra elementos
  ['sync-area','header-user','sidebar-user'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  });

  if (typeof switchView === 'function') switchView('view-app');

  // Carrega dados automaticamente
  carregarDadosDoSupabase();
}

// ── SINCRONIZAR API ───────────────────────────────────────────────────────────
async function sincronizarAPI() {
  if (!SESSION || !SESSION.empresa_id) {
    alert('Nenhuma empresa vinculada à sua conta.');
    return;
  }
  var btn = document.getElementById('btn-sync');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spin">⟳</span> Sincronizando...'; }
  _setStatus('⏳ Conectando à API...', '');

  try {
    // Busca última data sincronizada
    var logR = await fetch('/api/sync-log?empresa_id=' + SESSION.empresa_id, {
      headers: { 'Authorization': 'Bearer ' + SESSION.token }
    });
    var logD = await logR.json();
    var ultima = logD.ultima_data
      ? new Date(logD.ultima_data).toLocaleDateString('pt-BR')
      : 'nunca';
    _setStatus('⏳ Último sync: ' + ultima + ' — buscando novos dados...', '');

    // Chama sync via Vercel Function
    var r = await fetch('/api/sync', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ empresa_id: SESSION.empresa_id })
    });
    var d = await r.json();
    if (!r.ok || d.erro) throw new Error(d.erro || 'Erro na sincronização.');

    _setStatus('✓ ' + (d.mensagem || d.novos + ' registros importados'), 'ok');
    if (d.novos > 0) await carregarDadosDoSupabase();

  } catch(e) {
    _setStatus('✗ ' + e.message, 'erro');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg> Sincronizar';
    }
  }
}

// ── CARREGA DADOS → BD_DATA → RELATÓRIOS ─────────────────────────────────────
async function carregarDadosDoSupabase() {
  if (!SESSION || !SESSION.empresa_id) return;
  _setStatus('⏳ Carregando dados...', '');

  try {
    // Chama via Vercel Function
    var r = await fetch('/api/dados?empresa_id=' + SESSION.empresa_id, {
      headers: { 'Authorization': 'Bearer ' + SESSION.token }
    });
    var d = await r.json();
    if (!r.ok || d.erro) throw new Error(d.erro);

    var vendas = d.vendas || [];
    if (!vendas.length) {
      _setStatus('⚠ Nenhuma venda no banco. Clique em Sincronizar.', '');
      return;
    }

    // Converte para array de arrays (formato BD_DATA)
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
  el.className = 'cui-sync-status' + (tipo ? ' sync-' + tipo : '');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var modal = document.getElementById('login-modal');
    if (modal && modal.style.display !== 'none') fazerLogin();
  }
});