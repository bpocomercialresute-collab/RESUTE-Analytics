// =============================================================================
// AUTODETECT — Engine de detecção automática de papéis de colunas
// =============================================================================

/** Toggle global do recurso Status */
function toggleStatusFeature(enabled) {
  state.statusEnabled = enabled;
  if (!enabled) {
    ['pedidos', 'produtos'].forEach(kind => {
      for (const h in state.mapping[kind]) {
        if (state.mapping[kind][h] === 'STATUS') delete state.mapping[kind][h];
      }
    });
  }
  toast(enabled ? 'Análise de Status ativada' : 'Análise de Status desativada', 'info', 2500);
}

/**
 * Fuzzy match: compara um header normalizado contra a lista de hints de um papel.
 * Retorna { score, exact }.
 */
function fuzzyMatch(headerNorm, hints) {
  for (const hint of hints) {
    if (headerNorm === hint)                          return { score: 100, exact: true  };
    if (hint.length >= 3 && headerNorm.includes(hint)) return { score: 60,  exact: false };
    if (headerNorm.length >= 3 && hint.includes(headerNorm)) return { score: 55, exact: false };
  }
  return { score: 0, exact: false };
}

/**
 * Analisa o conteúdo de até 100 células e retorna métricas
 * usadas para inferir o tipo de dado da coluna.
 */
function analyzeColumnContent(values) {
  let nonEmpty = 0, dateCount = 0, numCount = 0, monetaryCount = 0;
  let skuLikeCount = 0, sizeValueCount = 0, colorValueCount = 0, statusLikeCount = 0;
  let intSum = 0, intCount = 0, floatCount = 0;
  let avgLength = 0, textWithSpaces = 0;
  const distinctValues = new Set();

  const DATE_REGEX     = /(\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{4}-\d{1,2}-\d{1,2})|(\d{1,2}-\d{1,2}-\d{2,4})|(\d{1,2}\.\d{1,2}\.\d{2,4})/;
  const MONETARY_REGEX = /R\$|\$\s?[\d.,]+|^\s*[\d]{1,3}(?:[.,]\d{3})*[.,]\d{2}\s*$/;
  const SKU_LIKE_REGEX = /^[A-Z0-9][A-Z0-9\-_.]{2,}[A-Z0-9]$/i;
  const EAN_REGEX      = /^\d{8,14}$/;
  const SIZE_VALUES    = new Set(['PP','P','M','G','GG','XG','XGG','EXG','U','UN','UNICO','UNICA','ÚNICO','ÚNICA','TM','34','36','38','40','42','44','46','48','50','52','54','56']);
  const COLOR_KW       = new Set(Object.keys(colorNameMap));
  const STATUS_KW      = new Set(['APROVADO','PENDENTE','CANCELADO','ENTREGUE','ENVIADO','FATURADO','EM PROCESSAMENTO','PROCESSANDO','FINALIZADO','ABERTO','FECHADO','PAGO','AGUARDANDO','CONCLUIDO','ATIVO','INATIVO','RECEBIDO','SEPARACAO','PRODUCAO','EXPEDICAO','PREPARANDO','ATRASADO']);

  values.slice(0, 100).forEach(v => {
    if (v === null || v === undefined || v === '') return;
    nonEmpty++;
    const s     = String(v).trim();
    const upper = s.toUpperCase();
    distinctValues.add(upper);
    avgLength += s.length;
    if (s.includes(' ')) textWithSpaces++;
    if (DATE_REGEX.test(s) || (v instanceof Date) || (typeof v === 'number' && v > 20000 && v < 60000)) dateCount++;
    if (MONETARY_REGEX.test(s)) monetaryCount++;
    const num = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
    if (!isNaN(num) && isFinite(num)) {
      numCount++;
      if (Number.isInteger(num)) { intSum += num; intCount++; } else floatCount++;
    }
    if (SKU_LIKE_REGEX.test(s) && /[A-Z]/i.test(s) && /\d/.test(s) && s.length <= 40) skuLikeCount++;
    else if (EAN_REGEX.test(s)) skuLikeCount++;
    if (SIZE_VALUES.has(upper))   sizeValueCount++;
    if (COLOR_KW.has(upper))      colorValueCount++;
    if (STATUS_KW.has(upper))     statusLikeCount++;
  });

  avgLength = nonEmpty > 0 ? avgLength / nonEmpty : 0;
  const intAvg = intCount > 0 ? intSum / intCount : 0;

  return {
    nonEmpty,
    dateRatio:       nonEmpty > 0 ? dateCount       / nonEmpty : 0,
    monetaryRatio:   nonEmpty > 0 ? monetaryCount   / nonEmpty : 0,
    numRatio:        nonEmpty > 0 ? numCount        / nonEmpty : 0,
    intRatio:        nonEmpty > 0 ? intCount        / nonEmpty : 0,
    floatRatio:      nonEmpty > 0 ? floatCount      / nonEmpty : 0,
    skuRatio:        nonEmpty > 0 ? skuLikeCount    / nonEmpty : 0,
    sizeRatio:       nonEmpty > 0 ? sizeValueCount  / nonEmpty : 0,
    colorRatio:      nonEmpty > 0 ? colorValueCount / nonEmpty : 0,
    statusRatio:     nonEmpty > 0 ? statusLikeCount / nonEmpty : 0,
    textWithSpacesRatio: nonEmpty > 0 ? textWithSpaces / nonEmpty : 0,
    avgLength, intAvg,
    distinctCount: distinctValues.size,
    distinctRatio: nonEmpty > 0 ? distinctValues.size / nonEmpty : 0
  };
}

