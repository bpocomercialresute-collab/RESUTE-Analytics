// =============================================================================
// FINANCEIRO — CORE (FASE 1: espaco reservado)
// =============================================================================
// Boot do modulo, estado e carga de dados.
//
// FASE 1  : abre a view e mostra o estado "em construcao". Nao le banco.
// FASE 2  : trocar finCarregarDados() pela leitura real via /api/secure-proxy,
//           SEMPRE filtrando empresa_id da sessao, e marcar
//           MODULO_META.financeiro.disponivel = true em js/modulos.js.
//
// Prefixos reservados deste modulo: fin- (CSS/IDs) e financeiro*/fin* (funcoes).
// Nao colidir com dc-, av-, relat-.
// =============================================================================

var FIN_RAW  = [];    // dados crus vindos do banco
var FIN_DATA = [];    // dados apos filtro de periodo
var FIN_CHARTS = {};  // instancias Chart.js — destruidas em financeiroDestruir()
var FIN_ACTIVE_COMPANY = '';
var FIN_IS_LOADING = false;
var FIN_LOAD_SEQUENCE = 0;
var FIN_ABORT_CONTROLLER = null;
var FIN_ADMIN_PREVIEW = false;
var FIN_ADMIN_PREVIEW_COMPANY = null;

/** Recorte de período em uso. Lido dos filtros do header. */
var FIN_FILTROS = { ano: 0, mes: 0, inicio: '', fim: '' };

var FIN_MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── ABRE O PAINEL FINANCEIRO ─────────────────────────────────────────────────

/**
 * @param {object} [opts] { empresaIdPreview } — preview supervisionado do super_admin
 */
function financeiroAbrir(opts) {
  opts = opts || {};
  if (typeof _touchSession === 'function') _touchSession();

  var empresaIdPreview = opts.empresaIdPreview || null;
  var previewAdmin = !!(typeof SESSION !== 'undefined' && SESSION
    && SESSION.papel === 'super_admin' && empresaIdPreview);

  FIN_ADMIN_PREVIEW = previewAdmin;
  FIN_ADMIN_PREVIEW_COMPANY = previewAdmin
    ? (typeof ADMIN_PREVIEW_COMPANIES !== 'undefined' ? (ADMIN_PREVIEW_COMPANIES || []) : [])
        .find(function(item) { return item.empresa_id === empresaIdPreview; }) || null
    : null;

  document.body.classList.remove('bpo-admin-mode');

  // Esconde login, layout admin e o painel comercial
  var lp = document.getElementById('view-login-page');
  if (lp) lp.style.display = 'none';
  ['sidebar', 'cui-wrapper', 'view-dash-cliente'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var ov = document.getElementById('sidebar-overlay');
  if (ov) ov.classList.remove('active');

  var view = document.getElementById('view-dash-financeiro');
  if (view) view.style.display = 'flex';

  _finMontarHeader();

  var eid = previewAdmin
    ? empresaIdPreview
    : ((typeof SESSION !== 'undefined' && SESSION)
        ? ((SESSION.empresa_ids && SESSION.empresa_ids[0]) || SESSION.empresa_id)
        : null);

  if (eid) finCarregarDados(eid);
  else finStatus('⚠ Empresa não configurada.');
}

/** Esconde o painel sem destruir o estado (troca de modulo). */
function financeiroFechar() {
  var view = document.getElementById('view-dash-financeiro');
  if (view) view.style.display = 'none';
}

/**
 * Libera recursos do modulo. Destruir os graficos aqui e obrigatorio:
 * sem isso o Chart.js vaza memoria a cada alternancia de modulo.
 */
function financeiroDestruir() {
  financeiroFechar();
  FIN_LOAD_SEQUENCE += 1;
  if (FIN_ABORT_CONTROLLER) {
    try { FIN_ABORT_CONTROLLER.abort(); } catch (e) {}
    FIN_ABORT_CONTROLLER = null;
  }
  Object.keys(FIN_CHARTS || {}).forEach(function(key) {
    try {
      if (FIN_CHARTS[key] && typeof FIN_CHARTS[key].destroy === 'function') FIN_CHARTS[key].destroy();
    } catch (e) {}
    delete FIN_CHARTS[key];
  });
  FIN_CHARTS = {};
  FIN_RAW = [];
  FIN_DATA = [];
  FIN_ACTIVE_COMPANY = '';
  FIN_IS_LOADING = false;
  FIN_ADMIN_PREVIEW = false;
  FIN_ADMIN_PREVIEW_COMPANY = null;
}

// ── HEADER ───────────────────────────────────────────────────────────────────

function _finMontarHeader() {
  var previewAdmin = FIN_ADMIN_PREVIEW;
  var empresaPreview = FIN_ADMIN_PREVIEW_COMPANY;

  var badge = document.getElementById('fin-empresa');
  if (badge) {
    badge.textContent = (empresaPreview && empresaPreview.nome)
      || ((typeof SESSION !== 'undefined' && SESSION) ? SESSION.empresa_nome : '')
      || 'Empresa';
  }

  var logo = document.querySelector('#view-dash-financeiro .fin-client-logo');
  if (logo) {
    var slug = String((empresaPreview && empresaPreview.slug)
      || ((typeof SESSION !== 'undefined' && SESSION) ? SESSION.empresa_slug : '')
      || '').toLowerCase();
    var logoSrc = (empresaPreview && empresaPreview.logo_url)
      || ((slug && slug !== 'plastrio' && slug !== 'vm-treino') ? 'assets/' + slug + '-logo.png' : null)
      || 'assets/varremaster-logo.png';
    logo.src = logoSrc;
    logo.alt = (empresaPreview && empresaPreview.nome)
      || ((typeof SESSION !== 'undefined' && SESSION) ? (SESSION.empresa_nome || '') : '')
      || 'Varremaster';
    logo.style.display = '';
    logo.onerror = function() {
      if (this.src.indexOf('varremaster-logo.png') === -1) {
        this.src = 'assets/varremaster-logo.png';
      } else {
        this.style.display = 'none';
      }
    };
  }

  var voltar = document.getElementById('fin-admin-back');
  var previewBadge = document.getElementById('fin-admin-preview-badge');
  if (voltar) voltar.style.display = previewAdmin ? 'inline-flex' : 'none';
  if (previewBadge) previewBadge.style.display = previewAdmin ? 'inline-flex' : 'none';

  if (typeof renderizarSeletorModulos === 'function') renderizarSeletorModulos();
}

function finStatus(msg) {
  var el = document.getElementById('fin-status');
  if (el) el.textContent = msg || '';
}

async function finFetchJson(url, signal, opcional) {
  var resposta = await fetch(url, {
    headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY },
    signal: signal
  });

  if (!resposta.ok) {
    var detalhe = await resposta.text();
    if (opcional) {
      console.warn('[FIN] Fonte opcional indisponivel:', resposta.status, detalhe);
      return [];
    }
    throw new Error(resposta.status === 403
      ? 'Acesso negado aos dados financeiros desta empresa.'
      : ('Falha ao carregar lancamentos (HTTP ' + resposta.status + ').'));
  }

  var json = await resposta.json();
  return Array.isArray(json) ? json : [];
}

