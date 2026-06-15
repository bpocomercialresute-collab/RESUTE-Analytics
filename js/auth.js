// =============================================================================
// AUTH.JS — Login, sessão e integração Supabase
// =============================================================================

const SUPA_URL = 'https://glfzevdsmmdvrwhplzkc.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZnpldmRzbW1kdnJ3aHBsemtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzU4NzMsImV4cCI6MjA5NzExMTg3M30.GEcGhBdW9whsdikO181Uvv2rpzXfvyntTHzPKots4bE';
const SYNC_URL = SUPA_URL + '/functions/v1/sync-visual-saef';

// Sessão em memória
var SESSION = null; // { usuario, empresa_id, empresa_nome, papel }

// ── INICIALIZA ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var saved = localStorage.getItem('resute_session');
  if (saved) {
    try { SESSION = JSON.parse(saved); } catch(e) { SESSION = null; }
  }
  if (SESSION) {
    mostrarApp();
  } else {
    mostrarLogin();
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
async function fazerLogin() {
  var email = document.getElementById('login-email').value.trim();
  var senha = document.getElementById('login-senha').value.trim();
  var erro  = document.getElementById('login-erro');
  var btn   = document.getElementById('login-btn');

  if (!email || !senha) { erro.textContent = 'Preencha email e senha.'; return; }

  btn.textContent = 'Entrando...'; btn.disabled = true; erro.textContent = '';

  try {
    // Autentica no Supabase Auth
    var resp = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ email: email, password: senha })
    });
    var data = await resp.json();
    if (!resp.ok || !data.access_token) throw new Error(data.error_description || 'Email ou senha incorretos.');

    var token = data.access_token;

    // Busca dados do usuário
    var uResp = await fetch(SUPA_URL + '/rest/v1/usuarios?email=eq.' + encodeURIComponent(email) + '&select=*,empresas(nome)', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token }
    });
    var usuarios = await uResp.json();
    if (!usuarios || !usuarios.length) throw new Error('Usuário não encontrado.');
    var u = usuarios[0];

    SESSION = {
      token:        token,
      usuario_id:   u.id,
      nome:         u.nome,
      email:        u.email,
      papel:        u.papel,
      empresa_id:   u.empresa_id,
      empresa_nome: u.empresas ? u.empresas.nome : 'RESUTE'
    };
    localStorage.setItem('resute_session', JSON.stringify(SESSION));
    mostrarApp();

  } catch(e) {
    erro.textContent = e.message || 'Erro ao fazer login.';
    btn.textContent = 'Entrar'; btn.disabled = false;
  }
}

function fazerLogout() {
  SESSION = null;
  localStorage.removeItem('resute_session');
  mostrarLogin();
}

function mostrarLogin() {
  document.getElementById('view-login').style.display = 'flex';
  document.getElementById('view-app').style.display   = 'none';
  document.getElementById('login-email').value = '';
  document.getElementById('login-senha').value = '';
  document.getElementById('login-erro').textContent = '';
}

function mostrarApp() {
  document.getElementById('view-login').style.display = 'none';
  document.getElementById('view-app').style.display   = 'block';
  // Atualiza nome e empresa no header
  var nomeEl    = document.getElementById('user-nome');
  var empresaEl = document.getElementById('user-empresa');
  if (nomeEl)    nomeEl.textContent    = SESSION ? SESSION.nome         : '';
  if (empresaEl) empresaEl.textContent = SESSION ? SESSION.empresa_nome : '';
  // Mostra/oculta botão sync
  var syncBtn = document.getElementById('btn-sync');
  if (syncBtn) syncBtn.style.display = 'flex';
}

