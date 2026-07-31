// =============================================================================
// DRE — CAMADA DE ENCAIXE
// =============================================================================
// Este arquivo e a unica cola entre o sistema e a ferramenta do DRE.
//
// A ferramenta e composta por tres arquivos que NAO devem ser editados aqui:
//   views/dre-painel.html   — bloco do painel
//   css/dre-painel.css      — estilos
//   js/dre/dre-engine.js    — motor (expoe o objeto global DRE)
// Copias identicas ficam em docs/ferramenta/ como referencia da entrega.
//
// Tres problemas de encaixe sao resolvidos aqui, e so aqui:
//
//   1. IDs DUPLICADOS. A ferramenta usa os mesmos ids do painel financeiro
//      (fin-empresa, fin-status, fin-kpis, fin-alertas...). Os dois blocos no
//      DOM ao mesmo tempo fariam getElementById devolver o elemento errado
//      para um dos lados. Por isso o HTML do DRE e montado na abertura e
//      removido no fechamento — so um conjunto de ids existe por vez.
//
//   2. CSS VAZANDO. css/dre-painel.css redefine .dc-kpi-card, .dc-alert-card e
//      .dc-tabela sem prefixo, o que atingiria o dashboard comercial. O CSS e
//      injetado por _dreInjetarCSS(), que prefixa todo seletor com
//      #view-dash-dre via CSSOM. O arquivo em disco continua intacto.
//
//   3. ABAS COMPARTILHADAS. ligarAbas() da ferramenta usa
//      querySelectorAll('.fin-tab') e alcanca as abas do painel financeiro,
//      que ficam sem aba ativa. _dreRestaurarAbasFinanceiro() reverte isso na
//      desmontagem.
//
// FONTE DE DADOS — fin_dre_plano_contas e fin_dre_lancamentos no Supabase,
// sempre filtradas por empresa_id (docs/supabase-dre.sql). Sem dado fictício:
// empresa sem plano/lançamentos cadastrados abre o painel vazio, com os
// estados vazios que a própria ferramenta já desenha. A digitação (colar
// planilha, editar célula a célula, marcar F_V/D_I) acontece dentro das
// próprias abas Plano de Contas e BD do painel — a aba Lançamentos é só
// leitura (visualização filtrada por ano). Ver a grade (js/dre/dre-grid.js)
// ligada ao motor em js/dre/dre-engine.js e os botões "Salvar no banco"
// ligados aqui embaixo. O console admin (js/dre/dre-admin.js)
// mantém só o botão "Abrir DRE" e as configurações da empresa.
// =============================================================================

var DRE_MONTADO = false;
var DRE_ADMIN_PREVIEW = false;
var DRE_ADMIN_PREVIEW_COMPANY = null;

var DRE_HTML_URL = 'views/dre-painel.html?v=4';
var DRE_CSS_URL  = 'css/dre-painel.css?v=2';

// ── CSS ESCOPADO ─────────────────────────────────────────────────────────────

/**
 * Injeta css/dre-painel.css com todo seletor prefixado por #view-dash-dre.
 *
 * Usa CSSOM em vez de regex: o navegador ja separou seletor de declaracao e
 * entende @media, entao a reescrita nao depende de parsear texto CSS na mao.
 * Roda uma vez por sessao.
 */
async function _dreInjetarCSS() {
  if (document.getElementById('dre-estilo-escopado')) return;

  var css = await fetch(DRE_CSS_URL).then(function(r) {
    if (!r.ok) throw new Error('Falha ao carregar o estilo do DRE (HTTP ' + r.status + ').');
    return r.text();
  });

  var tag = document.createElement('style');
  tag.id = 'dre-estilo-escopado';
  tag.textContent = css;
  document.head.appendChild(tag);

  try {
    _dreEscoparRegras(tag.sheet.cssRules);
  } catch (e) {
    // Sem escopo o painel ainda funciona, mas o CSS vaza para outras telas.
    console.error('[DRE] Nao foi possivel escopar o CSS:', e);
  }
}

function _dreEscoparRegras(regras) {
  for (var i = 0; i < regras.length; i++) {
    var regra = regras[i];
    if (regra.cssRules) { _dreEscoparRegras(regra.cssRules); continue; }
    if (!regra.selectorText) continue;

    regra.selectorText = regra.selectorText
      .split(',')
      .map(function(sel) { return '#view-dash-dre ' + sel.trim(); })
      .join(', ');
  }
}

// ── CARGA DE DADOS ───────────────────────────────────────────────────────────

/**
 * Le fin_dre_plano_contas e fin_dre_lancamentos da empresa e entrega
 * { plano, lancamentos } no formato que o motor espera.
 *
 * Mesmo mecanismo do painel financeiro (js/financeiro/financeiro-core.js):
 * SUPA_URL/SVC_KEY aqui são placeholders — o fetch monkey-patched em
 * auth.js redireciona para /api/secure-proxy, que valida a sessão e exige
 * o filtro empresa_id=eq.<id> em qualquer tabela fin_*.
 */