// ── CARGA DE DADOS ───────────────────────────────────────────────────────────

/**
 * Le fin_lancamentos da empresa. O proxy exige o filtro empresa_id=eq.<id>;
 * sem ele a requisicao recebe 403 — nao remova.
 *
 * FIN_LOAD_SEQUENCE + FIN_ABORT_CONTROLLER descartam respostas obsoletas
 * quando o usuario troca de empresa no meio da carga.
 */
async function finCarregarDadosAntigo(empresaId) {
  if (!empresaId) { finStatus('⚠ Empresa não configurada.'); return; }

  var sequencia = ++FIN_LOAD_SEQUENCE;
  FIN_ACTIVE_COMPANY = empresaId;
  FIN_IS_LOADING = true;
  finStatus('⏳ Carregando lançamentos...');

  if (FIN_ABORT_CONTROLLER) { try { FIN_ABORT_CONTROLLER.abort(); } catch (e) {} }
  FIN_ABORT_CONTROLLER = new AbortController();

  try {
    var url = SUPA_URL + '/rest/v1/fin_lancamentos'
      + '?empresa_id=eq.' + encodeURIComponent(empresaId)
      + '&select=*&order=data_competencia.desc&limit=100000';

    var resposta = await fetch(url, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY },
      signal: FIN_ABORT_CONTROLLER.signal
    });

    if (sequencia !== FIN_LOAD_SEQUENCE) return; // resposta obsoleta

    if (!resposta.ok) {
      var detalhe = await resposta.text();
      throw new Error(resposta.status === 403
        ? 'Acesso negado aos dados financeiros desta empresa.'
        : ('Falha ao carregar lançamentos (HTTP ' + resposta.status + ').' + (detalhe ? '' : '')));
    }

    var linhas = await resposta.json();
    if (sequencia !== FIN_LOAD_SEQUENCE) return;

    FIN_RAW = Array.isArray(linhas) ? linhas.map(finNormalizarLancamento) : [];
    finStatus(FIN_RAW.length
      ? '✓ ' + FIN_RAW.length.toLocaleString('pt-BR') + ' lançamentos'
      : 'Nenhum lançamento cadastrado.');

    var atualizado = document.getElementById('fin-last-update');
    if (atualizado) atualizado.textContent = 'Atualizado em ' + new Date().toLocaleString('pt-BR');

    finMontarFiltroAno();
    finFiltrarPeriodo();

  } catch (e) {
    if (e && e.name === 'AbortError') return;
    if (sequencia !== FIN_LOAD_SEQUENCE) return;
    console.error('[FIN] Erro ao carregar:', e);
    FIN_RAW = [];
    finStatus('✗ ' + e.message);
    finFiltrarPeriodo();
  } finally {
    if (sequencia === FIN_LOAD_SEQUENCE) FIN_IS_LOADING = false;
  }
}

