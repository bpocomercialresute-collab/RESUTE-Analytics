// =============================================================================
// AUTH.JS — Login, sessão, sync API e salvar dados manuais
// =============================================================================

const SUPA_URL = 'https://glfzevdsmmdvrwhplzkc.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZnpldmRzbW1kdnJ3aHBsemtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzU4NzMsImV4cCI6MjA5NzExMTg3M30.GEcGhBdW9whsdikO181Uvv2rpzXfvyntTHzPKots4bE';
const SVC_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZnpldmRzbW1kdnJ3aHBsemtjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTUzNTg3MywiZXhwIjoyMDk3MTExODczfQ.SA-rCZ9A6qXkY1lfYW65OjpTVUGSOLFXTb50s9R9nN0';

var SESSION  = null;
var EMPRESAS = [];

// F5 / recarregar = sempre volta para o login
// Usa sessionStorage (some ao fechar/recarregar) em vez de localStorage
(function() {
  // Limpa qualquer sessão de página anterior
  sessionStorage.removeItem('resute_session');
  // Também limpa localStorage antigo se existir
  sessionStorage.removeItem('resute_session');
})();

function abrirAnaliseVendas() {
  var saved = sessionStorage.getItem('resute_session');
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
    var r = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ email: email, password: senha })
    });
    var d = await r.json();
    if (!r.ok || !d.access_token) throw new Error(d.error_description || 'Email ou senha incorretos.');

    var uR = await fetch(
      SUPA_URL + '/rest/v1/usuarios?email=eq.' + encodeURIComponent(email) + '&select=*',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + d.access_token } }
    );
    var users = await uR.json();
    var u = (users && users.length) ? users[0] : { nome: email, papel: 'cliente', empresa_id: null };

    SESSION = {
      token:        d.access_token,
      nome:         u.nome || email,
      email:        email,
      papel:        u.papel || 'cliente',
      empresa_id:   u.empresa_id || null,
      empresa_nome: 'RESUTE'
    };
    sessionStorage.setItem('resute_session', JSON.stringify(SESSION));
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


// ── CLIENTE — usa a mesma view-app mas sem acesso a BD/edição ─────────────────
function _abrirDashCliente() {
  // Atualiza nome no header
  var campos = {
    'user-nome': SESSION.nome,
    'user-empresa': SESSION.empresa_nome,
    'sidebar-user-nome': SESSION.nome,
    'sidebar-user-empresa': SESSION.empresa_nome
  };
  Object.keys(campos).forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.textContent = campos[id];
  });

  // Mostra sync e user
  ['sync-area','header-user','sidebar-user'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  });

  // Vai para view-app
  if (typeof switchView === 'function') switchView('view-app');

  // ── Esconde tudo que cliente não pode ver ──────────────────────────────────

  // Esconde o item "BD & Cadastros" na sidebar
  document.querySelectorAll('.cui-nav-item').forEach(function(item){
    if (item.textContent.indexOf('BD') >= 0 || item.textContent.indexOf('Cadastro') >= 0) {
      item.style.display = 'none';
    }
  });

  // Esconde botões: BD & Cadastros, Processar, Salvar no Banco, Limpar
  var seletores = [
    '[onclick="avShowBD()"]',
    '[onclick="jssProcess()"]',
    '[onclick*="salvarDados"]',
    '[onclick*="jssClearGrid"]',
    '[onclick*="bdgAtualizar"]'
  ];
  seletores.forEach(function(sel){
    document.querySelectorAll(sel).forEach(function(el){ el.style.display='none'; });
  });

  // Esconde a área BD se acessada
  var bdArea = document.getElementById('av-bd-area');
  if (bdArea) bdArea.style.display = 'none';

  // ── Abre direto nos relatórios ──────────────────────────────────────────────
  // Vai direto para RELAT PRODUTOS
  setTimeout(function(){
    if (typeof avShowRel === 'function') avShowRel('relat-produtos');
  }, 100);

  // ── Carrega dados do banco e gera relatórios ────────────────────────────────
  carregarDadosDoSupabase(SESSION.empresa_id);
}