async function _dreCarregarDados(empresaId) {
  if (!empresaId) return { plano: [], lancamentos: [] };

  var qs = '?empresa_id=eq.' + encodeURIComponent(empresaId) + '&select=*&limit=100000';

  var respostas = await Promise.all([
    fetch(SUPA_URL + '/rest/v1/fin_dre_plano_contas' + qs, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    }),
    fetch(SUPA_URL + '/rest/v1/fin_dre_lancamentos' + qs + '&order=dt_caixa.desc', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
    })
  ]);

  for (var i = 0; i < respostas.length; i++) {
    if (!respostas[i].ok) throw new Error(respostas[i].status === 403
      ? 'Acesso negado aos dados do DRE desta empresa.'
      : 'Falha ao carregar os dados do DRE (HTTP ' + respostas[i].status + ').');
  }

  var dados = await Promise.all(respostas.map(function(r) { return r.json(); }));
  var plano = Array.isArray(dados[0]) ? dados[0] : [];
  var lancamentos = Array.isArray(dados[1]) ? dados[1] : [];

  // O motor filtra lançamento por cnpj (estado.cnpj). Aqui a multiempresa já é
  // feita por empresa_id, então todo lançamento entra sob o mesmo cnpj fixo —
  // ver DRE.init() logo abaixo, que abre sempre com cnpj: 1.
  lancamentos = lancamentos.map(function(l) { return Object.assign({}, l, { cnpj: 1 }); });

  return { plano: plano, lancamentos: lancamentos };
}

/** Empresa da sessão atual, ou a do preview supervisionado do super_admin. */
function _dreResolverEmpresaId(empresaIdPreview) {
  if (empresaIdPreview) return empresaIdPreview;
  if (typeof SESSION === 'undefined' || !SESSION) return null;
  return (SESSION.empresa_ids && SESSION.empresa_ids[0]) || SESSION.empresa_id || null;
}

// ── ABERTURA ─────────────────────────────────────────────────────────────────

/**
 * Abre o painel DRE.
 * @param {object} [opts] { empresaIdPreview } — preview supervisionado do super_admin
 */
async function dreAbrir(opts) {
  opts = opts || {};
  if (typeof _touchSession === 'function') _touchSession();

  var empresaIdPreview = opts.empresaIdPreview || null;
  DRE_ADMIN_PREVIEW = !!(typeof SESSION !== 'undefined' && SESSION
    && SESSION.papel === 'super_admin' && empresaIdPreview);

  DRE_ADMIN_PREVIEW_COMPANY = DRE_ADMIN_PREVIEW
    ? (typeof ADMIN_PREVIEW_COMPANIES !== 'undefined' ? (ADMIN_PREVIEW_COMPANIES || []) : [])
        .find(function(item) { return item.empresa_id === empresaIdPreview; }) || null
    : null;

  document.body.classList.remove('bpo-admin-mode');

  // Esconde login, layout admin e os outros paineis de cliente
  var login = document.getElementById('view-login-page');
  if (login) login.style.display = 'none';
  ['sidebar', 'cui-wrapper', 'view-dash-cliente', 'view-dash-financeiro'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.classList.remove('active');

  var view = document.getElementById('view-dash-dre');
  if (!view) { console.error('[DRE] Container #view-dash-dre nao existe no HTML.'); return; }
  view.style.display = 'block';

  try {
    await _dreInjetarCSS();
    await _dreMontarHTML(view);

    var eid = _dreResolverEmpresaId(empresaIdPreview);
    if (!eid) {
      var status = document.getElementById('fin-status');
      if (status) status.textContent = '⚠ Empresa não configurada.';
    }

    var dados = await _dreCarregarDados(eid);

    DRE.init({
      plano:       dados.plano,
      lancamentos: dados.lancamentos,
      empresa:     _dreNomeEmpresa(),
      cnpj:        1,
      ano:         null
    });

    _dreAplicarHeader();
    _dreLigarSalvarGrades(eid);
    _dreIniciarGradesLiteGrid(dados.plano, dados.lancamentos);

  } catch (e) {
    console.error('[DRE] Erro ao abrir:', e);
    view.innerHTML = '<div style="padding:40px;text-align:center;font-family:system-ui;color:#b30000">'
      + 'Nao foi possivel carregar o painel DRE.<br><small>' + (e && e.message ? e.message : '') + '</small>'
      + '</div>';
  }
}

/** Busca o bloco da ferramenta e o injeta no container. */
async function _dreMontarHTML(view) {
  if (DRE_MONTADO && view.querySelector('.fin-wrap')) return;

  var html = await fetch(DRE_HTML_URL).then(function(r) {
    if (!r.ok) throw new Error('Falha ao carregar o painel do DRE (HTTP ' + r.status + ').');
    return r.text();
  });

  view.innerHTML = html;
  DRE_MONTADO = true;
}

function _dreNomeEmpresa() {
  var preview = DRE_ADMIN_PREVIEW_COMPANY;
  return (preview && preview.nome)
    || ((typeof SESSION !== 'undefined' && SESSION) ? SESSION.empresa_nome : '')
    || 'Empresa';
}

/**
 * Ajustes de header que so o sistema conhece: selo de preview, botao de voltar
 * e o seletor de modulos. Roda depois do DRE.init, que escreve em #fin-empresa.
 */
function _dreAplicarHeader() {
  // O botao aparece para todo super_admin, nao so no preview: quando ele abre o
  // DRE pelo menu do console, e a unica saida da tela — o painel ocupa o viewport
  // inteiro e esconde a sidebar.
  var ehSuperAdmin = !!(typeof SESSION !== 'undefined' && SESSION
    && SESSION.papel === 'super_admin');

  var voltar = document.getElementById('fin-admin-back');
  if (voltar) {
    voltar.style.display = ehSuperAdmin ? 'inline-flex' : 'none';
    voltar.onclick = dreVoltarAoAdmin;
  }

  var selo = document.getElementById('fin-admin-preview-badge');
  if (selo) selo.classList.toggle('visivel', DRE_ADMIN_PREVIEW);

  if (typeof renderizarSeletorModulos === 'function') renderizarSeletorModulos();
}

// ── SALVAR NO BANCO (botões das abas Plano de Contas e BD) ───────────────────
//
// Mesmo fetch DELETE+POST em lote que antes vivia em js/dre/dre-admin.js
// (_dreGradeSalvarTabela) — só mudou de lugar. Grava em fin_dre_plano_contas
// e fin_dre_lancamentos, sempre restrito a empresa_id=eq.<id>.

var DRE_SALVAR_LOTE = 500;

async function _dreSalvarTabela(tabela, empresaId, registros) {
  var remocao = await fetch(
    SUPA_URL + '/rest/v1/' + tabela + '?empresa_id=eq.' + encodeURIComponent(empresaId),
    { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
  );
  if (!remocao.ok) throw new Error('Falha ao limpar antes de salvar (HTTP ' + remocao.status + ').');
  if (!registros.length) return 0;

  var enviados = 0;
  for (var i = 0; i < registros.length; i += DRE_SALVAR_LOTE) {
    var lote = registros.slice(i, i + DRE_SALVAR_LOTE);
    var resposta = await fetch(SUPA_URL + '/rest/v1/' + tabela, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'
      },
      body: JSON.stringify(lote)
    });
    if (!resposta.ok) throw new Error('Falha ao gravar o lote ' + (i / DRE_SALVAR_LOTE + 1) + ' (HTTP ' + resposta.status + ').');
    enviados += lote.length;
  }
  return enviados;
}

