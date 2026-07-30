// =============================================================================
// FINANCEIRO — ADMIN (entrada de dados)
// =============================================================================
// Importacao manual de lancamentos pelo super_admin, no mesmo espirito do
// fluxo manual do comercial: o usuario cola a planilha e o sistema converte.
//
// A escrita passa pelo fetch monkey-patched do auth.js, ou seja, vai para
// /api/secure-proxy, que exige sessao valida e so aceita gravacao em fin_*
// de super_admin. Nada de service role no navegador.
//
// Colunas esperadas, nesta ordem (tab ou ponto-e-virgula como separador):
//   tipo | competencia | vencimento | parceiro | documento | categoria |
//   valor | status | pagamento
// =============================================================================

var FIN_ADMIN_COLUNAS = [
  'tipo', 'competencia', 'vencimento', 'parceiro', 'documento',
  'categoria', 'valor', 'status', 'pagamento'
];

var FIN_ADMIN_LOTE = 500;

// ── MODAL DE IMPORTACAO ──────────────────────────────────────────────────────

function finAdminAbrirImportacao(empresaId) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  var empresaNome = typeof adminConsoleCompanyName === 'function'
    ? adminConsoleCompanyName(empresaId) : 'Empresa';

  var html =
      '<div class="admin-form-grid">'
    +   '<label class="admin-field admin-field-full">'
    +     '<span>Lançamentos de ' + adminConsoleEscape(empresaNome) + '</span>'
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
    +   '<pre class="fin-import-exemplo">tipo\tcompetência\tvencimento\tparceiro\tdocumento\tcategoria\tvalor\tstatus\tpagamento\n'
    +     'receita\t01/03/2026\t10/03/2026\tCliente X\tNF 1234\tVendas\t1500,00\tprevisto\t\n'
    +     'despesa\t01/03/2026\t05/03/2026\tFornecedor Y\tBOL 998\tInsumos\t430,50\tpago\t05/03/2026</pre>'
    +   'Datas em dd/mm/aaaa ou aaaa-mm-dd. Status: previsto, pago ou cancelado. '
    +   'Linha de cabeçalho é ignorada automaticamente.'
    + '</div>'
    + '<div class="admin-modal-actions">'
    +   '<button type="button" onclick="adminConsoleFecharModal()">Cancelar</button>'
    +   '<button class="admin-btn-primary" type="submit">Importar</button>'
    + '</div>';

  adminConsoleAbrirModal('FINANCEIRO', 'Importar lançamentos', html, function(formData) {
    finAdminImportar(empresaId, String(formData.get('dados') || ''), !!formData.get('substituir'));
  });
}

// ── PARSER ───────────────────────────────────────────────────────────────────