/**
 * Versao anterior (KPIs/graficos/vencimentos), mantida no arquivo mas fora
 * de uso desde a troca de 2026-09-02 — o cliente passou a ver a aba
 * Resultados do DRE (finCarregarDadosDRE, mais abaixo) em vez deste
 * dashboard. Ver docs/arquivado/financeiro-dashboard-cliente-antigo.html.
 */
async function finCarregarDadosLegado(empresaId) {
  if (!empresaId) { finStatus('Empresa nao configurada.'); return; }

  var sequencia = ++FIN_LOAD_SEQUENCE;
  FIN_ACTIVE_COMPANY = empresaId;
  FIN_IS_LOADING = true;
  finStatus('Carregando lancamentos...');

  if (FIN_ABORT_CONTROLLER) { try { FIN_ABORT_CONTROLLER.abort(); } catch (e) {} }
  FIN_ABORT_CONTROLLER = new AbortController();

  try {
    var filtroEmpresa = '?empresa_id=eq.' + encodeURIComponent(empresaId);
    var urlManual = SUPA_URL + '/rest/v1/fin_lancamentos'
      + filtroEmpresa
      + '&select=*&order=data_competencia.desc&limit=100000';
    var urlDre = SUPA_URL + '/rest/v1/fin_dre_lancamentos'
      + filtroEmpresa
      + '&select=*&order=dt_caixa.desc&limit=100000';
    var urlPlano = SUPA_URL + '/rest/v1/fin_dre_plano_contas'
      + filtroEmpresa
      + '&select=conta,grupo,fv,di&limit=100000';

    var respostas = await Promise.all([
      finFetchJson(urlManual, FIN_ABORT_CONTROLLER.signal, false),
      finFetchJson(urlDre, FIN_ABORT_CONTROLLER.signal, true),
      finFetchJson(urlPlano, FIN_ABORT_CONTROLLER.signal, true)
    ]);
    if (sequencia !== FIN_LOAD_SEQUENCE) return;

    var linhasManual = respostas[0];
    var linhasDre = respostas[1];
    var planoDre = finMontarMapaPlanoDRE(respostas[2]);
    var normalizadosDre = linhasDre.map(function(l) {
      return finNormalizarLancamentoDRE(l, planoDre);
    }).filter(Boolean);

    FIN_RAW = normalizadosDre.length
      ? normalizadosDre
      : linhasManual.map(finNormalizarLancamento);

    var origem = normalizadosDre.length ? 'DRE' : 'manual';
    finStatus(FIN_RAW.length
      ? String.fromCharCode(10003) + ' ' + FIN_RAW.length.toLocaleString('pt-BR') + ' lancamentos (' + origem + ')'
      : 'Nenhum lancamento cadastrado.');

    var atualizado = document.getElementById('fin-last-update');
    if (atualizado) atualizado.textContent = 'Atualizado em ' + new Date().toLocaleString('pt-BR');

    finMontarFiltroAno();
    finFiltrarPeriodo();

  } catch (e) {
    if (e && e.name === 'AbortError') return;
    if (sequencia !== FIN_LOAD_SEQUENCE) return;
    console.error('[FIN] Erro ao carregar:', e);
    FIN_RAW = [];
    finStatus('Erro: ' + e.message);
    finFiltrarPeriodo();
  } finally {
    if (sequencia === FIN_LOAD_SEQUENCE) FIN_IS_LOADING = false;
  }
}

/**
 * Carrega o financeiro do cliente mostrando a mesma aba Resultados do DRE
 * que o admin usa (motor js/dre/dre-engine.js, objeto global DRE).
 * Mesmas tabelas fin_dre_plano_contas / fin_dre_lancamentos que o painel
 * DRE do admin le — mesmo mecanismo de leitura ja usado por
 * finCarregarDadosLegado logo acima (fetch monkey-patched em auth.js
 * redireciona pra /api/secure-proxy, que exige empresa_id=eq.<id> em
 * toda tabela fin_*). Escrita continua bloqueada pro cliente no proprio
 * secure-proxy (so super_admin pode alterar dado financeiro) — o cliente
 * so ve, nao edita.
 */
var FIN_RESUMO_LISTENERS_LIGADOS = false;

