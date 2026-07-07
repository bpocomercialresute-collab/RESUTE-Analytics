// =============================================================================
// RELATORIOS.JS — Navegação entre áreas do app
// =============================================================================

function _hide(id){ var e=document.getElementById(id); if(e) e.style.display='none'; }
function _show(id){ var e=document.getElementById(id); if(e) e.style.display='block'; }
function _setBreadcrumb(txt){ var e=document.getElementById('breadcrumb-text'); if(e) e.textContent=txt; }

function _activePaneId(areaSelector) {
  var pane = document.querySelector(areaSelector + ' .av-tab-pane.active');
  return pane ? pane.id : '';
}

function _exportAreaInfo(tipo) {
  if (tipo === 'representantes') return { areaId: 'av-rep-area', titulo: 'Relatorio de Representantes' };
  if (tipo === 'bd') return { areaId: 'av-bd-area', titulo: 'BD e Cadastros' };
  return { areaId: 'av-rel-area', titulo: 'Relatorio de Produtos' };
}

function _exportPane(tipo) {
  var info = _exportAreaInfo(tipo);
  var paneId = _activePaneId('#' + info.areaId);
  var pane = paneId ? document.getElementById(paneId) : document.getElementById(info.areaId);
  return { info: info, pane: pane };
}

function _exportNomeArquivo(tipo, formato) {
  var info = _exportAreaInfo(tipo);
  var data = new Date().toISOString().slice(0, 10);
  return info.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + data + '.' + formato;
}

function _downloadBlob(blob, nome) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    URL.revokeObjectURL(url);
    a.remove();
  }, 250);
}

function _htmlEscape(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _pdfEscape(v) {
  return String(v == null ? '' : v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ]/g, ' ');
}

function _textoRelatorio(pane, titulo) {
  var linhas = [titulo, 'Gerado em ' + new Date().toLocaleString('pt-BR'), ''];
  if (!pane) return linhas.concat(['Nenhum conteudo encontrado.']);

  var tabelas = pane.querySelectorAll('table');
  if (tabelas.length) {
    tabelas.forEach(function(tbl, idx) {
      if (idx > 0) linhas.push('');
      var caption = tbl.closest('.laudo-doc, .av-table-wrap, .rep-scroll-area, .premio-report-table') || tbl.parentElement;
      var title = caption ? caption.querySelector('.laudo-section-title, .rel-title, .premio-report-title, .laudo-chart-title') : null;
      if (title && title.textContent.trim()) linhas.push(title.textContent.trim());
      tbl.querySelectorAll('tr').forEach(function(tr) {
        var cells = Array.from(tr.children).map(function(td) {
          return td.textContent.replace(/\s+/g, ' ').trim();
        }).filter(Boolean);
        if (cells.length) linhas.push(cells.join(' | '));
      });
    });
  } else {
    pane.innerText.split(/\n+/).map(function(x){ return x.trim(); }).filter(Boolean).forEach(function(x) {
      linhas.push(x);
    });
  }
  return linhas;
}

function _quebrarLinha(txt, max) {
  var s = String(txt || '').replace(/\s+/g, ' ').trim();
  if (!s) return [''];
  var partes = [];
  while (s.length > max) {
    var corte = s.lastIndexOf(' ', max);
    if (corte < 30) corte = max;
    partes.push(s.slice(0, corte));
    s = s.slice(corte).trim();
  }
  partes.push(s);
  return partes;
}