// ── SYNC API → SUPABASE ───────────────────────────────────────────────────────
async function sincronizarDados() {
  if (!SESSION || !SESSION.empresa_id) {
    alert('Sem empresa vinculada à sua conta.');
    return;
  }
  var btn    = document.getElementById('btn-sync');
  var status = document.getElementById('sync-status');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="sync-spin">⟳</span> Sincronizando...'; }
  if (status) { status.textContent = '⏳ Conectando à API...'; status.className = 'sync-status'; }

  try {
    var resp = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_id: SESSION.empresa_id })
    });
    var data = await resp.json();

    if (!resp.ok || data.erro) throw new Error(data.erro || 'Erro no servidor.');

    if (status) {
      status.textContent = '✓ ' + (data.mensagem || data.novos + ' registros importados');
      status.className = 'sync-status sync-ok';
    }

    // Se vieram dados novos, carrega para o BD e processa relatórios
    if (data.novos > 0) {
      await carregarDadosDoSupabase();
    }

  } catch(e) {
    if (status) { status.textContent = '✗ ' + e.message; status.className = 'sync-status sync-erro'; }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg> Sincronizar API'; }
  }
}

// ── CARREGA DADOS DO SUPABASE → BD_DATA → RELATÓRIOS ─────────────────────────
async function carregarDadosDoSupabase() {
  if (!SESSION || !SESSION.empresa_id) return;
  var status = document.getElementById('sync-status');
  if (status) { status.textContent = '⏳ Carregando dados...'; status.className = 'sync-status'; }

  try {
    // Busca vendas no Supabase (máx 50k registros)
    var resp = await fetch(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + SESSION.empresa_id +
      '&select=*&order=dt_saida.asc&limit=50000',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SESSION.token } }
    );
    var vendas = await resp.json();
    if (!Array.isArray(vendas) || !vendas.length) {
      if (status) { status.textContent = '⚠ Nenhuma venda encontrada no banco.'; status.className = 'sync-status'; }
      return;
    }

    // Converte para o formato do BD_DATA (array de arrays, mesma ordem das colunas)
    var headers = ['ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída',
      'VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM',
      'tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra',
      'NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto','GRUPO PAI',
      'subgrupo_produto','marca','familia_produto','classes'];

    var rows = vendas.map(function(v) {
      return [
        v.id_externo || '', v.num_pedido || '', v.produto || '', String(v.qtd || ''),
        v.dt_emissao || '', v.dt_saida || '', String(v.valor || ''),
        v.vendedor || '', v.industria || '', v.cliente || '',
        v.ano ? String(v.ano) : '', v.mes || '', v.grupo || '', v.semana || '',
        v.tipo_mercado || '', v.setor || '', v.cidade || '', v.uf || '',
        v.tipo_vendedor || '', '', '', v.rota || '', v.desconto || '',
        v.empresa_nome || '', v.cnpj || '', v.grupo_produto || '', v.grupo_pai || '',
        v.subgrupo || '', v.marca || '', v.familia || '', v.classes || ''
      ];
    });

    // Alimenta BD_DATA direto
    BD_DATA.headers = headers;
    BD_DATA.rows    = rows;
    BD_DATA.count   = rows.length;
    FULL_DATA.bd    = rows;

    // Mapeia colunas e gera relatórios
    try { bdMapColumns(); } catch(e) { console.error(e); }
    try { bdAutoFill();   } catch(e) { console.error(e); }
    try { bdUpdateAllTabs(); } catch(e) { console.error(e); }

    if (status) {
      status.textContent = '✓ ' + rows.length.toLocaleString('pt-BR') + ' vendas carregadas — relatórios atualizados!';
      status.className = 'sync-status sync-ok';
    }

    // Atualiza a grade visual do BD
    if (GRIDS && GRIDS.bd) {
      GRIDS.bd.allData  = rows;
      GRIDS.bd.filtered = null;
      GRIDS.bd.page     = 0;
      GRIDS.bd._render();
    }

  } catch(e) {
    console.error('Erro ao carregar dados:', e);
    if (status) { status.textContent = '✗ Erro ao carregar: ' + e.message; status.className = 'sync-status sync-erro'; }
  }
}

// Enter no campo de senha faz login
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.getElementById('view-login').style.display !== 'none') {
    fazerLogin();
  }
});