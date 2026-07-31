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

var DRE_HTML_URL = 'views/dre-painel.html?v=3';
var DRE_CSS_URL  = 'css/dre-painel.css?v=1';

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