function fazerLogout() {
  SESSION = null; EMPRESAS = [];
  sessionStorage.removeItem('resute_session');
  if (typeof switchView === 'function') switchView('view-home');
  ['sync-area','header-user','sidebar-user'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function _abrirApp() {
  // Cliente ou admin → mesma interface, mas com permissões diferentes
  if (SESSION.papel === 'cliente') {
    _abrirDashCliente();
    return;
  }

  // Super admin → interface completa com abas por empresa
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
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + empresa_id + '&select=*&order=dt_saida.asc&limit=50000',
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
    if (modal && modal.style.display !== 'none') fazerLogin();
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
  // Esconde layout admin
  ['cui-sidebar','cui-wrapper'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  var vc = document.getElementById('view-dash-cliente');
  if (vc) vc.style.display = 'flex';

  var emp = document.getElementById('dc-empresa');
  if (emp) emp.textContent = SESSION.empresa_nome || 'Cliente';

  // Carrega dados
  dcCarregarDados();
}

// ── CARREGA DADOS DO SUPABASE ─────────────────────────────────────────────────
async function dcCarregarDados() {
  dcStatus('⏳ Carregando dados...');
  try {
    var r = await fetch(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + SESSION.empresa_id +
      '&select=*&order=dt_saida.asc&limit=100000',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    var vendas = await r.json();
    if (!Array.isArray(vendas) || !vendas.length) {
      dcStatus('⚠ Nenhum dado disponível ainda.');
      return;
    }

    DC_RAW = vendas;

    // Preenche filtro de anos
    var anos = [...new Set(vendas.map(function(v){ return v.ano; }).filter(Boolean))].sort();
    var selAno = document.getElementById('dc-filtro-ano');
    if (selAno) {
      selAno.innerHTML = '<option value="0">Todos os anos</option>';
      anos.forEach(function(a){ selAno.innerHTML += '<option value="'+a+'">'+a+'</option>'; });
      // Seleciona o ano mais recente
      if (anos.length) selAno.value = anos[anos.length-1];
    }

    dcAplicarFiltro();
    dcStatus('✓ ' + vendas.length.toLocaleString('pt-BR') + ' registros carregados', true);

  } catch(e) {
    dcStatus('✗ ' + e.message);
    console.error(e);
  }
}

// ── FILTRO DE PERÍODO ─────────────────────────────────────────────────────────
function dcAplicarFiltro() {
  var ano = parseInt(document.getElementById('dc-filtro-ano').value) || 0;
  var mes = parseInt(document.getElementById('dc-filtro-mes').value) || 0;

  DC_DATA = DC_RAW.filter(function(v){
    if (ano && v.ano != ano) return false;
    if (mes && v.mes != mes && parseInt(v.mes) != mes) return false;
    return true;
  });

  dcRenderizar();
}

// ── RENDERIZA TUDO ────────────────────────────────────────────────────────────
function dcRenderizar() {
  var rows = DC_DATA;
  if (!rows.length) { dcStatus('⚠ Nenhum dado no período selecionado.'); return; }

  var fatTotal   = rows.reduce(function(s,r){ return s + (parseFloat(r.valor)||0); }, 0);
  var nPedidos   = rows.length;
  var ticket     = nPedidos ? fatTotal / nPedidos : 0;
  var clientes   = new Set(rows.map(function(r){ return r.cliente; }).filter(Boolean)).size;
  var produtos   = new Set(rows.map(function(r){ return r.produto; }).filter(Boolean)).size;
  var reps       = new Set(rows.map(function(r){ return r.vendedor; }).filter(Boolean)).size;

  // KPIs
  function fmt(v){ return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function set(id,val){ var el=document.getElementById(id); if(el) el.textContent=val; }

  set('dc-faturamento', fmt(fatTotal));
  set('dc-pedidos',     nPedidos.toLocaleString('pt-BR'));
  set('dc-ticket',      fmt(ticket));
  set('dc-clientes',    clientes.toLocaleString('pt-BR'));
  set('dc-produtos',    produtos.toLocaleString('pt-BR'));
  set('dc-reps',        reps.toLocaleString('pt-BR'));

  // Gráficos e tabelas
  dcChartEvolucao(rows);
  dcChartTrimestre(rows);
  dcChartProdutos(rows);
  dcChartGrupos(rows);
  dcTabelaReps(rows, fatTotal);
  dcTabelaUFs(rows, fatTotal);
  dcTabelaClientes(rows, fatTotal);
  dcTabelaInativos(rows);
}

// ── EVOLUÇÃO MENSAL ───────────────────────────────────────────────────────────
function dcChartEvolucao(rows) {
  var por_mes = {};
  MESES.forEach(function(m,i){ por_mes[i+1] = 0; });
  rows.forEach(function(r){
    var m = parseInt(r.mes) || 0;
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
    var m = parseInt(r.mes)||0;
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
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? '#22c55e' : (msg.startsWith('✗') ? '#ef4444' : '#475569');
}