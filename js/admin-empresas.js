// =============================================================================
// ADMIN_EMPRESAS.JS — Painel multi-empresa para super_admin
// =============================================================================

var EMPRESA_ATIVA = null; // { empresa_id, nome, slug, tem_api }
var EMPRESAS_LISTA = [];  // lista de todas as empresas

var EMPRESA_IDS = {
  varremaster: 'af3b599b-65c5-4868-b8bf-a5934da84f0d'
};

// ── INICIALIZA PAINEL ADMIN ────────────────────────────────────────────────────
async function adminInicializar() {
  try {
    // Busca empresas
    var eR = await fetch(SUPA_URL + '/rest/v1/empresas?select=*&ativo=eq.true&order=nome.asc', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    });
    var empresas = await eR.json();

    // Busca quais têm API configurada
    var aR = await fetch(SUPA_URL + '/rest/v1/api_config?select=empresa_id,sistema,api_url&ativo=eq.true', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    });
    var apis = await aR.json();

    EMPRESAS_LISTA = (empresas || []).map(function(e) {
      var api = (apis || []).find(function(a){ return a.empresa_id === e.id && a.api_url; });
      var origem = String(e.exibir_origem || 'manual').toLowerCase();
      return Object.assign({}, e, {
        empresa_id: e.id || e.empresa_id,
        nome:       e.nome,
        slug:       e.slug,
        tem_api:    !!api && origem === 'api',
        sistema:    api ? api.sistema : null
      });
    });

    // Renderiza abas
    _adminRenderizarAbas();

    // Seleciona primeira empresa automaticamente
    if (EMPRESAS_LISTA.length > 0) {
      adminSelecionarEmpresa(EMPRESAS_LISTA[0].empresa_id);
    }

  } catch(e) {
    console.error('Erro ao carregar empresas:', e);
    // Fallback com empresas hardcoded
    EMPRESAS_LISTA = [
      { empresa_id: 'af3b599b-65c5-4868-b8bf-a5934da84f0d', nome: 'Varremaster', slug: 'varremaster', tem_api: true, sistema: 'visual_saef' }
    ];
    _adminRenderizarAbas();
    adminSelecionarEmpresa(EMPRESAS_LISTA[0].empresa_id);
  }
}

function _adminRenderizarAbas() {
  var container = document.getElementById('admin-empresa-tabs');
  if (!container) return;

  container.innerHTML = EMPRESAS_LISTA.map(function(e) {
    var tag = e.tem_api
      ? '<span class="emp-tag tag-api">API</span>'
      : '<span class="emp-tag tag-manual">Manual</span>';
    return '<button class="admin-emp-tab" data-id="' + e.empresa_id + '" onclick="adminSelecionarEmpresa(\'' + e.empresa_id + '\')">'
         + e.nome + tag + '</button>';
  }).join('');
}

// ── SELECIONA EMPRESA ─────────────────────────────────────────────────────────
async function adminSelecionarEmpresa(empresa_id) {
  EMPRESA_ATIVA = EMPRESAS_LISTA.find(function(e){ return e.empresa_id === empresa_id; });
  if (!EMPRESA_ATIVA) return;

  // Atualiza abas visuais
  document.querySelectorAll('.admin-emp-tab').forEach(function(btn){
    btn.classList.toggle('active', btn.dataset.id === empresa_id);
  });

  // Mostra action bar
  var bar = document.getElementById('admin-action-bar');
  if (bar) bar.style.display = 'flex';

  // Nome da empresa ativa
  var nomeEl = document.getElementById('admin-emp-nome');
  if (nomeEl) nomeEl.textContent = EMPRESA_ATIVA.nome;

  // Botão Sincronizar: só para empresas com API
  var btnSync = document.getElementById('admin-btn-sync');
  if (btnSync) btnSync.style.display = EMPRESA_ATIVA.tem_api ? 'inline-flex' : 'none';

  // Status do sync
  _adminCarregarSyncLog();

  // Limpa a grade atual
  if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
    GRIDS.bd.allData  = [];
    GRIDS.bd.filtered = null;
    GRIDS.bd.page     = 0;
  }
  if (typeof FULL_DATA !== 'undefined') FULL_DATA.bd = [];
  if (typeof BD_DATA !== 'undefined') { BD_DATA.rows = []; BD_DATA.count = 0; }

  // Carrega dados do Supabase para esta empresa
  adminCarregarDadosEmpresa(empresa_id);
}