/**
 * Calcula score de compatibilidade (0–200) entre um header e um papel.
 * Combina score do nome do header e análise de conteúdo.
 */
function scoreRole(headerNormalized, contentAnalysis, role) {
  let score  = 0;
  const hints = HEADER_HINTS[role] || [];
  score += fuzzyMatch(headerNormalized, hints).score;

  const a = contentAnalysis;
  if (!a || a.nonEmpty === 0) return score;

  switch (role) {
    case 'DATA':
      if (a.dateRatio > 0.8) score += 80;
      else if (a.dateRatio > 0.5) score += 40;
      else if (a.dateRatio > 0.2) score += 15;
      break;
    case 'VALOR':
      if (a.monetaryRatio > 0.5) score += 50;
      if (a.floatRatio > 0.6)    score += 25;
      if (a.numRatio > 0.9 && a.intAvg > 10) score += 20;
      if (a.avgLength > 3 && a.avgLength < 20 && a.numRatio > 0.8) score += 15;
      break;
    case 'QTD':
      if (a.intRatio > 0.9 && a.intAvg < 50 && a.intAvg > 0) score += 45;
      if (a.intRatio > 0.9 && a.intAvg < 1000) score += 15;
      if (a.distinctCount < 20) score += 10;
      break;
    case 'SKU':
      if (a.skuRatio > 0.7) score += 55;
      else if (a.skuRatio > 0.4) score += 25;
      if (a.distinctRatio > 0.7) score += 20;
      break;
    case 'PEDIDO':
      if (a.intRatio > 0.8 && a.intAvg > 100) score += 30;
      if (a.distinctRatio > 0.5) score += 15;
      break;
    case 'PRODUTO':
      if (a.avgLength > 10 && a.avgLength < 120 && a.numRatio < 0.3) score += 35;
      if (a.textWithSpacesRatio > 0.6) score += 15;
      break;
    case 'COR':
      if (a.colorRatio > 0.5) score += 80;
      else if (a.colorRatio > 0.2) score += 40;
      if (a.distinctCount < 30 && a.avgLength < 20) score += 10;
      break;
    case 'TAMANHO':
      if (a.sizeRatio > 0.5) score += 80;
      else if (a.sizeRatio > 0.2) score += 40;
      if (a.distinctCount < 15) score += 15;
      break;
    case 'STATUS':
      if (a.statusRatio > 0.5) score += 70;
      else if (a.statusRatio > 0.2) score += 35;
      if (a.distinctCount <= 10 && a.avgLength < 25 && a.avgLength > 3 && a.numRatio < 0.3) score += 25;
      break;
    case 'ESTAMPA':
      if (a.avgLength > 5 && a.avgLength < 50 && a.distinctRatio > 0.3) score += 20;
      break;
  }

  return score;
}

/** Detecta automaticamente os papéis de todas as colunas de uma planilha */
function detectarRoles(kind) {
  const d = state[kind];
  if (!d.raw.length) return {};

  const colAnalysis = {};
  d.headers.forEach(header => {
    colAnalysis[header] = analyzeColumnContent(d.raw.slice(0, 100).map(row => row[header]));
  });

  const rolesToTry = state.statusEnabled
    ? ['DATA','PEDIDO','SKU','PRODUTO','QTD','VALOR','COR','TAMANHO','ESTAMPA','STATUS']
    : ['DATA','PEDIDO','SKU','PRODUTO','QTD','VALOR','COR','TAMANHO','ESTAMPA'];

  const scores = {};
  d.headers.forEach(header => {
    const hNorm = normalizeKey(header).replace(/[\s_\-\.\/]/g, '');
    scores[header] = {};
    rolesToTry.forEach(role => {
      scores[header][role] = scoreRole(hNorm, colAnalysis[header], role);
    });
  });

  // Greedy best-match com unicidade de roles
  const assigned = {}, result = {};
  const candidates = [];
  for (const header in scores) {
    for (const role in scores[header]) {
      if (scores[header][role] >= 40) candidates.push({ header, role, score: scores[header][role] });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    if (result[c.header]) continue;
    if (ROLES[c.role].unique && assigned[c.role]) continue;
    result[c.header] = c.role;
    if (ROLES[c.role].unique) assigned[c.role] = c.header;
  }
  return result;
}

/** Aplica auto-detecção ao state. Se forceOverride, sobrescreve mapeamentos existentes. */
function autoDetectarEAplicar(kind, forceOverride = false) {
  const detected = detectarRoles(kind);
  let applied = 0;
  for (const header in detected) {
    if (!forceOverride && state.mapping[kind][header]) continue;
    const role = detected[header];
    if (ROLES[role].unique) {
      const taken = Object.entries(state.mapping[kind]).find(([h, r]) => r === role && h !== header);
      if (taken && !forceOverride) continue;
    }
    state.mapping[kind][header] = role;
    applied++;
  }
  return applied;
}

/** Botão "Sugestão automática" — força override em todas as planilhas carregadas */
function autoMapping() {
  let totalApplied = 0;
  ['pedidos', 'produtos'].forEach(kind => {
    if (!state[kind].raw.length) return;
    const applied = autoDetectarEAplicar(kind, true);
    totalApplied += applied;
    renderSheetGrid(kind, kind === 'pedidos' ? 'sheetGridPed' : 'sheetGridProd');
  });
  updateMappedCount();
  if (totalApplied > 0) {
    toast(`${totalApplied} coluna${totalApplied > 1 ? 's' : ''} mapeada${totalApplied > 1 ? 's' : ''} automaticamente`, 'success');
  } else {
    toast('Nenhum padrão reconhecido — configure manualmente', 'warn');
  }
}
