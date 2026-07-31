// =============================================================================
// DRE — ADMIN (entrada de dados)
// =============================================================================
// Importacao manual do plano de contas e dos lancamentos pelo super_admin,
// no mesmo espirito do fluxo manual do financeiro (js/financeiro/financeiro-admin.js).
//
// E aqui que "tudo e calculado a mao": o admin cola a planilha de plano de
// contas e a de lancamentos, o parser converte e grava em fin_dre_plano_contas
// e fin_dre_lancamentos (docs/supabase-dre.sql). O painel do cliente
// (js/dre/dre-view.js) so le o resultado ja calculado por dre-engine.js —
// nao ha edicao nenhuma do lado do cliente.
//
// A escrita passa pelo fetch monkey-patched do auth.js, ou seja, vai para
// /api/secure-proxy, que exige sessao valida e so aceita gravacao em fin_*
// de super_admin. Nada de service role no navegador.
// =============================================================================

var DRE_ADMIN_LOTE = 500;

// ── PLANO DE CONTAS ──────────────────────────────────────────────────────────
//
// Colunas esperadas, nesta ordem (tab ou ponto-e-vírgula como separador):
//   cod | conta | grupo | fv | di
// 'cod' pode vir em branco — nesse caso usa o próprio nome da conta. 'grupo'
// precisa bater com um dos grupos que o motor conhece (DRE.SE_POR_GRUPO);
// fora disso a conta some do resultado sem aviso, por isso o parser valida
// contra essa lista em vez de aceitar qualquer texto.

var DRE_ADMIN_COLUNAS_PLANO = ['cod', 'conta', 'grupo', 'fv', 'di'];

function dreAdminAbrirImportacaoPlano(empresaId) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  var empresaNome = typeof adminConsoleCompanyName === 'function'
    ? adminConsoleCompanyName(empresaId) : 'Empresa';

  var grupos = (typeof DRE !== 'undefined' && DRE.SE_POR_GRUPO)
    ? Object.keys(DRE.SE_POR_GRUPO) : [];

  var html =
      '<div class="admin-form-grid">'
    +   '<label class="admin-field admin-field-full">'
    +     '<span>Plano de contas de ' + adminConsoleEscape(empresaNome) + '</span>'
    +     '<textarea name="dados" rows="10" required '
    +       'placeholder="Cole aqui as linhas da planilha..."></textarea>'
    +   '</label>'
    +   '<label class="admin-field admin-field-switch admin-field-full">'
    +     '<input type="checkbox" name="substituir">'
    +     '<span>Substituir todo o plano de contas existente desta empresa</span>'
    +   '</label>'
    + '</div>'
    + '<div class="admin-form-help">'
    +   'Uma linha por conta, colunas separadas por tabulação ou ponto e vírgula, nesta ordem:'
    +   '<pre class="fin-import-exemplo">cod\tconta\tgrupo\tfv\tdi\n'
    +     'MP02\tAviamento\tCUSTO. MP OU REVENDA\tV\t\n'
    +     '\tVendas\tRECEITA OPERACIONAL\t\t</pre>'
    +   '<code>cod</code> em branco usa o nome da conta. <code>fv</code>: F ou V (ou vazio). '
    +   '<code>di</code>: D ou I (ou vazio). Linha de cabeçalho é ignorada automaticamente.'
    +   (grupos.length
        ? '<br><br>Grupos aceitos: ' + grupos.map(adminConsoleEscape).join(' · ')
        : '')
    + '</div>'
    + '<div class="admin-modal-actions">'
    +   '<button type="button" onclick="adminConsoleFecharModal()">Cancelar</button>'
    +   '<button class="admin-btn-primary" type="submit">Importar</button>'
    + '</div>';

  adminConsoleAbrirModal('DRE', 'Importar plano de contas', html, function(formData) {
    dreAdminImportarPlano(empresaId, String(formData.get('dados') || ''), !!formData.get('substituir'));
  });
}

/** Acha o grupo canonico (mesma grafia que o motor usa) ignorando caixa. */
function dreAdminGrupoCanonico(valor) {
  var alvo = String(valor || '').trim().toLowerCase();
  if (!alvo) return null;
  var grupos = (typeof DRE !== 'undefined' && DRE.SE_POR_GRUPO) ? Object.keys(DRE.SE_POR_GRUPO) : [];
  for (var i = 0; i < grupos.length; i++) {
    if (grupos[i].toLowerCase() === alvo) return grupos[i];
  }
  return null;
}

function dreAdminFV(valor) {
  var texto = String(valor || '').trim().toUpperCase();
  return (texto === 'F' || texto === 'V') ? texto : '';
}

function dreAdminDI(valor) {
  var texto = String(valor || '').trim().toUpperCase();
  return (texto === 'D' || texto === 'I') ? texto : '';
}