async function _adminCarregarSyncLog() {
  if (!EMPRESA_ATIVA) return;
  try {
    var r = await fetch(
      SUPA_URL + '/rest/v1/sync_log?empresa_id=eq.' + EMPRESA_ATIVA.empresa_id
        + '&select=ultima_data,ultima_sync,total_registros,status'
        + '&order=ultima_sync.desc.nullslast&limit=1',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    var d = await r.json();
    var el = document.getElementById('admin-sync-status');
    if (!el) return;
    var log = d && d[0];
    if (log && (log.ultima_sync || log.ultima_data)) {
      var ref = log.ultima_sync || log.ultima_data;
      var refDate = new Date(ref);
      var dt  = refDate.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      var tot = (log.total_registros || 0).toLocaleString('pt-BR');
      var diasAtras = Math.floor((Date.now() - refDate.getTime()) / 86400000);
      var stale = diasAtras > 7;
      el.textContent = 'Último sync: ' + dt + ' — ' + tot + ' registros' + (stale ? ' ⚠ (' + diasAtras + ' dias atrás)' : '');
      el.className = 'admin-sync-status ' + (stale ? 'stale' : 'ok');
    } else {
      el.textContent = 'Nunca sincronizado';
      el.className = 'admin-sync-status';
    }
  } catch(e) { console.error(e); }
}

// ── CARREGA DADOS DO BANCO PARA A EMPRESA ATIVA ───────────────────────────────
async function adminCarregarDadosEmpresa(empresa_id) {
  _adminStatus('⏳ Carregando dados da ' + (EMPRESA_ATIVA ? EMPRESA_ATIVA.nome : '') + '...');
  try {
    var r = await fetch(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + empresa_id + '&select=*&order=dt_saida.asc&limit=100000',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    var vendas = await r.json();

    if (!Array.isArray(vendas) || !vendas.length) {
      _adminStatus('Sem dados no banco. Cole na grade ou clique Sincronizar.');
      if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
        GRIDS.bd.allData = []; GRIDS.bd.filtered = null;
        GRIDS.bd.page = 0; GRIDS.bd._render();
      }
      return;
    }

    var rows = vendas.map(function(v){ return [
      v.id_externo||'', v.num_pedido||'', v.produto||'', String(v.qtd||''),
      v.dt_emissao||'', v.dt_saida||'', String(v.valor||''),
      v.vendedor||'', v.industria||'', v.cliente||'',
      v.ano?String(v.ano):'', v.mes||'', v.grupo||'', v.semana||'',
      v.tipo_mercado||'', v.setor||'', v.cidade||'', v.uf||'',
      v.tipo_vendedor||'','','','','',
      v.empresa_nome||'', v.cnpj||'', v.grupo_produto||'', v.grupo_pai||'',
      v.subgrupo||'', v.marca||'', v.familia||'', v.classes||''
    ]; });

    BD_DATA.headers = ['ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída',
      'VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM',
      'tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra',
      'NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto','GRUPO PAI',
      'subgrupo_produto','marca','familia_produto','classes'];
    BD_DATA.rows  = rows;
    BD_DATA.count = rows.length;
    if (typeof FULL_DATA !== 'undefined') FULL_DATA.bd = rows;

    if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
      GRIDS.bd.allData  = rows;
      GRIDS.bd.filtered = null;
      GRIDS.bd.page     = 0;
      GRIDS.bd._render();
    }

    _adminStatus('✓ ' + rows.length.toLocaleString('pt-BR') + ' registros da ' + EMPRESA_ATIVA.nome, true);

  } catch(e) {
    console.error(e);
    _adminStatus('✗ ' + e.message);
  }
}

// ── SINCRONIZAR API (só Varremaster por enquanto) ─────────────────────────────
async function adminSincronizar() {
  if (!EMPRESA_ATIVA || !EMPRESA_ATIVA.tem_api) return;
  var btn = document.getElementById('admin-btn-sync');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spin">⟳</span> Sincronizando...'; }
  _adminStatus('⏳ Conectando à API da ' + EMPRESA_ATIVA.nome + '...');

  try {
    var r = await fetch(SUPA_URL + '/functions/v1/sync-visual-saef', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SVC_KEY },
      body: JSON.stringify({ empresa_id: EMPRESA_ATIVA.empresa_id })
    });
    var d = await r.json();
    if (!r.ok || d.erro) throw new Error(d.erro || 'Erro na sincronização.');

    _adminStatus('✓ ' + (d.mensagem || d.novos + ' registros importados'), true);

    // Grava sync_log (a edge function pode não gravar; garantimos aqui)
    try {
      var agora = new Date();
      var hoje  = agora.toISOString().split('T')[0];
      var total = d.novos || d.total_registros || 0;
      await fetch(SUPA_URL + '/rest/v1/sync_log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ empresa_id: EMPRESA_ATIVA.empresa_id, ultima_sync: agora.toISOString(), ultima_data: hoje, total_registros: total, status: 'ok', mensagem: d.mensagem || (total + ' registros importados via edge function.') })
      });
    } catch(_) {}

    // Recarrega dados e gera relatórios
    if ((d.novos || 0) > 0) {
      await adminCarregarDadosEmpresa(EMPRESA_ATIVA.empresa_id);
      adminProcessar();
    }
    _adminCarregarSyncLog();

  } catch(e) {
    _adminStatus('✗ ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="13" height="13"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg> Sincronizar API';
    }
  }
}