function _gerarPdfTexto(linhas) {
  var paginas = [];
  var atual = [];
  linhas.forEach(function(linha) {
    _quebrarLinha(linha, 95).forEach(function(parte) {
      if (atual.length >= 54) {
        paginas.push(atual);
        atual = [];
      }
      atual.push(parte);
    });
  });
  if (atual.length) paginas.push(atual);
  if (!paginas.length) paginas.push(['Relatorio sem conteudo.']);

  var objetos = [''];
  objetos.push('<< /Type /Catalog /Pages 2 0 R >>');
  var kids = paginas.map(function(_, i) { return (3 + i * 2) + ' 0 R'; }).join(' ');
  objetos.push('<< /Type /Pages /Kids [' + kids + '] /Count ' + paginas.length + ' >>');
  paginas.forEach(function(page, i) {
    var pageObj = 3 + i * 2;
    var contentObj = pageObj + 1;
    objetos.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ' + contentObj + ' 0 R >>');
    var y = 806;
    var stream = 'BT\n/F1 9 Tf\n';
    page.forEach(function(line) {
      stream += '40 ' + y + ' Td (' + _pdfEscape(line) + ') Tj\n';
      stream += '-40 0 Td\n';
      y -= 14;
    });
    stream += 'ET';
    objetos.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
  });

  var pdf = '%PDF-1.4\n';
  var offsets = [0];
  for (var i = 1; i < objetos.length; i++) {
    offsets[i] = pdf.length;
    pdf += i + ' 0 obj\n' + objetos[i] + '\nendobj\n';
  }
  var xref = pdf.length;
  pdf += 'xref\n0 ' + objetos.length + '\n0000000000 65535 f \n';
  for (var j = 1; j < objetos.length; j++) {
    pdf += String(offsets[j]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size ' + objetos.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return pdf;
}

function exportarRelatorioAtual(tipo, formato) {
  var alvo = _exportPane(tipo);
  if (!alvo.pane) {
    alert('Nenhum relatorio ativo para exportar.');
    return;
  }
  var titulo = alvo.info.titulo;
  if (formato === 'excel') {
    var clone = alvo.pane.cloneNode(true);
    clone.querySelectorAll('canvas, svg, button, input, select').forEach(function(el) { el.remove(); });
    var html = '<html><head><meta charset="UTF-8"></head><body>'
      + '<h2>' + _htmlEscape(titulo) + '</h2>'
      + '<p>Gerado em ' + _htmlEscape(new Date().toLocaleString('pt-BR')) + '</p>'
      + clone.innerHTML
      + '</body></html>';
    _downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }), _exportNomeArquivo(tipo, 'xls'));
    return;
  }
  var linhas = _textoRelatorio(alvo.pane, titulo);
  _downloadBlob(new Blob([_gerarPdfTexto(linhas)], { type: 'application/pdf' }), _exportNomeArquivo(tipo, 'pdf'));
}

function imprimirRelatorioAtual(tipo) {
  exportarRelatorioAtual(tipo, 'pdf');
}

function garantirAbaPremiacaoRepresentantes() {
  var area = document.getElementById('av-rep-area');
  if (!area) return;
  var bar = area.querySelector('.av-tabs-bar');
  if (bar && !bar.querySelector('[data-target="rep-tab-premiacao"]')) {
    var btn = document.createElement('button');
    btn.className = 'av-tab';
    btn.dataset.area = 'rep';
    btn.dataset.target = 'rep-tab-premiacao';
    btn.textContent = 'PREMIACAO';
    bar.appendChild(btn);
  }
  if (!document.getElementById('rep-tab-premiacao')) {
    var pane = document.createElement('div');
    pane.id = 'rep-tab-premiacao';
    pane.className = 'av-tab-pane';
    pane.innerHTML = '<div class="av-rel-placeholder"><p>PREMIACAO</p><span>Ranking de representantes para campanhas e premios</span></div>';
    area.appendChild(pane);
  }
}

function normalizarBotoesExportacao() {
  garantirAbaPremiacaoRepresentantes();
  document.querySelectorAll('.rel-export-pdf').forEach(function(btn) {
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>Baixar PDF';
    if (btn.dataset.excelReady === '1') return;
    var onclick = btn.getAttribute('onclick') || '';
    var m = onclick.match(/exportarRelatorioAtual\('([^']+)'/);
    var tipo = m ? m[1] : 'produtos';
    var excel = document.createElement('button');
    excel.type = 'button';
    excel.className = 'rel-print-btn rel-export-excel';
    excel.addEventListener('click', function() {
      exportarRelatorioAtual(tipo, 'excel');
    });
    excel.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/></svg>Baixar Excel';
    btn.insertAdjacentElement('afterend', excel);
    btn.dataset.excelReady = '1';
  });
  var repArea = document.getElementById('av-rep-area');
  if (repArea && !repArea.querySelector('.rel-export-pdf')) {
    var voltar = repArea.querySelector('.voltar-btn');
    var wrap = document.createElement('div');
    var criarBotao = function(formato, texto, classe) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rel-print-btn ' + classe;
      btn.addEventListener('click', function() {
        exportarRelatorioAtual('representantes', formato);
      });
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/></svg>' + texto;
      return btn;
    };
    wrap.className = 'rel-export-actions rel-export-actions-rep';
    wrap.appendChild(criarBotao('pdf', 'Baixar PDF', 'rel-export-pdf'));
    wrap.appendChild(criarBotao('excel', 'Baixar Excel', 'rel-export-excel'));
    if (voltar) voltar.insertAdjacentElement('afterend', wrap);
  }
}

document.addEventListener('DOMContentLoaded', normalizarBotoesExportacao);

function avGoHome() {
  if (typeof SESSION !== 'undefined' && SESSION && SESSION.papel === 'cliente') {
    var wrapper = document.getElementById('cui-wrapper');
    if (wrapper) wrapper.style.display = 'none';
    var app = document.getElementById('view-app');
    if (app) app.style.display = 'none';
    var dash = document.getElementById('view-dash-cliente');
    if (dash) dash.style.display = 'flex';
    document.body.classList.remove('client-report-mode');
    _setBreadcrumb('Análise de Vendas');
    return;
  }
  _hide('av-bd-area');
  _hide('av-rel-area');
  _hide('av-rep-area');
  _show('av-home');
  _setBreadcrumb('Início');
}