async function finCarregarDados(empresaId) {
  if (!empresaId) { finStatus('Empresa nao configurada.'); return; }

  var sequencia = ++FIN_LOAD_SEQUENCE;
  FIN_ACTIVE_COMPANY = empresaId;
  FIN_IS_LOADING = true;
  finStatus('Carregando...');

  if (FIN_ABORT_CONTROLLER) { try { FIN_ABORT_CONTROLLER.abort(); } catch (e) {} }
  FIN_ABORT_CONTROLLER = new AbortController();

  try {
    var qs = '?empresa_id=eq.' + encodeURIComponent(empresaId) + '&select=*&limit=100000';
    var respostas = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/fin_dre_plano_contas' + qs,
        { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }, signal: FIN_ABORT_CONTROLLER.signal }),
      fetch(SUPA_URL + '/rest/v1/fin_dre_lancamentos' + qs + '&order=dt_caixa.desc',
        { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }, signal: FIN_ABORT_CONTROLLER.signal })
    ]);
    if (sequencia !== FIN_LOAD_SEQUENCE) return;

    for (var i = 0; i < respostas.length; i++) {
      if (!respostas[i].ok) throw new Error(respostas[i].status === 403
        ? 'Acesso negado aos dados do DRE desta empresa.'
        : ('Falha ao carregar os dados do DRE (HTTP ' + respostas[i].status + ').'));
    }

    var dados = await Promise.all(respostas.map(function(r) { return r.json(); }));
    if (sequencia !== FIN_LOAD_SEQUENCE) return;

    var plano = Array.isArray(dados[0]) ? dados[0] : [];
    var lancamentos = (Array.isArray(dados[1]) ? dados[1] : []).map(function(l) {
      return Object.assign({}, l, { cnpj: 1 }); // ver DRE.init(): sempre cnpj fixo, multiempresa ja e por empresa_id
    });

    if (typeof _dreInjetarCSS === 'function') await _dreInjetarCSS();
    if (typeof DRE === 'undefined') throw new Error('Motor do DRE (js/dre/dre-engine.js) nao carregou.');

    DRE.init({
      plano: plano,
      lancamentos: lancamentos,
      empresa: (typeof SESSION !== 'undefined' && SESSION) ? SESSION.empresa_nome : '',
      cnpj: 1,
      ano: null
    });

    _finLigarResumoFiltroDRE();
    finAtualizarResumoFiltroDRE();

    finStatus(lancamentos.length
      ? String.fromCharCode(10003) + ' ' + lancamentos.length.toLocaleString('pt-BR') + ' lancamentos'
      : 'Nenhum lancamento cadastrado.');

    var atualizado = document.getElementById('fin-last-update');
    if (atualizado) atualizado.textContent = 'Atualizado em ' + new Date().toLocaleString('pt-BR');

  } catch (e) {
    if (e && e.name === 'AbortError') return;
    if (sequencia !== FIN_LOAD_SEQUENCE) return;
    console.error('[FIN] Erro ao carregar DRE:', e);
    finStatus('Erro: ' + e.message);
  } finally {
    if (sequencia === FIN_LOAD_SEQUENCE) FIN_IS_LOADING = false;
  }
}

/** Liga uma unica vez: mantem o chip recolhido do mobile sincronizado com
 *  o filtro de ano/mes do proprio DRE (que ja tem seu handler de recalculo
 *  via DRE.init -> montarFiltros — este listener so atualiza o texto do
 *  chip, nao recalcula nada, entao coexiste sem conflito). */
function _finLigarResumoFiltroDRE() {
  if (FIN_RESUMO_LISTENERS_LIGADOS) return;
  FIN_RESUMO_LISTENERS_LIGADOS = true;
  ['fin-filtro-ano', 'fin-filtro-mes'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', finAtualizarResumoFiltroDRE);
  });
  var btn = document.getElementById('fin-btn-atualizar');
  if (btn) btn.addEventListener('click', finAtualizarResumoFiltroDRE);
}

function finAtualizarResumoFiltroDRE() {
  var el = document.getElementById('fin-filtro-resumo-texto');
  if (!el) return;
  var selAno = document.getElementById('fin-filtro-ano');
  var selMes = document.getElementById('fin-filtro-mes');
  var ano = selAno ? parseInt(selAno.value, 10) || 0 : 0;
  var mes = selMes && selMes.value !== '' ? parseInt(selMes.value, 10) : null;
  var partes = [];
  if (mes !== null && ano) partes.push(MESES[mes] + '/' + ano);
  else if (ano) partes.push(String(ano));
  else partes.push('Todos os períodos');
  el.textContent = partes.join(' · ');
}

/** Normaliza tipos vindos do banco (numeric chega como string). */
function finNormalizarLancamento(linha) {
  return {
    id:               linha.id,
    tipo:             String(linha.tipo || '').toLowerCase(),
    descricao:        linha.descricao || '',
    parceiro:         linha.parceiro || '',
    documento:        linha.documento || '',
    categoria:        linha.categoria || 'Sem categoria',
    valor:            Number(linha.valor) || 0,
    data_competencia: linha.data_competencia || null,
    data_vencimento:  linha.data_vencimento || linha.data_competencia || null,
    data_pagamento:   linha.data_pagamento || null,
    status:           String(linha.status || 'previsto').toLowerCase(),
    origem:           linha.origem || 'manual'
  };
}

// ── HELPERS DE LANCAMENTO ────────────────────────────────────────────────────

function finMontarMapaPlanoDRE(plano) {
  var mapa = {};
  (plano || []).forEach(function(item) {
    var conta = String(item.conta || '').trim().toLowerCase();
    if (!conta) return;
    mapa[conta] = {
      grupo: item.grupo || '',
      fv: item.fv || '',
      di: item.di || ''
    };
  });
  return mapa;
}