/** Aceita dd/mm/aaaa, dd-mm-aaaa e aaaa-mm-dd. Devolve 'aaaa-mm-dd' ou null. */
function finAdminData(valor) {
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
function finAdminValor(valor) {
  var texto = String(valor || '').replace(/[R$\s]/gi, '').trim();
  if (!texto) return null;

  // Com vírgula decimal: remove separador de milhar e troca a vírgula
  if (texto.indexOf(',') !== -1) texto = texto.replace(/\./g, '').replace(',', '.');

  var numero = Number(texto);
  return isNaN(numero) ? null : numero;
}

function finAdminTipo(valor) {
  var texto = String(valor || '').trim().toLowerCase();
  if (texto.indexOf('rec') === 0 || texto === 'entrada' || texto === 'e') return 'receita';
  if (texto.indexOf('desp') === 0 || texto === 'saida' || texto === 'saída' || texto === 's') return 'despesa';
  return null;
}

function finAdminStatus(valor) {
  var texto = String(valor || '').trim().toLowerCase();
  if (texto.indexOf('pag') === 0 || texto.indexOf('receb') === 0 || texto.indexOf('baix') === 0) return 'pago';
  if (texto.indexOf('canc') === 0) return 'cancelado';
  return 'previsto';
}

/**
 * Converte o texto colado em linhas prontas para o banco.
 * @returns {{registros: Array, erros: Array<string>}}
 */
function finAdminParsear(texto, empresaId) {
  var registros = [];
  var erros = [];

  String(texto || '').split(/\r?\n/).forEach(function(linha, indice) {
    if (!linha.trim()) return;

    var colunas = linha.indexOf('\t') !== -1 ? linha.split('\t') : linha.split(';');
    var campo = {};
    FIN_ADMIN_COLUNAS.forEach(function(nome, i) { campo[nome] = (colunas[i] || '').trim(); });

    // Pula o cabeçalho, se veio junto
    if (indice === 0 && finAdminTipo(campo.tipo) === null
        && String(campo.tipo).toLowerCase().indexOf('tipo') === 0) return;

    var numeroLinha = indice + 1;
    var tipo = finAdminTipo(campo.tipo);
    var competencia = finAdminData(campo.competencia);
    var valor = finAdminValor(campo.valor);

    if (!tipo)         { erros.push('Linha ' + numeroLinha + ': tipo deve ser receita ou despesa.'); return; }
    if (!competencia)  { erros.push('Linha ' + numeroLinha + ': competência inválida.'); return; }
    if (valor === null){ erros.push('Linha ' + numeroLinha + ': valor inválido.'); return; }

    registros.push({
      empresa_id:       empresaId,
      tipo:             tipo,
      descricao:        campo.parceiro || null,
      parceiro:         campo.parceiro || null,
      documento:        campo.documento || null,
      categoria:        campo.categoria || 'Sem categoria',
      valor:            valor,
      data_competencia: competencia,
      data_vencimento:  finAdminData(campo.vencimento) || competencia,
      data_pagamento:   finAdminData(campo.pagamento),
      status:           finAdminStatus(campo.status),
      origem:           'manual',
      criado_por:       (SESSION && SESSION.email) || 'super_admin'
    });
  });

  return { registros: registros, erros: erros };
}

// ── GRAVACAO ─────────────────────────────────────────────────────────────────

async function finAdminImportar(empresaId, texto, substituir) {
  var resultado = finAdminParsear(texto, empresaId);

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
  var confirmacao = 'Importar ' + resultado.registros.length.toLocaleString('pt-BR')
    + ' lançamento(s) para ' + empresaNome + '?'
    + (substituir ? '\n\nATENÇÃO: todos os lançamentos atuais desta empresa serão apagados antes.' : '');
  if (!window.confirm(confirmacao)) return;

  adminConsoleFecharModal();

  try {
    if (substituir) {
      adminConsoleAviso('Removendo lançamentos anteriores...', 'info');
      var remocao = await fetch(
        SUPA_URL + '/rest/v1/fin_lancamentos?empresa_id=eq.' + encodeURIComponent(empresaId),
        { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
      );
      if (!remocao.ok) throw new Error('Falha ao limpar os lançamentos anteriores (HTTP ' + remocao.status + ').');
    }

    var enviados = 0;
    for (var i = 0; i < resultado.registros.length; i += FIN_ADMIN_LOTE) {
      var lote = resultado.registros.slice(i, i + FIN_ADMIN_LOTE);
      var resposta = await fetch(SUPA_URL + '/rest/v1/fin_lancamentos', {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + SVC_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(lote)
      });
      if (!resposta.ok) throw new Error('Falha ao gravar o lote ' + (i / FIN_ADMIN_LOTE + 1)
        + ' (HTTP ' + resposta.status + ').');
      enviados += lote.length;
      adminConsoleAviso('Gravando... ' + enviados.toLocaleString('pt-BR') + ' de '
        + resultado.registros.length.toLocaleString('pt-BR'), 'info');
    }

    adminConsoleTrackActivity('financeiro', 'Lançamentos importados',
      enviados + ' registros - ' + empresaNome);
    adminConsoleAviso('✓ ' + enviados.toLocaleString('pt-BR')
      + ' lançamento(s) importado(s) para ' + empresaNome + '.', 'success');
    await finAdminCarregarResumo(true);

  } catch (e) {
    console.error('[FIN-ADMIN] Importação falhou:', e);
    adminConsoleAviso('Importação falhou: ' + e.message, 'error');
  }
}

/** Apaga todos os lançamentos de uma empresa. Confirmação dupla, sem volta. */
async function finAdminLimpar(empresaId) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  var empresaNome = adminConsoleCompanyName(empresaId);

  if (!window.confirm('Apagar TODOS os lançamentos financeiros de ' + empresaNome + '?')) return;
  if (!window.confirm('Confirme: esta ação não pode ser desfeita. Apagar tudo de ' + empresaNome + '?')) return;

  try {
    var resposta = await fetch(
      SUPA_URL + '/rest/v1/fin_lancamentos?empresa_id=eq.' + encodeURIComponent(empresaId),
      { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status);

    adminConsoleTrackActivity('financeiro', 'Lançamentos apagados', empresaNome);
    adminConsoleAviso('Lançamentos de ' + empresaNome + ' apagados.', 'success');
    await finAdminCarregarResumo(true);
  } catch (e) {
    adminConsoleAviso('Falha ao apagar: ' + e.message, 'error');
  }
}

// ── RESUMO POR EMPRESA (mostrado nos cards da aba Financeiro) ────────────────

var FIN_ADMIN_RESUMO = {};   // empresa_id -> { registros, receita, despesa }
var FIN_ADMIN_RESUMO_OK = false;

async function finAdminCarregarResumo(force) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  if (FIN_ADMIN_RESUMO_OK && !force) return;

  try {
    var resposta = await fetch(
      SUPA_URL + '/rest/v1/fin_lancamentos?select=empresa_id,tipo,valor,status&limit=100000',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status);

    var linhas = await resposta.json();
    var resumo = {};
    (Array.isArray(linhas) ? linhas : []).forEach(function(l) {
      var id = String(l.empresa_id);
      if (!resumo[id]) resumo[id] = { registros: 0, receita: 0, despesa: 0 };
      resumo[id].registros += 1;
      if (String(l.status).toLowerCase() === 'cancelado') return;
      if (String(l.tipo).toLowerCase() === 'receita') resumo[id].receita += Number(l.valor) || 0;
      else resumo[id].despesa += Number(l.valor) || 0;
    });

    FIN_ADMIN_RESUMO = resumo;
    FIN_ADMIN_RESUMO_OK = true;
  } catch (e) {
    // Tabela ainda não criada ou indisponível: os cards apenas não mostram volume
    FIN_ADMIN_RESUMO = {};
    FIN_ADMIN_RESUMO_OK = false;
    console.warn('[FIN-ADMIN] Resumo indisponível:', e && e.message);
  }

  if (typeof adminConsoleRenderFinanceiro === 'function') adminConsoleRenderFinanceiro();
}

/** Linha de volume mostrada no card da empresa. */
function finAdminResumoTexto(empresaId) {
  var resumo = FIN_ADMIN_RESUMO[String(empresaId)];
  if (!resumo || !resumo.registros) return 'Nenhum lançamento importado.';
  return resumo.registros.toLocaleString('pt-BR') + ' lançamento(s) · entradas '
    + finFormatarMoedaCurta(resumo.receita) + ' · saídas ' + finFormatarMoedaCurta(resumo.despesa);
}