function _dreStatusGrade(elId, msg, tipo) {
  var el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'fin-status' + (tipo ? ' ' + tipo : '');
}

/** Liga os botões "Salvar no banco" das abas Plano de Contas e BD ao fetch acima. */
function _dreLigarSalvarGrades(empresaId) {
  var btnPlano = document.getElementById('fin-dre-salvar-plano');
  if (btnPlano) {
    btnPlano.onclick = async function() {
      var registros = DRE.registrosPlanoParaSalvar();
      var semGrupo = registros.filter(function(r) { return !r.grupo || !(DRE.SE_POR_GRUPO && DRE.SE_POR_GRUPO[r.grupo]); });
      if (semGrupo.length) {
        _dreStatusGrade('fin-dre-status-plano', semGrupo.length + ' conta(s) com grupo inválido — corrija antes de salvar.', 'erro');
        return;
      }
      if (!window.confirm('Salvar ' + registros.length + ' conta(s)? Substitui todo o plano atual desta empresa.')) return;

      _dreStatusGrade('fin-dre-status-plano', 'Salvando...', '');
      try {
        var enviados = await _dreSalvarTabela('fin_dre_plano_contas', empresaId,
          registros.map(function(r) { return Object.assign({}, r, { empresa_id: empresaId }); }));
        _dreStatusGrade('fin-dre-status-plano', '✓ ' + enviados.toLocaleString('pt-BR') + ' conta(s) salva(s).', 'ok');
      } catch (e) {
        _dreStatusGrade('fin-dre-status-plano', 'Falha ao salvar: ' + e.message, 'erro');
      }
    };
  }

  var btnBD = document.getElementById('fin-dre-bd-salvar');
  if (btnBD) {
    btnBD.onclick = async function() {
      var registros = DRE.registrosBDParaSalvar();
      if (!window.confirm('Salvar ' + registros.length + ' lançamento(s)? Substitui todos os lançamentos atuais desta empresa.')) return;

      _dreStatusGrade('fin-dre-status-bd', 'Salvando...', '');
      try {
        var enviados = await _dreSalvarTabela('fin_dre_lancamentos', empresaId,
          registros.map(function(r) { return Object.assign({}, r, { empresa_id: empresaId }); }));
        _dreStatusGrade('fin-dre-status-bd', '✓ ' + enviados.toLocaleString('pt-BR') + ' lançamento(s) salvo(s).', 'ok');
      } catch (e) {
        _dreStatusGrade('fin-dre-status-bd', 'Falha ao salvar: ' + e.message, 'erro');
      }
    };
  }
}

