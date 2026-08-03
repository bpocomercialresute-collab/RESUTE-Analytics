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

var DRE_HTML_URL = 'views/dre-painel.html?v=7';
var DRE_CSS_URL  = 'css/dre-painel.css?v=5';

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
 * Ajustes de header que so o sistema conhece: selo de preview e botao de voltar.
 * Roda depois do DRE.init, que escreve em #fin-empresa.
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
// vendas. Inicializado após DRE.init(), que já carregou plano e lançamentos em
// DRE.estado. Callbacks interceptados na instância (não no protótipo) para
// disparar recalcular() após cada edição ou colagem.

/** Inicializa as duas grades LiteGrid e carrega os dados vindos do Supabase. */
function _dreIniciarGradesLiteGrid(plano, lancamentos) {
  if (typeof LiteGrid === 'undefined' || typeof GRID_DEFS === 'undefined') return;

  window._dreRenderToggleHtml = function(ci, val) {
    val = String(val || '').trim().toUpperCase();
    var isF = ci === 3;
    var opts = isF ? ['F','V'] : ['D','I'];
    var cls  = isF ? ['dre-tb-f','dre-tb-v'] : ['dre-tb-d','dre-tb-i'];
    return '<span class="dre-tb-wrap">'
      + '<span class="dre-tb ' + cls[0] + (val === opts[0] ? ' on' : '') + '">' + opts[0] + '</span>'
      + '<span class="dre-tb ' + cls[1] + (val === opts[1] ? ' on' : '') + '">' + opts[1] + '</span>'
      + '</span>';
  };

  window._dreRenderToggle = function(key, ci, val, td) {
    if (key !== 'dre_plano') return false;
    if (ci !== 3 && ci !== 4) return false;
    td.innerHTML = window._dreRenderToggleHtml(ci, val);
    return true;
  };

  GRID_DEFS['dre_bd'] = { cols: [
    {t:'ID',                 w:60,  auto:false},
    {t:'DT_CAIXA',           w:100, auto:false},
    {t:'DT_VENC',            w:100, auto:false},
    {t:'DT_PAG',             w:100, auto:false},
    {t:'CONTA',              w:200, auto:false},
    {t:'TIPO',               w:80,  auto:false},
    {t:'VALOR',              w:90,  auto:false},
    {t:'TOT_PAGO',           w:90,  auto:false},
    {t:'FORNECEDOR CLIENTE', w:170, auto:false},
    {t:'N_DOC',              w:100, auto:false},
    {t:'BANCO',              w:90,  auto:false},
    {t:'FORMA',              w:90,  auto:false},
    {t:'PARCELA',            w:75,  auto:false},
    {t:'TOT_PARCELAS',       w:105, auto:false},
    {t:'OBS',                w:150, auto:false},
    {t:'CNPJ',               w:140, auto:false},
    {t:'DT CUSTORIA',        w:110, auto:false},
    {t:'Histórico',          w:180, auto:false},
    {t:'S_E',                w:50,  auto:true},
    {t:'GRUPO',              w:160, auto:true},
    {t:'STATUS',             w:70,  auto:true},
    {t:'DIA',                w:50,  auto:true},
    {t:'MÊS',                w:60,  auto:true},
    {t:'DIA_SEM',            w:70,  auto:true},
    {t:'ANO',                w:60,  auto:true},
    {t:'VENC',               w:80,  auto:true},
    {t:'SEMANA_ANO',         w:100, auto:true},
    {t:'ULTIMO_DIA_DO_MES',  w:140, auto:true},
    {t:'CNPJ_2',             w:140, auto:true},
    {t:'safra',              w:70,  auto:true},
    {t:'CICLO',              w:70,  auto:true}
  ]};
  if (!GRID_DEFS['dre_plano']) {
    GRID_DEFS['dre_plano'] = { cols: [
      {t:'COD',   w:80,  auto:false},
      {t:'CONTA', w:220, auto:false},
      {t:'GRUPO', w:200, auto:false},
      {t:'F_V',   w:60,  auto:false},
      {t:'D_I',   w:60,  auto:false}
    ]};
  }
  // BD_DRE: mesmo esquema visual da aba BD — só CAD e GRUPO ficam com aparência
  // de "coluna auto" (fundo/cor de derivada). As demais herdam o estilo padrão
  // de célula editável, mesmo sendo somente leitura (a edição é bloqueada por
  // override de _commit/_paste/_pasteAt/_select mais abaixo).
  GRID_DEFS['dre_bddre'] = { cols: [
    {t:'ID',     w:50,  auto:false},
    {t:'CNPJ',   w:60,  auto:false},
    {t:'ANO',    w:60,  auto:false},
    {t:'CODIGO', w:80,  auto:false},
    {t:'CONTA',  w:200, auto:false},
    {t:'Jan',    w:80,  auto:false},
    {t:'Fev',    w:80,  auto:false},
    {t:'Mar',    w:80,  auto:false},
    {t:'Abr',    w:80,  auto:false},
    {t:'Mai',    w:80,  auto:false},
    {t:'Jun',    w:80,  auto:false},
    {t:'Jul',    w:80,  auto:false},
    {t:'Ago',    w:80,  auto:false},
    {t:'Set',    w:80,  auto:false},
    {t:'Out',    w:80,  auto:false},
    {t:'Nov',    w:80,  auto:false},
    {t:'Dez',    w:80,  auto:false},
    {t:'CAD',    w:50,  auto:true},
    {t:'GRUPO',  w:180, auto:true},
    {t:'TOTAL',  w:100, auto:false},
    {t:'MED',    w:80,  auto:false},
    {t:'%',      w:70,  auto:false},
    {t:'s_e',    w:50,  auto:false}
  ]};

  // Fecha instâncias antigas (troca de empresa, reabertura)
  delete GRIDS['dre_bd'];
  delete GRIDS['dre_plano'];
  delete GRIDS['dre_bddre'];

  // ── Grade BD (livro-razão editável) ──────────────────────────────────────────
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
      _dreAtualizarBDDRE();
    });
  }

  // ── Grade Plano de Contas ─────────────────────────────────────────────────────
  var alvoPlano = document.getElementById('fin-dre-tab-plano');
  if (alvoPlano) {
    var gridPlano = new LiteGrid(alvoPlano, 'dre_plano');
    GRIDS['dre_plano'] = gridPlano;

    var atualizarPlano = function() {
      FULL_DATA['dre_plano'] = gridPlano.allData.slice();
      DRE.estado.plano = _drePlanoDeRows(gridPlano.getData());
      if (GRIDS['dre_bd']) _dreAtualizarDerivadasBD(GRIDS['dre_bd']);
      DRE.recalcular();
      _dreAtualizarBDDRE();
    };
    var renderOriginalPlano = gridPlano._render.bind(gridPlano);
    gridPlano._render = function() {
      renderOriginalPlano();
      _dreAtualizarTodosTogles(gridPlano);
    };

    gridPlano.setData(_drePlanoToRows(plano));
    FULL_DATA['dre_plano'] = gridPlano.allData.slice();
    _dreAtualizarTodosTogles(gridPlano);

    gridPlano._tbody.addEventListener('mousedown', function(e) {
      var td = e.target.closest('td');
      if (!td || td.classList.contains('lg-rn')) return;
      var tr = td.closest('tr');
      if (!tr) return;
      var ci = Array.from(tr.cells).indexOf(td) - 1;
      if (ci !== 3 && ci !== 4) return;
      e.preventDefault();
      e.stopPropagation();
      var rn = tr.querySelector('.lg-rn');
      var ri = rn ? parseInt(rn.textContent, 10) - 1 : -1;
      if (ri < 0) return;

      var ncols = gridPlano.def.cols.length;
      while (gridPlano.allData.length <= ri) {
        var vazia = [];
        for (var j = 0; j < ncols; j++) vazia.push('');
        gridPlano.allData.push(vazia);
      }
      while (gridPlano.allData[ri].length < ncols) gridPlano.allData[ri].push('');

      if (ci === 3) {
        var atualFV = gridPlano.allData[ri][3] || '';
        if (atualFV === '') gridPlano.allData[ri][3] = 'F';
        else if (atualFV === 'F') gridPlano.allData[ri][3] = 'V';
        else gridPlano.allData[ri][3] = '';
      } else {
        var atualDI = gridPlano.allData[ri][4] || '';
        if (atualDI === '') gridPlano.allData[ri][4] = 'D';
        else if (atualDI === 'D') gridPlano.allData[ri][4] = 'I';
        else gridPlano.allData[ri][4] = '';
      }

      if (gridPlano._inp) gridPlano._inp.style.display = 'none';
      gridPlano._renderRow(ri);
      _dreAtualizarTodosTogles(gridPlano);
      atualizarPlano();
    }, true);

    _drePatchGrid(gridPlano, function() {
      _dreAtualizarTodosTogles(gridPlano);
      atualizarPlano();
    });
  }

  // ── Grade BD_DRE (matriz SUMIFS, 100% somente leitura) ──────────────────────
  _dreIniciarGradeBDDRE();
}