/**
 * Converte o texto colado do plano de contas em linhas prontas para o banco.
 * @returns {{registros: Array, erros: Array<string>}}
 */
function dreAdminParsearPlano(texto, empresaId) {
  var registros = [];
  var erros = [];
  var vistos = {}; // nome da conta (normalizado) -> numero da linha, contra duplicata no proprio arquivo

  String(texto || '').split(/\r?\n/).forEach(function(linha, indice) {
    if (!linha.trim()) return;

    var colunas = linha.indexOf('\t') !== -1 ? linha.split('\t') : linha.split(';');
    var campo = {};
    DRE_ADMIN_COLUNAS_PLANO.forEach(function(nome, i) { campo[nome] = (colunas[i] || '').trim(); });

    // Pula o cabeçalho, se veio junto
    if (indice === 0 && String(campo.cod).toLowerCase() === 'cod'
        && String(campo.conta).toLowerCase() === 'conta') return;

    var numeroLinha = indice + 1;
    var conta = campo.conta;
    var grupo = dreAdminGrupoCanonico(campo.grupo);

    if (!conta)  { erros.push('Linha ' + numeroLinha + ': conta em branco.'); return; }
    if (!grupo)  { erros.push('Linha ' + numeroLinha + ': grupo "' + campo.grupo + '" não reconhecido.'); return; }

    var chave = conta.trim().toLowerCase();
    if (vistos[chave]) { erros.push('Linha ' + numeroLinha + ': conta "' + conta + '" repetida (já na linha ' + vistos[chave] + ').'); return; }
    vistos[chave] = numeroLinha;

    registros.push({
      empresa_id: empresaId,
      cod:        campo.cod || conta,
      conta:      conta,
      grupo:      grupo,
      fv:         dreAdminFV(campo.fv),
      di:         dreAdminDI(campo.di)
    });
  });

  return { registros: registros, erros: erros };
}