// ── GRADES LITEGRID (abas BD e Plano de Contas) ───────────────────────────────
//
// Usa o LiteGrid de js/jss.js — o mesmo componente do módulo de análise de
// vendas. Colunas conforme Modelo_DRE_Matheus.xlsx. Callbacks interceptados na
// instância para disparar recalcular() após cada edição ou colagem.
//
// Mapeamento BD (0-indexed):
//  0=ID  1=DT_CAIXA  2=DT_VENC  3=DT_PAG  4=CONTA  5=TIPO  6=VALOR
//  7=TOT_PAGO  8=FORNECEDOR CLIENTE  9=N_DOC  10=BANCO  11=FORMA
//  12=PARCELA  13=TOT_PARCELAS  14=OBS  15=CNPJ  16=DT CUSTORIA  17=Histórico
//  [derivadas] 18=S_E  19=GRUPO  20=STATUS  21=DIA  22=MÊS  23=DIA_SEM
//              24=ANO  25=VENC  26=SEMANA_ANO

/** Inicializa as duas grades LiteGrid e carrega os dados vindos do Supabase. */
function _dreIniciarGradesLiteGrid(plano, lancamentos) {
  if (typeof LiteGrid === 'undefined' || typeof GRID_DEFS === 'undefined') return;

  // Sempre redefine: garante coluna certa mesmo após hot-reload
  GRID_DEFS['dre_bd'] = { cols: [
    {t:'ID',                 w:55,  auto:false},
    {t:'DT_CAIXA',           w:100, auto:false},
    {t:'DT_VENC',            w:100, auto:false},
    {t:'DT_PAG',             w:100, auto:false},
    {t:'CONTA',              w:200, auto:false},
    {t:'TIPO',               w:90,  auto:false},
    {t:'VALOR',              w:90,  auto:false},
    {t:'TOT_PAGO',           w:90,  auto:false},
    {t:'FORNECEDOR CLIENTE', w:170, auto:false},
    {t:'N_DOC',              w:100, auto:false},
    {t:'BANCO',              w:90,  auto:false},
    {t:'FORMA',              w:90,  auto:false},
    {t:'PARCELA',            w:70,  auto:false},
    {t:'TOT_PARCELAS',       w:100, auto:false},
    {t:'OBS',                w:140, auto:false},
    {t:'CNPJ',               w:120, auto:false},
    {t:'DT CUSTORIA',        w:100, auto:false},
    {t:'Histórico',          w:150, auto:false},
    {t:'S_E',       w:50,  auto:true},
    {t:'GRUPO',     w:160, auto:true},
    {t:'STATUS',    w:60,  auto:true},
    {t:'DIA',       w:40,  auto:true},
    {t:'MÊS',       w:60,  auto:true},
    {t:'DIA_SEM',   w:60,  auto:true},
    {t:'ANO',       w:60,  auto:true},
    {t:'VENC',      w:70,  auto:true},
    {t:'SEMANA_ANO',w:90,  auto:true}
  ]};

  GRID_DEFS['dre_plano'] = { cols: [
    {t:'COD',   w:80,  auto:false},
    {t:'CONTA', w:220, auto:false},
    {t:'GRUPO', w:200, auto:false},
    {t:'F_V',   w:60,  auto:false},
    {t:'D_I',   w:60,  auto:false}
  ]};

  // Fecha instâncias antigas (troca de empresa, reabertura)
  delete GRIDS['dre_bd'];
  delete GRIDS['dre_plano'];
  delete JSS_FILTERS['dre_bd'];
  delete JSS_FILTERS['dre_plano'];

  // Instala override do filtro uma única vez
  if (!window._dreFilterHooked) {
    window._dreFilterHooked = true;
    var _orig = lgShowFilter;
    window.lgShowFilter = function(key, ci, anchor) {
      if (key === 'dre_bd' || key === 'dre_plano') { _dreShowFilter(key, ci, anchor); }
      else { _orig(key, ci, anchor); }
    };
  }

  // ── Grade BD ──────────────────────────────────────────────────────────────────
  var alvoBD = document.getElementById('fin-dre-tab-bd');
  if (alvoBD) {
    var gridBD = new LiteGrid(alvoBD, 'dre_bd');
    GRIDS['dre_bd'] = gridBD;

    gridBD.setData(_dreRowsBD(lancamentos));
    FULL_DATA['dre_bd'] = gridBD.allData.slice();
    _dreAtualizarDerivadasBD(gridBD);

    _drePatchGrid(gridBD, function() {
      _dreAtualizarDerivadasBD(gridBD);
      FULL_DATA['dre_bd'] = gridBD.allData.slice();
      DRE.estado.lancamentos = _dreLancDeRows(gridBD.getData());
      DRE.recalcular();
    });
  }

  // ── Grade Plano de Contas ─────────────────────────────────────────────────────
  var alvoPlano = document.getElementById('fin-dre-tab-plano');
  if (alvoPlano) {
    var gridPlano = new LiteGrid(alvoPlano, 'dre_plano');
    GRIDS['dre_plano'] = gridPlano;

    gridPlano.setData(_drePlanoToRows(plano));
    FULL_DATA['dre_plano'] = gridPlano.allData.slice();
    _drePatchPlanoToggles(gridPlano);
    for (var pr = 0; pr < gridPlano.allData.length; pr++) gridPlano._renderRow(pr);

    var planoCallback = function() {
      FULL_DATA['dre_plano'] = gridPlano.allData.slice();
      DRE.estado.plano = _drePlanoDeRows(gridPlano.getData());
      if (GRIDS['dre_bd']) _dreAtualizarDerivadasBD(GRIDS['dre_bd']);
      DRE.recalcular();
    };
    _drePatchGrid(gridPlano, planoCallback);

    // Toggle F_V (col 3) e D_I (col 4) em capture — intercepta antes do LiteGrid
    alvoPlano.addEventListener('mousedown', function(e) {
      var td = e.target.closest('td');
      if (!td) return;
      var tr = td.parentElement;
      if (!tr || !tr.parentElement || tr.parentElement.tagName !== 'TBODY') return;
      var ci = Array.from(tr.cells).indexOf(td) - 1;
      if (ci !== 3 && ci !== 4) return;
      e.stopPropagation();
      e.preventDefault();
      var rn = tr.querySelector('.lg-rn');
      var ri = rn ? parseInt(rn.textContent) - 1 : -1;
      if (ri < 0) return;
      var ncols = GRID_DEFS['dre_plano'].cols.length;
      while (gridPlano.allData.length <= ri) {
        var er = []; for (var j = 0; j < ncols; j++) er.push(''); gridPlano.allData.push(er);
      }
      while (gridPlano.allData[ri].length < ncols) gridPlano.allData[ri].push('');
      var cur = String(gridPlano.allData[ri][ci] || '').trim().toUpperCase();
      gridPlano.allData[ri][ci] = ci === 3
        ? (cur === 'F' ? 'V' : cur === 'V' ? '' : 'F')
        : (cur === 'D' ? 'I' : cur === 'I' ? '' : 'D');
      gridPlano._renderRow(ri);
      planoCallback();
    }, true);
  }

  // ── Filtros da aba Lançamentos ────────────────────────────────────────────────
  // Popular o select de GRUPO com os 15 grupos canônicos
  var selLancGrupo = document.getElementById('fin-lanc-filtro-grupo');
  if (selLancGrupo && typeof DRE !== 'undefined') {
    selLancGrupo.innerHTML = '<option value="">Grupo: todos</option>' +
      Object.keys(DRE.SE_POR_GRUPO).map(function(g) {
        return '<option value="'+g.replace(/"/g,'&quot;')+'">'+g+'</option>';
      }).join('');
  }
  ['fin-lanc-filtro-grupo','fin-lanc-filtro-se','fin-lanc-filtro-mes'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function() { DRE.recalcular(); });
  });
}