function finNormalizarLancamentoDRE(linha, planoDre) {
  if (!linha || !linha.dt_caixa) return null;

  var conta = linha.conta || 'Sem conta';
  var plano = planoDre[String(conta).trim().toLowerCase()] || {};
  var grupo = plano.grupo || linha.grupo || conta;
  var bruto = Number(linha.valor);
  if (!Number.isFinite(bruto)) bruto = Number(linha.tot_pago) || 0;
  if (!bruto) return null;

  var tipo = finTipoDRE(grupo, linha.tipo, bruto);
  if (!tipo) return null;

  var pago = Number(linha.tot_pago);
  var valor = linha.dt_pag && Number.isFinite(pago) && pago > 0 ? pago : bruto;
  var status = linha.dt_pag || (Number.isFinite(pago) && Math.abs(pago) >= Math.abs(bruto))
    ? 'pago'
    : 'previsto';

  return {
    id:               linha.id,
    tipo:             tipo,
    descricao:        conta,
    parceiro:         linha.parceiro || '',
    documento:        linha.documento || '',
    categoria:        grupo || conta,
    valor:            Math.abs(Number(valor) || 0),
    data_competencia: linha.dt_caixa || null,
    data_vencimento:  linha.dt_venc || linha.dt_caixa || null,
    data_pagamento:   linha.dt_pag || null,
    status:           status,
    origem:           'dre'
  };
}

function finTipoDRE(grupo, tipoOriginal, valor) {
  var textoTipo = String(tipoOriginal || '').toLowerCase();
  if (textoTipo.indexOf('rece') !== -1 || textoTipo.indexOf('entrada') !== -1) return 'receita';
  if (textoTipo.indexOf('desp') !== -1 || textoTipo.indexOf('saida') !== -1 || textoTipo.indexOf('sa\u00edda') !== -1) return 'despesa';

  var mapa = (typeof DRE !== 'undefined' && DRE.SE_POR_GRUPO) ? DRE.SE_POR_GRUPO : {};
  var se = mapa[grupo] || '';
  if (se === 'E') return 'receita';
  if (se === 'S') return 'despesa';

  var grupoNormalizado = String(grupo || '').toUpperCase();
  if (grupoNormalizado.indexOf('RECEITA') !== -1 || grupoNormalizado.indexOf('FATURAMENTO') !== -1) return 'receita';
  if (grupoNormalizado.indexOf('CUSTO') !== -1 || grupoNormalizado.indexOf('DESP') !== -1 || grupoNormalizado.indexOf('INVEST') !== -1) return 'despesa';

  return Number(valor) < 0 ? 'despesa' : 'receita';
}

function finEhReceita(l)  { return l.tipo === 'receita'; }
function finEhDespesa(l)  { return l.tipo === 'despesa'; }
function finEhPago(l)     { return l.status === 'pago'; }
function finEhCancelado(l){ return l.status === 'cancelado'; }
function finEhAberto(l)   { return l.status === 'previsto'; }

/** Vencido e derivado, nunca lido do banco: em aberto com vencimento no passado. */
function finEstaVencido(l) {
  if (!finEhAberto(l) || !l.data_vencimento) return false;
  return finDataParaTempo(l.data_vencimento) < finHojeTempo();
}

function finHojeTempo() {
  var hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
}

/** Converte 'YYYY-MM-DD' em timestamp local, sem o deslocamento de fuso do ISO. */
function finDataParaTempo(iso) {
  if (!iso) return 0;
  var p = String(iso).slice(0, 10).split('-');
  if (p.length !== 3) return 0;
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime();
}

/** Rótulo de status para as tabelas, já considerando o vencimento. */
function finStatusLabel(l) {
  if (finEhCancelado(l)) return 'Cancelado';
  if (finEhPago(l)) return 'Pago';
  if (finEstaVencido(l)) return 'Vencido';
  return 'Em aberto';
}

function finSomar(lista, filtro) {
  return lista.reduce(function(total, l) {
    return filtro(l) ? total + l.valor : total;
  }, 0);
}

// ── FILTROS DE PERIODO ───────────────────────────────────────────────────────

/** Lê os filtros do header e reprocessa o recorte. */
function finFiltrarPeriodo() {
  FIN_FILTROS = {
    ano:    parseInt((document.getElementById('fin-filtro-ano') || {}).value || '0', 10) || 0,
    mes:    parseInt((document.getElementById('fin-filtro-mes') || {}).value || '0', 10) || 0,
    inicio: String((document.getElementById('fin-filtro-inicio') || {}).value || ''),
    fim:    String((document.getElementById('fin-filtro-fim') || {}).value || '')
  };

  FIN_DATA = FIN_RAW.filter(finDentroDoPeriodo);

  if (typeof finRenderizar === 'function') finRenderizar();
  finAtualizarResumoFiltro();
}

function finToggleFiltrosMobile() {
  var grupo = document.getElementById('fin-filtros-grupo');
  var btn = document.getElementById('fin-filtro-resumo');
  if (!grupo || !btn) return;
  var aberto = grupo.classList.toggle('aberto');
  btn.setAttribute('aria-expanded', aberto ? 'true' : 'false');
}

function finAtualizarResumoFiltro() {
  var el = document.getElementById('fin-filtro-resumo-texto');
  if (!el) return;
  var ano = FIN_FILTROS.ano || 0;
  var mes = FIN_FILTROS.mes || 0;
  var partes = [];
  if (mes && ano) partes.push(MESES[mes - 1] + '/' + ano);
  else if (ano) partes.push(String(ano));
  else partes.push('Todos os períodos');
  el.textContent = partes.join(' · ');
}

