// =============================================================================
// DRE — GRID ESTILO EXCEL (motor genérico)
// =============================================================================
// Componente novo, independente da ferramenta original (js/dre/dre-engine.js,
// views/dre-painel.html, css/dre-painel.css) — não toca em nenhum deles.
// Usado pelo console admin (js/dre/dre-admin.js) para editar Plano de Contas
// e Lançamentos com comportamento de planilha: célula clicável, colar/copiar
// do Excel, navegação por teclado, ordenar, filtrar, desfazer, validação
// inline e totais no rodapé — ver docs/ferramenta/modelo/PROMPT_DRE_RESUTE.md.
//
// Escopo assumido para manter colar/copiar sem ambiguidade: COLAR só funciona
// sem ordenação nem filtro ativos (a grid pede pra limpar antes). Com a view
// reordenada, a posição visual das células não bate com o array de dados, e
// colar num "meio" de outra ordem quebraria silenciosamente. Copiar, navegar
// e editar célula a célula funcionam normalmente com filtro/ordenação ativos.
//
// Uma instância por chamada de criarGridDRE(); duas instâncias vivem ao mesmo
// tempo (Plano de Contas e Lançamentos), cada uma com seu próprio estado.
// =============================================================================

/**
 * @param {object} cfg
 * @param {HTMLElement} cfg.container         onde a grid é desenhada (fica vazio até aqui)
 * @param {Array<object>} cfg.colunas         ver formato abaixo
 * @param {Array<object>} cfg.linhas          dados iniciais (mutados em memória; salvar é responsabilidade de quem chama)
 * @param {function} [cfg.calcularDerivadas]  (linha, todasLinhas) => void — escreve as colunas tipo 'derivada' na própria linha
 * @param {function} [cfg.aoMudar]            (linhas) => void — chamado após toda edição/colagem/exclusão/desfazer
 *
 * Formato de coluna:
 *   { key, titulo, tipo: 'texto'|'numero'|'data'|'toggle'|'derivada',
 *     opcoes: ['F','V'],        // só para tipo 'toggle'
 *     obrigatorio: true,
 *     soma: true,               // entra no total do rodapé (só 'numero')
 *     validar: (valor, linha, todasLinhas) => string|null,   // mensagem de erro ou null
 *     aviso: (valor, linha, todasLinhas) => string|null }    // mensagem de aviso (não bloqueia), célula amarela
 *
 * @returns {{ obterLinhas: function, definirLinhas: function, revalidar: function, destruir: function }}
 */