/** 9 colunas derivadas no BD (índices 18-26). CONTA está no índice 4. */
function _dreAtualizarDerivadasBD(gridBD) {
  var SE_MAP  = DRE.SE_POR_GRUPO;
  var MESES   = DRE.MESES;
  var DIAS_SEM = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  var idx = new Map();
  DRE.estado.plano.forEach(function(c) {
    idx.set(String(c.conta || '').trim().toLowerCase(), c);
  });
  var hoje = new Date(); hoje.setHours(0,0,0,0);
  var data = gridBD.allData;
  for (var i = 0; i < data.length; i++) {
    var r = data[i]; if (!r) continue;
    var conta  = String(r[4] || '').trim().toLowerCase();   // CONTA at [4]
    var pc     = conta ? idx.get(conta) : null;
    var temLinha = r[4] || r[1];

    r[18] = pc ? (SE_MAP[pc.grupo] || 'S') : (conta ? '#N/A' : ''); // S_E
    r[19] = pc ? (pc.grupo || '') : (conta ? '#N/A' : '');           // GRUPO

    var dt = String(r[1] || '');   // DT_CAIXA at [1]
    var d  = dt ? new Date(dt) : null;
    var ok = d && !isNaN(d);
    r[20] = temLinha ? (r[3] ? 'PG' : 'N') : '';           // STATUS (DT_PAG at [3])
    r[21] = ok ? d.getDate() : '';                          // DIA
    r[22] = ok ? (MESES[d.getMonth()] || '') : '';          // MÊS
    r[23] = ok ? (DIAS_SEM[d.getDay()] || '') : '';         // DIA_SEM
    r[24] = ok ? d.getFullYear() : '';                      // ANO

    // VENC: VP=pago, VENCIDO=vencido sem pag, VA=a vencer
    if (!temLinha)       { r[25] = ''; }
    else if (r[3])       { r[25] = 'VP'; }
    else {
      var dv = r[2] ? new Date(String(r[2])) : null;       // DT_VENC at [2]
      r[25] = (dv && !isNaN(dv)) ? (dv < hoje ? 'VENCIDO' : 'VA') : '';
    }

    // SEMANA_ANO
    if (ok) {
      var soy = new Date(d.getFullYear(), 0, 1);
      r[26] = Math.ceil(((d - soy) / 86400000 + soy.getDay() + 1) / 7);
    } else { r[26] = ''; }
  }
  gridBD._render();
}

/** Intercepta _commit, _pasteAt e _paste para disparar callback após cada mudança. */
function _drePatchGrid(grid, cb) {
  var origCommit  = grid._commit.bind(grid);
  var origPasteAt = grid._pasteAt.bind(grid);
  var origPaste   = grid._paste.bind(grid);
  grid._commit  = function()         { origCommit(); cb(); };
  grid._pasteAt = function(txt,r,c)  { origPasteAt(txt,r,c); cb(); };
  grid._paste   = function(txt)      { origPaste(txt); cb(); };
}

