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
// FONTE DE DADOS — hoje sao os JSON de exemplo da entrega (assets/dre/). Para
// ligar no banco basta trocar _dreCarregarDados(): o motor so precisa receber
// { plano, lancamentos } com a forma documentada em docs/MODULO-DRE.md.
// =============================================================================

var DRE_MONTADO = false;
var DRE_ADMIN_PREVIEW = false;
var DRE_ADMIN_PREVIEW_COMPANY = null;

var DRE_HTML_URL  = 'views/dre-painel.html?v=1';
var DRE_CSS_URL   = 'css/dre-painel.css?v=1';
var DRE_PLANO_URL = 'assets/dre/plano_contas.json?v=1';
var DRE_BD_URL    = 'assets/dre/bd_lancamentos.json?v=1';

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
 * Entrega { plano, lancamentos } para o motor.
 *
 * FASE ATUAL: JSON de exemplo da entrega, iguais para toda empresa.
 * FASE BANCO: trocar por leitura de fin_plano_contas e fin_lancamentos via
 * /api/secure-proxy, sempre com filtro empresa_id — ver docs/MODULO-DRE.md.
 */
async function _dreCarregarDados() {
  var respostas = await Promise.all([
    fetch(DRE_PLANO_URL),
    fetch(DRE_BD_URL)
  ]);

  respostas.forEach(function(r) {
    if (!r.ok) throw new Error('Falha ao carregar os dados do DRE (HTTP ' + r.status + ').');
  });

  var dados = await Promise.all(respostas.map(function(r) { return r.json(); }));

  return {
    plano:       Array.isArray(dados[0]) ? dados[0] : [],
    lancamentos: Array.isArray(dados[1]) ? dados[1] : []
  };
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

    var dados = await _dreCarregarDados();

    DRE.init({
      plano:       dados.plano,
      lancamentos: dados.lancamentos,
      empresa:     _dreNomeEmpresa(),
      cnpj:        1,
      ano:         null
    });

    _dreAplicarHeader();

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

/**
 * Atalho do menu do console admin ("Resultado (DRE)").
 *
 * O super_admin cai no console apos o login, nao no painel do cliente, e o
 * seletor de modulos so existe dentro do painel do cliente. Sem esta porta o
 * DRE so seria alcancavel entrando no preview de alguma empresa.
 */
function dreAbrirDoAdmin() {
  if (typeof SESSION === 'undefined' || !SESSION || SESSION.papel !== 'super_admin') return;
  if (typeof abrirModulo === 'function') { abrirModulo('dre'); return; }
  dreAbrir({});
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