function criarGridDRE(cfg) {
  var container = cfg.container;
  var colunas = cfg.colunas;
  var linhas = (cfg.linhas || []).map(function(l) { return Object.assign({}, l); });
  var calcularDerivadas = cfg.calcularDerivadas || function() {};
  var aoMudar = cfg.aoMudar || function() {};

  var ordenacao = { chave: null, direcao: 0 };   // direcao: 0 nenhuma, 1 asc, -1 desc
  var filtros = {};                              // chave -> Set(valores permitidos) — ausente = sem filtro
  var busca = '';
  var buscaOcorrencias = [];
  var buscaIndice = -1;

  var ativa = null;          // { linha: indice na VIEW, col: indice na coluna editável/derivada }
  var selecaoFim = null;     // idem, para range com shift+click
  var editando = false;
  var ultimaColagem = 0;     // contador exibido ao usuário

  var snapshotDesfazer = null; // clone de `linhas` antes da última colagem/limpeza
  var removerListenerFiltro = null; // detacha o "clicar fora fecha" do dropdown de filtro anterior

  recalcularTudo();

  // ── ARMAÇÃO DO DOM ──────────────────────────────────────────────────────────

  container.innerHTML =
      '<div class="fin-grid-toolbar">'
    +   '<button type="button" class="fin-grid-btn" data-acao="limpar">Limpar tudo</button>'
    +   '<button type="button" class="fin-grid-btn" data-acao="desfazer" disabled>Desfazer última colagem</button>'
    +   '<input type="search" class="fin-grid-busca" placeholder="Buscar na grade... (Enter = próxima)">'
    +   '<span class="fin-grid-contagem"></span>'
    +   '<span class="fin-grid-aviso-colar"></span>'
    + '</div>'
    + '<div class="fin-grid-scroll"><table class="fin-grid-tabela"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>'
    + '<div class="fin-grid-rodape-msg"></div>';

  var elBusca = container.querySelector('.fin-grid-busca');
  var elContagem = container.querySelector('.fin-grid-contagem');
  var elAvisoColar = container.querySelector('.fin-grid-aviso-colar');
  var elBtnDesfazer = container.querySelector('[data-acao="desfazer"]');
  var elTabela = container.querySelector('.fin-grid-tabela');
  var elThead = elTabela.querySelector('thead');
  var elTbody = elTabela.querySelector('tbody');
  var elTfoot = elTabela.querySelector('tfoot');
  var elRodapeMsg = container.querySelector('.fin-grid-rodape-msg');

  container.querySelector('[data-acao="limpar"]').addEventListener('click', function() {
    if (!linhas.length) return;
    if (!window.confirm('Limpar todas as ' + linhas.length + ' linha(s) desta grade? (não afeta o banco até você salvar)')) return;
    guardarParaDesfazer();
    linhas = [];
    ativa = null; selecaoFim = null;
    aposMudar();
  });

  elBtnDesfazer.addEventListener('click', desfazer);

  elBusca.addEventListener('input', function() { busca = elBusca.value; localizarOcorrencias(); desenharCorpo(); });
  elBusca.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!buscaOcorrencias.length) return;
    buscaIndice = (buscaIndice + 1) % buscaOcorrencias.length;
    desenharCorpo();
    focarOcorrenciaAtual();
  });

  container.tabIndex = -1;
  container.addEventListener('paste', aoColar);
  container.addEventListener('copy', aoCopiar);
  container.addEventListener('keydown', aoTeclar);

  desenharCabecalho();
  desenharCorpo();
  desenharRodape();

  // ── CÁLCULO / VALIDAÇÃO ──────────────────────────────────────────────────────

  function recalcularTudo() {
    linhas.forEach(function(l) { calcularDerivadas(l, linhas); });
  }

  /** Roda validar/aviso de toda coluna em toda linha. Guarda o resultado na própria célula (não no dado). */
  function validarTudo() {
    var mapa = new Map(); // linha (objeto) -> { key -> {erro, aviso} }
    linhas.forEach(function(l) {
      var porColuna = {};
      colunas.forEach(function(c) {
        var valor = l[c.key];
        var erro = c.obrigatorio && (valor === '' || valor == null) ? 'Campo obrigatório.' : null;
        if (!erro && typeof c.validar === 'function') erro = c.validar(valor, l, linhas);
        var aviso = !erro && typeof c.aviso === 'function' ? c.aviso(valor, l, linhas) : null;
        porColuna[c.key] = { erro: erro, aviso: aviso };
      });
      mapa.set(l, porColuna);
    });
    return mapa;
  }

  // ── VIEW (ordenação + filtro) ────────────────────────────────────────────────

  function viewAtual() {
    var lista = linhas.slice();

    Object.keys(filtros).forEach(function(chave) {
      var permitidos = filtros[chave];
      if (!permitidos) return;
      lista = lista.filter(function(l) { return permitidos.has(String(l[chave] == null ? '' : l[chave])); });
    });

    if (ordenacao.chave && ordenacao.direcao) {
      var chave = ordenacao.chave, dir = ordenacao.direcao;
      var coluna = colunas.filter(function(c) { return c.key === chave; })[0];
      var numerica = coluna && coluna.tipo === 'numero';
      lista.sort(function(a, b) {
        var va = a[chave], vb = b[chave];
        if (numerica) { va = Number(va) || 0; vb = Number(vb) || 0; return (va - vb) * dir; }
        va = String(va == null ? '' : va).toLowerCase();
        vb = String(vb == null ? '' : vb).toLowerCase();
        return va < vb ? -dir : va > vb ? dir : 0;
      });
    }

    return lista;
  }

  function semFiltroOuOrdenacao() {
    return !ordenacao.chave && !Object.keys(filtros).some(function(k) { return !!filtros[k]; });
  }

  // ── DESENHO ──────────────────────────────────────────────────────────────────

  function desenharCabecalho() {
    var tr = document.createElement('tr');
    colunas.forEach(function(c) {
      var th = document.createElement('th');
      th.className = 'fin-grid-th' + (c.tipo === 'derivada' ? ' fin-grid-th-derivada' : '');

      var rotulo = document.createElement('span');
      rotulo.className = 'fin-grid-th-rotulo';
      rotulo.textContent = c.titulo;
      rotulo.addEventListener('click', function() { alternarOrdenacao(c.key); });
      th.appendChild(rotulo);

      if (ordenacao.chave === c.key && ordenacao.direcao) {
        var seta = document.createElement('span');
        seta.className = 'fin-grid-th-seta';
        seta.textContent = ordenacao.direcao === 1 ? '▲' : '▼';
        th.appendChild(seta);
      }

      if (c.tipo !== 'derivada') {
        var filtroBtn = document.createElement('button');
        filtroBtn.type = 'button';
        filtroBtn.className = 'fin-grid-th-filtro' + (filtros[c.key] ? ' ativo' : '');
        filtroBtn.title = 'Filtrar ' + c.titulo;
        filtroBtn.textContent = '▾';
        filtroBtn.addEventListener('click', function(e) { e.stopPropagation(); abrirFiltro(c, filtroBtn); });
        th.appendChild(filtroBtn);
      }

      tr.appendChild(th);
    });
    elThead.innerHTML = '';
    elThead.appendChild(tr);
  }

  function alternarOrdenacao(chave) {
    if (ordenacao.chave !== chave) { ordenacao = { chave: chave, direcao: 1 }; }
    else if (ordenacao.direcao === 1) { ordenacao.direcao = -1; }
    else { ordenacao = { chave: null, direcao: 0 }; }
    desenharCabecalho();
    desenharCorpo();
  }

  function abrirFiltro(coluna, botao) {
    document.querySelectorAll('.fin-grid-filtro-flutuante').forEach(function(n) { n.remove(); });
    if (removerListenerFiltro) { document.removeEventListener('click', removerListenerFiltro); removerListenerFiltro = null; }

    var valores = Array.from(new Set(linhas.map(function(l) { return String(l[coluna.key] == null ? '' : l[coluna.key]); })));
    valores.sort();
    var selecionados = filtros[coluna.key] || new Set(valores);

    var painel = document.createElement('div');
    painel.className = 'fin-grid-filtro-flutuante';
    painel.innerHTML =
        '<div class="fin-grid-filtro-acoes">'
      +   '<button type="button" data-todos="1">Selecionar tudo</button>'
      +   '<button type="button" data-todos="0">Limpar</button>'
      + '</div>'
      + '<div class="fin-grid-filtro-lista"></div>'
      + '<div class="fin-grid-filtro-rodape">'
      +   '<button type="button" data-ok="1">Aplicar</button>'
      +   '<button type="button" data-cancelar="1">Cancelar</button>'
      + '</div>';

    var lista = painel.querySelector('.fin-grid-filtro-lista');
    valores.forEach(function(v) {
      var linha = document.createElement('label');
      linha.className = 'fin-grid-filtro-item';
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = selecionados.has(v);
      chk.value = v;
      linha.appendChild(chk);
      var span = document.createElement('span');
      span.textContent = v === '' ? '(vazio)' : v;
      linha.appendChild(span);
      lista.appendChild(linha);
    });

    painel.querySelectorAll('[data-todos]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var marcar = btn.dataset.todos === '1';
        lista.querySelectorAll('input').forEach(function(c) { c.checked = marcar; });
      });
    });
    painel.querySelector('[data-cancelar]').addEventListener('click', function() { painel.remove(); });
    painel.querySelector('[data-ok]').addEventListener('click', function() {
      var marcados = Array.from(lista.querySelectorAll('input:checked')).map(function(c) { return c.value; });
      if (marcados.length === valores.length) delete filtros[coluna.key];
      else filtros[coluna.key] = new Set(marcados);
      painel.remove();
      desenharCabecalho();
      desenharCorpo();
    });

    document.body.appendChild(painel);
    var r = botao.getBoundingClientRect();
    painel.style.top = (window.scrollY + r.bottom + 4) + 'px';
    painel.style.left = (window.scrollX + r.left) + 'px';

    setTimeout(function() {
      removerListenerFiltro = function(e) {
        if (!painel.contains(e.target)) {
          painel.remove();
          document.removeEventListener('click', removerListenerFiltro);
          removerListenerFiltro = null;
        }
      };
      document.addEventListener('click', removerListenerFiltro);
    }, 0);
  }

  function localizarOcorrencias() {
    buscaOcorrencias = [];
    buscaIndice = -1;
    if (!busca.trim()) return;
    var alvo = busca.trim().toLowerCase();
    var view = viewAtual();
    view.forEach(function(l, li) {
      colunas.forEach(function(c, ci) {
        var texto = String(l[c.key] == null ? '' : l[c.key]).toLowerCase();
        if (texto.indexOf(alvo) !== -1) buscaOcorrencias.push({ linha: li, col: ci });
      });
    });
    if (buscaOcorrencias.length) buscaIndice = 0;
  }

  function focarOcorrenciaAtual() {
    if (buscaIndice < 0) return;
    var alvo = buscaOcorrencias[buscaIndice];
    var celula = elTbody.querySelector('[data-linha="' + alvo.linha + '"][data-col="' + alvo.col + '"]');
    if (celula) celula.scrollIntoView({ block: 'center' });
  }

  function desenharCorpo() {
    var view = viewAtual();
    var validacoes = validarTudo();
    elTbody.innerHTML = '';

    if (!view.length) {
      var trVazio = document.createElement('tr');
      var tdVazio = document.createElement('td');
      tdVazio.colSpan = colunas.length;
      tdVazio.className = 'fin-grid-vazio';
      tdVazio.textContent = linhas.length ? 'Nenhuma linha corresponde ao filtro.' : 'Sem linhas. Cole dados do Excel (Ctrl+V) com uma célula selecionada.';
      trVazio.appendChild(tdVazio);
      elTbody.appendChild(trVazio);
      elContagem.textContent = '';
      return;
    }

    view.forEach(function(linha, li) {
      var tr = document.createElement('tr');
      var estadoLinha = validacoes.get(linha) || {};

      colunas.forEach(function(c, ci) {
        var td = document.createElement('td');
        td.dataset.linha = String(li);
        td.dataset.col = String(ci);
        td.className = 'fin-grid-td';
        if (c.tipo === 'derivada') td.className += ' fin-grid-td-derivada';
        if (c.tipo === 'numero') td.className += ' fin-grid-td-num';

        var v = estadoLinha[c.key] || {};
        if (v.erro) { td.className += ' fin-grid-td-invalida'; td.title = v.erro; }
        else if (v.aviso) { td.className += ' fin-grid-td-aviso'; td.title = v.aviso; }

        if (naSelecao(li, ci)) td.className += ' fin-grid-td-selecionada';
        var ehOcorrencia = buscaOcorrencias.some(function(o) { return o.linha === li && o.col === ci; });
        if (ehOcorrencia) td.className += ' fin-grid-td-encontrada';

        if (c.tipo === 'toggle') {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'fin-grid-toggle';
          btn.textContent = linha[c.key] || '—';
          btn.addEventListener('click', function(e) {
            e.stopPropagation();
            selecionarUnica(li, ci);
            alternarToggle(linha, c);
          });
          td.appendChild(btn);
        } else {
          td.textContent = linha[c.key] == null ? '' : String(linha[c.key]);
        }

        td.addEventListener('mousedown', function(e) {
          if (e.shiftKey && ativa) { selecaoFim = { linha: li, col: ci }; desenharCorpo(); return; }
          selecionarUnica(li, ci);
        });
        if (c.tipo !== 'toggle' && c.tipo !== 'derivada') {
          td.addEventListener('dblclick', function() { iniciarEdicao(li, ci); });
        }

        tr.appendChild(td);
      });

      elTbody.appendChild(tr);
    });

    elContagem.textContent = view.length + ' linha(s)' + (view.length !== linhas.length ? ' de ' + linhas.length : '');
  }

  function desenharRodape() {
    var view = viewAtual();
    var tr = document.createElement('tr');
    colunas.forEach(function(c) {
      var td = document.createElement('td');
      if (c.soma && c.tipo === 'numero') {
        var soma = view.reduce(function(s, l) { return s + (Number(l[c.key]) || 0); }, 0);
        td.textContent = soma.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        td.className = 'fin-grid-td-num';
      }
      tr.appendChild(td);
    });
    elTfoot.innerHTML = '';
    elTfoot.appendChild(tr);
  }

  function atualizarTudo() {
    desenharCabecalho();
    desenharCorpo();
    desenharRodape();
  }

  // ── SELEÇÃO / NAVEGAÇÃO ──────────────────────────────────────────────────────

  function naSelecao(li, ci) {
    if (!ativa) return false;
    var fim = selecaoFim || ativa;
    var l0 = Math.min(ativa.linha, fim.linha), l1 = Math.max(ativa.linha, fim.linha);
    var c0 = Math.min(ativa.col, fim.col), c1 = Math.max(ativa.col, fim.col);
    return li >= l0 && li <= l1 && ci >= c0 && ci <= c1;
  }

  function selecionarUnica(li, ci) {
    ativa = { linha: li, col: ci };
    selecaoFim = null;
    desenharCorpo();
    container.focus();
  }

  function alternarToggle(linha, coluna) {
    var atual = linha[coluna.key];
    var i = coluna.opcoes.indexOf(atual);
    linha[coluna.key] = i === -1 ? coluna.opcoes[0] : (i === coluna.opcoes.length - 1 ? '' : coluna.opcoes[i + 1]);
    aposMudar();
  }

  function iniciarEdicao(li, ci) {
    if (editando) return;
    var view = viewAtual();
    var linha = view[li];
    var coluna = colunas[ci];
    if (!linha || coluna.tipo === 'derivada' || coluna.tipo === 'toggle') return;

    editando = true;
    var td = elTbody.querySelector('[data-linha="' + li + '"][data-col="' + ci + '"]');
    if (!td) { editando = false; return; }

    var valorAtual = linha[coluna.key] == null ? '' : String(linha[coluna.key]);
    td.innerHTML = '';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'fin-grid-input';
    input.value = valorAtual;
    td.appendChild(input);
    input.focus();
    input.select();

    function commit(avancar) {
      if (!editando) return;
      editando = false;
      linha[coluna.key] = normalizarValor(coluna, input.value);
      aposMudar();
      if (avancar === 'baixo') moverAtiva(1, 0);
      else if (avancar === 'direita') moverAtiva(0, 1);
      else desenharCorpo();
    }

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); commit('baixo'); }
      else if (e.key === 'Tab') { e.preventDefault(); commit('direita'); }
      else if (e.key === 'Escape') { e.preventDefault(); editando = false; desenharCorpo(); }
    });
    input.addEventListener('blur', function() { commit(null); });
  }

  function normalizarValor(coluna, texto) {
    texto = String(texto == null ? '' : texto).trim();
    if (coluna.tipo === 'numero') {
      if (!texto) return '';
      var limpo = texto.replace(/[R$\s]/gi, '');
      if (limpo.indexOf(',') !== -1) limpo = limpo.replace(/\./g, '').replace(',', '.');
      var n = Number(limpo);
      return isNaN(n) ? texto : n;
    }
    if (coluna.tipo === 'data') {
      return normalizarDataTexto(texto) || texto;
    }
    return texto;
  }

  function normalizarDataTexto(texto) {
    texto = String(texto || '').trim();
    if (!texto) return '';
    var iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return texto;
    var br = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!br) return texto;
    var ano = br[3].length === 2 ? '20' + br[3] : br[3];
    return ano + '-' + String(br[2]).padStart(2, '0') + '-' + String(br[1]).padStart(2, '0');
  }

  function moverAtiva(dl, dc) {
    if (!ativa) { selecionarUnica(0, 0); return; }
    var view = viewAtual();
    var novaLinha = Math.min(Math.max(ativa.linha + dl, 0), Math.max(view.length - 1, 0));
    var novaCol = Math.min(Math.max(ativa.col + dc, 0), colunas.length - 1);
    selecionarUnica(novaLinha, novaCol);
  }

  // ── TECLADO ──────────────────────────────────────────────────────────────────

  function aoTeclar(e) {
    if (editando) return; // input próprio cuida das teclas
    if (!ativa && (e.key === 'Tab' || e.key.indexOf('Arrow') === 0)) { selecionarUnica(0, 0); }

    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); desfazer(); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); moverAtiva(1, 0); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); moverAtiva(-1, 0); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); moverAtiva(0, -1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moverAtiva(0, 1); return; }
    if (e.key === 'Tab')        { e.preventDefault(); moverAtiva(0, e.shiftKey ? -1 : 1); return; }
    if (e.key === 'Enter')      { e.preventDefault(); if (ativa) iniciarEdicao(ativa.linha, ativa.col); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!ativa) return;
      e.preventDefault();
      apagarSelecao();
      return;
    }
    // Digitar direto numa célula selecionada substitui o conteúdo (comportamento Excel)
    if (ativa && !editando && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      iniciarEdicao(ativa.linha, ativa.col);
      var input = elTbody.querySelector('.fin-grid-input');
      if (input) input.value = e.key;
    }
  }

  function apagarSelecao() {
    var view = viewAtual();
    var fim = selecaoFim || ativa;
    var l0 = Math.min(ativa.linha, fim.linha), l1 = Math.max(ativa.linha, fim.linha);
    var c0 = Math.min(ativa.col, fim.col), c1 = Math.max(ativa.col, fim.col);
    for (var li = l0; li <= l1; li++) {
      var linha = view[li];
      if (!linha) continue;
      for (var ci = c0; ci <= c1; ci++) {
        var coluna = colunas[ci];
        if (coluna.tipo === 'derivada') continue;
        linha[coluna.key] = coluna.tipo === 'numero' ? '' : '';
      }
    }
    aposMudar();
  }

  // ── COLAR / COPIAR ───────────────────────────────────────────────────────────

  function aoColar(e) {
    if (!ativa || editando) return;
    e.preventDefault();

    if (!semFiltroOuOrdenacao()) {
      mostrarAvisoColar('Remova o filtro e a ordenação antes de colar.');
      return;
    }

    var texto = (e.clipboardData || window.clipboardData).getData('text');
    if (!texto) return;

    var linhasColadas = texto.replace(/\r/g, '').split('\n');
    if (linhasColadas.length && linhasColadas[linhasColadas.length - 1] === '') linhasColadas.pop();
    if (!linhasColadas.length) return;

    guardarParaDesfazer();

    var colInicio = ativa.col;
    var linhaInicio = ativa.linha;

    linhasColadas.forEach(function(linhaTexto, offsetLinha) {
      var valores = linhaTexto.split('\t');
      var indiceDado = linhaInicio + offsetLinha;

      while (indiceDado >= linhas.length) linhas.push(criarLinhaVazia());
      var linha = linhas[indiceDado];

      valores.forEach(function(valor, offsetCol) {
        var coluna = colunas[colInicio + offsetCol];
        if (!coluna || coluna.tipo === 'derivada') return;
        linha[coluna.key] = normalizarValor(coluna, valor);
      });
    });

    ultimaColagem = linhasColadas.length;
    mostrarAvisoColar(ultimaColagem + ' linha(s) colada(s).');
    aposMudar();
  }

  function mostrarAvisoColar(msg) {
    elAvisoColar.textContent = msg;
    setTimeout(function() { if (elAvisoColar.textContent === msg) elAvisoColar.textContent = ''; }, 4000);
  }

  function criarLinhaVazia() {
    var l = {};
    colunas.forEach(function(c) { l[c.key] = ''; });
    return l;
  }

  function aoCopiar(e) {
    if (!ativa) return;
    var view = viewAtual();
    var fim = selecaoFim || ativa;
    var l0 = Math.min(ativa.linha, fim.linha), l1 = Math.max(ativa.linha, fim.linha);
    var c0 = Math.min(ativa.col, fim.col), c1 = Math.max(ativa.col, fim.col);

    var linhasTexto = [];
    for (var li = l0; li <= l1; li++) {
      var linha = view[li];
      if (!linha) continue;
      var valores = [];
      for (var ci = c0; ci <= c1; ci++) valores.push(linha[colunas[ci].key] == null ? '' : String(linha[colunas[ci].key]));
      linhasTexto.push(valores.join('\t'));
    }

    e.clipboardData.setData('text/plain', linhasTexto.join('\n'));
    e.preventDefault();
  }

  // ── DESFAZER ─────────────────────────────────────────────────────────────────

  function guardarParaDesfazer() {
    snapshotDesfazer = linhas.map(function(l) { return Object.assign({}, l); });
    elBtnDesfazer.disabled = false;
  }

  function desfazer() {
    if (!snapshotDesfazer) return;
    linhas = snapshotDesfazer;
    snapshotDesfazer = null;
    elBtnDesfazer.disabled = true;
    ativa = null; selecaoFim = null;
    aposMudar();
  }

  // ── CICLO ────────────────────────────────────────────────────────────────────

  function aposMudar() {
    recalcularTudo();
    atualizarTudo();
    aoMudar(linhas);
  }

  return {
    obterLinhas: function() { return linhas.slice(); },
    definirLinhas: function(novas) {
      linhas = (novas || []).map(function(l) { return Object.assign({}, l); });
      ativa = null; selecaoFim = null; snapshotDesfazer = null;
      elBtnDesfazer.disabled = true;
      aposMudar();
    },
    revalidar: atualizarTudo,
    destruir: function() { container.innerHTML = ''; }
  };
}