/** Aplica o visual de botoes nas colunas F_V e D_I sem alterar a logica do grid. */
function _drePatchPlanoToggles(gridPlano) {
  if (!gridPlano || gridPlano._dreTogglesPatched) return;
  gridPlano._dreTogglesPatched = true;

  var origRender = gridPlano._render.bind(gridPlano);
  var origRenderRow = gridPlano._renderRow.bind(gridPlano);

  gridPlano._render = function() {
    origRender();
    _dreRenderPlanoToggles(gridPlano);
  };

  gridPlano._renderRow = function(ri) {
    origRenderRow(ri);
    _dreRenderPlanoToggleRow(gridPlano, ri);
  };
}

function _dreRenderPlanoToggles(gridPlano) {
  if (!gridPlano || !gridPlano._tbody) return;
  var from = gridPlano.page * gridPlano.pageSize;
  var rows = gridPlano._tbody.querySelectorAll('tr');
  rows.forEach(function(_tr, rowIdx) {
    _dreRenderPlanoToggleRow(gridPlano, from + rowIdx);
  });
}

function _dreRenderPlanoToggleRow(gridPlano, ri) {
  if (!gridPlano || !gridPlano._tbody) return;
  var from = gridPlano.page * gridPlano.pageSize;
  var rowIdx = ri - from;
  var rows = gridPlano._tbody.querySelectorAll('tr');
  if (rowIdx < 0 || rowIdx >= rows.length) return;

  var tr = rows[rowIdx];
  var r = gridPlano.allData[ri] || [];
  var tds = tr.querySelectorAll('td');
  _dreRenderPlanoToggleCell(tds[4], r[3], 'F', 'V');
  _dreRenderPlanoToggleCell(tds[5], r[4], 'D', 'I');
}

function _dreRenderPlanoToggleCell(td, valor, a, b) {
  if (!td) return;
  var v = String(valor || '').trim().toUpperCase();
  td.innerHTML =
    '<span class="dre-toggle-cell">' +
      '<span class="dre-tb dre-tb-' + a.toLowerCase() + (v === a ? ' ativo' : '') + '">' + a + '</span>' +
      '<span class="dre-tb dre-tb-' + b.toLowerCase() + (v === b ? ' ativo' : '') + '">' + b + '</span>' +
    '</span>';
}

/** Objeto plano -> array de células (COD, CONTA, GRUPO, F_V, D_I). */
function _drePlanoToRows(plano) {
  return (plano || []).map(function(p) {
    return [p.cod||'', p.conta||'', p.grupo||'', p.fv||'', p.di||''];
  });
}

/** Array de linhas da grade Plano -> array de objetos plano. */
function _drePlanoDeRows(rows) {
  return rows.map(function(r) {
    return { cod: r[0]||'', conta: r[1]||'', grupo: r[2]||'', fv: r[3]||'', di: r[4]||'' };
  });
}

/** Objeto lançamento -> array de 27 células (18 editáveis + 9 derivadas). */
function _dreRowsBD(lancs) {
  return (lancs || []).map(function(l) {
    return [
      '',                                           // 0  ID
      l.dt_caixa  || '',                            // 1  DT_CAIXA
      l.dt_venc   || '',                            // 2  DT_VENC
      l.dt_pag    || '',                            // 3  DT_PAG
      l.conta     || '',                            // 4  CONTA
      '',                                           // 5  TIPO
      l.valor     != null ? l.valor    : '',        // 6  VALOR
      l.tot_pago  != null ? l.tot_pago : '',        // 7  TOT_PAGO
      l.parceiro  || '',                            // 8  FORNECEDOR CLIENTE
      l.documento || '',                            // 9  N_DOC
      l.banco     || '',                            // 10 BANCO
      l.forma     || '',                            // 11 FORMA
      '', '', '', '', '', '',                       // 12-17 PARCELA…Histórico
      '', '', '', '', '', '', '', '', ''            // 18-26 derivadas
    ];
  });
}

/** Array de linhas da grade BD -> objetos lançamento para o motor. */
function _dreLancDeRows(rows) {
  var cnpj = DRE.estado.cnpj;
  return rows
    .filter(function(r) { return r[4] && r[1]; })  // precisa CONTA[4] e DT_CAIXA[1]
    .map(function(r) {
      return {
        conta:     r[4]  || '',
        dt_caixa:  r[1]  || '',
        dt_venc:   r[2]  || null,
        dt_pag:    r[3]  || null,
        valor:     (r[6]  !== '' && r[6]  !== null) ? Number(r[6])  : null,
        tot_pago:  (r[7]  !== '' && r[7]  !== null) ? Number(r[7])  : null,
        parceiro:  r[8]  || null,
        documento: r[9]  || null,
        banco:     r[10] || null,
        forma:     r[11] || null,
        cnpj:      cnpj
      };
    });
}

// ── FILTRO MULTI-SELECT PARA GRADES DRE ──────────────────────────────────────
// Substitui lgShowFilter() para as keys 'dre_bd' e 'dre_plano'.
// Usa checkboxes + busca em vez do radio-button simples do jss.js.