async function dreAdminImportarPlano(empresaId, texto, substituir) {
  var resultado = dreAdminParsearPlano(texto, empresaId);

  if (resultado.erros.length) {
    adminConsoleAviso(resultado.erros.slice(0, 3).join(' ')
      + (resultado.erros.length > 3 ? ' (+' + (resultado.erros.length - 3) + ' erros)' : ''), 'error');
    return;
  }
  if (!resultado.registros.length) {
    adminConsoleAviso('Nenhuma conta válida encontrada no texto colado.', 'warn');
    return;
  }

  var empresaNome = adminConsoleCompanyName(empresaId);
  var confirmacao = 'Importar ' + resultado.registros.length.toLocaleString('pt-BR')
    + ' conta(s) para ' + empresaNome + '?'
    + (substituir ? '\n\nATENÇÃO: todo o plano de contas atual desta empresa será apagado antes.' : '');
  if (!window.confirm(confirmacao)) return;

  adminConsoleFecharModal();

  try {
    if (substituir) {
      adminConsoleAviso('Removendo plano de contas anterior...', 'info');
      var remocao = await fetch(
        SUPA_URL + '/rest/v1/fin_dre_plano_contas?empresa_id=eq.' + encodeURIComponent(empresaId),
        { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
      );
      if (!remocao.ok) throw new Error('Falha ao limpar o plano de contas anterior (HTTP ' + remocao.status + ').');
    }

    var enviados = 0;
    for (var i = 0; i < resultado.registros.length; i += DRE_ADMIN_LOTE) {
      var lote = resultado.registros.slice(i, i + DRE_ADMIN_LOTE);
      var resposta = await fetch(SUPA_URL + '/rest/v1/fin_dre_plano_contas', {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + SVC_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(lote)
      });
      if (!resposta.ok) throw new Error('Falha ao gravar o lote ' + (i / DRE_ADMIN_LOTE + 1)
        + ' (HTTP ' + resposta.status + (resposta.status === 409
          ? ' — conta já existente; marque "Substituir" ou remova a duplicata.' : '') + ').');
      enviados += lote.length;
      adminConsoleAviso('Gravando... ' + enviados.toLocaleString('pt-BR') + ' de '
        + resultado.registros.length.toLocaleString('pt-BR'), 'info');
    }

    if (typeof adminConsoleTrackActivity === 'function') {
      adminConsoleTrackActivity('financeiro', 'Plano de contas do DRE importado',
        enviados + ' contas - ' + empresaNome);
    }
    adminConsoleAviso('✓ ' + enviados.toLocaleString('pt-BR')
      + ' conta(s) importada(s) para ' + empresaNome + '.', 'success');
    await dreAdminCarregarResumo(true);

  } catch (e) {
    console.error('[DRE-ADMIN] Importação do plano falhou:', e);
    adminConsoleAviso('Importação falhou: ' + e.message, 'error');
  }
}

/** Apaga todo o plano de contas de uma empresa. Confirmação dupla, sem volta. */
async function dreAdminLimparPlano(empresaId) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  var empresaNome = adminConsoleCompanyName(empresaId);

  if (!window.confirm('Apagar TODO o plano de contas do DRE de ' + empresaNome + '?')) return;
  if (!window.confirm('Confirme: esta ação não pode ser desfeita. Apagar tudo de ' + empresaNome + '?')) return;

  try {
    var resposta = await fetch(
      SUPA_URL + '/rest/v1/fin_dre_plano_contas?empresa_id=eq.' + encodeURIComponent(empresaId),
      { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status);

    if (typeof adminConsoleTrackActivity === 'function') {
      adminConsoleTrackActivity('financeiro', 'Plano de contas do DRE apagado', empresaNome);
    }
    adminConsoleAviso('Plano de contas de ' + empresaNome + ' apagado.', 'success');
    await dreAdminCarregarResumo(true);
  } catch (e) {
    adminConsoleAviso('Falha ao apagar: ' + e.message, 'error');
  }
}

// ── LANÇAMENTOS ──────────────────────────────────────────────────────────────
//
// Colunas esperadas, nesta ordem (tab ou ponto-e-vírgula como separador):
//   conta | dt_caixa | dt_venc | dt_pag | valor | parceiro | documento | banco | forma
// 'conta' precisa bater com um nome cadastrado no plano de contas — se não
// bater, o motor mostra a linha como #N/A e ela fica fora do DRE (o painel já
// alerta quantos lançamentos caem nesse caso; o import aqui só avisa, não bloqueia).

var DRE_ADMIN_COLUNAS_LANC = ['conta', 'dt_caixa', 'dt_venc', 'dt_pag', 'valor', 'parceiro', 'documento', 'banco', 'forma'];

function dreAdminAbrirImportacaoLancamentos(empresaId) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  var empresaNome = typeof adminConsoleCompanyName === 'function'
    ? adminConsoleCompanyName(empresaId) : 'Empresa';

  var html =
      '<div class="admin-form-grid">'
    +   '<label class="admin-field admin-field-full">'
    +     '<span>Lançamentos do DRE de ' + adminConsoleEscape(empresaNome) + '</span>'
    +     '<textarea name="dados" rows="10" required '
    +       'placeholder="Cole aqui as linhas da planilha..."></textarea>'
    +   '</label>'
    +   '<label class="admin-field admin-field-switch admin-field-full">'
    +     '<input type="checkbox" name="substituir">'
    +     '<span>Substituir todos os lançamentos existentes desta empresa</span>'
    +   '</label>'
    + '</div>'
    + '<div class="admin-form-help">'
    +   'Uma linha por lançamento, colunas separadas por tabulação ou ponto e vírgula, nesta ordem:'
    +   '<pre class="fin-import-exemplo">conta\tdt_caixa\tdt_venc\tdt_pag\tvalor\tparceiro\tdocumento\tbanco\tforma\n'
    +     'Vendas\t06/09/2024\t06/09/2024\t06/09/2024\t170,00\tCliente X\tP3937/1\tBANCO DO BRASIL\tPIX BB\n'
    +     'Aviamento\t07/09/2024\t20/09/2024\t\t350,50\tFornecedor Y\t45658\t\t</pre>'
    +   'Datas em dd/mm/aaaa ou aaaa-mm-dd. <code>dt_pag</code> em branco = ainda não pago. '
    +   '<code>conta</code> precisa existir no plano de contas desta empresa, senão fica fora do DRE. '
    +   'Linha de cabeçalho é ignorada automaticamente.'
    + '</div>'
    + '<div class="admin-modal-actions">'
    +   '<button type="button" onclick="adminConsoleFecharModal()">Cancelar</button>'
    +   '<button class="admin-btn-primary" type="submit">Importar</button>'
    + '</div>';

  adminConsoleAbrirModal('DRE', 'Importar lançamentos', html, function(formData) {
    dreAdminImportarLancamentos(empresaId, String(formData.get('dados') || ''), !!formData.get('substituir'));
  });
}

/** Aceita dd/mm/aaaa, dd-mm-aaaa e aaaa-mm-dd. Devolve 'aaaa-mm-dd' ou null. */
function dreAdminData(valor) {
  var texto = String(valor || '').trim();
  if (!texto) return null;

  var iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return texto;

  var br = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!br) return null;

  var ano = br[3].length === 2 ? '20' + br[3] : br[3];
  return ano + '-' + String(br[2]).padStart(2, '0') + '-' + String(br[1]).padStart(2, '0');
}

/** Aceita 1.234,56 / 1234.56 / R$ 1.234,56. Devolve número ou null. */
function dreAdminValor(valor) {
  var texto = String(valor || '').replace(/[R$\s]/gi, '').trim();
  if (!texto) return null;

  if (texto.indexOf(',') !== -1) texto = texto.replace(/\./g, '').replace(',', '.');

  var numero = Number(texto);
  return isNaN(numero) ? null : numero;
}