// ── GRADE BD_DRE ────────────────────────────────────────────────────────────
//
// Somente leitura: nenhuma célula é editável. Origem dos dados é DRE.estado.bdDre,
// que já é derivado do PLANO_CONTAS cruzado com o BD via SUMIFS. Filtros
// (ano, grupo, s_e, busca) atuam client-side; o filtro de ano além de restringir
// a visão troca DRE.estado.ano e dispara DRE.recalcular() para reindexar a matriz.

var _dreBDDreFiltros = { ano: '', grupo: '', se: '', busca: '' };
var _dreRecalcularWrapped = false;

function _dreIniciarGradeBDDRE() {
  var alvo = document.getElementById('fin-dre-tab-bddre');
  if (!alvo) return;

  // O motor tem seu próprio renderBDDRE() que reescreve o innerHTML deste
  // container a cada DRE.recalcular(). Interceptamos recalcular() uma única vez
  // para reconstruir a grade LiteGrid depois — assim a visualização em grade
  // continua consistente sem tocar em dre-engine.js.
  if (!_dreRecalcularWrapped && DRE && typeof DRE.recalcular === 'function') {
    var recalcOrig = DRE.recalcular;
    DRE.recalcular = function() {
      recalcOrig.apply(this, arguments);
      _dreReconstruirBDDRE();
    };
    _dreRecalcularWrapped = true;
  }

  _dreReconstruirBDDRE();
  _dreBDDrePopularFiltros();
  _dreBDDreLigarFiltros();
}