function _dreShowFilter(key, colIdx, anchor) {
  document.querySelectorAll('.col-filter-dropdown').forEach(function(d){ d.remove(); });
  var grd = GRIDS[key]; if (!grd) return;
  var colDef = (GRID_DEFS[key]||{cols:[]}).cols[colIdx] || {};
  var colName = colDef.t || ('Col '+(colIdx+1));
  var src = FULL_DATA[key] || grd.allData;
  var seen = {}, vals = [];
  src.forEach(function(r){ var v=String(r[colIdx]||'').trim(); if(v&&!seen[v]){seen[v]=1;vals.push(v);} });
  vals.sort(function(a,b){ var na=parseFloat(a),nb=parseFloat(b); return(!isNaN(na)&&!isNaN(nb))?na-nb:a.localeCompare(b,'pt-BR'); });
  // Valores fixos para colunas bem definidas
  var presets = { 'GRUPO':Object.keys(DRE.SE_POR_GRUPO), 'S_E':['E','S','0'],
    'STATUS':['PG','N'], 'VENC':['VP','VA','VENCIDO'], 'MÊS':DRE.MESES };
  if (presets[colName]) presets[colName].forEach(function(v){ if(!seen[v]){seen[v]=1;vals.push(v);} });
  var active = (JSS_FILTERS[key]||{})[colIdx] || [];
  if (!Array.isArray(active)) active = active ? [active] : [];
  var rect = anchor.getBoundingClientRect();
  var drop = document.createElement('div');
  drop.className = 'col-filter-dropdown';
  drop.style.cssText = 'position:fixed;top:'+(rect.bottom+2)+'px;left:'+Math.min(rect.left,window.innerWidth-260)+'px;z-index:9999;min-width:240px;background:#fff;border:1px solid #ccd5de;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.18);font-size:12px;';
  var items = vals.slice(0,300).map(function(v){
    var ch = active.indexOf(v)>=0?'checked':'';
    var ve = v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    return '<label style="display:flex;align-items:center;gap:6px;padding:3px 10px;cursor:pointer;" class="dre-fi"><input type="checkbox" value="'+ve+'" '+ch+' style="cursor:pointer;"><span>'+ve+'</span></label>';
  }).join('');
  drop.innerHTML =
    '<div style="padding:7px 10px;background:#f0f3f7;border-bottom:1px solid #dde3eb;display:flex;justify-content:space-between;align-items:center;">'
    +'<strong style="font-size:11px;">'+colName+'</strong>'
    +'<button onclick="dreClearFilter(\''+key+'\','+colIdx+')" style="font-size:10px;border:none;background:none;cursor:pointer;color:#666;">✕ Limpar</button></div>'
    +'<div style="padding:5px 8px;border-bottom:1px solid #eee;">'
    +'<input placeholder="Buscar…" style="width:100%;box-sizing:border-box;border:1px solid #ccd5de;border-radius:4px;padding:3px 6px;font-size:11px;"></div>'
    +'<label style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-bottom:1px solid #f0f3f7;font-weight:600;cursor:pointer;">'
    +'<input type="checkbox" class="dre-sel-all" '+(active.length===0?'checked':'')+' style="cursor:pointer;"><span>Selecionar tudo</span></label>'
    +'<div style="max-height:210px;overflow-y:auto;padding:3px 0;">'+items+'</div>'
    +'<div style="padding:6px 10px;border-top:1px solid #eee;display:flex;gap:6px;justify-content:flex-end;">'
    +'<button onclick="dreClearFilter(\''+key+'\','+colIdx+')" style="padding:3px 10px;border:1px solid #ccd5de;border-radius:4px;cursor:pointer;font-size:11px;">Limpar</button>'
    +'<button class="dre-fa" style="padding:3px 10px;background:#002060;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">Aplicar</button>'
    +'</div>';
  document.body.appendChild(drop);
  var searchEl = drop.querySelector('input[placeholder]');
  var listEl   = drop.querySelector('div[style*="max-height"]');
  var selAll   = drop.querySelector('.dre-sel-all');
  if (searchEl) searchEl.addEventListener('input', function(){
    var q=searchEl.value.toLowerCase();
    listEl.querySelectorAll('.dre-fi').forEach(function(el){
      el.style.display = el.textContent.toLowerCase().indexOf(q)>=0 ? '' : 'none';
    });
  });
  if (selAll) selAll.addEventListener('change', function(){
    listEl.querySelectorAll('input[type=checkbox]').forEach(function(cb){ cb.checked=selAll.checked; });
  });
  drop.querySelector('.dre-fa').addEventListener('click', function(){
    var sel=[]; listEl.querySelectorAll('input[type=checkbox]:checked').forEach(function(cb){ sel.push(cb.value); });
    dreApplyFilterMulti(key, colIdx, sel); drop.remove();
  });
  setTimeout(function(){ document.addEventListener('click', function cl(e){ if(!drop.contains(e.target)){drop.remove();document.removeEventListener('click',cl);} }); }, 0);
}

