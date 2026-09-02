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

var DRE_HTML_URL = 'views/dre-painel.html';
var DRE_CSS_URL  = 'css/dre-painel.css';

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
/**
 * Exibe modal de seleção de empresa para super_admin sem empresa_id.
 * Retorna o empresa_id escolhido ou null se o usuário cancelar.
 */
async function _dreEscolherEmpresaAdmin(view) {
  // Tenta usar ADMIN_PREVIEW_COMPANIES já carregado; senão busca do banco.
  var lista = (typeof ADMIN_PREVIEW_COMPANIES !== 'undefined' && ADMIN_PREVIEW_COMPANIES && ADMIN_PREVIEW_COMPANIES.length)
    ? ADMIN_PREVIEW_COMPANIES.map(function(c) { return { id: c.empresa_id, nome: c.nome }; })
    : [];

  if (!lista.length) {
    try {
      var resp = await fetch(SUPA_URL + '/rest/v1/empresas?select=id,nome&ativo=eq.true&order=nome', {
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY }
      });
      if (resp.ok) {
        var arr = await resp.json();
        if (Array.isArray(arr)) lista = arr;
      }
    } catch (_) {}
  }

  if (!lista.length) {
    alert('Nenhuma empresa encontrada. Cadastre uma empresa antes de abrir o DRE.');
    return null;
  }

  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;padding:32px 28px;min-width:320px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.22);font-family:system-ui,sans-serif;';

    var titulo = document.createElement('h2');
    titulo.textContent = 'Selecionar empresa';
    titulo.style.cssText = 'margin:0 0 8px;font-size:1.15rem;color:#0A2F2F;';

    var sub = document.createElement('p');
    sub.textContent = 'Escolha a empresa para abrir o DRE:';
    sub.style.cssText = 'margin:0 0 18px;font-size:.9rem;color:#555;';

    var sel = document.createElement('select');
    sel.style.cssText = 'width:100%;padding:10px 12px;border:1.5px solid #ccc;border-radius:8px;font-size:1rem;margin-bottom:20px;box-sizing:border-box;';
    lista.forEach(function(e) {
      var op = document.createElement('option');
      op.value = e.id;
      op.textContent = e.nome;
      sel.appendChild(op);
    });

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

    var btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancelar';
    btnCancel.style.cssText = 'padding:8px 18px;border:1px solid #ccc;background:#f5f5f5;border-radius:7px;cursor:pointer;font-size:.95rem;';

    var btnOk = document.createElement('button');
    btnOk.textContent = 'Abrir';
    btnOk.style.cssText = 'padding:8px 20px;border:none;background:#14746F;color:#fff;border-radius:7px;cursor:pointer;font-size:.95rem;font-weight:600;';

    btns.appendChild(btnCancel);
    btns.appendChild(btnOk);
    box.appendChild(titulo);
    box.appendChild(sub);
    box.appendChild(sel);
    box.appendChild(btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    btnOk.onclick = function() { document.body.removeChild(overlay); resolve(sel.value); };
    btnCancel.onclick = function() { document.body.removeChild(overlay); resolve(null); };
  });
}

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

    // Super_admin sem empresa selecionada: mostrar seletor antes de carregar.
    if (!eid && typeof SESSION !== 'undefined' && SESSION && SESSION.papel === 'super_admin') {
      var empresaEscolhida = await _dreEscolherEmpresaAdmin(view);
      if (!empresaEscolhida) return; // fechou sem escolher
      eid = empresaEscolhida;
      empresaIdPreview = eid;
      DRE_ADMIN_PREVIEW = true;
    }

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
    _dreLigarExportar();
    _dreLigarDateInputs();
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

function _dreMarcarDirtyPlano() {
  var btn = document.getElementById('fin-dre-salvar-plano');
  if (btn) btn.classList.add('fin-btn-dirty');
}

function _dreLimparDirtyPlano() {
  var btn = document.getElementById('fin-dre-salvar-plano');
  if (btn) btn.classList.remove('fin-btn-dirty');
}

/**
 * Parse de número aceita formato BR (1.234,56) e formato padrão (1234.56).
 * Retorna null para célula vazia; 0 só quando o valor de fato é zero.
 */
function _dreParseNum(v) {
  if (v === '' || v == null) return null;
  var s = String(v).trim().replace(/\s/g, '').replace(/^R\$\s*/, '');
  if (s === '' || s === '-') return null;
  var n = Number(s);
  if (Number.isFinite(n)) return n;
  // Tenta formato BR: "1.234,56" → "1234.56"
  var br = s.replace(/\./g, '').replace(',', '.');
  n = Number(br);
  return Number.isFinite(n) ? n : null;
}