/**
 * Recorte por data_competencia. O intervalo explícito (início/fim) tem
 * prioridade sobre ano/mês — mesmo comportamento do painel comercial.
 */
function finDentroDoPeriodo(l) {
  var quando = finDataParaTempo(l.data_competencia);
  if (!quando) return false;

  if (FIN_FILTROS.inicio || FIN_FILTROS.fim) {
    if (FIN_FILTROS.inicio && quando < finDataParaTempo(FIN_FILTROS.inicio)) return false;
    if (FIN_FILTROS.fim    && quando > finDataParaTempo(FIN_FILTROS.fim))    return false;
    return true;
  }

  var data = new Date(quando);
  if (FIN_FILTROS.ano && data.getFullYear() !== FIN_FILTROS.ano) return false;
  if (FIN_FILTROS.mes && (data.getMonth() + 1) !== FIN_FILTROS.mes) return false;
  return true;
}

/** Texto legível do recorte, mostrado abaixo do título. */
function finPeriodoDescricao() {
  if (FIN_FILTROS.inicio && FIN_FILTROS.fim) {
    return 'Período: ' + finFormatarData(FIN_FILTROS.inicio) + ' até ' + finFormatarData(FIN_FILTROS.fim);
  }
  if (!FIN_FILTROS.ano) return 'Todos os períodos';
  if (FIN_FILTROS.mes) return FIN_MESES_FULL[FIN_FILTROS.mes - 1] + ' de ' + FIN_FILTROS.ano;
  return 'Ano de ' + FIN_FILTROS.ano;
}

function finFormatarData(iso) {
  if (!iso) return '';
  var partes = String(iso).slice(0, 10).split('-');
  if (partes.length !== 3) return String(iso);
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

/** Popula o seletor de ano a partir dos dados carregados. */
function finMontarFiltroAno() {
  var sel = document.getElementById('fin-filtro-ano');
  if (!sel) return;

  var anterior = sel.value;
  var anos = [];
  FIN_RAW.forEach(function(l) {
    var quando = finDataParaTempo(l.data_competencia);
    if (!quando) return;
    var ano = new Date(quando).getFullYear();
    if (anos.indexOf(ano) === -1) anos.push(ano);
  });
  anos.sort(function(a, b) { return b - a; });

  sel.innerHTML = '<option value="0">Todos os anos</option>'
    + anos.map(function(ano) { return '<option value="' + ano + '">' + ano + '</option>'; }).join('');

  // Mantém a escolha do usuário; senão abre no ano mais recente
  if (anterior && anos.indexOf(Number(anterior)) !== -1) sel.value = anterior;
  else if (anos.length) sel.value = String(anos[0]);
}

// ── CALCULOS ─────────────────────────────────────────────────────────────────

function finFormatarMoedaCurta(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0, maximumFractionDigits: 0
  });
}

/**
 * @param {object} kpi item de FIN_KPIS
 * @returns {{valor:number, detalhe:string}|null}
 */
function finCalcularKpi(kpi) {
  if (!FIN_DATA.length) return null;

  var vigentes = FIN_DATA.filter(function(l) { return !finEhCancelado(l); });

  var aReceber = finSomar(vigentes, function(l) { return finEhReceita(l) && finEhAberto(l); });
  var aPagar   = finSomar(vigentes, function(l) { return finEhDespesa(l) && finEhAberto(l); });
  var recebido = finSomar(vigentes, function(l) { return finEhReceita(l) && finEhPago(l); });
  var pago     = finSomar(vigentes, function(l) { return finEhDespesa(l) && finEhPago(l); });

  switch (kpi.id) {
    case 'receber': {
      var vencidoReceber = finSomar(vigentes, function(l) { return finEhReceita(l) && finEstaVencido(l); });
      return {
        valor: aReceber,
        detalhe: vencidoReceber > 0
          ? finFormatarMoedaCurta(vencidoReceber) + ' já vencido'
          : 'Nenhum título vencido.'
      };
    }
    case 'pagar': {
      var vencidoPagar = finSomar(vigentes, function(l) { return finEhDespesa(l) && finEstaVencido(l); });
      return {
        valor: aPagar,
        detalhe: vencidoPagar > 0
          ? finFormatarMoedaCurta(vencidoPagar) + ' em atraso'
          : 'Nenhum compromisso em atraso.'
      };
    }
    case 'saldo': {
      var saldo = (recebido + aReceber) - (pago + aPagar);
      return {
        valor: saldo,
        detalhe: saldo >= 0 ? 'Previsão positiva no período.' : 'Saídas superam as entradas.'
      };
    }
    case 'recebido':
      return { valor: recebido, detalhe: 'Baixas confirmadas no período.' };

    case 'pago':
      return { valor: pago, detalhe: 'Pagamentos confirmados no período.' };

    case 'inadimplencia': {
      var totalReceita = finSomar(vigentes, finEhReceita);
      if (!totalReceita) return { valor: 0, detalhe: 'Sem receita no período.' };
      var vencido = finSomar(vigentes, function(l) { return finEhReceita(l) && finEstaVencido(l); });
      return {
        valor: (vencido / totalReceita) * 100,
        detalhe: finFormatarMoedaCurta(vencido) + ' vencido de ' + finFormatarMoedaCurta(totalReceita)
      };
    }
  }
  return null;
}