/** (Re)cria a grade LiteGrid do BD_DRE quando o container foi apagado por renderBDDRE. */
function _dreReconstruirBDDRE() {
  var alvo = document.getElementById('fin-dre-tab-bddre');
  if (!alvo) return;
  var grid = GRIDS['dre_bddre'];
  if (!grid || !grid._tbody || !alvo.contains(grid._tbody)) {
    grid = new LiteGrid(alvo, 'dre_bddre');
    // Bloqueia edição/colagem — matriz é 100% derivada.
    grid._commit  = function() {};
    grid._paste   = function() {};
    grid._pasteAt = function() {};
    // _select: nunca abre o input flutuante — apenas realça a célula e mostra
    // a referência. Vale para colunas auto:true (CAD/GRUPO) e auto:false, que
    // aqui existem só pelo esquema de cores da aba BD; nada é editável.
    grid._select = function(ri, ci, td) {
      this.selRow = ri; this.selCol = ci;
      if (this._tbody) {
        this._tbody.querySelectorAll('.lg-sel-cell').forEach(function(el){ el.classList.remove('lg-sel-cell'); });
        this._tbody.querySelectorAll('.lg-sel-row').forEach(function(el){ el.classList.remove('lg-sel-row'); });
      }
      if (td) {
        td.classList.add('lg-sel-cell');
        var tr = td.closest('tr');
        if (tr) Array.from(tr.cells).forEach(function(c){ c.classList.add('lg-sel-row'); });
      }
      var col = ci < 26
        ? String.fromCharCode(65 + ci)
        : String.fromCharCode(64 + Math.floor(ci / 26)) + String.fromCharCode(65 + (ci % 26));
      var rc = document.getElementById('lg-rc-' + this.key);
      if (rc) rc.textContent = col + (ri + 1);
      if (this._inp) this._inp.style.display = 'none';
      var rv = document.getElementById('lg-rv-' + this.key);
      var src = this.filtered || this.allData;
      if (rv) rv.value = (src[ri] && src[ri][ci] !== undefined) ? src[ri][ci] : '';
    };
    GRIDS['dre_bddre'] = grid;
  }
  _dreAtualizarBDDRE();
}