/**
 * Converte datas BR (DD/MM/AAAA) para ISO (AAAA-MM-DD).
 * Formato ISO já passa sem alteração. Outros formatos passam como estão.
 */
function _dreNormalizarData(v) {
  if (!v) return v || null;
  var m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? (m[3] + '-' + m[2] + '-' + m[1]) : String(v);
}

/**
 * Exibe datas no padrão brasileiro (DD/MM/AAAA).
 * Mantém vazio quando a célula está vazia e não força texto inválido.
 */
function _dreDataParaBR(v) {
  if (!v) return '';
  var s = String(v).trim();
  var br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return s;
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
  return s;
}

/**
 * Parse UTC seguro para datas do DRE em BR ou ISO.
 * Evita que o fuso do Brasil jogue a data para o dia anterior.
 */
function _dreParseDataUTC(v) {
  if (!v) return null;
  var s = String(v).trim();
  var br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  var d = new Date(s);
  return isNaN(d) ? null : d;
}

function _dreNormalizarDatasRegistro(r) {
  var out = Object.assign({}, r);
  ['dt_caixa', 'dt_venc', 'dt_pag', 'dt_custoria'].forEach(function(k) {
    if (out[k]) out[k] = _dreNormalizarData(out[k]);
  });
  return out;
}

/** Liga os botões "Salvar no banco" das abas Plano de Contas e BD ao fetch acima. */
function _dreLigarSalvarGrades(empresaId) {
  var btnPlano = document.getElementById('fin-dre-salvar-plano');
  if (btnPlano) {
    btnPlano.onclick = async function() {
      // Sincroniza do grid no momento do clique (evita estado desatualizado).
      if (GRIDS['dre_plano']) DRE.estado.plano = _drePlanoDeRows(GRIDS['dre_plano'].getData());

      var registros = DRE.registrosPlanoParaSalvar();
      if (!registros.length) {
        alert('Nenhuma conta encontrada na grade. Cole os dados do Plano de Contas (Ctrl+V) antes de salvar.');
        return;
      }
      if (!window.confirm('Salvar ' + registros.length + ' conta(s)? Substitui todo o plano atual desta empresa.')) return;

      _dreStatusGrade('fin-dre-status-plano', 'Salvando...', '');
      try {
        var enviados = await _dreSalvarTabela('fin_dre_plano_contas', empresaId,
          registros.map(function(r) { return Object.assign({}, r, { empresa_id: empresaId }); }));
        _dreStatusGrade('fin-dre-status-plano', '✓ ' + enviados.toLocaleString('pt-BR') + ' conta(s) salva(s).', 'ok');
        _dreLimparDirtyPlano();
      } catch (e) {
        console.error('[DRE] Falha ao salvar plano:', e);
        alert('Falha ao salvar Plano de Contas:\n' + e.message);
        _dreStatusGrade('fin-dre-status-plano', 'Falha ao salvar: ' + e.message, 'erro');
      }
    };
  }

  var btnBD = document.getElementById('fin-dre-bd-salvar');
  if (btnBD) {
    btnBD.onclick = async function() {
      // Sincroniza do grid no momento do clique (evita estado desatualizado).
      if (GRIDS['dre_bd']) DRE.estado.lancamentos = _dreLancDeRows(GRIDS['dre_bd'].getData());

      var registros = DRE.registrosBDParaSalvar();
      if (!registros.length) {
        alert('Nenhum lançamento válido encontrado.\n\nVerifique:\n• DT_CAIXA preenchida (1ª coluna)\n• CONTA preenchida (4ª coluna)\n\nCole os dados do BD (Ctrl+V) e tente novamente.');
        return;
      }

      // Aviso crítico: se TODOS os valores forem zero, a importação está errada.
      var todosZero = registros.every(function(r) { return !r.valor || r.valor === 0; });
      if (todosZero) {
        var prosseguir = window.confirm(
          '⚠ ATENÇÃO: todos os ' + registros.length + ' lançamentos têm VALOR = 0.\n\n' +
          'Isso significa que o DRE não vai mostrar nenhum dado.\n\n' +
          'Prováveis causas:\n' +
          '• A coluna VALOR (6ª coluna) está vazia ou com texto\n' +
          '• Os valores estão em outra coluna — verifique o mapeamento\n' +
          '• Valores em formato BR (ex: 1.234,56) — tente trocar vírgula por ponto\n\n' +
          'Deseja salvar mesmo assim?'
        );
        if (!prosseguir) return;
      }

      if (!window.confirm('Salvar ' + registros.length + ' lançamento(s)? Substitui todos os lançamentos atuais desta empresa.')) return;

      _dreStatusGrade('fin-dre-status-bd', 'Salvando...', '');
      try {
        // Normaliza datas BR (DD/MM/AAAA → AAAA-MM-DD) antes de enviar ao banco.
        var lotes = registros.map(function(r) {
          return _dreNormalizarDatasRegistro(Object.assign({}, r, { empresa_id: empresaId }));
        });
        var enviados = await _dreSalvarTabela('fin_dre_lancamentos', empresaId, lotes);
        _dreStatusGrade('fin-dre-status-bd', '✓ ' + enviados.toLocaleString('pt-BR') + ' lançamento(s) salvo(s).', 'ok');
      } catch (e) {
        console.error('[DRE] Falha ao salvar BD:', e);
        alert('Falha ao salvar BD:\n' + e.message);
        _dreStatusGrade('fin-dre-status-bd', 'Falha ao salvar: ' + e.message, 'erro');
      }
    };
  }

  // ── Botão Limpar BD ──────────────────────────────────────────────────────────
  var btnLimparBD = document.getElementById('fin-dre-bd-limpar');
  if (btnLimparBD) {
    btnLimparBD.onclick = async function() {
      if (!window.confirm('Apagar TODOS os lançamentos desta empresa no banco?\nEsta ação não pode ser desfeita.')) return;
      _dreStatusGrade('fin-dre-status-bd', 'Limpando...', '');
      try {
        await _dreSalvarTabela('fin_dre_lancamentos', empresaId, []);
        // Limpa a grade local também
        DRE.estado.lancamentos = [];
        if (GRIDS['dre_bd']) { GRIDS['dre_bd'].allData = []; GRIDS['dre_bd']._render(); }
        DRE.recalcular();
        _dreStatusGrade('fin-dre-status-bd', '✓ BD apagado.', 'ok');
      } catch (e) {
        console.error('[DRE] Falha ao limpar BD:', e);
        alert('Falha ao limpar BD:\n' + e.message);
        _dreStatusGrade('fin-dre-status-bd', 'Falha: ' + e.message, 'erro');
      }
    };
  }

  // ── Botão Exportar ──────────────────────────────────────────────────────────
  var btnExportar = document.getElementById('fin-dre-btn-exportar');
  if (btnExportar) btnExportar.onclick = _dreExportarCSV;

  // ── Importar arquivo na aba BD ───────────────────────────────────────────────
  var inputImportar = document.getElementById('fin-dre-bd-importar');
  if (inputImportar) {
    inputImportar.onchange = function() {
      if (inputImportar.files && inputImportar.files[0]) {
        _dreImportarArquivo(inputImportar.files[0]);
        inputImportar.value = '';
      }
    };
  }

  // ── Botão Limpar Plano ───────────────────────────────────────────────────────
  var btnLimparPlano = document.getElementById('fin-dre-plano-limpar');
  if (btnLimparPlano) {
    btnLimparPlano.onclick = async function() {
      if (!window.confirm('Apagar TODO o Plano de Contas desta empresa no banco?\nEsta ação não pode ser desfeita.')) return;
      _dreStatusGrade('fin-dre-status-plano', 'Limpando...', '');
      try {
        await _dreSalvarTabela('fin_dre_plano_contas', empresaId, []);
        // Limpa a grade local também
        DRE.estado.plano = [];
        if (GRIDS['dre_plano']) { GRIDS['dre_plano'].allData = []; GRIDS['dre_plano']._render(); }
        DRE.recalcular();
        _dreStatusGrade('fin-dre-status-plano', '✓ Plano apagado.', 'ok');
      } catch (e) {
        console.error('[DRE] Falha ao limpar Plano:', e);
        alert('Falha ao limpar Plano de Contas:\n' + e.message);
        _dreStatusGrade('fin-dre-status-plano', 'Falha: ' + e.message, 'erro');
      }
    };
  }
}