/**
 * Converte o texto colado de lançamentos em linhas prontas para o banco.
 * @returns {{registros: Array, erros: Array<string>, foraDoPlano: Array<string>}}
 */
function dreAdminParsearLancamentos(texto, empresaId, contasConhecidas) {
  var registros = [];
  var erros = [];
  var foraDoPlano = {};
  var conhecidas = {};
  (contasConhecidas || []).forEach(function(c) { conhecidas[String(c).trim().toLowerCase()] = true; });

  String(texto || '').split(/\r?\n/).forEach(function(linha, indice) {
    if (!linha.trim()) return;

    var colunas = linha.indexOf('\t') !== -1 ? linha.split('\t') : linha.split(';');
    var campo = {};
    DRE_ADMIN_COLUNAS_LANC.forEach(function(nome, i) { campo[nome] = (colunas[i] || '').trim(); });

    // Pula o cabeçalho, se veio junto
    if (indice === 0 && String(campo.conta).toLowerCase() === 'conta'
        && String(campo.dt_caixa).toLowerCase() === 'dt_caixa') return;

    var numeroLinha = indice + 1;
    var conta = campo.conta;
    var dtCaixa = dreAdminData(campo.dt_caixa);
    var valor = dreAdminValor(campo.valor);

    if (!conta)   { erros.push('Linha ' + numeroLinha + ': conta em branco.'); return; }
    if (!dtCaixa) { erros.push('Linha ' + numeroLinha + ': dt_caixa inválida.'); return; }
    if (valor === null) { erros.push('Linha ' + numeroLinha + ': valor inválido.'); return; }

    if (conhecidas && Object.keys(conhecidas).length && !conhecidas[conta.trim().toLowerCase()]) {
      foraDoPlano[conta] = true;
    }

    registros.push({
      empresa_id: empresaId,
      conta:      conta,
      valor:      valor,
      dt_caixa:   dtCaixa,
      dt_venc:    dreAdminData(campo.dt_venc) || dtCaixa,
      dt_pag:     dreAdminData(campo.dt_pag),
      parceiro:   campo.parceiro || null,
      documento:  campo.documento || null,
      banco:      campo.banco || null,
      forma:      campo.forma || null,
      origem:     'manual',
      criado_por: (SESSION && SESSION.email) || 'super_admin'
    });
  });

  return { registros: registros, erros: erros, foraDoPlano: Object.keys(foraDoPlano) };
}