/** Popula selects de ano e grupo com base nos lançamentos e nos grupos conhecidos. */
function _dreBDDrePopularFiltros() {
  var selAno = document.getElementById('fin-dre-bddre-filtro-ano');
  if (selAno) {
    var anos = {};
    (DRE.estado.lancamentos || []).forEach(function(l) {
      var d = l.dt_caixa ? new Date(l.dt_caixa) : null;
      if (d && !isNaN(d)) anos[d.getFullYear()] = true;
    });
    if (DRE.estado.ano) anos[DRE.estado.ano] = true;
    var lista = Object.keys(anos).sort();
    selAno.innerHTML = '<option value="">Ano: todos</option>'
      + lista.map(function(a) { return '<option value="' + a + '">' + a + '</option>'; }).join('');
    if (DRE.estado.ano && lista.indexOf(String(DRE.estado.ano)) >= 0) {
      selAno.value = String(DRE.estado.ano);
      _dreBDDreFiltros.ano = String(DRE.estado.ano);
    }
  }

  var selGrupo = document.getElementById('fin-dre-bddre-filtro-grupo');
  if (selGrupo) {
    selGrupo.innerHTML = '<option value="">Grupo: todos</option>'
      + Object.keys(DRE.SE_POR_GRUPO || {}).map(function(g) {
          return '<option value="' + g.replace(/"/g,'&quot;') + '">' + g + '</option>';
        }).join('');
  }
}

/** Liga eventos change/input dos selects e do campo de busca. */
function _dreBDDreLigarFiltros() {
  var selAno = document.getElementById('fin-dre-bddre-filtro-ano');
  if (selAno) selAno.onchange = function() {
    _dreBDDreFiltros.ano = selAno.value;
    // Ano vazio no filtro mantém o ano atual do estado (matriz sempre por ano)
    var novo = selAno.value ? parseInt(selAno.value, 10) : null;
    if (novo && novo !== DRE.estado.ano) {
      DRE.estado.ano = novo;
      DRE.recalcular();
    }
    _dreAtualizarBDDRE();
  };

  var selGrupo = document.getElementById('fin-dre-bddre-filtro-grupo');
  if (selGrupo) selGrupo.onchange = function() {
    _dreBDDreFiltros.grupo = selGrupo.value;
    _dreAtualizarBDDRE();
  };

  var selSE = document.getElementById('fin-dre-bddre-filtro-se');
  if (selSE) selSE.onchange = function() {
    _dreBDDreFiltros.se = selSE.value;
    _dreAtualizarBDDRE();
  };

  var busca = document.getElementById('fin-dre-bddre-busca');
  if (busca) busca.oninput = function() {
    _dreBDDreFiltros.busca = busca.value || '';
    _dreAtualizarBDDRE();
  };
}

/** Repopula a grade BD_DRE a partir de DRE.estado.bdDre, aplicando filtros. */
function _dreAtualizarBDDRE() {
  var grid = GRIDS['dre_bddre'];
  if (!grid) return;
  var linhas = _dreBDDreFiltrar(DRE.estado.bdDre || []);
  grid.setData(_dreRowsBDDRE(linhas));
  FULL_DATA['dre_bddre'] = grid.allData.slice();
}

/** Aplica filtros client-side sobre estado.bdDre. */
function _dreBDDreFiltrar(bdDre) {
  var f = _dreBDDreFiltros;
  var busca = (f.busca || '').trim().toLowerCase();
  return bdDre.filter(function(l) {
    if (f.ano && String(l.ano) !== f.ano) return false;
    if (f.grupo && l.grupo !== f.grupo) return false;
    if (f.se && String(l.s_e) !== f.se) return false;
    if (busca) {
      var alvo = ((l.codigo || '') + ' ' + (l.conta || '')).toLowerCase();
      if (alvo.indexOf(busca) < 0) return false;
    }
    return true;
  });
}

/** Formata número no padrão pt-BR com 2 casas; zero e não-numérico viram ''. */
function _dreBDDreNum(v) {
  var n = Number(v);
  if (!isFinite(n) || n === 0) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Objeto linha BD_DRE -> array de células (mesma ordem de GRID_DEFS dre_bddre). */
function _dreRowsBDDRE(linhas) {
  return (linhas || []).map(function(l) {
    var meses = (l.meses || []).map(_dreBDDreNum);
    while (meses.length < 12) meses.push('');
    var pct = (typeof l.pct === 'number' && isFinite(l.pct))
      ? (l.pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
      : '';
    return [
      l.id      != null ? l.id      : '',
      l.cnpj    != null ? l.cnpj    : '',
      l.ano     != null ? l.ano     : '',
      l.codigo  || '',
      l.conta   || '',
      meses[0], meses[1], meses[2], meses[3], meses[4], meses[5],
      meses[6], meses[7], meses[8], meses[9], meses[10], meses[11],
      l.cad     || '',
      l.grupo   || '',
      _dreBDDreNum(l.total),
      _dreBDDreNum(l.med),
      pct,
      l.s_e     || ''
    ];
  });
}

function _dreAtualizarTodosTogles(gridPlano) {
  if (!gridPlano || !gridPlano._tbody || !window._dreRenderToggleHtml) return;
  var rows = gridPlano._tbody.rows;
  var from = (gridPlano.page || 0) * (gridPlano.pageSize || 100);
  var src = gridPlano.filtered !== null ? gridPlano.filtered : gridPlano.allData;
  for (var ri = 0; ri < rows.length; ri++) {
    var tr = rows[ri];
    var dados = (src && src[from + ri]) || [];
    [3, 4].forEach(function(ci) {
      var td = tr.cells[ci + 1];
      if (!td) return;
      var val = dados[ci] || '';
      td.innerHTML = window._dreRenderToggleHtml(ci, val);
    });
  }
}

/** Recalcula colunas auto (S_E, GRUPO, STATUS, DIA, MÊS, DIA_SEM, ANO, VENC, SEMANA_ANO, ULTIMO_DIA_DO_MES, CNPJ_2, safra, CICLO) na grade BD. */
function _dreAtualizarDerivadasBD(gridBD) {
  var SE_MAP   = DRE.SE_POR_GRUPO;
  var MESES    = DRE.MESES;
  var DIAS_SEM = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  var idx = new Map();
  DRE.estado.plano.forEach(function(c) {
    idx.set(String(c.conta || '').trim().toLowerCase(), c);
  });

  var hoje = new Date(); hoje.setHours(0,0,0,0);
  var data = gridBD.allData;
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (!r) continue;

    // CONTA = índice 4
    var conta = String(r[4] || '').trim().toLowerCase();
    var pc = conta ? idx.get(conta) : null;

    // 18: S_E  |  19: GRUPO
    r[19] = pc ? (pc.grupo || '') : (conta ? '#N/A' : '');
    r[18] = pc ? (SE_MAP[pc.grupo] || 'S') : (conta ? '#N/A' : '');

    // DT_CAIXA = índice 1
    var dt = String(r[1] || '');
    var d  = dt ? new Date(dt) : null;
    var ok = d && !isNaN(d);

    r[24] = ok ? d.getFullYear()                  : '';  // ANO
    r[22] = ok ? (MESES[d.getMonth()] || '')      : '';  // MÊS
    r[21] = ok ? d.getDate()                       : '';  // DIA
    r[23] = ok ? (DIAS_SEM[d.getDay()] || '')     : '';  // DIA_SEM
    r[29] = ok ? d.getFullYear()                  : '';  // safra

    // SEMANA_ANO
    if (ok) {
      var jan1 = new Date(d.getFullYear(), 0, 1);
      r[26] = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    } else {
      r[26] = '';
    }

    // ULTIMO_DIA_DO_MES
    r[27] = ok ? new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() : '';

    // DT_VENC = índice 2
    var dtv = String(r[2] || '');
    var dv  = dtv ? new Date(dtv) : null;
    var okv = dv && !isNaN(dv);
    if (okv) {
      dv.setHours(0,0,0,0);
      r[25] = dv < hoje ? 'VENCIDO' : 'NO PRAZO';  // VENC
    } else {
      r[25] = '';
    }

    // 20: STATUS — DT_PAG = índice 3
    r[20] = r[4] ? (r[3] ? 'PG' : 'N') : '';

    // 28: CNPJ_2 — copia CNPJ (índice 15)
    r[28] = r[15] || '';

    // 30: CICLO — dias entre DT_CAIXA e DT_VENC
    r[30] = (ok && okv) ? Math.round((dv - d) / 86400000) : '';
  }
  gridBD._render();
}

/** Intercepta _commit, _pasteAt e _paste para disparar callback após cada mudança. */
function _drePatchGrid(grid, cb) {
  var origCommit  = grid._commit.bind(grid);
  var origPasteAt = grid._pasteAt.bind(grid);
  var origPaste   = grid._paste.bind(grid);

  grid._commit = function() { origCommit(); cb(); };
  grid._pasteAt = function(txt, r, c) { origPasteAt(txt, r, c); cb(); };
  grid._paste   = function(txt)       { origPaste(txt); cb(); };
}

/** Objeto plano -> array de células (mesma ordem de GRID_DEFS dre_plano). */
function _drePlanoToRows(plano) {
  return (plano || []).map(function(p) {
    return [p.cod || '', p.conta || '', p.grupo || '', p.fv || '', p.di || ''];
  });
}

/** Array de linhas da grade -> array de objetos plano. */
function _drePlanoDeRows(rows) {
  return rows.map(function(r) {
    return { cod: r[0] || '', conta: r[1] || '', grupo: r[2] || '', fv: r[3] || '', di: r[4] || '' };
  });
}

/** Objeto lançamento -> array (18 colunas editáveis + 13 derivadas vazias). */
function _dreRowsBD(lancs) {
  return (lancs || []).map(function(l) {
    return [
      l.id           || '',                                  // 0:  ID
      l.dt_caixa     || '',                                  // 1:  DT_CAIXA
      l.dt_venc      || '',                                  // 2:  DT_VENC
      l.dt_pag       || '',                                  // 3:  DT_PAG
      l.conta        || '',                                  // 4:  CONTA
      l.tipo         || '',                                  // 5:  TIPO
      l.valor     != null ? l.valor     : '',                // 6:  VALOR
      l.tot_pago  != null ? l.tot_pago  : '',                // 7:  TOT_PAGO
      l.parceiro     || '',                                  // 8:  FORNECEDOR CLIENTE
      l.documento    || '',                                  // 9:  N_DOC
      l.banco        || '',                                  // 10: BANCO
      l.forma        || '',                                  // 11: FORMA
      l.parcela      || '',                                  // 12: PARCELA
      l.tot_parcelas || '',                                  // 13: TOT_PARCELAS
      l.obs          || '',                                  // 14: OBS
      l.cnpj         || '',                                  // 15: CNPJ
      l.dt_custoria  || '',                                  // 16: DT CUSTORIA
      l.historico    || '',                                  // 17: Histórico
      '', '', '', '', '', '', '', '', '', '', '', '', ''     // 18-30: auto
    ];
  });
}

/** Array de linhas da grade -> array de objetos lançamento (filtra sem CONTA+DT_CAIXA). */
function _dreLancDeRows(rows) {
  var cnpj = DRE.estado.cnpj;
  return rows
    .filter(function(r) { return r[4] && r[1]; })  // CONTA(4) + DT_CAIXA(1)
    .map(function(r) {
      return {
        conta:        r[4]  || '',
        dt_caixa:     r[1]  || '',
        dt_venc:      r[2]  || null,
        dt_pag:       r[3]  || null,
        tipo:         r[5]  || null,
        valor:        (r[6]  !== '' && r[6]  !== null) ? Number(r[6])  : null,
        tot_pago:     (r[7]  !== '' && r[7]  !== null) ? Number(r[7])  : null,
        parceiro:     r[8]  || null,
        documento:    r[9]  || null,
        banco:        r[10] || null,
        forma:        r[11] || null,
        parcela:      r[12] || null,
        tot_parcelas: r[13] || null,
        obs:          r[14] || null,
        cnpj:         r[15] || cnpj,
        dt_custoria:  r[16] || null,
        historico:    r[17] || null
      };
    });
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

  // Fecha módulo de cliente ativo se houver
  if (typeof MODULO_ATIVO !== 'undefined' && MODULO_ATIVO && MODULO_ATIVO !== 'dre') {
    if (typeof _fecharModulo === 'function') _fecharModulo(MODULO_ATIVO);
  }
  MODULO_ATIVO = 'dre';
  if (typeof dreAbrir === 'function') dreAbrir({ empresaIdPreview: companyId });
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