// ── PROCESSAR ─────────────────────────────────────────────────────────────────
function adminProcessar() {
  if (!EMPRESA_ATIVA) { alert('Selecione uma empresa primeiro.'); return; }

  var rows = (typeof FULL_DATA !== 'undefined' && FULL_DATA.bd && FULL_DATA.bd.length)
    ? FULL_DATA.bd
    : (typeof GRIDS !== 'undefined' && GRIDS.bd ? GRIDS.bd.getData() : []);
  rows = rows.filter(function(r){ return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; }); });

  if (!rows.length) { alert('Sem dados para processar. Cole dados na grade ou sincronize.'); return; }

  _adminStatus('⏳ Processando ' + rows.length.toLocaleString('pt-BR') + ' linhas...');

  BD_DATA.rows  = rows;
  BD_DATA.count = rows.length;

  setTimeout(function(){
    try { bdMapColumns(); }    catch(e){ console.error(e); }
    try { bdAutoFill(); }      catch(e){ console.error(e); }
    try { bdUpdateAllTabs(); } catch(e){ console.error(e); }

    if (typeof GRIDS !== 'undefined' && GRIDS.bd) {
      GRIDS.bd.allData = BD_DATA.rows; GRIDS.bd.filtered = null;
      GRIDS.bd.page = 0; GRIDS.bd._render();
    }
    _adminStatus('✓ ' + rows.length.toLocaleString('pt-BR') + ' linhas processadas — relatórios gerados!', true);
  }, 10);
}

// ── SALVAR NO BANCO ───────────────────────────────────────────────────────────
async function adminSalvarBanco() {
  if (!EMPRESA_ATIVA) { alert('Selecione uma empresa primeiro.'); return; }

  var rows = (typeof FULL_DATA !== 'undefined' && FULL_DATA.bd && FULL_DATA.bd.length)
    ? FULL_DATA.bd
    : (typeof GRIDS !== 'undefined' && GRIDS.bd ? GRIDS.bd.getData() : []);
  rows = rows.filter(function(r){ return r && r.some(function(c){ return c!==''&&c!==null&&c!==undefined; }); });

  if (!rows.length) { alert('Sem dados para salvar.'); return; }

  if (!confirm('Salvar ' + rows.length.toLocaleString('pt-BR') + ' linhas para ' + EMPRESA_ATIVA.nome + ' no Supabase?')) return;

  _adminStatus('⏳ Salvando...');

  var empresa_id = EMPRESA_ATIVA.empresa_id;
  var registros  = rows.map(function(r, i){
    return {
      empresa_id: empresa_id,
      id_externo: 'manual_' + empresa_id.slice(0,8) + '_' + Date.now() + '_' + i,
      num_pedido: r[1]||null, produto:  r[2]||null, qtd: parseFloat(r[3])||null,
      dt_emissao: r[4]||null, dt_saida: r[5]||null,
      valor:      parseFloat(String(r[6]||'0').replace(',','.'))||null,
      vendedor:   r[7]||null, industria: r[8]||null, cliente: r[9]||null,
      ano: parseInt(r[10])||null, mes: r[11]||null, grupo: r[12]||null,
      cidade: r[16]||null, uf: r[17]||null,
      empresa_nome: EMPRESA_ATIVA.nome, cnpj: r[24]||null, marca: r[28]||null
    };
  });

  try {
    // Deleta registros manuais antigos desta empresa antes de reinserir
    await fetch(SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + empresa_id + '&id_externo=like.manual_*', {
      method: 'DELETE',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    });

    // Insere em lotes de 500
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
        throw new Error(err.slice(0,200));
      }
      _adminStatus('⏳ ' + Math.min(i+lote, registros.length) + '/' + registros.length + ' salvos...');
    }

    _adminStatus('✓ ' + registros.length.toLocaleString('pt-BR') + ' linhas salvas para ' + EMPRESA_ATIVA.nome + '!', true);
    _adminCarregarSyncLog();

  } catch(e) {
    console.error(e);
    _adminStatus('✗ Erro ao salvar: ' + e.message);
    alert('Erro ao salvar: ' + e.message);
  }
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function _adminStatus(msg, ok) {
  var el = document.getElementById('admin-sync-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'admin-sync-status' + (ok ? ' ok' : (msg.startsWith('✗') ? ' erro' : ''));
}