/** Busca os nomes de conta já cadastrados, para avisar sobre lançamento órfão antes de gravar. */
async function dreAdminContasDaEmpresa(empresaId) {
  try {
    var resposta = await fetch(
      SUPA_URL + '/rest/v1/fin_dre_plano_contas?empresa_id=eq.' + encodeURIComponent(empresaId) + '&select=conta',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    if (!resposta.ok) return [];
    var linhas = await resposta.json();
    return (Array.isArray(linhas) ? linhas : []).map(function(l) { return l.conta; });
  } catch (e) {
    return [];
  }
}

async function dreAdminImportarLancamentos(empresaId, texto, substituir) {
  var contasConhecidas = await dreAdminContasDaEmpresa(empresaId);
  var resultado = dreAdminParsearLancamentos(texto, empresaId, contasConhecidas);

  if (resultado.erros.length) {
    adminConsoleAviso(resultado.erros.slice(0, 3).join(' ')
      + (resultado.erros.length > 3 ? ' (+' + (resultado.erros.length - 3) + ' erros)' : ''), 'error');
    return;
  }
  if (!resultado.registros.length) {
    adminConsoleAviso('Nenhum lançamento válido encontrado no texto colado.', 'warn');
    return;
  }

  var empresaNome = adminConsoleCompanyName(empresaId);
  var avisoPlano = resultado.foraDoPlano.length
    ? '\n\nAtenção: ' + resultado.foraDoPlano.length + ' conta(s) não estão no plano desta empresa e vão ficar fora do DRE (#N/A): '
      + resultado.foraDoPlano.slice(0, 5).join(', ') + (resultado.foraDoPlano.length > 5 ? '...' : '')
    : '';
  var confirmacao = 'Importar ' + resultado.registros.length.toLocaleString('pt-BR')
    + ' lançamento(s) para ' + empresaNome + '?'
    + (substituir ? '\n\nATENÇÃO: todos os lançamentos atuais desta empresa serão apagados antes.' : '')
    + avisoPlano;
  if (!window.confirm(confirmacao)) return;

  adminConsoleFecharModal();

  try {
    if (substituir) {
      adminConsoleAviso('Removendo lançamentos anteriores...', 'info');
      var remocao = await fetch(
        SUPA_URL + '/rest/v1/fin_dre_lancamentos?empresa_id=eq.' + encodeURIComponent(empresaId),
        { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
      );
      if (!remocao.ok) throw new Error('Falha ao limpar os lançamentos anteriores (HTTP ' + remocao.status + ').');
    }

    var enviados = 0;
    for (var i = 0; i < resultado.registros.length; i += DRE_ADMIN_LOTE) {
      var lote = resultado.registros.slice(i, i + DRE_ADMIN_LOTE);
      var resposta = await fetch(SUPA_URL + '/rest/v1/fin_dre_lancamentos', {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + SVC_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(lote)
      });
      if (!resposta.ok) throw new Error('Falha ao gravar o lote ' + (i / DRE_ADMIN_LOTE + 1)
        + ' (HTTP ' + resposta.status + ').');
      enviados += lote.length;
      adminConsoleAviso('Gravando... ' + enviados.toLocaleString('pt-BR') + ' de '
        + resultado.registros.length.toLocaleString('pt-BR'), 'info');
    }

    if (typeof adminConsoleTrackActivity === 'function') {
      adminConsoleTrackActivity('financeiro', 'Lançamentos do DRE importados',
        enviados + ' registros - ' + empresaNome);
    }
    adminConsoleAviso('✓ ' + enviados.toLocaleString('pt-BR')
      + ' lançamento(s) importado(s) para ' + empresaNome + '.', 'success');
    await dreAdminCarregarResumo(true);

  } catch (e) {
    console.error('[DRE-ADMIN] Importação de lançamentos falhou:', e);
    adminConsoleAviso('Importação falhou: ' + e.message, 'error');
  }
}

/** Apaga todos os lançamentos do DRE de uma empresa. Confirmação dupla, sem volta. */
async function dreAdminLimparLancamentos(empresaId) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  var empresaNome = adminConsoleCompanyName(empresaId);

  if (!window.confirm('Apagar TODOS os lançamentos do DRE de ' + empresaNome + '?')) return;
  if (!window.confirm('Confirme: esta ação não pode ser desfeita. Apagar tudo de ' + empresaNome + '?')) return;

  try {
    var resposta = await fetch(
      SUPA_URL + '/rest/v1/fin_dre_lancamentos?empresa_id=eq.' + encodeURIComponent(empresaId),
      { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status);

    if (typeof adminConsoleTrackActivity === 'function') {
      adminConsoleTrackActivity('financeiro', 'Lançamentos do DRE apagados', empresaNome);
    }
    adminConsoleAviso('Lançamentos do DRE de ' + empresaNome + ' apagados.', 'success');
    await dreAdminCarregarResumo(true);
  } catch (e) {
    adminConsoleAviso('Falha ao apagar: ' + e.message, 'error');
  }
}

// ── RESUMO POR EMPRESA (mostrado nos cards da aba Financeiro) ────────────────

var DRE_ADMIN_RESUMO = {};   // empresa_id -> { contas, lancamentos }
var DRE_ADMIN_RESUMO_OK = false;

async function dreAdminCarregarResumo(force) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  if (DRE_ADMIN_RESUMO_OK && !force) return;

  try {
    var respostas = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/fin_dre_plano_contas?select=empresa_id&limit=100000',
        { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }),
      fetch(SUPA_URL + '/rest/v1/fin_dre_lancamentos?select=empresa_id&limit=100000',
        { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } })
    ]);
    respostas.forEach(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); });

    var dados = await Promise.all(respostas.map(function(r) { return r.json(); }));
    var resumo = {};

    (Array.isArray(dados[0]) ? dados[0] : []).forEach(function(l) {
      var id = String(l.empresa_id);
      if (!resumo[id]) resumo[id] = { contas: 0, lancamentos: 0 };
      resumo[id].contas += 1;
    });
    (Array.isArray(dados[1]) ? dados[1] : []).forEach(function(l) {
      var id = String(l.empresa_id);
      if (!resumo[id]) resumo[id] = { contas: 0, lancamentos: 0 };
      resumo[id].lancamentos += 1;
    });

    DRE_ADMIN_RESUMO = resumo;
    DRE_ADMIN_RESUMO_OK = true;
  } catch (e) {
    // Tabelas ainda nao criadas (docs/supabase-dre.sql nao rodou) ou indisponiveis
    DRE_ADMIN_RESUMO = {};
    DRE_ADMIN_RESUMO_OK = false;
    console.warn('[DRE-ADMIN] Resumo indisponível:', e && e.message);
  }

  if (typeof adminConsoleRenderFinanceiro === 'function') adminConsoleRenderFinanceiro();
}

