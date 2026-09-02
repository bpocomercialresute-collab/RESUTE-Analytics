/* ============================================================
   MOTOR DO DRE — RESUTE
   Réplica em JS da cadeia PLANO_CONTAS -> BD -> BD_DRE -> DESIGN.
   Arquivo separado: o contrato de encaixe proíbe <script> no bloco HTML.
   ============================================================ */

const DRE = (() => {
  'use strict';

  /* ---------- 1. CONSTANTES DO MODELO ---------- */

  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // Grupo -> s_e. Réplica da coluna Y do BD_DRE.
  // '0' = extracontábil: NÃO entra na soma do resultado.
  const SE_POR_GRUPO = {
    'RECEITA OPERACIONAL':     'E',
    'RECEITA NÃO OPERACIONAL': 'E',
    'FATURAMENTO':             '0',
    'VALOR PRODUZIDO':         '0',
    'DESCONTOS CONCEDIDOS':    '0',
    'FATURAMENTO FISCAL':      '0',
    'CUSTO. MP OU REVENDA':    'S',
    'DESP. OPERACIONAL':       'S',
    'DESP. COMERCIAL':         'S',
    'DESP. LOGÍSTICA':         'S',
    'DESP. ADM':               'S',
    'MANUT. E CONSERVAÇÃO':    'S',
    'DESP. TRIBUTÁRIA':        'S',
    'DESP. FINANCEIRA':        'S',
    'PROLABORE E RETIRADA':    'S',
    'DESP. FIXA':              'S',
    'INVESTIMENTOS':           'S'
  };

  // Estrutura do DRE — ordem exata do painel Resultado
  const ESTRUTURA = [
    // ── Receitas ──────────────────────────────────────────────────
    { tipo:'separador',  nome:'RECEITA' },
    { tipo:'grupo',      nome:'VALOR PRODUZIDO',         paralelo:true },
    { tipo:'grupo',      nome:'FATURAMENTO',             paralelo:true },
    { tipo:'grupo',      nome:'RECEITA OPERACIONAL',     sinal:'+' },
    { tipo:'grupo',      nome:'RECEITA NÃO OPERACIONAL', sinal:'+' },
    { tipo:'grupo',      nome:'DESCONTOS CONCEDIDOS',    paralelo:true },
    { tipo:'grupo',      nome:'FATURAMENTO FISCAL',      paralelo:true },
    // ── Despesas ──────────────────────────────────────────────────
    { tipo:'grupo',      nome:'PROLABORE E RETIRADA',    sinal:'-' },
    { tipo:'grupo',      nome:'DESP. ADM',               sinal:'-' },
    { tipo:'grupo',      nome:'MANUT. E CONSERVAÇÃO',    sinal:'-' },
    { tipo:'grupo',      nome:'DESP. OPERACIONAL',       sinal:'-' },
    { tipo:'grupo',      nome:'CUSTO. MP OU REVENDA',    sinal:'-' },
    { tipo:'grupo',      nome:'DESP. TRIBUTÁRIA',        sinal:'-' },
    { tipo:'grupo',      nome:'DESP. FINANCEIRA',        sinal:'-' },
    { tipo:'grupo',      nome:'DESP. LOGÍSTICA',         sinal:'-' },
    { tipo:'grupo',      nome:'DESP. COMERCIAL',         sinal:'-' },
    // ── Investimentos ─────────────────────────────────────────────
    { tipo:'grupo',      nome:'INVESTIMENTOS',           sinal:'-' }
  ];

  /* ---------- 2. ESTADO ---------- */

  const estado = {
    plano: [],          // PLANO_CONTAS
    lancamentos: [],    // BD
    bd: [],             // BD enriquecido (PROCV + ano/mesIdx), todo o historico, sem filtro de recorte
    bdDre: [],          // BD_DRE
    ano: null,
    anoInicio: null,    // ano do início do recorte
    anoFim: null,       // ano do fim do recorte
    cnpj: 1,
    mesInicio: 0,       // índice 0-11
    mesFim: 11,
    slots: [],          // [{ano, mes}] — lista plana de meses no recorte
    charts: {},
    empresa: ''
  };

  /* ---------- 3. UTILITÁRIOS ---------- */

  // O BD grava o mês em minúsculo ('set') e o BD_DRE em capitalizado ('Set').
  // No Excel o SUMIFS é case-insensitive; em JS não é. Normaliza os dois lados.
  const norm = v => String(v ?? '').trim().toLowerCase();

  const num = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const fmt = v => {
    const n = Math.round(num(v));
    return n === 0 ? '-' : n.toLocaleString('pt-BR');
  };

  const fmtPct = v => (num(v) * 100).toFixed(2).replace('.', ',') + '%';

  const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const mesesDoRecorte = () => estado.slots.length || (estado.mesFim - estado.mesInicio + 1);

  // Reconstrói estado.slots — lista plana de {ano,mes} que cobre o recorte.
  // Suporta intervalos multi-ano (ex: Ago/2025 → Ago/2026 = 13 slots).
  function _construirSlots() {
    const anoI = estado.anoInicio ?? estado.ano;
    const anoF = estado.anoFim   ?? estado.ano;
    const slots = [];
    if (anoI != null && anoF != null) {
      let a = anoI, m = estado.mesInicio;
      const fimA = anoF, fimM = estado.mesFim;
      while ((a < fimA || (a === fimA && m <= fimM)) && slots.length < 60) {
        slots.push({ ano: a, mes: m });
        m++;
        if (m > 11) { m = 0; a++; }
      }
    }
    if (!slots.length) {
      const a = estado.ano ?? new Date().getFullYear();
      for (let i = estado.mesInicio; i <= estado.mesFim; i++)
        slots.push({ ano: a, mes: i });
    }
    estado.slots = slots;
    return slots;
  }

  const parseData = v => {
    if (!v) return null;
    const s = String(v).trim();
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    const d = new Date(s);
    return isNaN(d) ? null : d;
  };

  const dataBR = v => {
    if (!v) return '';
    const s = String(v).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s;
  };

  /* ---------- 4. ESTÁGIO 1: PLANO_CONTAS ---------- */

  // Indexa o plano por nome de conta. É a chave do PROCV.
  function indexarPlano() {
    const idx = new Map();
    for (const c of estado.plano) {
      const k = norm(c.conta);
      if (idx.has(k)) console.warn('[DRE] Conta duplicada no plano:', c.conta);
      idx.set(k, c);
    }
    return idx;
  }

  const seDoGrupo = g => SE_POR_GRUPO[g] ?? 'S';

  /* ---------- 5. ESTÁGIO 2: BD (PROCV + derivadas de data) ---------- */

  function enriquecerBD() {
    const idx = indexarPlano();
    return estado.lancamentos.map(l => {
      const c = idx.get(norm(l.conta));
      const d = parseData(l.dt_caixa);
      const valido = d && !isNaN(d);
      // ISO date strings ("2024-01-15") são UTC midnight. getFullYear/getMonth usam
      // fuso local — no Brasil (UTC-3) viram o dia anterior. getUTC* evita isso.
      return {
        ...l,
        grupo: c ? c.grupo : '#N/A',          // PROCV
        s_e:   c ? seDoGrupo(c.grupo) : '#N/A',
        fv:    c ? (c.fv || '') : '',
        di:    c ? (c.di || '') : '',
        ano:   valido ? d.getUTCFullYear() : null,
        mesIdx: valido ? d.getUTCMonth() : null,
        mes:   valido ? MESES[d.getUTCMonth()] : null,
        status: l.dt_pag ? 'PG' : 'N'
      };
    });
  }

  /* ---------- 6. ESTÁGIO 3: BD_DRE (o SUMIFS) ---------- */

  /*  Fórmula original, célula G2 do BD_DRE:
      =SUMIFS(BD!$G:$G;
              BD!$E:$E; BD_DRE!$F2;   <- conta
              BD!$Y:$Y; BD_DRE!$D2;   <- ano
              BD!$W:$W; BD_DRE!G$1;   <- mês (cabeçalho da coluna)
              BD!$P:$P; BD_DRE!$B2)   <- CNPJ

      Em vez de varrer o BD 12x por conta (321 x 12 = 3.852 varreduras),
      indexa o BD uma vez por chave conta|ano|mês|cnpj — mesmo resultado,
      uma passada só.                                                      */
  function montarBDDRE() {
    const slots = _construirSlots();
    const bd = enriquecerBD();

    // Indexa todos os lançamentos por conta|ano|mesIdx|cnpj (multi-ano)
    const soma = new Map();
    for (const l of bd) {
      if (l.ano == null) continue;
      const chave = `${norm(l.conta)}|${l.ano}|${l.mesIdx}|${l.cnpj}`;
      soma.set(chave, num(soma.get(chave)) + num(l.valor));
    }

    // meses[i] = valor do slot i (não mais índice de calendário fixo)
    const linhas = [];
    let id = 1;
    for (const c of estado.plano) {
      const meses = slots.map(sl =>
        num(soma.get(`${norm(c.conta)}|${sl.ano}|${sl.mes}|${estado.cnpj}`))
      );
      linhas.push({
        id: id++,
        cnpj: estado.cnpj,
        ano: estado.anoInicio ?? estado.ano,
        codigo: c.cod,
        conta: c.conta,
        grupo: c.grupo,
        fv: c.fv || '',
        di: c.di || '',
        s_e: seDoGrupo(c.grupo),
        cad: 'OK',
        meses,
        total: 0, med: 0, pct: 0     // preenchidos abaixo
      });
    }

    for (const l of linhas) {
      const t = l.meses.reduce((s, v) => s + v, 0);
      l.total = t;
      l.med = slots.length > 0 ? t / slots.length : 0;
    }

    // % = TOTAL da linha / RECEITA total do período.
    // Precisa da receita já somada — por isso é um segundo passe.
    const receita = linhas
      .filter(l => l.s_e === 'E')
      .reduce((s, l) => s + l.total, 0);
    for (const l of linhas) l.pct = receita ? l.total / receita : 0;

    estado.bdDre = linhas;
    estado.bd = bd;
    return linhas;
  }

  /* ---------- 7. ESTÁGIO 4: TOTALIZADORES E RESULTADO ---------- */

  function totalGrupo(nome) {
    const linhas = estado.bdDre.filter(l => l.grupo === nome);
    const n = estado.slots.length || mesesDoRecorte();
    const meses = Array.from({ length: n }, (_, i) =>
      linhas.reduce((s, l) => s + (l.meses[i] || 0), 0)
    );
    const total = linhas.reduce((s, l) => s + l.total, 0);
    return { linhas, meses, total, med: n > 0 ? total / n : 0 };
  }

  /* ---------- 7b. EVOLUÇÃO ANUAL (acumulado + variação ano a ano) ----------
     Bloco fixo por baixo do TOTAL de cada tabela da aba Resultados: sempre
     compara os 2 anos mais recentes com lançamento no BD_DRE, mês a mês,
     independente do recorte de período selecionado na tela — só usa o
     recorte pra saber QUANTAS colunas de mês desenhar e qual mês cada
     coluna representa (estado.slots[i].mes), ignorando o ano de cada slot. */

  // Anos distintos com lançamento válido (ano != null), mais recente primeiro.
  function anosDisponiveis() {
    const anos = new Set();
    for (const l of estado.bd) if (l.ano != null) anos.add(l.ano);
    return Array.from(anos).sort((a, b) => b - a);
  }

  // Série Jan..Dez (12 posições) de um grupo, num ano específico — sempre o
  // calendário inteiro, não o recorte filtrado.
  function serieAnualGrupo(nomeGrupo, ano) {
    const meses = new Array(12).fill(0);
    if (ano == null) return meses;
    for (const l of estado.bd) {
      if (l.ano !== ano || l.grupo !== nomeGrupo || l.cnpj !== estado.cnpj) continue;
      if (l.mesIdx == null) continue;
      meses[l.mesIdx] += num(l.valor);
    }
    return meses;
  }

  // Série Jan..Dez da receita (grupos com s_e === 'E'), num ano específico.
  function serieAnualReceita(ano) {
    const meses = new Array(12).fill(0);
    if (ano == null) return meses;
    for (const l of estado.bd) {
      if (l.ano !== ano || l.cnpj !== estado.cnpj || l.s_e !== 'E') continue;
      if (l.mesIdx == null) continue;
      meses[l.mesIdx] += num(l.valor);
    }
    return meses;
  }

  const acumular = meses => {
    const out = [];
    let s = 0;
    for (const v of meses) { s += v; out.push(s); }
    return out;
  };

  // Variação percentual atual vs anterior. null = não calculável (sem base).
  const evolucaoPct = (atual, anterior) =>
    anterior ? (atual - anterior) / Math.abs(anterior) : null;

  // Bloco de evolução anual de um grupo, uma linha por coluna do recorte
  // atual (estado.slots), sempre comparando os 2 anos mais recentes do BD_DRE.
  function evolucaoAnualGrupo(nomeGrupo) {
    const anos = anosDisponiveis();
    if (!anos.length) return null;
    const anoAtual = anos[0];
    const anoAnterior = anos.length > 1 ? anos[1] : null;

    const serieAtual    = serieAnualGrupo(nomeGrupo, anoAtual);
    const serieAnterior = serieAnualGrupo(nomeGrupo, anoAnterior);
    const acAtual    = acumular(serieAtual);
    const acAnterior = acumular(serieAnterior);
    const receitaAtual = serieAnualReceita(anoAtual);

    const porSlot = estado.slots.map(sl => {
      const m = sl.mes;
      const valAtual    = serieAtual[m];
      const valAnterior = serieAnterior[m];
      const mesAnteriorMesmaSerie = m === 0 ? serieAnterior[11] : serieAtual[m - 1];
      return {
        valAnterior,
        acAtual: acAtual[m],
        acAnterior: acAnterior[m],
        evolAnualMes:   evolucaoPct(valAtual, valAnterior),
        evolAnualAcum:  evolucaoPct(acAtual[m], acAnterior[m]),
        evolMensal:     evolucaoPct(valAtual, mesAnteriorMesmaSerie),
        pctReceita:     receitaAtual[m] ? valAtual / receitaAtual[m] : null
      };
    });

    return { anoAtual, anoAnterior, porSlot };
  }

  // Todas as linhas de resultado, mês a mês e no total.
  function calcularResultado() {
    const g = {};
    for (const nome of Object.keys(SE_POR_GRUPO)) g[nome] = totalGrupo(nome);

    const m_ = (grupo, i) => g[grupo].meses[i];
    const slots = estado.slots;

    const serie = {
      totReceita:[], despVariaveis:[], despFixa:[],
      totalDespesas:[], resultFinanceiro:[], resultOperacional:[],
      // mantidos para KPIs/alertas legados (elementos removidos do HTML, retornam cedo)
      receitaLiquida:[], lucroBruto:[], ebitda:[],
      antesSocios:[], lucroLiquido:[], geracaoCaixa:[]
    };

    // Itera sobre slots (não mais 12 meses fixos)
    for (let i = 0; i < slots.length; i++) {
      const recOp  = m_('RECEITA OPERACIONAL', i);
      const recNOp = m_('RECEITA NÃO OPERACIONAL', i);
      const trib   = m_('DESP. TRIBUTÁRIA', i);
      const custo  = m_('CUSTO. MP OU REVENDA', i);
      const oper   = m_('DESP. OPERACIONAL', i);
      const log    = m_('DESP. LOGÍSTICA', i);
      const com    = m_('DESP. COMERCIAL', i);
      const adm    = m_('DESP. ADM', i);
      const manut  = m_('MANUT. E CONSERVAÇÃO', i);
      const fin    = m_('DESP. FINANCEIRA', i);
      const soc    = m_('PROLABORE E RETIRADA', i);
      const fixaGrp= m_('DESP. FIXA', i);
      const inv    = m_('INVESTIMENTOS', i);

      const tr = recOp + recNOp;                               // TOT. RECEITA
      const dv = oper + custo + trib + log + com;              // DESP. VARIÁVEIS
      const df = adm + manut + fin + soc + fixaGrp;           // DESP. FIXA
      const td = dv + df;                                      // TOTAL DESPESAS
      const rf = tr - td;                                      // RESULTADO FINANCEIRO
      const ro = rf - inv;                                     // RESULTADO OPERACIONAL

      serie.totReceita.push(tr);
      serie.despVariaveis.push(dv);
      serie.despFixa.push(df);
      serie.totalDespesas.push(td);
      serie.resultFinanceiro.push(rf);
      serie.resultOperacional.push(ro);

      // legado
      const rl = recOp - trib;
      const lb = rl - custo;
      const eb = lb - oper - com - log - adm - manut;
      const as = eb - fin + recNOp;
      const ll = as - soc;
      serie.receitaLiquida.push(rl); serie.lucroBruto.push(lb);
      serie.ebitda.push(eb);         serie.antesSocios.push(as);
      serie.lucroLiquido.push(ll);   serie.geracaoCaixa.push(ll - inv);
    }

    const somaRecorte = arr => arr.reduce((s, v) => s + v, 0);

    const tot = {};
    for (const k of Object.keys(serie)) tot[k] = somaRecorte(serie[k]);

    return { grupos: g, serie, total: tot, base: tot.totReceita };
  }

  /* ---------- 8. ANÁLISE F_V E D_I ---------- */

  function analiseFVDI() {
    // Só custos e despesas. Receita e blocos extracontábeis ficam de fora.
    const saidas = estado.bdDre.filter(l => l.s_e === 'S');
    const bucket = (campo, valor) => saidas
      .filter(l => (l[campo] || '-') === valor)
      .reduce((s, l) => s + l.total, 0);

    const fv = { F: bucket('fv','F'), V: bucket('fv','V'), '-': bucket('fv','-') };
    const di = { D: bucket('di','D'), I: bucket('di','I'), '-': bucket('di','-') };

    const receita = estado.bdDre
      .filter(l => l.s_e === 'E')
      .reduce((s, l) => s + l.total, 0);

    // Margem de contribuição: receita menos tudo que é variável.
    const margemContrib = receita - fv.V;
    const indiceMC = receita ? margemContrib / receita : 0;
    // Ponto de equilíbrio: quanto precisa faturar para o fixo se pagar.
    const pontoEquilibrio = indiceMC ? fv.F / indiceMC : 0;

    const produzido = totalGrupo('VALOR PRODUZIDO').total;
    const custoDiretoUnit = produzido ? di.D / produzido : 0;

    return { fv, di, receita, margemContrib, indiceMC, pontoEquilibrio,
             produzido, custoDiretoUnit };
  }

  /* ---------- 9. RENDER: BLOCOS DO DRE (visual da aba DESIGN) ---------- */

  function cabecalhoBloco(nome, paralelo) {
    const th = [];
    th.push(`<th class="fin-dre-col-conta">${esc(nome)}${
      paralelo ? '<span class="fin-dre-tag-paralelo">NÃO SOMA</span>' : ''}</th>`);
    const multiAno = estado.anoInicio !== null && estado.anoInicio !== estado.anoFim;
    for (const sl of estado.slots) {
      const lbl = multiAno
        ? MESES[sl.mes] + '/' + String(sl.ano).slice(2)
        : MESES[sl.mes];
      th.push(`<th class="fin-dre-th-mes" onclick="dreResultSortCol(this)">${lbl}<span class="fin-dre-sort-icon"></span></th>`);
    }
    th.push('<th class="fin-dre-col-tot">TOT</th>');
    th.push('<th class="fin-dre-col-med">MÉD/ANO</th>');
    th.push('<th class="fin-dre-col-pct-h">%</th>');
    th.push('<th class="fin-dre-col-spark-h">Mês</th>');
    return `<thead><tr>${th.join('')}</tr></thead>`;
  }

  // Mini gráfico de linha (sparkline) com a série de valores de uma linha,
  // pra ver a tendência mensal num relance sem abrir gráfico separado.
  function sparklineSvg(valores) {
    const w = 64, h = 24, pad = 3;
    const vals = (valores || []).map(num);
    if (vals.length < 2) return '';
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const stepX = (w - pad * 2) / (vals.length - 1);
    const pts = vals.map((v, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg class="fin-dre-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`
      + `<polyline points="${pts}" fill="none" stroke="#1C64C0" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`
      + `</svg>`;
  }

  function renderBloco(item) {
    const g = totalGrupo(item.nome);
    const saida = seDoGrupo(item.nome) === 'S';
    const cls = v => num(v) === 0 ? 'fin-dre-val-zero'
                   : (saida ? 'fin-dre-val-saida' : 'fin-dre-val-entrada');
    const prefixo = saida ? '(-)' : (item.paralelo ? '(=)' : '(+)');

    // Apenas linhas com pelo menos um valor não-zero no recorte
    const nSlots = estado.slots.length;
    const linhasVisiveis = g.linhas.filter(l => {
      for (let i = 0; i < nSlots; i++)
        if (l.meses[i] !== 0) return true;
      return false;
    });

    // Grupo sem dados → linha compacta
    if (!linhasVisiveis.length) {
      return `<div class="fin-dre-bloco-vazio${item.paralelo ? ' fin-dre-paralelo' : ''}" data-grupo="${esc(item.nome)}" data-se="${seDoGrupo(item.nome)}">
        <span class="fin-dre-bloco-vazio-nome">${prefixo} ${esc(item.nome)}</span>
        <span class="fin-dre-bloco-vazio-msg">Sem dados no período</span>
      </div>`;
    }

    const corpo = linhasVisiveis.map(l => {
      const tds = [`<td class="fin-dre-col-conta">${esc(l.conta)}</td>`];
      for (let i = 0; i < nSlots; i++)
        tds.push(`<td class="${cls(l.meses[i])}">${fmt(l.meses[i])}</td>`);
      tds.push(`<td class="fin-dre-col-tot ${cls(l.total)}">${fmt(l.total)}</td>`);
      tds.push(`<td class="fin-dre-col-med ${cls(l.med)}">${fmt(l.med)}</td>`);
      tds.push(`<td class="fin-dre-col-pct">${fmtPct(l.pct)}</td>`);
      tds.push(`<td class="fin-dre-col-spark">${sparklineSvg(l.meses)}</td>`);
      return `<tr>${tds.join('')}</tr>`;
    }).join('');

    const rodape = [`<td class="fin-dre-col-conta">${prefixo} TOTAL ${esc(item.nome)}</td>`];
    for (let i = 0; i < nSlots; i++)
      rodape.push(`<td>${fmt(g.meses[i])}</td>`);
    rodape.push(`<td class="fin-dre-col-tot-foot">${fmt(g.total)}</td>`);
    rodape.push(`<td class="fin-dre-col-med-foot">${fmt(g.med)}</td>`);
    const receita = estado.bdDre.filter(l => l.s_e === 'E').reduce((s,l)=>s+l.total,0);
    rodape.push(`<td class="fin-dre-col-pct">${fmtPct(receita ? g.total / receita : 0)}</td>`);
    rodape.push(`<td class="fin-dre-col-spark">${sparklineSvg(g.meses)}</td>`);

    const evolucao = linhasEvolucao(item.nome, nSlots);

    return `<div class="fin-dre-bloco${item.paralelo ? ' fin-dre-paralelo' : ''}" data-grupo="${esc(item.nome)}" data-se="${seDoGrupo(item.nome)}">
      <div class="fin-dre-bloco-scroll">
        <table class="fin-dre-tabela">
          ${cabecalhoBloco(item.nome, item.paralelo)}
          <tbody>${corpo}</tbody>
          <tfoot><tr class="fin-dre-tr-total">${rodape.join('')}</tr>${evolucao}</tfoot>
        </table>
      </div></div>`;
  }

  const fmtPct1 = v => v == null ? '—' : (Math.abs(v) * 100).toFixed(1).replace('.', ',') + '%';

  // Linha de valor absoluto (Acumulado) ou percentual com seta (Evolução),
  // uma célula por slot do recorte atual + 3 células vazias (TOT/MÉD/%, que
  // não fazem sentido pra essas métricas — mantém a tabela alinhada).
  function linhaEvolucaoValor(label, valores) {
    const tds = [`<td class="fin-dre-col-conta fin-dre-evol-label">${esc(label)}</td>`];
    for (const v of valores) tds.push(`<td class="fin-dre-evol-num">${fmt(v)}</td>`);
    tds.push('<td></td><td></td><td></td><td></td>');
    return `<tr class="fin-dre-tr-evolucao">${tds.join('')}</tr>`;
  }

  function linhaEvolucaoPct(label, valores) {
    const tds = [`<td class="fin-dre-col-conta fin-dre-evol-label">${esc(label)}</td>`];
    for (const v of valores) {
      if (v == null) { tds.push('<td class="fin-dre-evol-pct fin-dre-evol-neutro">—</td>'); continue; }
      const seta = v > 0 ? '▲' : (v < 0 ? '▼' : '►');
      const corCls = v > 0 ? 'fin-dre-evol-up' : (v < 0 ? 'fin-dre-evol-down' : 'fin-dre-evol-neutro');
      tds.push(`<td class="fin-dre-evol-pct ${corCls}">${seta} ${fmtPct1(v)}</td>`);
    }
    tds.push('<td></td><td></td><td></td><td></td>');
    return `<tr class="fin-dre-tr-evolucao">${tds.join('')}</tr>`;
  }

  // % sob Receita: percentual simples, sem seta (assim no modelo de referência).
  function linhaPctSimples(label, valores) {
    const tds = [`<td class="fin-dre-col-conta fin-dre-evol-label">${esc(label)}</td>`];
    for (const v of valores)
      tds.push(`<td class="fin-dre-evol-pct fin-dre-evol-neutro">${v == null ? '—' : fmtPct1(v)}</td>`);
    tds.push('<td></td><td></td><td></td><td></td>');
    return `<tr class="fin-dre-tr-evolucao">${tds.join('')}</tr>`;
  }

  // Monta as 7 linhas de acumulado/evolução anual de um grupo, alinhadas
  // coluna a coluna com o recorte de período atual (estado.slots).
  function linhasEvolucao(nomeGrupo, nSlots) {
    const ev = evolucaoAnualGrupo(nomeGrupo);
    if (!ev) return '';
    const rows = ev.porSlot;
    if (rows.length !== nSlots) return '';

    const lblAcum = ano => ano == null ? 'Acumulado' : `Acumulado de ${ano}`;
    const lblAnoAnterior = ev.anoAnterior == null ? nomeGrupo : `${nomeGrupo} DE ${ev.anoAnterior}`;
    // Ordem igual ao modelo: valor bruto mensal do ano anterior primeiro
    // (comparação direta com a linha TOTAL logo acima), depois acumulado do
    // ano atual, depois acumulado do ano anterior, depois as 4 percentuais.
    return linhaEvolucaoValor(lblAnoAnterior, rows.map(r => r.valAnterior))
      + linhaEvolucaoValor(lblAcum(ev.anoAtual), rows.map(r => r.acAtual))
      + linhaEvolucaoValor(lblAcum(ev.anoAnterior), rows.map(r => r.acAnterior))
      + linhaEvolucaoPct('% de evolução anual até o mês', rows.map(r => r.evolAnualAcum))
      + linhaEvolucaoPct('% de evolução anual do mês',     rows.map(r => r.evolAnualMes))
      + linhaEvolucaoPct('% de evolução mensal',           rows.map(r => r.evolMensal))
      + linhaPctSimples('% sob Receita',                   rows.map(r => r.pctReceita));
  }

  // Linha de resultado: tabela com mês a mês igual ao bloco, fundo verde/vermelho/navy.
  function renderResultado(item, res) {
    const v = res.total[item.chave];
    const meses = res.serie[item.chave] || [];
    const margem = res.base ? v / res.base : 0;
    const med = mesesDoRecorte() > 0 ? v / mesesDoRecorte() : 0;

    const cls = item.base ? 'fin-dre-res-base'
              : (v >= 0 ? 'fin-dre-res-pos' : 'fin-dre-res-neg');

    const nSlots = estado.slots.length;
    const tds = [`<td class="fin-dre-col-conta">${esc(item.nome)}</td>`];
    for (let i = 0; i < nSlots; i++)
      tds.push(`<td>${fmt(meses[i] || 0)}</td>`);
    tds.push(`<td class="fin-dre-col-tot">${fmt(v)}</td>`);
    tds.push(`<td class="fin-dre-col-med">${fmt(med)}</td>`);
    tds.push(`<td class="fin-dre-col-pct">${item.base ? '—' : fmtPct(margem)}</td>`);

    return `<div class="fin-dre-resultado-bloco">
      <div class="fin-dre-bloco-scroll">
        <table class="fin-dre-tabela">
          <tbody><tr class="fin-dre-resultado-tr ${cls}">${tds.join('')}</tr></tbody>
        </table>
      </div></div>`;
  }

  function renderSeparador(item, res) {
    const v = res.total[item.chave] ?? null;
    const ncols = estado.slots.length + 3;
    const valHtml = v !== null
      ? `<span class="fin-dre-sep-valor ${v < 0 ? 'fin-dre-sep-neg' : ''}">${fmt(v)}</span>`
      : '';
    return `<div class="fin-dre-separador">
      <span class="fin-dre-sep-nome">${esc(item.nome)}</span>
      ${valHtml}
    </div>`;
  }

  function _dreOrfas() {
    const orfas = (estado.lancamentos || []).filter(l => {
      const planoIdx = new Map(estado.plano.map(c => [c.conta.trim().toLowerCase(), true]));
      return !planoIdx.has((l.conta || '').trim().toLowerCase());
    }).length;
    return orfas;
  }

  /* ---------- 9b. BALANÇO MENSAL — tabela completa ---------- */
  function renderBalanco(res) {
    const s = res.serie, t = res.total;
    const g = res.grupos;
    const slots = estado.slots;
    const nM = slots.length;
    const multiAno = estado.anoInicio !== null && estado.anoInicio !== estado.anoFim;
    const fvdi = analiseFVDI();

    const safeDiv = (a, b) => (b && isFinite(a / b)) ? a / b : 0;

    const gmeses = nome => (g[nome] ? g[nome].meses : Array(nM).fill(0));
    const gtot   = nome => (g[nome] ? g[nome].total : 0);
    const gmed   = nome => (g[nome] ? g[nome].med   : 0);

    const base = t.totReceita;

    const fmtEvol = (i) => {
      if (i <= 0) return '-';
      const cur = s.resultFinanceiro[i] || 0;
      const prev = s.resultFinanceiro[i - 1] || 0;
      if (!prev) return 'zerou';
      const pct = ((cur - prev) / Math.abs(prev)) * 100;
      if (!isFinite(pct)) return 'zerou';
      const arrow = pct >= 0 ? '↑' : '↓';
      const cls = pct >= 0 ? 'fin-bal-evol-up' : 'fin-bal-evol-down';
      return `<span class="${cls}">${arrow} ${pct.toFixed(1).replace('.', ',')}%</span>`;
    };

    const mkTd = v => {
      const n = num(v);
      return `<td class="${n < 0 ? 'fin-dre-val-saida' : ''}">${fmt(n)}</td>`;
    };

    const mkRow = (nome, arr, tot, med, pctVal, cls) => {
      let tds = `<td class="fin-dre-col-conta fin-bal-conta ${cls || ''}">${esc(nome)}</td>`;
      for (let i = 0; i < nM; i++) tds += mkTd(arr ? (arr[i] || 0) : 0);
      tds += `<td class="fin-dre-col-tot-foot">${fmt(tot)}</td>`;
      tds += `<td class="fin-dre-col-med-foot">${fmt(med)}</td>`;
      tds += `<td class="fin-dre-col-pct">${pctVal !== null && pctVal !== undefined ? fmtPct(pctVal) : '-'}</td>`;
      tds += `<td class="fin-dre-col-spark">${sparklineSvg(arr)}</td>`;
      return `<tr class="${cls || ''}">${tds}</tr>`;
    };

    const mkPctRow = (nome, numArr, denArr, totNum, totDen) => {
      let tds = `<td class="fin-dre-col-conta fin-bal-conta fin-bal-pctrow">${esc(nome)}</td>`;
      const pcts = [];
      for (let i = 0; i < nM; i++) {
        const n = num(numArr ? numArr[i] : 0);
        const d = num(denArr ? denArr[i] : 0);
        const pct = d ? (n / d) * 100 : 0;
        pcts.push(isFinite(pct) ? pct : 0);
        tds += `<td class="fin-bal-pct-cell">${isFinite(pct) ? pct.toFixed(1).replace('.', ',') + '%' : '0,0%'}</td>`;
      }
      const tp = totDen ? (totNum / totDen) * 100 : 0;
      tds += `<td class="fin-dre-col-tot-foot fin-bal-pct-cell">${isFinite(tp) ? tp.toFixed(2).replace('.', ',') + '%' : '0,00%'}</td>`;
      tds += `<td class="fin-dre-col-med-foot">-</td><td class="fin-dre-col-pct">-</td>`;
      tds += `<td class="fin-dre-col-spark">${sparklineSvg(pcts)}</td>`;
      return `<tr class="fin-bal-pctrow">${tds}</tr>`;
    };

    const evolRow = () => {
      let tds = `<td class="fin-dre-col-conta fin-bal-conta fin-bal-evol">% de evolução mensal</td>`;
      for (let i = 0; i < nM; i++) tds += `<td>${fmtEvol(i)}</td>`;
      tds += `<td class="fin-dre-col-tot-foot">-</td><td class="fin-dre-col-med-foot">-</td><td class="fin-dre-col-pct">-</td><td class="fin-dre-col-spark"></td>`;
      return `<tr class="fin-bal-evol">${tds}</tr>`;
    };

    const th = [`<th class="fin-dre-col-conta">BALANÇO MENSAL</th>`];
    for (const sl of slots) {
      const lbl = multiAno ? MESES[sl.mes] + '/' + String(sl.ano).slice(2) : MESES[sl.mes];
      th.push(`<th>${lbl}</th>`);
    }
    th.push(`<th class="fin-dre-col-tot">TOT</th><th class="fin-dre-col-med">MÉD/ANO</th><th class="fin-dre-col-pct-h">%</th><th class="fin-dre-col-spark-h">Mês</th>`);

    const faturouMais = base - fvdi.pontoEquilibrio;
    const fatMeses    = gmeses('FATURAMENTO');
    const fatTot      = gtot('FATURAMENTO');

    const tbody = [
      // ── RECEITAS ────────────────────────────────────────────────────────
      mkRow('TOT. RECEITA',                     s.totReceita,                  t.totReceita,          t.totReceita/nM,          1,                                          'fin-bal-receita'),
      mkRow('TOT. VALOR PRODUZIDO',             gmeses('VALOR PRODUZIDO'),     gtot('VALOR PRODUZIDO'),  gmed('VALOR PRODUZIDO'),  safeDiv(gtot('VALOR PRODUZIDO'),base),     'fin-bal-sub'),
      mkRow('(+) TOT. FATURAMENTO',             fatMeses,                      gtot('FATURAMENTO'),   gmed('FATURAMENTO'),      safeDiv(gtot('FATURAMENTO'),base),           'fin-bal-sub'),
      mkRow('(-) TOTAL FATURAMENTO FISCAL',     gmeses('FATURAMENTO FISCAL'),  gtot('FATURAMENTO FISCAL'), gmed('FATURAMENTO FISCAL'), safeDiv(gtot('FATURAMENTO FISCAL'),base), 'fin-bal-sub'),
      mkRow('(+) TOT. RECEITA OPERACIONAL',     gmeses('RECEITA OPERACIONAL'), gtot('RECEITA OPERACIONAL'), gmed('RECEITA OPERACIONAL'), safeDiv(gtot('RECEITA OPERACIONAL'),base), 'fin-bal-sub'),
      mkRow('(+) TOT. RECEITA NÃO OPERACIONAL', gmeses('RECEITA NÃO OPERACIONAL'), gtot('RECEITA NÃO OPERACIONAL'), gmed('RECEITA NÃO OPERACIONAL'), safeDiv(gtot('RECEITA NÃO OPERACIONAL'),base), 'fin-bal-sub'),
      mkRow('(-) TOTAL DESCONTOS CONCEDIDOS',   gmeses('DESCONTOS CONCEDIDOS'), gtot('DESCONTOS CONCEDIDOS'), gmed('DESCONTOS CONCEDIDOS'), safeDiv(gtot('DESCONTOS CONCEDIDOS'),base), 'fin-bal-desc'),
      // ── DESP. VARIÁVEIS ─────────────────────────────────────────────────
      mkRow('(-) TOTAL DESP. OPERACIONAL',      gmeses('DESP. OPERACIONAL'),   gtot('DESP. OPERACIONAL'),  gmed('DESP. OPERACIONAL'),  safeDiv(gtot('DESP. OPERACIONAL'),base),  'fin-bal-dv-sub'),
      mkRow('(-) TOTAL CUSTO. MP OU REVENDA',   gmeses('CUSTO. MP OU REVENDA'),gtot('CUSTO. MP OU REVENDA'),gmed('CUSTO. MP OU REVENDA'),safeDiv(gtot('CUSTO. MP OU REVENDA'),base),'fin-bal-dv-sub'),
      mkRow('(-) TOTAL DESP. TRIBUTÁRIA',       gmeses('DESP. TRIBUTÁRIA'),    gtot('DESP. TRIBUTÁRIA'),   gmed('DESP. TRIBUTÁRIA'),   safeDiv(gtot('DESP. TRIBUTÁRIA'),base),   'fin-bal-dv-sub'),
      mkRow('DEA',                              Array(nM).fill(0),             0, 0, 0,                                                                                         'fin-bal-dv-sub'),
      mkRow('(-) TOTAL DESP. LOGÍSTICA',        gmeses('DESP. LOGÍSTICA'),     gtot('DESP. LOGÍSTICA'),    gmed('DESP. LOGÍSTICA'),    safeDiv(gtot('DESP. LOGÍSTICA'),base),    'fin-bal-dv-sub'),
      mkRow('(-) TOTAL DESP. COMERCIAL',        gmeses('DESP. COMERCIAL'),     gtot('DESP. COMERCIAL'),    gmed('DESP. COMERCIAL'),    safeDiv(gtot('DESP. COMERCIAL'),base),    'fin-bal-dv-sub'),
      mkRow('(-) TOTAL DESP VARIÁVEIS',         s.despVariaveis,               t.despVariaveis,  t.despVariaveis/nM,  safeDiv(t.despVariaveis,base),  'fin-bal-dv'),
      // ── DESP. FIXA ──────────────────────────────────────────────────────
      mkRow('(-) TOTAL DESP. ADM',              gmeses('DESP. ADM'),           gtot('DESP. ADM'),          gmed('DESP. ADM'),          safeDiv(gtot('DESP. ADM'),base),          'fin-bal-df-sub'),
      mkRow('(-) TOTAL MANUT. E CONSERVAÇÃO',   gmeses('MANUT. E CONSERVAÇÃO'),gtot('MANUT. E CONSERVAÇÃO'),gmed('MANUT. E CONSERVAÇÃO'),safeDiv(gtot('MANUT. E CONSERVAÇÃO'),base),'fin-bal-df-sub'),
      mkRow('(-) TOTAL DESP. FINANCEIRA',       gmeses('DESP. FINANCEIRA'),    gtot('DESP. FINANCEIRA'),   gmed('DESP. FINANCEIRA'),   safeDiv(gtot('DESP. FINANCEIRA'),base),   'fin-bal-df-sub'),
      mkRow('(-) TOTAL DESP. FIXA',             gmeses('DESP. FIXA'),          gtot('DESP. FIXA'),         gmed('DESP. FIXA'),         safeDiv(gtot('DESP. FIXA'),base),         'fin-bal-df-sub'),
      mkRow('(-) TOT. PROLABORE E RETIRADA',    gmeses('PROLABORE E RETIRADA'),gtot('PROLABORE E RETIRADA'),gmed('PROLABORE E RETIRADA'),safeDiv(gtot('PROLABORE E RETIRADA'),base),'fin-bal-df-sub'),
      mkRow('(-) TOTAL DESP FIXA',              s.despFixa,                    t.despFixa,       t.despFixa/nM,       safeDiv(t.despFixa,base),       'fin-bal-df'),
      mkRow('(-) TOTAL DESPESAS',               s.totalDespesas,               t.totalDespesas,  t.totalDespesas/nM,  safeDiv(t.totalDespesas,base),  'fin-bal-td'),
      // ── PATRIMÔNIO & RESULTADOS ─────────────────────────────────────────
      mkRow('TOTAL DE PATRIMÔNIO',              Array(nM).fill(0), 0, 0, null, 'fin-bal-pat'),
      mkRow('(-) TOTAL INVESTIMENTOS',          gmeses('INVESTIMENTOS'),       gtot('INVESTIMENTOS'),      gmed('INVESTIMENTOS'),      safeDiv(gtot('INVESTIMENTOS'),base),      'fin-bal-inv'),
      mkRow('FATUROU A MAIS DO PONTO DE EQUILÍBRIO', Array(nM).fill(0),       faturouMais, 0, safeDiv(faturouMais,base),                                                       'fin-bal-sub'),
      mkRow('RESULTADO FINANCEIRO NO MÊS',      s.resultFinanceiro,  t.resultFinanceiro, t.resultFinanceiro/nM, safeDiv(t.resultFinanceiro,base), t.resultFinanceiro >= 0 ? 'fin-bal-pos' : 'fin-bal-neg'),
      mkRow('RESULTADO OPERACIONAL NO MÊS',     s.resultOperacional, t.resultOperacional, t.resultOperacional/nM, safeDiv(t.resultOperacional,base), t.resultOperacional >= 0 ? 'fin-bal-pos' : 'fin-bal-neg'),
      // ── % ───────────────────────────────────────────────────────────────
      evolRow(),
      mkPctRow('% Result. Financ. sobre recebimento', s.resultFinanceiro, s.totReceita,           t.resultFinanceiro, base),
      mkPctRow('% Lucro Líquido sobre faturamento',   s.lucroLiquido,     fatMeses,               t.lucroLiquido,     fatTot),
      mkPctRow('% Result. Financ. sobre Patrimônio',  Array(nM).fill(0),  Array(nM).fill(0),      0, 0),
      mkPctRow('% Result. Operac. sobre Patrimônio',  Array(nM).fill(0),  Array(nM).fill(0),      0, 0),
    ].join('');

    return `<div class="fin-balanco-wrap">
      <div class="fin-balanco-scroll">
        <table class="fin-dre-tabela fin-balanco-tabela">
          <thead><tr>${th.join('')}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div></div>`;
  }

  function renderDRE() {
    const res = calcularResultado();
    const alvo = document.getElementById('fin-dre-corpo');
    if (!alvo) return res;

    // Cabeçalho de período + aviso de orphans
    const slots = estado.slots;
    const s0 = slots[0] || { ano: estado.ano, mes: estado.mesInicio };
    const sN = slots[slots.length - 1] || s0;
    const multiAno = s0.ano !== sN.ano;
    const fmtSlotLbl = sl => MESES[sl.mes] + (multiAno ? '/' + String(sl.ano).slice(2) : '');
    const periodo = (s0.ano === sN.ano && s0.mes === sN.mes)
      ? fmtSlotLbl(s0) + ' ' + s0.ano
      : fmtSlotLbl(s0) + ' a ' + fmtSlotLbl(sN) + (multiAno ? '' : ' ' + s0.ano);
    const orfas = _dreOrfas();
    const avisoOrfa = orfas > 0
      ? `<div class="fin-dre-aviso-orfa">⚠ ${orfas} lançamento(s) com conta fora do Plano (#N/A) — não entram no DRE.</div>`
      : '';

    const blocos = ESTRUTURA.map(item => {
      if (item.tipo === 'grupo')     return renderBloco(item);
      if (item.tipo === 'separador') return renderSeparador(item, res);
      return renderResultado(item, res);
    }).join('');

    alvo.innerHTML = `<div class="fin-dre-periodo-label">${periodo}</div>${avisoOrfa}${blocos}${renderBalanco(res)}`;
    return res;
  }

  /* ---------- 10. RENDER: MATRIZ BD_DRE ---------- */

  function renderBDDRE() {
    const alvo = document.getElementById('fin-dre-tab-bddre');
    if (!alvo) return;
    const slots = estado.slots;
    const multiAno = estado.anoInicio !== null && estado.anoInicio !== estado.anoFim;
    const mesesHdr = slots.map(sl =>
      multiAno ? MESES[sl.mes] + '/' + String(sl.ano).slice(2) : MESES[sl.mes]
    );
    const th = ['ID','CNPJ','ANO','CODIGO','CONTA']
      .map(h => `<th>${h}</th>`)
      .concat(mesesHdr.map(m => `<th class="num">${m}</th>`))
      .concat(['<th>CAD</th>','<th>GRUPO</th>','<th class="num">TOTAL</th>',
               '<th class="num">MED</th>','<th class="num">%</th>','<th>s_e</th>'])
      .join('');
    const totalCols = 5 + slots.length + 6;

    if (!estado.bdDre.length) {
      const motivo = !estado.plano.length
        ? 'Matriz BD_DRE é derivada do Plano de Contas — cadastre contas na aba <strong>Plano de Contas</strong> para popular esta grade.'
        : 'Nenhuma linha para o recorte atual.';
      alvo.innerHTML = `<table class="dc-tabela"><thead><tr>${th}</tr></thead>`
        + `<tbody><tr><td colspan="${totalCols}" class="fin-tabela-vazia">${motivo}</td></tr></tbody></table>`;
      return;
    }

    const tb = estado.bdDre.map(l => `<tr>
      <td>${esc(l.id)}</td>
      <td>${esc(l.cnpj)}</td>
      <td>${esc(l.ano)}</td>
      <td><span class="fin-dre-cod">${esc(l.codigo)}</span></td>
      <td>${esc(l.conta)}</td>
      ${l.meses.map(v => `<td class="num${l.s_e==='S'&&v?' neg':''}">${fmt(v)}</td>`).join('')}
      <td>${esc(l.cad)}</td>
      <td><span class="fin-dre-chip-grupo">${esc(l.grupo)}</span></td>
      <td class="num"><strong>${fmt(l.total)}</strong></td>
      <td class="num">${fmt(l.med)}</td>
      <td class="num">${fmtPct(l.pct)}</td>
      <td>${esc(l.s_e)}</td>
    </tr>`).join('');

    alvo.innerHTML = `<table class="dc-tabela"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`;
  }

  /* ---------- 11. DADOS PARA AS GRADES E PARA SALVAR ---------- */
  //
  // As grades Excel vivem em dre-view.js (LiteGrid de js/jss.js). Este módulo
  // expõe só o que a view precisa: grupoCanonico() para validar o GRUPO ao salvar
  // e as duas funções que entregam registros prontos para POST no Supabase.

  function grupoCanonico(valor) {
    const alvo = norm(valor);
    if (!alvo) return null;
    return Object.keys(SE_POR_GRUPO).find(g => g.toLowerCase() === alvo) || null;
  }

  function indexarPlanoPorNome() {
    const idx = new Map();
    for (const c of estado.plano) idx.set(norm(c.conta), c);
    return idx;
  }

  /** Linhas prontas para POST em fin_dre_plano_contas (sem empresa_id). */
  function registrosPlanoParaSalvar() {
    return estado.plano
      .filter(l => l.conta)
      .map(l => ({
        cod: l.cod || l.conta,
        conta: l.conta,
        grupo: grupoCanonico(l.grupo) || l.grupo,
        fv: (l.fv === 'F' || l.fv === 'V') ? l.fv : '',
        di: (l.di === 'D' || l.di === 'I') ? l.di : ''
      }));
  }

  /** Linhas prontas para POST em fin_dre_lancamentos (sem empresa_id). */
  function registrosBDParaSalvar() {
    return estado.lancamentos
      .filter(l => l.conta && l.dt_caixa)
      .map(l => ({
        conta: l.conta,
        valor: num(l.valor),
        tot_pago: (l.tot_pago === '' || l.tot_pago == null) ? null : num(l.tot_pago),
        dt_caixa: l.dt_caixa,
        dt_venc: l.dt_venc || l.dt_caixa,
        dt_pag: l.dt_pag || null,
        parceiro: l.parceiro || null,
        documento: l.documento || null,
        banco: l.banco || null,
        forma: l.forma || null,
        tipo: l.tipo || null,
        parcela: l.parcela || null,
        tot_parcelas: l.tot_parcelas || null,
        obs: l.obs || null,
        dt_custoria: l.dt_custoria || null,
        historico: l.historico || null,
        origem: 'manual'
      }));
  }

  /* ---------- 12. RENDER: LANÇAMENTOS (visualização somente leitura) ---------- */
  //
  // Quem edita é a grade da aba BD (seção 11, estado.lancamentos). Esta aba só
  // mostra o resultado já enriquecido (PROCV + derivadas), filtrado pelo ano
  // corrente do topo — mesma lógica que a ferramenta original tinha antes da
  // grade existir.

  function renderLancamentos() {
    const alvo = document.getElementById('fin-dre-tab-lancamentos');
    if (!alvo) return;
    const filtroGrupo = document.getElementById('fin-lanc-filtro-grupo')?.value || '';
    const filtroSE    = document.getElementById('fin-lanc-filtro-se')?.value    || '';
    const filtroMes   = document.getElementById('fin-lanc-filtro-mes')?.value   || '';
    let bd = enriquecerBD().filter(l => l.ano === estado.ano);
    if (filtroGrupo) bd = bd.filter(l => l.grupo === filtroGrupo);
    if (filtroSE)    bd = bd.filter(l => l.s_e   === filtroSE);
    if (filtroMes)   bd = bd.filter(l => l.mes   === filtroMes);

    const contEl = document.getElementById('fin-lanc-contagem');
    if (contEl) contEl.textContent = bd.length.toLocaleString('pt-BR') + ' lançamentos';

    const tbody = alvo.querySelector('tbody') || alvo;
    if (!bd.length) {
      if (alvo.querySelector('table')) {
        alvo.querySelector('tbody').innerHTML =
          '<tr><td colspan="9" class="fin-tabela-vazia">Sem lançamentos no período.</td></tr>';
      } else {
        alvo.innerHTML = '<div class="fin-tabela-vazia">Sem lançamentos no período.</div>';
      }
      return;
    }
    const rows = bd.map((l, i) => `<tr>
      <td>${esc(i + 1)}</td>
      <td>${esc(dataBR(l.dt_caixa))}</td>
      <td>${esc(l.conta)}</td>
      <td><span class="fin-dre-chip-grupo">${esc(l.grupo)}</span></td>
      <td>${esc(l.s_e)}</td>
      <td class="num${l.s_e === 'S' ? ' neg' : ''}">${fmt(l.valor)}</td>
      <td>${esc(l.status)}</td>
      <td>${esc(l.banco)}</td>
      <td>${esc(l.forma)}</td>
    </tr>`).join('');

    if (alvo.querySelector('table')) {
      alvo.querySelector('tbody').innerHTML = rows;
    } else {
      alvo.innerHTML = `<table class="dc-tabela">
        <thead><tr><th>#</th><th>DT_CAIXA</th><th>CONTA</th><th>GRUPO</th>
        <th>S_E</th><th class="num">VALOR</th><th>STATUS</th><th>BANCO</th><th>FORMA</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    }
  }

  /* ---------- 13. RENDER: ANÁLISE F/V E D/I ---------- */

  function barra(partes, total, classes) {
    if (!total) return '<div class="fin-dre-barra"></div>';
    const segs = Object.entries(partes)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => {
        const p = (v / total) * 100;
        return `<div class="fin-dre-barra-seg ${classes[k]}" style="width:${p.toFixed(2)}%">${
          p >= 9 ? p.toFixed(0) + '%' : ''}</div>`;
      }).join('');
    return `<div class="fin-dre-barra">${segs}</div>`;
  }

  function renderFVDI() {
    const alvo = document.getElementById('fin-dre-tab-fv');
    if (!alvo) return;
    const a = analiseFVDI();
    const totFV = a.fv.F + a.fv.V + a.fv['-'];
    const totDI = a.di.D + a.di.I + a.di['-'];

    alvo.innerHTML = `<div class="fin-dre-quadros">

      <div class="fin-dre-quadro">
        <h3>F_V — Fixo × Variável</h3>
        <div class="fin-dre-quadro-corpo">
          ${barra({F:a.fv.F, V:a.fv.V, '-':a.fv['-']}, totFV,
                  {F:'fixo', V:'variavel', '-':'naomarcado'})}
          <div class="fin-dre-legenda">
            <span><i style="background:#002060"></i>Fixo ${fmt(a.fv.F)}</span>
            <span><i style="background:#00B050"></i>Variável ${fmt(a.fv.V)}</span>
            <span><i style="background:#c3cad6"></i>Não marcado ${fmt(a.fv['-'])}</span>
          </div>
          <div class="fin-dre-indicadores">
            <div class="fin-dre-ind">
              <div class="fin-dre-ind-valor">${fmt(a.margemContrib)}</div>
              <div class="fin-dre-ind-label">Margem de contribuição</div></div>
            <div class="fin-dre-ind">
              <div class="fin-dre-ind-valor">${fmtPct(a.indiceMC)}</div>
              <div class="fin-dre-ind-label">Índice MC</div></div>
            <div class="fin-dre-ind">
              <div class="fin-dre-ind-valor">${fmt(a.pontoEquilibrio)}</div>
              <div class="fin-dre-ind-label">Ponto de equilíbrio</div></div>
          </div>
        </div>
      </div>

      <div class="fin-dre-quadro">
        <h3>D_I — Direto × Indireto</h3>
        <div class="fin-dre-quadro-corpo">
          ${barra({D:a.di.D, I:a.di.I, '-':a.di['-']}, totDI,
                  {D:'direto', I:'indireto', '-':'naomarcado'})}
          <div class="fin-dre-legenda">
            <span><i style="background:#00B050"></i>Direto ${fmt(a.di.D)}</span>
            <span><i style="background:#5a6a7e"></i>Indireto ${fmt(a.di.I)}</span>
            <span><i style="background:#c3cad6"></i>Não marcado ${fmt(a.di['-'])}</span>
          </div>
          <div class="fin-dre-indicadores">
            <div class="fin-dre-ind">
              <div class="fin-dre-ind-valor">${fmt(a.produzido)}</div>
              <div class="fin-dre-ind-label">Valor produzido</div></div>
            <div class="fin-dre-ind">
              <div class="fin-dre-ind-valor">${fmt(a.custoDiretoUnit)}</div>
              <div class="fin-dre-ind-label">Custo direto unitário</div></div>
            <div class="fin-dre-ind">
              <div class="fin-dre-ind-valor">${fmtPct(totDI ? a.di.D/totDI : 0)}</div>
              <div class="fin-dre-ind-label">Peso do direto</div></div>
          </div>
        </div>
      </div>

    </div>`;
  }

  /* ---------- 14. KPIs, ALERTAS E RESUMO ---------- */

  function kpi(valor, label, sub) {
    return `<div class="dc-kpi-card">
      <div class="dc-kpi-value">${valor}</div>
      <div class="dc-kpi-label">${esc(label)}</div>
      <div class="dc-kpi-sub">${esc(sub)}</div></div>`;
  }

  function renderKPIs(res) {
    const alvo = document.getElementById('fin-kpis');
    if (!alvo) return;
    const t = res.total, base = res.base || 1;
    alvo.innerHTML =
      kpi(fmt(t.receitaLiquida), 'Receita líquida', `${mesesDoRecorte()} meses`) +
      kpi(fmt(t.lucroBruto),   'Lucro bruto',   'margem ' + fmtPct(t.lucroBruto/base)) +
      kpi(fmt(t.ebitda),       'EBITDA',        'margem ' + fmtPct(t.ebitda/base)) +
      kpi(fmt(t.lucroLiquido), 'Lucro líquido', 'margem ' + fmtPct(t.lucroLiquido/base)) +
      kpi(fmt(t.geracaoCaixa), 'Geração de caixa', 'após investimentos');
  }

  function renderAlertas(res) {
    const alvo = document.getElementById('fin-alertas');
    if (!alvo) return;
    const t = res.total, base = res.base || 1, a = analiseFVDI();
    const out = [];
    const add = (tipo, titulo, txt) =>
      out.push(`<div class="dc-alert-card ${tipo}"><strong>${esc(titulo)}</strong><span>${esc(txt)}</span></div>`);

    if (t.lucroLiquido < 0) add('negativo','Prejuízo no período',
      `Lucro líquido de ${fmt(t.lucroLiquido)}.`);
    else add('positivo','Resultado positivo',
      `Lucro líquido de ${fmt(t.lucroLiquido)} (${fmtPct(t.lucroLiquido/base)}).`);

    if (t.ebitda/base < 0.10) add('atencao','EBITDA apertado',
      `Margem EBITDA em ${fmtPct(t.ebitda/base)}.`);

    if (a.pontoEquilibrio > a.receita) add('atencao','Abaixo do ponto de equilíbrio',
      `Precisa faturar ${fmt(a.pontoEquilibrio)} e faturou ${fmt(a.receita)}.`);

    const semFV = estado.plano.filter(c => seDoGrupo(c.grupo)==='S' && !c.fv).length;
    if (semFV) add('atencao','Contas sem marcação F_V',
      `${semFV} contas de saída sem Fixo/Variável — margem de contribuição incompleta.`);

    const semDI = estado.plano.filter(c => seDoGrupo(c.grupo)==='S' && !c.di).length;
    if (semDI) add('atencao','Contas sem marcação D_I',
      `${semDI} contas de saída sem Direto/Indireto — custo por produto incompleto.`);

    const orfas = enriquecerBD().filter(l => l.grupo === '#N/A');
    if (orfas.length) add('negativo','Contas fora do plano',
      `${orfas.length} lançamentos com conta inexistente no plano (#N/A). Não entram no DRE.`);

    alvo.innerHTML = out.join('');
  }

  function renderResumo(res) {
    const el = document.getElementById('fin-executive-summary');
    if (!el) return;
    const t = res.total, base = res.base || 1;
    const slots_ = estado.slots;
    const r0 = slots_[0] || { ano: estado.ano, mes: estado.mesInicio };
    const rN = slots_[slots_.length - 1] || r0;
    const mAno_ = r0.ano !== rN.ano;
    const fmtL_ = sl => MESES[sl.mes] + (mAno_ ? '/' + String(sl.ano).slice(2) : '');
    const periodoStr = mesesDoRecorte() === 1
      ? fmtL_(r0) + ' ' + r0.ano
      : fmtL_(r0) + ' a ' + fmtL_(rN) + (mAno_ ? '' : ' de ' + r0.ano);

    el.innerHTML = `No recorte de <strong>${mesesDoRecorte()} meses</strong>
      (${periodoStr}), a receita líquida somou <strong>${fmt(t.receitaLiquida)}</strong>.
      O lucro bruto ficou em <strong>${fmt(t.lucroBruto)}</strong>
      (${fmtPct(t.lucroBruto/base)}), o EBITDA em <strong>${fmt(t.ebitda)}</strong>
      (${fmtPct(t.ebitda/base)}) e o lucro líquido em <strong>${fmt(t.lucroLiquido)}</strong>
      (${fmtPct(t.lucroLiquido/base)}). Depois de investimentos, a geração de caixa foi de
      <strong>${fmt(t.geracaoCaixa)}</strong>.`;

    const lbl = document.getElementById('fin-periodo-label');
    if (lbl) lbl.textContent =
      `${fmtL_(r0)} a ${fmtL_(rN)}${mAno_ ? '' : ' de ' + r0.ano}${estado.empresa ? ' · ' + estado.empresa : ''}`;
  }

  /* ---------- 15. GRÁFICOS (Chart.js já integrado no sistema) ---------- */

  function grafico(id, cfg) {
    const el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return;
    estado.charts[id]?.destroy();
    estado.charts[id] = new Chart(el, cfg);
  }

  function renderGraficos(res) {
    const slots = estado.slots;
    const multiAno = estado.anoInicio !== null && estado.anoInicio !== estado.anoFim;
    const lbl = slots.map(sl => multiAno ? MESES[sl.mes] + '/' + String(sl.ano).slice(2) : MESES[sl.mes]);
    const cut = arr => arr.slice(0, slots.length);

    grafico('fin-dre-chart-resultado', {
      type: 'bar',
      data: { labels: lbl, datasets: [
        { label:'Receita líquida', data: cut(res.serie.receitaLiquida), backgroundColor:'#002060' },
        { label:'Lucro líquido',   data: cut(res.serie.lucroLiquido),   backgroundColor:'#00B050' }
      ]},
      options: { responsive:true, maintainAspectRatio:false }
    });

    const grupos = Object.keys(SE_POR_GRUPO)
      .filter(g => seDoGrupo(g) === 'S')
      .map(g => ({ nome:g, total: totalGrupo(g).total }))
      .filter(g => g.total > 0)
      .sort((a,b) => b.total - a.total);

    grafico('fin-dre-chart-grupos', {
      type: 'bar',
      data: { labels: grupos.map(g => g.nome),
              datasets: [{ label:'Total', data: grupos.map(g => g.total),
                           backgroundColor:'#FF0000' }]},
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false,
                 plugins:{ legend:{ display:false }}}
    });

    const a = analiseFVDI();
    grafico('fin-dre-chart-fv', {
      type: 'doughnut',
      data: { labels:['Fixo','Variável','Não marcado'],
              datasets:[{ data:[a.fv.F, a.fv.V, a.fv['-']],
                          backgroundColor:['#002060','#00B050','#c3cad6'] }]},
      options: { responsive:true, maintainAspectRatio:false }
    });

    const base = res.serie.receitaLiquida;
    const pct = arr => arr.map((v,i) => base[i] ? (v/base[i])*100 : 0);
    grafico('fin-dre-chart-margem', {
      type: 'line',
      data: { labels: lbl, datasets: [
        { label:'Margem bruta %',   data: cut(pct(res.serie.lucroBruto)),   borderColor:'#002060', tension:.3 },
        { label:'Margem EBITDA %',  data: cut(pct(res.serie.ebitda)),       borderColor:'#00B050', tension:.3 },
        { label:'Margem líquida %', data: cut(pct(res.serie.lucroLiquido)), borderColor:'#FF0000', tension:.3 }
      ]},
      options: { responsive:true, maintainAspectRatio:false }
    });
  }

  /* ---------- 16. ORQUESTRAÇÃO ---------- */

  // A ordem importa: inverter produz número errado sem erro visível.
  function recalcular() {
    const st = document.getElementById('fin-status');
    if (st) { st.textContent = 'Calculando…'; st.className = 'fin-status carregando'; }

    montarBDDRE();                 // 1-4: plano -> BD -> SUMIFS -> TOTAL/MED/%
    const res = calcularResultado();
    renderResumo(res);             // 5
    renderKPIs(res);
    renderAlertas(res);
    renderDRE();                   // 6-8
    renderBDDRE();
    renderLancamentos();
    renderFVDI();
    renderGraficos(res);

    if (st) {
      st.textContent = `${estado.bdDre.length} linhas · ${estado.lancamentos.length} lançamentos`;
      st.className = 'fin-status';
    }
  }

  const ABAS_SEM_FILTRO = new Set(['fin-dre-pane-plano', 'fin-dre-pane-dre', 'fin-dre-pane-bddre']);

  function _dreAtualizarVisibilidadeFiltros(paneId) {
    const filtros = document.querySelector('.fin-filtros');
    if (filtros) filtros.style.display = ABAS_SEM_FILTRO.has(paneId) ? 'none' : '';
  }

  function ligarAbas() {
    document.querySelectorAll('.fin-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fin-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.fin-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const paneId = btn.dataset.finPane;
        document.getElementById(paneId)?.classList.add('active');
        _dreAtualizarVisibilidadeFiltros(paneId);
      });
    });
    // Aplica estado inicial conforme aba já ativa
    const abaAtiva = document.querySelector('.fin-tab.active');
    if (abaAtiva) _dreAtualizarVisibilidadeFiltros(abaAtiva.dataset.finPane);
  }

  function montarFiltros() {
    const anos = [...new Set(estado.lancamentos
      .map(l => { const d = parseData(l.dt_caixa); return (d && !isNaN(d)) ? d.getUTCFullYear() : null; })
      .filter(v => v !== null))].sort();
    if (!anos.length) anos.push(new Date().getFullYear());
    estado.ano = estado.ano ?? anos[anos.length - 1];
    if (estado.anoInicio == null) estado.anoInicio = estado.ano;
    if (estado.anoFim   == null) estado.anoFim   = estado.ano;

    const selAno = document.getElementById('fin-filtro-ano');
    if (selAno) {
      selAno.innerHTML = anos.map(a =>
        `<option value="${a}"${a === estado.ano ? ' selected' : ''}>${a}</option>`).join('');
      selAno.addEventListener('change', () => {
        estado.ano = +selAno.value;
        estado.anoInicio = estado.ano;
        estado.anoFim    = estado.ano;
        recalcular();
      });
    }

    const selMes = document.getElementById('fin-filtro-mes');
    if (selMes) {
      selMes.innerHTML = '<option value="">Ano inteiro</option>' +
        MESES.map((m,i) => `<option value="${i}">${m}</option>`).join('');
      selMes.addEventListener('change', () => {
        if (selMes.value === '') { estado.mesInicio = 0; estado.mesFim = 11; }
        else { estado.mesInicio = estado.mesFim = +selMes.value; }
        estado.anoInicio = estado.ano;
        estado.anoFim    = estado.ano;
        recalcular();
      });
    }

    const selGrupo = document.getElementById('fin-dre-filtro-grupo');
    if (selGrupo) {
      selGrupo.innerHTML = '<option value="">Grupo: todos</option>' +
        Object.keys(SE_POR_GRUPO).map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    }

    const selGrupoLanc = document.getElementById('fin-lanc-filtro-grupo');
    if (selGrupoLanc) {
      selGrupoLanc.innerHTML = '<option value="">Grupo: todos</option>' +
        Object.keys(SE_POR_GRUPO).map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
      selGrupoLanc.addEventListener('change', renderLancamentos);
    }

    document.getElementById('fin-btn-atualizar')?.addEventListener('click', recalcular);
  }

  /* ---------- 17. API PÚBLICA ---------- */

  function init({ plano = [], lancamentos = [], empresa = '', cnpj = 1, ano = null } = {}) {
    estado.plano = plano.map(c => ({ ...c, fv: c.fv || '', di: c.di || '' }));
    estado.lancamentos = lancamentos;
    estado.cnpj = cnpj;
    estado.ano = ano;
    estado.anoInicio = ano;
    estado.anoFim    = ano;

    estado.empresa = empresa || '';

    const el = document.getElementById('fin-empresa');
    if (el) el.textContent = empresa || 'RESUTE';

    ligarAbas();
    montarFiltros();
    recalcular();
    // As grades LiteGrid (BD e Plano de Contas) são inicializadas por dre-view.js
    // depois deste init(), que já carregou os dados em estado.plano / estado.lancamentos.
  }

  return { init, recalcular, estado, MESES, SE_POR_GRUPO, ESTRUTURA,
           montarBDDRE, calcularResultado, analiseFVDI, totalGrupo,
           registrosPlanoParaSalvar, registrosBDParaSalvar, renderLancamentos };
})();

