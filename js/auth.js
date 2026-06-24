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
  // Cliente → interface limpa só com relatórios
  if (SESSION.papel === 'cliente') {
    _abrirCliente();
    return;
  }

  // Super admin → interface completa
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

// ── INTERFACE CLIENTE ─────────────────────────────────────────────────────────
function _abrirCliente() {
  // Esconde tudo e mostra view-cliente
  ['view-home','view-tools','view-app','cui-sidebar','cui-wrapper'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var vc = document.getElementById('view-cliente');
  if (vc) vc.style.display = 'flex';

  // Preenche nome da empresa
  var badge = document.getElementById('cli-empresa-nome');
  if (badge) badge.textContent = SESSION.empresa_nome || 'Empresa';

  // Carrega dados automaticamente
  _clienteCarregarDados();
}

function clienteAba(id) {
  document.querySelectorAll('.cli-tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.cli-rel-pane').forEach(function(p){ p.style.display='none'; p.classList.remove('active'); });
  var pane = document.getElementById(id);
  if (pane) { pane.style.display='block'; pane.classList.add('active'); }
  // Ativa aba clicada
  event.target.classList.add('active');
}

async function clienteSincronizar() {
  var btn = document.getElementById('cli-btn-sync');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="auth-spin">⟳</span> Atualizando...'; }
  _clienteStatus('⏳ Sincronizando com a API...', '');
  try {
    var r = await fetch('https://glfzevdsmmdvrwhplzkc.supabase.co/functions/v1/sync-visual-saef', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZnpldmRzbW1kdnJ3aHBsemtjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTUzNTg3MywiZXhwIjoyMDk3MTExODczfQ.SA-rCZ9A6qXkY1lfYW65OjpTVUGSOLFXTb50s9R9nN0'},
      body:JSON.stringify({empresa_id:SESSION.empresa_id})
    });
    var d = await r.json();
    if (d.erro) throw new Error(d.erro);
    _clienteStatus('✓ ' + (d.mensagem||'Dados atualizados'), 'sync-ok');
    if ((d.novos||0)>0) await _clienteCarregarDados();
  } catch(e) {
    _clienteStatus('✗ '+e.message, 'sync-erro');
  } finally {
    if (btn) { btn.disabled=false; btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="13" height="13"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg> Atualizar dados'; }
  }
}

async function _clienteCarregarDados() {
  if (!SESSION || !SESSION.empresa_id) return;
  _clienteStatus('⏳ Carregando relatórios...', '');
  try {
    var r = await fetch(
      'https://glfzevdsmmdvrwhplzkc.supabase.co/rest/v1/vendas?empresa_id=eq.'+SESSION.empresa_id+'&select=*&order=dt_saida.asc&limit=50000',
      { headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZnpldmRzbW1kdnJ3aHBsemtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzU4NzMsImV4cCI6MjA5NzExMTg3M30.GEcGhBdW9whsdikO181Uvv2rpzXfvyntTHzPKots4bE', 'Authorization': 'Bearer '+SVC_KEY } }
    );
    var vendas = await r.json();
    if (!Array.isArray(vendas)||!vendas.length) {
      _clienteStatus('⚠ Sem dados. Clique Atualizar dados.','');
      document.getElementById('cli-sem-dados').style.display='flex';
      return;
    }
    document.getElementById('cli-sem-dados').style.display='none';

    // Alimenta BD_DATA e gera relatórios
    var rows = vendas.map(function(v){return[
      v.id_externo||'',v.num_pedido||'',v.produto||'',String(v.qtd||''),
      v.dt_emissao||'',v.dt_saida||'',String(v.valor||''),
      v.vendedor||'',v.industria||'',v.cliente||'',
      v.ano?String(v.ano):'',v.mes||'',v.grupo||'',v.semana||'',
      v.tipo_mercado||'',v.setor||'',v.cidade||'',v.uf||'',
      v.tipo_vendedor||'','','','','',
      v.empresa_nome||'',v.cnpj||'',v.grupo_produto||'',v.grupo_pai||'',
      v.subgrupo||'',v.marca||'',v.familia||'',v.classes||''
    ];});

    BD_DATA.headers=['ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída',
      'VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM',
      'tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra',
      'NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto','GRUPO PAI',
      'subgrupo_produto','marca','familia_produto','classes'];
    BD_DATA.rows=rows; BD_DATA.count=rows.length;
    if(typeof FULL_DATA!=='undefined') FULL_DATA.bd=rows;

    try{bdMapColumns();}catch(e){}
    try{bdAutoFill();}catch(e){}

    // Renderiza relatórios na interface cliente
    _clienteRenderizarRelatorios();

    _clienteStatus('✓ '+rows.length.toLocaleString('pt-BR')+' registros', 'sync-ok');
  } catch(e) {
    _clienteStatus('✗ '+e.message,'sync-erro');
  }
}

function _clienteRenderizarRelatorios() {
  // Gera relatórios e copia para divs do cliente
  try { if(typeof bdUpdateVendaProduto==='function') bdUpdateVendaProduto(); } catch(e){}
  try { if(typeof bdUpdateLaudoGrupo==='function')   bdUpdateLaudoGrupo(); }   catch(e){}
  try { if(typeof bdUpdateLaudoMarca==='function')   bdUpdateLaudoMarca(); }   catch(e){}
  try { if(typeof repUpdateAll==='function')         repUpdateAll(); }         catch(e){}

  // Copia conteúdo gerado para os containers do cliente
  function clonar(srcId, dstId) {
    var src = document.getElementById(srcId);
    var dst = document.getElementById(dstId);
    if (src && dst) { dst.innerHTML = src.innerHTML; }
  }
  setTimeout(function(){
    clonar('av-rel-venda-produto',   'cli-venda-produto-content');
    clonar('av-rel-laudo-grupo',     'cli-laudo-grupo-content');
    clonar('av-rel-laudo-marca',     'cli-laudo-marca-content');
    clonar('av-rep-content',         'cli-representantes-content');
  }, 500);
}

function _clienteStatus(msg, cls) {
  var el = document.getElementById('cli-sync-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'cli-sync-status' + (cls ? ' '+cls : '');
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