/** Linha de volume mostrada no card da empresa. */
function dreAdminResumoTexto(empresaId) {
  var resumo = DRE_ADMIN_RESUMO[String(empresaId)];
  if (!resumo || (!resumo.contas && !resumo.lancamentos)) return 'Nenhum dado de DRE importado.';
  return resumo.contas.toLocaleString('pt-BR') + ' conta(s) no plano · '
    + resumo.lancamentos.toLocaleString('pt-BR') + ' lançamento(s)';
}

// =============================================================================
// GRADE ESTILO EXCEL (js/dre/dre-grid.js)
// =============================================================================
// "Importar plano de contas" / "Importar lançamentos" acima continuam servindo
// para a primeira carga em massa (colar uma planilha inteira de uma vez). Os
// dois botões abaixo abrem uma grade viva, carregada com o que já está no
// banco: célula a célula, colar/copiar, ordenar, filtrar, desfazer e validação
// inline — ver docs/ferramenta/modelo/PROMPT_DRE_RESUTE.md. Fecha e reabre sem
// perder nada; só grava no banco quando o admin aperta "Salvar no banco".
// =============================================================================

/** Cria o overlay de tela cheia e devolve os pontos onde a grade se pluga. */
function _dreGradeCriarOverlay(titulo, subtitulo) {
  var overlay = document.createElement('div');
  overlay.className = 'fin-grid-overlay';
  overlay.innerHTML =
      '<div class="fin-grid-overlay-header">'
    +   '<div><h2>' + titulo + '</h2><small>' + subtitulo + '</small></div>'
    +   '<div class="fin-grid-overlay-acoes">'
    +     '<button type="button" class="fin-grid-btn" data-fechar="1">Fechar sem salvar</button>'
    +     '<button type="button" class="fin-grid-btn fin-grid-btn-primario" data-salvar="1">Salvar no banco</button>'
    +     '<button type="button" class="fin-grid-btn-fechar" data-fechar="1" aria-label="Fechar">&times;</button>'
    +   '</div>'
    + '</div>'
    + '<div class="fin-grid-overlay-status"></div>'
    + '<div class="fin-grid-overlay-body"></div>';

  document.body.appendChild(overlay);

  var corpo = overlay.querySelector('.fin-grid-overlay-body');
  var status = overlay.querySelector('.fin-grid-overlay-status');
  var btnSalvar = overlay.querySelector('[data-salvar]');

  function fechar() { overlay.remove(); }
  overlay.querySelectorAll('[data-fechar]').forEach(function(b) { b.addEventListener('click', fechar); });

  function mostrarStatus(msg, tipo) {
    status.textContent = msg || '';
    status.className = 'fin-grid-overlay-status' + (tipo ? ' ' + tipo : '');
  }

  return { overlay: overlay, corpo: corpo, btnSalvar: btnSalvar, fechar: fechar, status: mostrarStatus };
}

/** DELETE + POST em lote na tabela. Mesma semântica das importações em texto. */
async function _dreGradeSalvarTabela(tabela, empresaId, registros) {
  var remocao = await fetch(
    SUPA_URL + '/rest/v1/' + tabela + '?empresa_id=eq.' + encodeURIComponent(empresaId),
    { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
  );
  if (!remocao.ok) throw new Error('Falha ao limpar antes de salvar (HTTP ' + remocao.status + ').');
  if (!registros.length) return 0;

  var enviados = 0;
  for (var i = 0; i < registros.length; i += DRE_ADMIN_LOTE) {
    var lote = registros.slice(i, i + DRE_ADMIN_LOTE);
    var resposta = await fetch(SUPA_URL + '/rest/v1/' + tabela, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'
      },
      body: JSON.stringify(lote)
    });
    if (!resposta.ok) throw new Error('Falha ao gravar o lote ' + (i / DRE_ADMIN_LOTE + 1) + ' (HTTP ' + resposta.status + ').');
    enviados += lote.length;
  }
  return enviados;
}

// ── GRADE: PLANO DE CONTAS ───────────────────────────────────────────────────

function _dreGradeColunasPlano() {
  return [
    { key: 'cod', titulo: 'COD', tipo: 'texto' },
    { key: 'conta', titulo: 'CONTA', tipo: 'texto', obrigatorio: true,
      validar: function(valor, linha, todasLinhas) {
        if (!valor) return null;
        var repetida = todasLinhas.some(function(l) {
          return l !== linha && String(l.conta || '').trim().toLowerCase() === String(valor).trim().toLowerCase();
        });
        return repetida ? 'Conta repetida na grade — o PROCV do motor fica ambíguo.' : null;
      } },
    { key: 'grupo', titulo: 'GRUPO', tipo: 'texto', obrigatorio: true,
      validar: function(valor) {
        if (!valor) return null;
        return dreAdminGrupoCanonico(valor) ? null : 'Grupo não reconhecido pelo motor.';
      } },
    { key: 'fv', titulo: 'F_V', tipo: 'toggle', opcoes: ['F', 'V'] },
    { key: 'di', titulo: 'D_I', tipo: 'toggle', opcoes: ['D', 'I'] }
  ];
}