/**
 * @param {string} tabelaId id do container (ver FIN_TABELAS)
 * @returns {Array<Array<string|number>>} linhas na ordem das colunas
 */
function finLinhasTabela(tabelaId) {
  if (!FIN_DATA.length) return [];
  var vigentes = FIN_DATA.filter(function(l) { return !finEhCancelado(l); });

  if (tabelaId === 'fin-tab-categorias') return finLinhasCategorias(vigentes);
  if (tabelaId === 'fin-tab-receber')    return finLinhasTitulos(vigentes, 'receita');
  if (tabelaId === 'fin-tab-pagar')      return finLinhasTitulos(vigentes, 'despesa');
  if (tabelaId === 'fin-tab-fluxo')      return finLinhasFluxo(vigentes);
  if (tabelaId === 'fin-tab-dre')        return finLinhasResultado(vigentes);
  return [];
}

function finLinhasCategorias(lista) {
  var despesas = lista.filter(finEhDespesa);
  var total = finSomar(despesas, function() { return true; });
  if (!total) return [];

  var porCategoria = {};
  despesas.forEach(function(l) {
    porCategoria[l.categoria] = (porCategoria[l.categoria] || 0) + l.valor;
  });

  return Object.keys(porCategoria)
    .sort(function(a, b) { return porCategoria[b] - porCategoria[a]; })
    .slice(0, 20)
    .map(function(categoria) {
      var valor = porCategoria[categoria];
      return [
        categoria,
        finFormatarMoedaCurta(valor),
        ((valor / total) * 100).toFixed(1).replace('.', ',') + '%'
      ];
    });
}

function finLinhasTitulos(lista, tipo) {
  return lista
    .filter(function(l) { return l.tipo === tipo; })
    .sort(function(a, b) { return finDataParaTempo(a.data_vencimento) - finDataParaTempo(b.data_vencimento); })
    .slice(0, 500)
    .map(function(l) {
      return [
        finFormatarData(l.data_vencimento),
        l.parceiro || '—',
        l.documento || '—',
        finFormatarMoedaCurta(l.valor),
        finStatusLabel(l)
      ];
    });
}

function finLinhasFluxo(lista) {
  var saldo = 0;
  return lista
    .slice()
    .sort(function(a, b) { return finDataParaTempo(a.data_competencia) - finDataParaTempo(b.data_competencia); })
    .slice(0, 500)
    .map(function(l) {
      var entrada = finEhReceita(l) ? l.valor : 0;
      var saida   = finEhDespesa(l) ? l.valor : 0;
      saldo += entrada - saida;
      return [
        finFormatarData(l.data_competencia),
        l.descricao || l.parceiro || '—',
        l.categoria,
        entrada ? finFormatarMoedaCurta(entrada) : '—',
        saida ? finFormatarMoedaCurta(saida) : '—',
        finFormatarMoedaCurta(saldo)
      ];
    });
}

function finLinhasResultado(lista) {
  var receita = finSomar(lista, finEhReceita);
  if (!receita && !finSomar(lista, finEhDespesa)) return [];
  var despesa = finSomar(lista, finEhDespesa);
  var resultado = receita - despesa;

  function percentual(valor) {
    if (!receita) return '—';
    return ((valor / receita) * 100).toFixed(1).replace('.', ',') + '%';
  }

  return [
    ['Receita do período',  finFormatarMoedaCurta(receita),   percentual(receita)],
    ['Despesas do período', finFormatarMoedaCurta(despesa),   percentual(despesa)],
    ['Resultado',           finFormatarMoedaCurta(resultado), percentual(resultado)]
  ];
}