// ── EXPORT CSV ───────────────────────────────────────────────────────────────

function _dreExportarCSV() {
  var abaAtiva = document.querySelector('.fin-tab.active');
  var pane = abaAtiva ? abaAtiva.dataset.finPane : '';
  var rows, headers, nome;

  if (pane === 'fin-dre-pane-bd' && GRIDS['dre_bd']) {
    headers = (GRID_DEFS['dre_bd'] || {}).cols.map(function(c){ return c.t; });
    rows = GRIDS['dre_bd'].getData();
    nome = 'DRE_BD';
  } else if (pane === 'fin-dre-pane-plano' && GRIDS['dre_plano']) {
    headers = (GRID_DEFS['dre_plano'] || {}).cols.map(function(c){ return c.t; });
    rows = GRIDS['dre_plano'].getData();
    nome = 'DRE_Plano';
  } else if (pane === 'fin-dre-pane-bddre' && GRIDS['dre_bddre']) {
    headers = (GRID_DEFS['dre_bddre'] || {}).cols.map(function(c){ return c.t; });
    rows = GRIDS['dre_bddre'].getData();
    nome = 'DRE_BDDRE';
  } else {
    alert('Selecione uma aba (BD, Plano ou BD_DRE) para exportar.');
    return;
  }

  var csv = [headers.map(function(h){ return '"'+String(h||'').replace(/"/g,'""')+'"'; }).join(';')];
  rows.forEach(function(r) {
    csv.push(r.map(function(c){ return '"'+String(c===null||c===undefined?'':c).replace(/"/g,'""')+'"'; }).join(';'));
  });

  var blob = new Blob(['﻿'+csv.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = nome + '_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

// ── IMPORT ARQUIVO CSV/TSV ────────────────────────────────────────────────────

function _dreImportarArquivo(file) {
  if (!file) return;
  var grid = GRIDS['dre_bd'];
  if (!grid) { alert('Aba BD não está inicializada.'); return; }

  var reader = new FileReader();
  reader.onload = function(e) {
    var txt = e.target.result || '';
    // Detecta separador: tab, ponto-e-vírgula, vírgula
    var sep = txt.indexOf('\t') >= 0 ? '\t' : (txt.indexOf(';') >= 0 ? ';' : ',');
    var linhas = txt.split(/\r?\n/);
    // Remove cabeçalho se primeira célula não parecer data
    var primeira = (linhas[0] || '').split(sep)[0].trim();
    var temCab = !/^\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(primeira) && !/^\d{4}-\d{2}-\d{2}/.test(primeira);
    if (temCab) linhas = linhas.slice(1);
    var dados = linhas
      .filter(function(l){ return l.trim(); })
      .map(function(l){
        return l.split(sep).map(function(c){ return c.replace(/^"|"$/g,'').replace(/""/g,'"').trim(); });
      });
    if (!dados.length) { alert('Arquivo vazio ou formato não reconhecido.'); return; }
    // Cola igual ao paste — usa o mesmo mecanismo do LiteGrid
    var tsv = dados.map(function(r){ return r.join('\t'); }).join('\n');
    grid._pasteAt(tsv, 0, 0);
    _dreStatusGrade('fin-dre-status-bd', '✓ ' + dados.length + ' linha(s) importada(s) do arquivo.', 'ok');
  };
  reader.readAsText(file, 'UTF-8');
}

// ── GRADES LITEGRID (abas BD e Plano de Contas) ───────────────────────────────
//
// Usa o LiteGrid de js/jss.js — o mesmo componente do módulo de análise de
// vendas. Inicializado após DRE.init(), que já carregou plano e lançamentos em
// DRE.estado. Callbacks interceptados na instância (não no protótipo) para
// disparar recalcular() após cada edição ou colagem.

/**
 * Sincroniza estado.ano e o select #fin-filtro-ano com os anos reais dos
 * lançamentos em DRE.estado.lancamentos.
 *
 * Chamado depois de cada edição na grade BD para que o SUMIFS use o ano
 * correto quando o admin cola dados de um ano diferente do ano atual.
 */
function _dreAtualizarFiltrosAno() {
  var anos = [];
  (DRE.estado.lancamentos || []).forEach(function(l) {
    var d = _dreParseDataUTC(l.dt_caixa);
    if (d && !isNaN(d)) anos.push(d.getUTCFullYear());
  });
  anos = anos.filter(function(v, i, a) { return a.indexOf(v) === i; }).sort();
  if (!anos.length) return;

  var anoAtual = DRE.estado.ano;
  if (anos.indexOf(anoAtual) < 0) {
    anoAtual = anos[anos.length - 1];
    DRE.estado.ano = anoAtual;
    DRE.estado.anoInicio = anoAtual;
    DRE.estado.anoFim    = anoAtual;
    DRE.estado.mesInicio = 0;
    DRE.estado.mesFim = 11;
    var selMes = document.getElementById('fin-filtro-mes');
    if (selMes) selMes.value = '';
  }

  var selAno = document.getElementById('fin-filtro-ano');
  if (!selAno) return;
  selAno.innerHTML = anos.map(function(a) {
    return '<option value="' + a + '"' + (a === anoAtual ? ' selected' : '') + '>' + a + '</option>';
  }).join('');
}

/** Inicializa as duas grades LiteGrid e carrega os dados vindos do Supabase. */
function _dreIniciarGradesLiteGrid(plano, lancamentos) {
  if (typeof LiteGrid === 'undefined' || typeof GRID_DEFS === 'undefined') return;

  window._dreRenderToggleHtml = function(ci, val) {
    val = String(val || '').trim().toUpperCase();
    var isF = ci === 4;
    var opts = isF ? ['F','V'] : ['D','I'];
    var cls  = isF ? ['dre-tb-f','dre-tb-v'] : ['dre-tb-d','dre-tb-i'];
    return '<span class="dre-tb-wrap">'
      + '<span class="dre-tb ' + cls[0] + (val === opts[0] ? ' on' : '') + '">' + opts[0] + '</span>'
      + '<span class="dre-tb ' + cls[1] + (val === opts[1] ? ' on' : '') + '">' + opts[1] + '</span>'
      + '</span>';
  };

  window._dreRenderToggle = function(key, ci, val, td) {
    if (key !== 'dre_plano') return false;
    if (ci !== 4 && ci !== 5) return false;
    td.innerHTML = window._dreRenderToggleHtml(ci, val);
    return true;
  };

  window._dreRenderCell = function(key, ci, val, td) {
    if (key === 'dre_bd' && (ci === 1 || ci === 2 || ci === 3 || ci === 16)) {
      td.textContent = _dreDataParaBR(val);
      return true;
    }
    return false;
  };

  GRID_DEFS['dre_bd'] = { cols: [
    {t:'#',                  w:45,  auto:false},
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
      {t:'#',    w:45,  auto:false},
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
      _dreAtualizarFiltrosAno();
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
      // r[0] (# ID) mantido fixo — não recalcular por posição
      FULL_DATA['dre_plano'] = gridPlano.allData.slice();
      DRE.estado.plano = _drePlanoDeRows(gridPlano.getData());
      if (GRIDS['dre_bd']) _dreAtualizarDerivadasBD(GRIDS['dre_bd']);
      DRE.recalcular();
      _dreAtualizarBDDRE();
      _dreMarcarDirtyPlano();
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
      if (ci !== 4 && ci !== 5) return;
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

      if (ci === 4) {
        var atualFV = gridPlano.allData[ri][4] || '';
        if (atualFV === '') gridPlano.allData[ri][4] = 'F';
        else if (atualFV === 'F') gridPlano.allData[ri][4] = 'V';
        else gridPlano.allData[ri][4] = '';
      } else {
        var atualDI = gridPlano.allData[ri][5] || '';
        if (atualDI === '') gridPlano.allData[ri][5] = 'D';
        else if (atualDI === 'D') gridPlano.allData[ri][5] = 'I';
        else gridPlano.allData[ri][5] = '';
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

  // ── Filtros rápidos BD e Resultados ─────────────────────────────────────────
  _dreConfigurarFiltroBD();
  _dreConfigurarFiltroResultados();
}

// ── FILTROS RÁPIDOS BD ───────────────────────────────────────────────────────

function _dreConfigurarFiltroBD() {
  var busca = document.getElementById('fin-dre-bd-busca');
  var filtroSE = document.getElementById('fin-dre-bd-filtro-se');
  var btnLimpar = document.getElementById('fin-dre-bd-limpar-filtro');
  var grid = GRIDS['dre_bd'];
  if (!grid || !busca) return;

  function aplicar() {
    var termo = (busca.value || '').trim().toLowerCase();
    var se = (filtroSE ? filtroSE.value : '').trim();
    var src = FULL_DATA['dre_bd'] || grid.allData;

    if (!termo && !se) {
      grid.filtered = null;
      grid.page = 0;
      grid._render();
      return;
    }

    grid.filtered = src.filter(function(row) {
      if (!row) return false;
      if (se && String(row[18] || '').trim() !== se) return false;
      if (termo) {
        var m = String(row[4]  || '').toLowerCase().indexOf(termo) >= 0
             || String(row[17] || '').toLowerCase().indexOf(termo) >= 0
             || String(row[8]  || '').toLowerCase().indexOf(termo) >= 0;
        if (!m) return false;
      }
      return true;
    });
    grid.page = 0;
    grid._render();
  }

  busca.addEventListener('input', aplicar);
  if (filtroSE) filtroSE.addEventListener('change', aplicar);
  if (btnLimpar) btnLimpar.addEventListener('click', function() {
    busca.value = '';
    if (filtroSE) filtroSE.value = '';
    grid.filtered = null;
    grid.page = 0;
    grid._render();
  });
}

// ── FILTROS RÁPIDOS RESULTADOS ────────────────────────────────────────────────

var _dreResultadoFiltroWrapped = false;

function _dreConfigurarFiltroResultados() {
  var selGrupo  = document.getElementById('fin-dre-resultado-grupo');
  var selTipo   = document.getElementById('fin-dre-resultado-tipo');
  var btnLimpar = document.getElementById('fin-dre-resultado-limpar');
  if (!selGrupo) return;

  (DRE.ESTRUTURA || []).filter(function(e) { return e.tipo === 'grupo'; }).forEach(function(e) {
    var op = document.createElement('option');
    op.value = e.nome;
    op.textContent = e.nome;
    selGrupo.appendChild(op);
  });

  function aplicar() {
    var grupoFiltro = selGrupo.value;
    var tipoFiltro  = selTipo ? selTipo.value : '';
    var corpo = document.getElementById('fin-dre-corpo');
    if (!corpo) return;

    corpo.querySelectorAll('[data-grupo]').forEach(function(b) {
      var okGrupo = !grupoFiltro || b.dataset.grupo === grupoFiltro;
      var okTipo  = !tipoFiltro  || b.dataset.se    === tipoFiltro;
      b.style.display = (okGrupo && okTipo) ? '' : 'none';
    });

    var balanco = corpo.querySelector('.fin-balanco-wrap');
    if (balanco) balanco.style.display = (!grupoFiltro && !tipoFiltro) ? '' : 'none';
  }

  selGrupo.addEventListener('change', aplicar);
  if (selTipo) selTipo.addEventListener('change', aplicar);
  if (btnLimpar) btnLimpar.addEventListener('click', function() {
    selGrupo.value = '';
    if (selTipo) selTipo.value = '';
    aplicar();
  });

  if (!_dreResultadoFiltroWrapped && DRE && typeof DRE.recalcular === 'function') {
    var origRecalc = DRE.recalcular;
    DRE.recalcular = function() {
      origRecalc.apply(this, arguments);
      setTimeout(aplicar, 0);
    };
    _dreResultadoFiltroWrapped = true;
  }
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
      var d = _dreParseDataUTC(l.dt_caixa);
      if (d && !isNaN(d)) anos[d.getUTCFullYear()] = true;
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

  // Aviso quando Plano de Contas está vazio (BD_DRE depende de plano).
  var alvo = document.getElementById('fin-dre-tab-bddre');
  if (!alvo) return;
  var aviso = alvo.querySelector('.dre-aviso-plano-vazio');
  var semPlano = !DRE.estado.plano || !DRE.estado.plano.length;
  if (semPlano && !aviso) {
    var div = document.createElement('div');
    div.className = 'dre-aviso-plano-vazio';
    div.style.cssText = 'padding:14px 18px;color:#92400e;background:#fef3c7;border-radius:8px;margin:14px;font-size:.88rem;line-height:1.5;';
    div.innerHTML = '<strong>⚠ BD_DRE vazio:</strong> o relatório precisa do <strong>Plano de Contas</strong> preenchido.'
      + ' Vá até a aba <strong>Plano de Contas</strong>, cole as contas com seus grupos e clique em <strong>Salvar no banco</strong>.'
      + ' Depois volte aqui — as colunas de Jan a Dez mostrarão os totais por conta.';
    alvo.insertBefore(div, alvo.firstChild);
  } else if (!semPlano && aviso) {
    aviso.remove();
  }
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

/** Formata número no padrão pt-BR com 2 casas; zero vira '-', não-numérico vira ''. */
function _dreBDDreNum(v) {
  var n = Number(v);
  if (!isFinite(n)) return '';
  if (n === 0) return '-';
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
    [4, 5].forEach(function(ci) {
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

    // r[0] mantido como digitado pelo usuário (não recalcular)

    // CONTA = índice 4
    var conta = String(r[4] || '').trim().toLowerCase();
    var pc = conta ? idx.get(conta) : null;

    // 19: GRUPO  |  18: S_E
    r[19] = pc ? (pc.grupo || '') : (conta ? '#N/A' : '');
    r[18] = pc ? (SE_MAP[pc.grupo] || 'S') : (conta ? '#N/A' : '');

    // DT_CAIXA = índice 1
    var dt = String(r[1] || '');
    var d  = _dreParseDataUTC(dt);
    var ok = d && !isNaN(d);

    r[24] = ok ? d.getUTCFullYear()                  : '';  // ANO
    r[22] = ok ? (MESES[d.getUTCMonth()] || '')      : '';  // MÊS
    r[21] = ok ? d.getUTCDate()                       : '';  // DIA
    r[23] = ok ? (DIAS_SEM[d.getUTCDay()] || '')     : '';  // DIA_SEM
    r[29] = ok ? d.getUTCFullYear()                  : '';  // safra

    // SEMANA_ANO
    if (ok) {
      var jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      r[26] = Math.ceil(((d - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7);
    } else {
      r[26] = '';
    }

    // ULTIMO_DIA_DO_MES
    r[27] = ok ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() : '';

    // DT_VENC = índice 2
    var dtv = String(r[2] || '');
    var dv  = _dreParseDataUTC(dtv);
    var okv = dv && !isNaN(dv);
    if (okv) {
      r[25] = dv < hoje ? 'VENCIDO' : 'NO PRAZO';  // VENC
    } else {
      r[25] = '';
    }

    // 20: STATUS - DT_PAG = índice 3
    r[20] = r[4] ? (r[3] ? 'PG' : 'N') : '';

    // 28: CNPJ_2 - copia CNPJ (índice 15)
    r[28] = r[15] || '';

    // 30: CICLO - dias entre DT_CAIXA e DT_VENC
    r[30] = (ok && okv) ? Math.round((dv - d) / 86400000) : '';
  }
  gridBD._render();
}

/** Intercepta _commit, _pasteAt e _paste para disparar callback após cada mudança. */
function _dreNormalizarPastePlano(txt, startCol) {
  if (startCol !== 0 && startCol !== 1) return txt;
  var linhas = String(txt || '').replace(/\r/g, '').split('\n');
  if (linhas.length && linhas[linhas.length - 1] === '') linhas.pop();
  if (!linhas.length) return txt;

  var deveNormalizar = linhas.some(function(linha) {
    var cells = linha.split('\t');
    if (cells.length < 6) return false;
    var c0 = String(cells[0] || '').trim().toUpperCase();
    var c1 = String(cells[1] || '').trim().toUpperCase();
    var c2 = String(cells[2] || '').trim().toUpperCase();
    var c3 = String(cells[3] || '').trim();
    var c4 = String(cells[4] || '').trim().toUpperCase();
    var c5 = String(cells[5] || '').trim().toUpperCase();
    var headerPlanoExcel = c0 === 'COD' && c1 === 'CONTA' && c2 === 'CAD' && c3.toUpperCase() === 'GRUPO';
    var linhaPlanoExcel = c0 && c1 && c3 && /^[FV]?$/.test(c4) && /^[DI]?$/.test(c5);
    return headerPlanoExcel || linhaPlanoExcel;
  });

  if (!deveNormalizar) return txt;

  var prefixo = startCol === 0 ? '\t' : '';  // slot vazio para col # quando colando do início
  return linhas.map(function(linha) {
    var cells = linha.split('\t');
    if (cells.length < 6) return linha;
    cells[4] = String(cells[4] || '').trim().toUpperCase();
    cells[5] = String(cells[5] || '').trim().toUpperCase();
    return prefixo + [cells[0], cells[1], cells[3], cells[4], cells[5]].join('\t');
  }).join('\n');
}

function _drePatchGrid(grid, cb) {
  var origCommit  = grid._commit.bind(grid);
  var origPasteAt = grid._pasteAt.bind(grid);
  var origPaste   = grid._paste.bind(grid);
  var origUndo    = grid._undo ? grid._undo.bind(grid) : null;

  grid._commit = function() {
    var ri = grid.selRow, ci = grid.selCol;
    origCommit();
    // Col # (ci=0): impede duplicata — auto-incrementa para próximo disponível
    if (ci === 0 && ri >= 0 && grid.allData[ri]) {
      var val = String(grid.allData[ri][0] || '').trim();
      if (val !== '') {
        var isDup = grid.allData.some(function(r, i) {
          return i !== ri && r && String(r[0] || '').trim() === val;
        });
        if (isDup) {
          var used = {};
          grid.allData.forEach(function(r, i) { if (i !== ri && r) used[String(r[0] || '').trim()] = true; });
          var n = parseInt(val) || 1;
          while (used[String(n)]) n++;
          grid.allData[ri][0] = n;
          grid._render();
        }
      }
    }
    cb();
  };
  function _dreDeduplicarHash() {
    var used = {};
    grid.allData.forEach(function(r, ri) {
      if (!r) return;
      var v = String(r[0] || '').trim();
      if (!v) return;
      if (!used[v]) { used[v] = true; return; }
      var n = parseInt(v) || 1;
      while (used[String(n)]) n++;
      r[0] = n; used[String(n)] = true;
    });
  }

  grid._pasteAt = function(txt, r, c) {
    if (grid.key === 'dre_plano') txt = _dreNormalizarPastePlano(txt, c);
    origPasteAt(txt, r, c);
    _dreDeduplicarHash();
    cb();
  };
  grid._paste   = function(txt) {
    if (grid.key === 'dre_plano') txt = _dreNormalizarPastePlano(txt, 0);
    origPaste(txt);
    _dreDeduplicarHash();
    cb();
  };
  if (origUndo) grid._undo = function() { origUndo(); cb(); };
}

/** Objeto plano -> array de células (mesma ordem de GRID_DEFS dre_plano). */
function _drePlanoToRows(plano) {
  return (plano || []).map(function(p, idx) {
    return [idx + 1, p.cod || '', p.conta || '', p.grupo || '', p.fv || '', p.di || ''];
  });
}

/** Array de linhas da grade -> array de objetos plano. */
function _drePlanoDeRows(rows) {
  return rows.map(function(r) {
    return { cod: r[1] || '', conta: r[2] || '', grupo: r[3] || '', fv: r[4] || '', di: r[5] || '' };
  });
}

/** Objeto lançamento -> array (1 # auto + 17 editáveis + 13 derivadas vazias). */
function _dreRowsBD(lancs) {
  return (lancs || []).map(function(l, idx) {
    return [
      idx + 1,                                               // 0:  # (auto, sequencial)
      _dreDataParaBR(l.dt_caixa),                            // 1:  DT_CAIXA
      _dreDataParaBR(l.dt_venc),                             // 2:  DT_VENC
      _dreDataParaBR(l.dt_pag),                              // 3:  DT_PAG
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
      _dreDataParaBR(l.dt_custoria),                         // 16: DT CUSTORIA
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
        dt_caixa:     _dreNormalizarData(r[1]) || '',
        dt_venc:      _dreNormalizarData(r[2]) || null,
        dt_pag:       _dreNormalizarData(r[3]) || null,
        tipo:         r[5]  || null,
        valor:        _dreParseNum(r[6]),
        tot_pago:     _dreParseNum(r[7]),
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

// ── EXPORTAR ─────────────────────────────────────────────────────────────────

/** Liga o botão Exportar — gera CSV do BD_DRE (matriz conta × mês). */
function _dreLigarExportar() {
  var btn = document.getElementById('fin-dre-btn-exportar');
  if (!btn) return;

  btn.onclick = function() {
    var bdDre = DRE.estado.bdDre || [];
    if (!bdDre.length) {
      alert('Sem dados para exportar. Verifique se o Plano de Contas e os Lançamentos estão preenchidos.');
      return;
    }

    var MESES = DRE.MESES;
    var header = ['COD', 'CONTA', 'GRUPO', 'S_E', 'F_V', 'D_I']
      .concat(MESES)
      .concat(['TOTAL', 'MED', '%']);

    var rows = bdDre.map(function(l) {
      return [l.codigo || '', l.conta || '', l.grupo || '', l.s_e || '', l.fv || '', l.di || '']
        .concat((l.meses || []).map(function(v) { return v || 0; }))
        .concat([
          Math.round(l.total || 0),
          Math.round(l.med   || 0),
          ((l.pct || 0) * 100).toFixed(2) + '%'
        ]);
    });

    var csv = [header].concat(rows).map(function(r) {
      return r.map(function(v) {
        var s = String(v == null ? '' : v);
        return (s.indexOf(';') >= 0 || s.indexOf('"') >= 0)
          ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    }).join('\r\n');

    var nome = (DRE.estado.empresa || 'DRE').replace(/[^A-Za-z0-9_\-]/g, '_');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'BD_DRE_' + nome + '_' + (DRE.estado.ano || '') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
}

// ── FILTROS DE DATA ───────────────────────────────────────────────────────────

/**
 * Liga os inputs de data Início/Fim ao motor.
 * Quando o usuário preenche as datas, atualiza mesInicio/mesFim (e ano, se
 * necessário) e dispara recalcular(). O dropdown "Mês" é resetado para
 * "Ano inteiro" para não conflitar com o intervalo por data.
 */
function _dreLigarDateInputs() {
  var elInicio = document.getElementById('fin-filtro-inicio');
  var elFim    = document.getElementById('fin-filtro-fim');
  if (!elInicio && !elFim) return;

  function aplicar() {
    var vi = elInicio ? elInicio.value : '';
    var vf = elFim    ? elFim.value    : '';
    if (!vi && !vf) return;

    var di = vi ? new Date(vi) : null;
    var df = vf ? new Date(vf) : null;
    var changed = false;

    if (di && !isNaN(di)) {
      DRE.estado.anoInicio = di.getUTCFullYear();
      DRE.estado.mesInicio = di.getUTCMonth();
      DRE.estado.ano = DRE.estado.anoInicio;
      var selAno = document.getElementById('fin-filtro-ano');
      if (selAno) selAno.value = DRE.estado.ano;
      changed = true;
    }
    if (df && !isNaN(df)) {
      DRE.estado.anoFim = df.getUTCFullYear();
      DRE.estado.mesFim = df.getUTCMonth();
      changed = true;
    }

    if (changed) {
      var selMes = document.getElementById('fin-filtro-mes');
      if (selMes) selMes.value = '';
      DRE.recalcular();
    }
  }

  if (elInicio) elInicio.addEventListener('change', aplicar);
  if (elFim)    elFim.addEventListener('change', aplicar);
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