async function dreAdminAbrirGradePlano(empresaId) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  var empresaNome = adminConsoleCompanyName(empresaId);
  var ui = _dreGradeCriarOverlay('Plano de contas — ' + adminConsoleEscape(empresaNome),
    'Grade editável. Cole do Excel com Ctrl+V, clique nos botões F_V/D_I para marcar. Nada grava até "Salvar no banco".');

  ui.status('Carregando plano de contas...', '');

  var linhas = [];
  try {
    var resposta = await fetch(
      SUPA_URL + '/rest/v1/fin_dre_plano_contas?empresa_id=eq.' + encodeURIComponent(empresaId) + '&select=cod,conta,grupo,fv,di&order=conta.asc',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
    linhas = await resposta.json();
  } catch (e) {
    ui.status('Falha ao carregar: ' + e.message, 'erro');
  }

  var grid = criarGridDRE({
    container: ui.corpo,
    colunas: _dreGradeColunasPlano(),
    linhas: linhas,
    aoMudar: function() { ui.status('', ''); }
  });

  ui.btnSalvar.addEventListener('click', async function() {
    var registros = grid.obterLinhas()
      .filter(function(l) { return l.conta; })
      .map(function(l) {
        return {
          empresa_id: empresaId,
          cod: l.cod || l.conta,
          conta: l.conta,
          grupo: dreAdminGrupoCanonico(l.grupo) || l.grupo,
          fv: (l.fv === 'F' || l.fv === 'V') ? l.fv : '',
          di: (l.di === 'D' || l.di === 'I') ? l.di : ''
        };
      });

    var semGrupo = registros.filter(function(r) { return !dreAdminGrupoCanonico(r.grupo); });
    if (semGrupo.length) {
      ui.status(semGrupo.length + ' conta(s) com grupo inválido — corrija antes de salvar (veja a borda vermelha).', 'erro');
      return;
    }

    if (!window.confirm('Salvar ' + registros.length + ' conta(s) para ' + empresaNome + '? Substitui todo o plano atual desta empresa.')) return;

    ui.status('Salvando...', '');
    try {
      var enviados = await _dreGradeSalvarTabela('fin_dre_plano_contas', empresaId, registros);
      if (typeof adminConsoleTrackActivity === 'function') {
        adminConsoleTrackActivity('financeiro', 'Plano de contas do DRE editado na grade', enviados + ' contas - ' + empresaNome);
      }
      ui.status('✓ ' + enviados.toLocaleString('pt-BR') + ' conta(s) salva(s).', 'ok');
      await dreAdminCarregarResumo(true);
    } catch (e) {
      ui.status('Falha ao salvar: ' + e.message, 'erro');
    }
  });
}

// ── GRADE: LANÇAMENTOS ───────────────────────────────────────────────────────

function _dreGradeColunasLancamentos(planoIndex) {
  return [
    { key: 'conta', titulo: 'CONTA', tipo: 'texto', obrigatorio: true,
      aviso: function(valor) {
        if (!valor || !planoIndex.size) return null;
        return planoIndex.has(String(valor).trim().toLowerCase()) ? null : 'Conta fora do plano — vira #N/A no DRE.';
      } },
    { key: 'dt_caixa', titulo: 'DT_CAIXA', tipo: 'data', obrigatorio: true,
      validar: function(valor) { return valor && !/^\d{4}-\d{2}-\d{2}$/.test(valor) ? 'Data inválida.' : null; } },
    { key: 'dt_venc', titulo: 'DT_VENC', tipo: 'data' },
    { key: 'dt_pag', titulo: 'DT_PAG', tipo: 'data' },
    { key: 'valor', titulo: 'VALOR', tipo: 'numero', obrigatorio: true, soma: true,
      validar: function(valor) { return valor !== '' && isNaN(Number(valor)) ? 'Valor não numérico.' : null; } },
    { key: 'parceiro', titulo: 'PARCEIRO', tipo: 'texto' },
    { key: 'documento', titulo: 'DOCUMENTO', tipo: 'texto' },
    { key: 'banco', titulo: 'BANCO', tipo: 'texto' },
    { key: 'forma', titulo: 'FORMA', tipo: 'texto' },
    { key: 'grupo', titulo: 'GRUPO', tipo: 'derivada' },
    { key: 's_e', titulo: 'S_E', tipo: 'derivada' },
    { key: 'ano', titulo: 'ANO', tipo: 'derivada' },
    { key: 'mes', titulo: 'MÊS', tipo: 'derivada' },
    { key: 'status', titulo: 'STATUS', tipo: 'derivada' }
  ];
}