function avShowBD() {
  _hide('av-home');
  _hide('av-rel-area');
  _hide('av-rep-area');
  _show('av-bd-area');
  _setBreadcrumb('BD & Cadastros');
  if (typeof jssEnsureInit === 'function') jssEnsureInit();
}

function avShowRel(tipo) {
  _hide('av-home');
  _hide('av-bd-area');
  _hide('av-rep-area');

  // RELAT REPRESENTANTES vai para área própria
  if (tipo === 'relat-representantes') {
    if (typeof garantirAbaPremiacaoRepresentantes === 'function') garantirAbaPremiacaoRepresentantes();
    if (typeof normalizarBotoesExportacao === 'function') normalizarBotoesExportacao();
    _show('av-rep-area');
    _setBreadcrumb('Relat. Representantes');
    if (typeof BD_DATA !== 'undefined' && BD_DATA.rows && BD_DATA.rows.length > 0) {
      var repAtiva = _activePaneId('#av-rep-area') || 'rep-tab-mix';
      if (typeof repRenderTab === 'function') repRenderTab(repAtiva);
    }
    return;
  }

  // RELAT PRODUTOS
  _show('av-rel-area');
  _setBreadcrumb('Relat. Produtos');

  // Gera todos os relatórios se tiver dados
  if (false && typeof BD_DATA !== 'undefined' && BD_DATA.rows && BD_DATA.rows.length > 0) {
    try { if (typeof bdUpdateCadastroInsights === 'function') bdUpdateCadastroInsights(); } catch(e){ console.error(e); }
    try { if (typeof bdUpdateVendaProduto    === 'function') bdUpdateVendaProduto(); }    catch(e){ console.error(e); }
    try { if (typeof bdUpdateLaudoGrupo      === 'function') bdUpdateLaudoGrupo(); }      catch(e){ console.error(e); }
    try { if (typeof bdUpdateLaudoMarca      === 'function') bdUpdateLaudoMarca(); }      catch(e){ console.error(e); }
    try { if (typeof bdUpdateLaudoGruposAno  === 'function') bdUpdateLaudoGruposAno(); }  catch(e){ console.error(e); }
    try { if (typeof bdUpdateLaudoGruposAno02=== 'function') bdUpdateLaudoGruposAno02();} catch(e){ console.error(e); }
  } else {
    // Sem dados — mostra aviso em cada painel
    var msg = '<div class="rel-sem-dados">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="40" height="40"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
      + '<p>Nenhum dado carregado</p>'
      + '<span>Clique em <b>Sincronizar</b> para buscar os dados da API, ou acesse <b>BD & Cadastros</b> e cole manualmente.</span>'
      + '</div>';
    ['av-rel-cadastro-insights','av-rel-venda-produto','av-rel-laudo-grupo','av-rel-laudo-ano','av-rel-laudo-ano02','av-rel-laudo-marca'].forEach(function(id){
      var el = document.getElementById(id);
      if (el) el.innerHTML = msg;
    });
  }

  // Ativa a aba correta
  var alvo = 'av-rel-venda-produto';
  if (tipo === 'relat-produtos') alvo = 'av-rel-venda-produto';
  document.querySelectorAll('#av-rel-area .av-tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('#av-rel-area .av-tab-pane').forEach(function(p){ p.classList.remove('active'); });
  var tab  = document.querySelector('#av-rel-area [data-target="'+alvo+'"]');
  var pane = document.getElementById(alvo);
  if (tab)  tab.classList.add('active');
  if (pane) pane.classList.add('active');
  if (typeof BD_DATA !== 'undefined' && BD_DATA.rows && BD_DATA.rows.length > 0 && typeof relRenderTab === 'function') {
    relRenderTab(alvo);
  }
}

// Troca de abas genérica
document.addEventListener('click', function(e) {
  var tab = e.target.closest('.av-tab');
  if (!tab || !tab.dataset.target) return;
  var bar  = tab.closest('.av-tabs-bar');
  if (!bar) return;
  var area = bar.parentElement;
  bar.querySelectorAll('.av-tab').forEach(function(t){ t.classList.remove('active'); });
  area.querySelectorAll('.av-tab-pane').forEach(function(p){ p.classList.remove('active'); });
  tab.classList.add('active');
  var pane = document.getElementById(tab.dataset.target);
  if (pane) pane.classList.add('active');
  if (tab.dataset.area === 'rep' && typeof repRenderTab === 'function') {
    repRenderTab(tab.dataset.target);
  } else if (area && area.id === 'av-rel-area' && typeof relRenderTab === 'function') {
    relRenderTab(tab.dataset.target);
  }
});