/** @returns {Array<{tipo:string, titulo:string, detalhe:string}>} */
function finCalcularAlertas() {
  if (!FIN_DATA.length) return [];
  var vigentes = FIN_DATA.filter(function(l) { return !finEhCancelado(l); });
  var alertas = [];

  var receitaVencida = vigentes.filter(function(l) { return finEhReceita(l) && finEstaVencido(l); });
  if (receitaVencida.length) {
    alertas.push({
      tipo: 'negativo',
      titulo: 'Títulos vencidos a receber',
      detalhe: receitaVencida.length + ' título(s), somando '
        + finFormatarMoedaCurta(finSomar(receitaVencida, function() { return true; }))
    });
  }

  var despesaVencida = vigentes.filter(function(l) { return finEhDespesa(l) && finEstaVencido(l); });
  if (despesaVencida.length) {
    alertas.push({
      tipo: 'atencao',
      titulo: 'Compromissos em atraso',
      detalhe: despesaVencida.length + ' conta(s), somando '
        + finFormatarMoedaCurta(finSomar(despesaVencida, function() { return true; }))
    });
  }

  var saldo = finSomar(vigentes, finEhReceita) - finSomar(vigentes, finEhDespesa);
  alertas.push({
    tipo: saldo >= 0 ? 'positivo' : 'negativo',
    titulo: saldo >= 0 ? 'Resultado positivo' : 'Resultado negativo',
    detalhe: 'Entradas menos saídas no período: ' + finFormatarMoedaCurta(saldo)
  });

  // Concentração de receita em um único cliente
  var receitas = vigentes.filter(finEhReceita);
  var totalReceita = finSomar(receitas, function() { return true; });
  if (totalReceita) {
    var porCliente = {};
    receitas.forEach(function(l) {
      var nome = l.parceiro || 'Não informado';
      porCliente[nome] = (porCliente[nome] || 0) + l.valor;
    });
    var maior = Object.keys(porCliente).sort(function(a, b) { return porCliente[b] - porCliente[a]; })[0];
    var fatia = (porCliente[maior] / totalReceita) * 100;
    if (fatia >= 30) {
      alertas.push({
        tipo: 'atencao',
        titulo: 'Receita concentrada',
        detalhe: maior + ' representa ' + fatia.toFixed(1).replace('.', ',') + '% da receita do período.'
      });
    }
  }

  return alertas;
}

// ── SERIES PARA GRAFICOS ─────────────────────────────────────────────────────

/** Agrupa receitas e despesas por mês (AAAA-MM) dentro do recorte. */
function finSerieMensal() {
  var mapa = {};
  FIN_DATA.filter(function(l) { return !finEhCancelado(l); }).forEach(function(l) {
    var quando = finDataParaTempo(l.data_competencia);
    if (!quando) return;
    var data = new Date(quando);
    var chave = data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0');
    if (!mapa[chave]) mapa[chave] = { receita: 0, despesa: 0 };
    if (finEhReceita(l)) mapa[chave].receita += l.valor;
    else mapa[chave].despesa += l.valor;
  });

  var chaves = Object.keys(mapa).sort();
  var acumulado = 0;
  return {
    labels: chaves.map(function(c) {
      var p = c.split('-');
      return FIN_MESES_FULL[Number(p[1]) - 1].slice(0, 3) + '/' + p[0].slice(2);
    }),
    receitas: chaves.map(function(c) { return mapa[c].receita; }),
    despesas: chaves.map(function(c) { return mapa[c].despesa; }),
    saldoAcumulado: chaves.map(function(c) {
      acumulado += mapa[c].receita - mapa[c].despesa;
      return acumulado;
    })
  };
}

/** Distribuição por faixa de vencimento, para os gráficos de aging. */
function finSerieAging(tipo) {
  var faixas = [
    { label: 'A vencer',   min: 0,   max: Infinity, futuro: true },
    { label: 'Até 30d',    min: 0,   max: 30 },
    { label: '31 a 60d',   min: 31,  max: 60 },
    { label: '61 a 90d',   min: 61,  max: 90 },
    { label: 'Mais de 90d',min: 91,  max: Infinity },
    { label: 'Baixado',    min: 0,   max: 0, pago: true }
  ];
  var valores = faixas.map(function() { return 0; });
  var hoje = finHojeTempo();

  FIN_DATA.filter(function(l) {
    return l.tipo === tipo && !finEhCancelado(l);
  }).forEach(function(l) {
    if (finEhPago(l)) { valores[5] += l.valor; return; }

    var vencimento = finDataParaTempo(l.data_vencimento);
    if (!vencimento || vencimento >= hoje) { valores[0] += l.valor; return; }

    var diasAtraso = Math.floor((hoje - vencimento) / 86400000);
    if (diasAtraso <= 30) valores[1] += l.valor;
    else if (diasAtraso <= 60) valores[2] += l.valor;
    else if (diasAtraso <= 90) valores[3] += l.valor;
    else valores[4] += l.valor;
  });

  return { labels: faixas.map(function(f) { return f.label; }), valores: valores };
}

/** Botao "Atualizar" do header. */
async function finAtualizar() {
  var btn = document.getElementById('fin-btn-atualizar');
  if (btn) btn.disabled = true;
  try {
    if (FIN_ACTIVE_COMPANY) await finCarregarDados(FIN_ACTIVE_COMPANY);
  } catch (e) {
    finStatus('✗ ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** Volta ao console admin a partir do preview supervisionado. */
/** Alterna entre as abas "Resultados" e "Laudo Grupo" do financeiro do cliente. */
function finAbrirAbaCliente(paneId, btn) {
  document.querySelectorAll('.fin-tabs-cliente .fin-tab').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.fin-pane-cliente').forEach(function(p) { p.style.display = 'none'; });
  if (btn) btn.classList.add('active');
  var pane = document.getElementById(paneId);
  if (pane) pane.style.display = '';
}

function finVoltarAoAdmin() {
  if (typeof SESSION === 'undefined' || !SESSION || SESSION.papel !== 'super_admin') return;
  financeiroDestruir();
  MODULO_ATIVO = null;
  if (typeof abrirSeletorEmpresasCliente === 'function') abrirSeletorEmpresasCliente();
}