if (typeof module !== 'undefined') module.exports = DRE;

// ── Ordenação de colunas de mês na aba Resultados ────────────────────────────
// Chamada pelo onclick de cada <th class="fin-dre-th-mes"> gerado em cabecalhoBloco.
// Ordena só o <tbody> (o <tfoot> de totais permanece fixo).
function dreResultSortCol(th) {
  var table = th.closest('table');
  if (!table) return;
  var tbody = table.querySelector('tbody');
  if (!tbody) return;

  var tr = th.closest('tr');
  var thIndex = Array.from(tr.cells).indexOf(th);
  var asc = th.dataset.asc !== 'true';

  // Limpa indicadores em todos os ths da mesma linha
  Array.from(tr.cells).forEach(function(c) {
    delete c.dataset.asc;
    var icon = c.querySelector('.fin-dre-sort-icon');
    if (icon) icon.textContent = '';
  });

  th.dataset.asc = String(asc);
  var icon = th.querySelector('.fin-dre-sort-icon');
  if (icon) icon.textContent = asc ? ' ▲' : ' ▼';

  // Parse número BR: "1.234" → 1234, "(-)1.234" → -1234, "-" → 0
  function parseNumBR(s) {
    s = String(s || '').trim();
    if (s === '-' || s === '') return 0;
    var neg = s.charAt(0) === '-' ? -1 : 1;
    var clean = s.replace(/^-/, '').replace(/\./g, '').replace(',', '.');
    var n = parseFloat(clean);
    return isNaN(n) ? 0 : neg * n;
  }

  var rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort(function(a, b) {
    var va = a.cells[thIndex] ? a.cells[thIndex].textContent : '';
    var vb = b.cells[thIndex] ? b.cells[thIndex].textContent : '';
    var na = parseNumBR(va), nb = parseNumBR(vb);
    return asc ? na - nb : nb - na;
  });
  rows.forEach(function(r) { tbody.appendChild(r); });
}