function dreApplyFilterMulti(key, colIdx, values) {
  if (!JSS_FILTERS[key]) JSS_FILTERS[key] = {};
  if (!values || !values.length) delete JSS_FILTERS[key][colIdx]; else JSS_FILTERS[key][colIdx] = values;
  dreApplyFilter(key);
}

function dreApplyFilter(key) {
  var grd = GRIDS[key]; if (!grd) return;
  var filters = JSS_FILTERS[key] || {};
  var src = FULL_DATA[key] || grd.allData;
  var fks = Object.keys(filters);
  grd.filtered = fks.length === 0 ? null : src.filter(function(r){
    return fks.every(function(ci){
      var v = String(r[parseInt(ci)]||'').trim();
      var f = filters[ci];
      return Array.isArray(f) ? f.indexOf(v)>=0 : v===f;
    });
  });
  grd.page = 0; grd._render();
  grd.container.querySelectorAll('.col-filter-btn').forEach(function(b){
    var ci = parseInt(b.dataset.col);
    var f = filters[ci]; var on = f && (Array.isArray(f)?f.length>0:true);
    b.innerHTML = on ? '▾●' : '▾'; b.style.color = on ? '#e07b00' : '';
  });
}

function dreClearFilter(key, colIdx) {
  if (JSS_FILTERS[key]) delete JSS_FILTERS[key][colIdx];
  dreApplyFilter(key);
  document.querySelectorAll('.col-filter-dropdown').forEach(function(d){ d.remove(); });
}

/**
 * Botão "Abrir DRE" do card de cada empresa, na aba Financeiro do console
 * admin (js/admin-console.js, adminConsoleRenderFinanceiro). O DRE é por
 * empresa — não existe uma abertura "genérica" sem saber de qual empresa são
 * os dados, por isso este atalho sempre exige um companyId.
 */
function dreAbrirDoAdmin(companyId) {
  if (typeof SESSION === 'undefined' || !SESSION || SESSION.papel !== 'super_admin') return;
  if (!companyId) return;

  // Garante a lista de preview mesmo sem passar pelo seletor de empresas cliente.
  if (typeof ADMIN_PREVIEW_COMPANIES !== 'undefined'
      && (!ADMIN_PREVIEW_COMPANIES || !ADMIN_PREVIEW_COMPANIES.length)
      && typeof ADMIN_CONSOLE !== 'undefined') {
    ADMIN_PREVIEW_COMPANIES = (ADMIN_CONSOLE.companies || []).map(function(company) {
      return {
        empresa_id: company.id || company.empresa_id,
        nome: company.nome || 'Empresa',
        slug: company.slug || null,
        logo_url: company.logo_url || null,
        ativo: company.ativo !== false,
        tem_api: false
      };
    });
  }

  if (typeof abrirModulo === 'function') abrirModulo('dre', { empresaIdPreview: companyId });
}

/** Volta ao console do super_admin, encerrando o preview supervisionado. */
function dreVoltarAoAdmin() {
  if (typeof SESSION === 'undefined' || !SESSION || SESSION.papel !== 'super_admin') return;
  dreDestruir();
  MODULO_ATIVO = null;
  if (typeof abrirSeletorEmpresasCliente === 'function') abrirSeletorEmpresasCliente();
}

// ── FECHAMENTO ───────────────────────────────────────────────────────────────

/**
 * Esconde o painel e desmonta o HTML.
 *
 * A desmontagem nao e opcional: e ela que impede os ids da ferramenta de
 * coexistirem com os do painel financeiro. Ver o cabecalho deste arquivo.
 */
function dreFechar() {
  var view = document.getElementById('view-dash-dre');
  if (view) { view.style.display = 'none'; view.innerHTML = ''; }
  DRE_MONTADO = false;
  _dreRestaurarAbasFinanceiro();
}

/** Libera os graficos. Sem isso o Chart.js vaza a cada troca de modulo. */
function dreDestruir() {
  try {
    var charts = (typeof DRE !== 'undefined' && DRE.estado) ? DRE.estado.charts : null;
    if (charts) {
      Object.keys(charts).forEach(function(id) {
        try { if (charts[id] && charts[id].destroy) charts[id].destroy(); } catch (e) {}
        delete charts[id];
      });
    }
  } catch (e) {}

  dreFechar();
  DRE_ADMIN_PREVIEW = false;
  DRE_ADMIN_PREVIEW_COMPANY = null;
}

/**
 * O ligarAbas() da ferramenta tira a classe .active de todo .fin-tab e
 * .fin-pane do documento, inclusive os do painel financeiro. Devolve a
 * primeira aba daquele painel ao estado ativo.
 */
function _dreRestaurarAbasFinanceiro() {
  var painel = document.getElementById('view-dash-financeiro');
  if (!painel) return;

  var abas = painel.querySelectorAll('.fin-tab');
  var paineis = painel.querySelectorAll('.fin-pane');
  if (!abas.length) return;

  abas.forEach(function(b) { b.classList.remove('active'); });
  paineis.forEach(function(p) { p.classList.remove('active'); });

  abas[0].classList.add('active');
  var alvo = document.getElementById(abas[0].dataset.finPane);
  if (alvo) alvo.classList.add('active');
}