/** GRUPO/S_E via PROCV no plano; ANO/MÊS/STATUS a partir das datas — mesma lógica do motor. */
function _dreGradeCalcularDerivadasLancamento(planoIndex) {
  var meses = (typeof DRE !== 'undefined' && DRE.MESES) ? DRE.MESES : [];
  return function(linha) {
    var conta = planoIndex.get(String(linha.conta || '').trim().toLowerCase());
    linha.grupo = conta ? conta.grupo : '#N/A';
    linha.s_e = conta ? (typeof DRE !== 'undefined' ? (DRE.SE_POR_GRUPO[conta.grupo] || 'S') : '') : '#N/A';

    var d = new Date(linha.dt_caixa);
    var valido = linha.dt_caixa && !isNaN(d);
    linha.ano = valido ? d.getFullYear() : '';
    linha.mes = valido ? (meses[d.getMonth()] || '') : '';
    linha.status = linha.dt_pag ? 'PG' : 'N';
  };
}

async function dreAdminAbrirGradeLancamentos(empresaId) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  var empresaNome = adminConsoleCompanyName(empresaId);
  var ui = _dreGradeCriarOverlay('Lançamentos — ' + adminConsoleEscape(empresaNome),
    'Grade editável. GRUPO/S_E/ANO/MÊS/STATUS são calculados sozinhos — não edite. Nada grava até "Salvar no banco".');

  ui.status('Carregando lançamentos e plano de contas...', '');

  var linhas = [];
  var planoIndex = new Map();
  try {
    var respostas = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/fin_dre_lancamentos?empresa_id=eq.' + encodeURIComponent(empresaId)
        + '&select=conta,valor,dt_caixa,dt_venc,dt_pag,parceiro,documento,banco,forma&order=dt_caixa.desc&limit=20000',
        { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }),
      fetch(SUPA_URL + '/rest/v1/fin_dre_plano_contas?empresa_id=eq.' + encodeURIComponent(empresaId) + '&select=conta,grupo',
        { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } })
    ]);
    respostas.forEach(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); });
    var dados = await Promise.all(respostas.map(function(r) { return r.json(); }));
    linhas = Array.isArray(dados[0]) ? dados[0] : [];
    (Array.isArray(dados[1]) ? dados[1] : []).forEach(function(c) {
      planoIndex.set(String(c.conta).trim().toLowerCase(), c);
    });
  } catch (e) {
    ui.status('Falha ao carregar: ' + e.message, 'erro');
  }

  if (linhas.length > 5000) {
    ui.status('Aviso: ' + linhas.length.toLocaleString('pt-BR') + ' lançamentos — a grade renderiza tudo de uma vez '
      + 'e pode ficar lenta acima de alguns milhares de linhas. Use filtro por ano/conta se travar.', '');
  }

  var grid = criarGridDRE({
    container: ui.corpo,
    colunas: _dreGradeColunasLancamentos(planoIndex),
    linhas: linhas,
    calcularDerivadas: _dreGradeCalcularDerivadasLancamento(planoIndex),
    aoMudar: function() { ui.status('', ''); }
  });

  ui.btnSalvar.addEventListener('click', async function() {
    var registros = grid.obterLinhas()
      .filter(function(l) { return l.conta && l.dt_caixa; })
      .map(function(l) {
        return {
          empresa_id: empresaId,
          conta: l.conta,
          valor: Number(l.valor) || 0,
          dt_caixa: l.dt_caixa,
          dt_venc: l.dt_venc || l.dt_caixa,
          dt_pag: l.dt_pag || null,
          parceiro: l.parceiro || null,
          documento: l.documento || null,
          banco: l.banco || null,
          forma: l.forma || null,
          origem: 'manual',
          criado_por: (SESSION && SESSION.email) || 'super_admin'
        };
      });

    var foraDoPlano = registros.filter(function(r) { return planoIndex.size && !planoIndex.has(String(r.conta).trim().toLowerCase()); }).length;
    var aviso = foraDoPlano ? ('\n\n' + foraDoPlano + ' conta(s) fora do plano vão ficar de fora do DRE (#N/A).') : '';
    if (!window.confirm('Salvar ' + registros.length + ' lançamento(s) para ' + empresaNome + '? Substitui todos os lançamentos atuais desta empresa.' + aviso)) return;

    ui.status('Salvando...', '');
    try {
      var enviados = await _dreGradeSalvarTabela('fin_dre_lancamentos', empresaId, registros);
      if (typeof adminConsoleTrackActivity === 'function') {
        adminConsoleTrackActivity('financeiro', 'Lançamentos do DRE editados na grade', enviados + ' registros - ' + empresaNome);
      }
      ui.status('✓ ' + enviados.toLocaleString('pt-BR') + ' lançamento(s) salvo(s).', 'ok');
      await dreAdminCarregarResumo(true);
    } catch (e) {
      ui.status('Falha ao salvar: ' + e.message, 'erro');
    }
  });
}
