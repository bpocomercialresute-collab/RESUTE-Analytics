// =============================================================================
// PROCESS — Processamento de dados, extração de atributos e hash de cores
// =============================================================================

/** Cache de cores HSL geradas via hash */
const HSL_HASH_CACHE = new Map();

/** Retorna a cor (hex ou hsl) associada a um nome */
function getChartColor(name) {
  const clean = String(name || 'N/D').toUpperCase().trim();
  if (colorNameMap[clean]) return colorNameMap[clean];
  if (HSL_HASH_CACHE.has(clean)) return HSL_HASH_CACHE.get(clean);
  let hash = 0;
  for (let i = 0; i < clean.length; i++) { hash = clean.charCodeAt(i) + ((hash << 5) - hash); hash = hash & hash; }
  const hsl = `hsl(${Math.abs(hash) % 360}, 65%, 58%)`;
  HSL_HASH_CACHE.set(clean, hsl);
  return hsl;
}

/** Remove máscara de moeda e retorna número */
function limparMascaraNumero(v) {
  if (typeof v === 'number') return v;
  let s = String(v || '').replace('R$', '').trim();
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  return parseFloat(s) || 0;
}

/** Parseia uma data em vários formatos */
function parseData(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d;
  }
  let s = String(v).trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

const fmtData    = d => d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';
const fmtMesAno  = d => d ? `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';

/**
 * Extrai cor e tamanho do nome/SKU do produto quando não há colunas mapeadas.
 * Usa regex compiladas de constants.js.
 */
function extrairAtributos(nome, sku) {
  let n = String(nome || '').toUpperCase().trim();
  let cor = 'N/D', tamanho = 'N/D';
  if (!n && !sku) return { cor, tamanho };

  const matchTam = SIZE_REGEX_GLOBAL.exec(' ' + n + ' ');
  if (matchTam) { tamanho = matchTam[1].toUpperCase(); n = n.replace(matchTam[0], ' '); }
  if (TAMANHOS_UNICOS_SET.has(tamanho)) tamanho = 'ÚNICO';

  const matchCor = MASTER_COLOR_REGEX.exec(' ' + n + ' ');
  if (matchCor) cor = matchCor[1].toUpperCase();

  if (cor === 'N/D' && n.indexOf('-') !== -1) {
    const idx = n.lastIndexOf('-');
    let suf = n.substring(idx + 1).trim();
    suf = suf.replace(LIXO_TAMANHO_REGEX, ' ').replace(SIZE_REGEX_GLOBAL, ' ').replace(/[^A-ZÀ-Úa-zà-ú\s]/gi, ' ').replace(/\s+/g, ' ').trim();
    if (suf.length >= 3 && !NUM_ONLY_REGEX.test(suf)) cor = suf.toUpperCase();
  }

  if (cor === 'N/D' && sku) {
    const ss = String(sku).toUpperCase();
    for (const abbr in skuAbbrMap) {
      if (ss.indexOf('-' + abbr) !== -1 || ss.indexOf('_' + abbr) !== -1 || ss.endsWith(abbr)) { cor = skuAbbrMap[abbr]; break; }
    }
  }

  if (cor !== 'N/D') cor = cor.replace('PRETA','PRETO').replace('BRANCA','BRANCO').replace('VERMELHA','VERMELHO');
  return { cor, tamanho };
}

/** Retorna o header mapeado para um papel (ou null se não mapeado) */
function getCol(kind, role) {
  for (const header in state.mapping[kind]) {
    if (state.mapping[kind][header] === role) return header;
  }
  return null;
}

/** Retorna lista de headers mapeados como CUSTOM */
function getCustomCols(kind) {
  return Object.entries(state.mapping[kind]).filter(([, r]) => r === 'CUSTOM').map(([h]) => h);
}

/** Confirma mapeamento e processa os dados */
function confirmarMapeamento() {
  if (Object.keys(state.mapping.pedidos).length === 0) {
    toast('Marque ao menos uma coluna na planilha de pedidos', 'warn', 4000);
    return;
  }
  showLoader(true, 'Processando dados…');
  setTimeout(() => {
    try {
      processar();
      goToDashboard();
      toast(`${state.unified.length.toLocaleString('pt-BR')} registros processados`, 'success');
    } catch (err) {
      console.error(err);
      toast('Erro: ' + err.message, 'error', 5000);
    } finally {
      showLoader(false);
    }
  }, 80);
}

/** Processa os dados brutos usando o mapeamento definido pelo usuário */
function processar() {
  const colData    = getCol('pedidos', 'DATA');
  const colPedido  = getCol('pedidos', 'PEDIDO');
  const colSku     = getCol('pedidos', 'SKU');
  const colProduto = getCol('pedidos', 'PRODUTO');
  const colQtd     = getCol('pedidos', 'QTD');
  const colValor   = getCol('pedidos', 'VALOR');
  const colCor     = getCol('pedidos', 'COR');
  const colTam     = getCol('pedidos', 'TAMANHO');
  const colEst     = getCol('pedidos', 'ESTAMPA');
  const colStatus  = getCol('pedidos', 'STATUS');
  const customCols = getCustomCols('pedidos');

  // Indexa cadastro de produtos
  const mapProdSKU = new Map(), mapProdNome = new Map();
  if (state.produtos.raw.length) {
    const pSku  = getCol('produtos', 'SKU');
    const pNome = getCol('produtos', 'PRODUTO');
    if (pSku || pNome) {
      state.produtos.raw.forEach(p => {
        const sku  = pSku  ? String(p[pSku]  || '').trim().toUpperCase() : '';
        const nome = pNome ? String(p[pNome] || '').trim().toUpperCase() : '';
        p._SKU = sku; p._nome = nome;
        if (sku)  mapProdSKU.set(sku, p);
        if (nome) mapProdNome.set(nome, p);
      });
    }
  }

  // Dimensões ativas
  const activeDims = [];
  if (colData)           activeDims.push('DATA');
  if (colProduto || colSku) activeDims.push('PRODUTO');
  if (colCor)            activeDims.push('COR');
  else if (colProduto)   activeDims.push('COR_EXTRAIDA');
  if (colTam)            activeDims.push('TAMANHO');
  else if (colProduto)   activeDims.push('TAMANHO_EXTRAIDO');
  if (colEst)            activeDims.push('ESTAMPA');
  if (colStatus)         activeDims.push('STATUS');
  customCols.forEach(h => activeDims.push(`CUSTOM::${h}`));
  state.activeDimensions = activeDims;

  // Processa linhas
  const unified = [];
  state.pedidos.raw.forEach((ped, i) => {
    const rawSku     = colSku     ? String(ped[colSku]     || '').trim() : '';
    const rawProduto = colProduto ? String(ped[colProduto] || '').trim() : '';
    const qtd        = colQtd    ? limparMascaraNumero(ped[colQtd])  : 1;
    const valor      = colValor  ? limparMascaraNumero(ped[colValor]) : 0;
    if (qtd <= 0 && valor <= 0) return;

    const data      = colData   ? parseData(ped[colData]) : null;
    const pedidoNum = colPedido ? String(ped[colPedido] || '-').trim() : '-';
    const status    = colStatus ? String(ped[colStatus] || 'N/D').trim() : 'N/D';

    let cor     = colCor ? String(ped[colCor] || '').trim().toUpperCase() : '';
    let tamanho = colTam ? String(ped[colTam] || '').trim().toUpperCase() : '';
    const estampa = colEst ? String(ped[colEst] || '').trim() : '';

    if (!cor || !tamanho) {
      const extr = extrairAtributos(rawProduto, rawSku);
      if (!cor)     cor     = extr.cor;
      if (!tamanho) tamanho = extr.tamanho;
    }
    if (!cor)     cor     = 'N/D';
    if (!tamanho) tamanho = 'N/D';
    if (TAMANHOS_UNICOS_SET.has(tamanho.toUpperCase())) tamanho = 'ÚNICO';

    let matchTipo     = 'DIRETO';
    let produtoFinal  = rawProduto;
    let skuMestre     = rawSku.toUpperCase().replace(SKU_CLEANER_REGEX, '').replace(TAIL_CLEAN_REGEX, '').trim();

    if (mapProdSKU.size || mapProdNome.size) {
      matchTipo = 'SEM MATCH';
      if (skuMestre && mapProdSKU.has(skuMestre)) {
        const ref = mapProdSKU.get(skuMestre);
        if (ref._nome) produtoFinal = ref._nome;
        matchTipo = 'SKU EXATO';
      } else if (rawProduto && mapProdNome.has(rawProduto.toUpperCase())) {
        matchTipo = 'NOME';
      } else if (rawProduto) {
        matchTipo = 'BUSCA TEXTUAL';
      }
    }

    const record = {
      _rowIndex: i, data, mesAno: fmtMesAno(data),
      pedido: pedidoNum, skuOriginal: rawSku, skuMestre,
      produto: produtoFinal || '(sem nome)',
      cor, tamanho, estampa: estampa || '—', status,
      quantidade: qtd, valorUnitario: qtd ? valor / qtd : 0, valorTotal: valor, match: matchTipo
    };
    customCols.forEach(h => {
      const v = ped[h];
      record[`custom::${h}`] = (v === null || v === undefined || v === '') ? '—' : String(v).trim();
    });
    unified.push(record);
  });

  state.unified = unified;
  aplicarFiltros();
}
