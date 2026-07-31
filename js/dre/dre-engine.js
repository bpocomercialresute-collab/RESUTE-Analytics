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
    'CUSTO. MP OU REVENDA':    'S',
    'DESP. OPERACIONAL':       'S',
    'DESP. COMERCIAL':         'S',
    'DESP. LOGÍSTICA':         'S',
    'DESP. ADM':               'S',
    'MKT':                     'S',
    'MANUT. E CONSERVAÇÃO':    'S',
    'DESP. TRIBUTÁRIA':        'S',
    'DESP. FINANCEIRA':        'S',
    'PROLABORE E RETIRADA':    'S',
    'INVESTIMENTOS':           'S'
  };

  // Estrutura do DRE. 'grupo' desenha um bloco; 'resultado' desenha uma faixa.
  const ESTRUTURA = [
    { tipo:'grupo',     nome:'FATURAMENTO',             paralelo:true },
    { tipo:'grupo',     nome:'VALOR PRODUZIDO',         paralelo:true },
    { tipo:'grupo',     nome:'RECEITA OPERACIONAL',     sinal:'+' },
    { tipo:'grupo',     nome:'DESP. TRIBUTÁRIA',        sinal:'-' },
    { tipo:'resultado', nome:'RECEITA LÍQUIDA',         chave:'receitaLiquida', base:true },
    { tipo:'grupo',     nome:'CUSTO. MP OU REVENDA',    sinal:'-' },
    { tipo:'resultado', nome:'LUCRO BRUTO',             chave:'lucroBruto' },
    { tipo:'grupo',     nome:'DESP. OPERACIONAL',       sinal:'-' },
    { tipo:'grupo',     nome:'DESP. COMERCIAL',         sinal:'-' },
    { tipo:'grupo',     nome:'DESP. LOGÍSTICA',         sinal:'-' },
    { tipo:'grupo',     nome:'DESP. ADM',               sinal:'-' },
    { tipo:'grupo',     nome:'MKT',                     sinal:'-' },
    { tipo:'grupo',     nome:'MANUT. E CONSERVAÇÃO',    sinal:'-' },
    { tipo:'resultado', nome:'EBITDA',                  chave:'ebitda' },
    { tipo:'grupo',     nome:'DESP. FINANCEIRA',        sinal:'-' },
    { tipo:'grupo',     nome:'RECEITA NÃO OPERACIONAL', sinal:'+' },
    { tipo:'resultado', nome:'RESULTADO ANTES DE SÓCIOS', chave:'antesSocios' },
    { tipo:'grupo',     nome:'PROLABORE E RETIRADA',    sinal:'-' },
    { tipo:'resultado', nome:'LUCRO LÍQUIDO',           chave:'lucroLiquido' },
    { tipo:'grupo',     nome:'INVESTIMENTOS',           sinal:'-' },
    { tipo:'resultado', nome:'GERAÇÃO DE CAIXA',        chave:'geracaoCaixa' }
  ];

  /* ---------- 2. ESTADO ---------- */

  const estado = {
    plano: [],          // PLANO_CONTAS
    lancamentos: [],    // BD
    bdDre: [],          // BD_DRE
    ano: null,
    cnpj: 1,
    mesInicio: 0,       // índice 0-11
    mesFim: 11,
    charts: {}
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

  const mesesDoRecorte = () => estado.mesFim - estado.mesInicio + 1;

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
      const d = new Date(l.dt_caixa);
      const valido = !isNaN(d);
      return {
        ...l,
        grupo: c ? c.grupo : '#N/A',          // PROCV
        s_e:   c ? seDoGrupo(c.grupo) : '#N/A',
        fv:    c ? (c.fv || '') : '',
        di:    c ? (c.di || '') : '',
        ano:   valido ? d.getFullYear() : null,
        mesIdx: valido ? d.getMonth() : null,
        mes:   valido ? MESES[d.getMonth()] : null,
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
    const bd = enriquecerBD();

    const soma = new Map();
    for (const l of bd) {
      if (l.ano == null) continue;
      const chave = `${norm(l.conta)}|${l.ano}|${l.mesIdx}|${l.cnpj}`;
      soma.set(chave, num(soma.get(chave)) + num(l.valor));
    }

    // Produto cartesiano conta x ano x cnpj — igual à planilha:
    // o layout não muda de tamanho, mesmo com meses zerados.
    const linhas = [];
    let id = 1;
    for (const c of estado.plano) {
      const meses = MESES.map((_, i) =>
        num(soma.get(`${norm(c.conta)}|${estado.ano}|${i}|${estado.cnpj}`))
      );
      linhas.push({
        id: id++,
        cnpj: estado.cnpj,
        ano: estado.ano,
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

    // TOTAL = SOMA(Jan:Dez) restrito ao recorte de meses
    for (const l of linhas) {
      let t = 0;
      for (let i = estado.mesInicio; i <= estado.mesFim; i++) t += l.meses[i];
      l.total = t;
      l.med = t / mesesDoRecorte();          // MÉD = TOTAL / meses do recorte
    }

    // % = TOTAL da linha / RECEITA total do período.
    // Precisa da receita já somada — por isso é um segundo passe.
    const receita = linhas
      .filter(l => l.s_e === 'E')
      .reduce((s, l) => s + l.total, 0);
    for (const l of linhas) l.pct = receita ? l.total / receita : 0;

    estado.bdDre = linhas;
    return linhas;
  }

  /* ---------- 7. ESTÁGIO 4: TOTALIZADORES E RESULTADO ---------- */

  function totalGrupo(nome) {
    const linhas = estado.bdDre.filter(l => l.grupo === nome);
    const meses = MESES.map((_, i) =>
      linhas.reduce((s, l) => s + l.meses[i], 0)
    );
    const total = linhas.reduce((s, l) => s + l.total, 0);
    return { linhas, meses, total, med: total / mesesDoRecorte() };
  }

  // Todas as linhas de resultado, mês a mês e no total.
  function calcularResultado() {
    const g = {};
    for (const nome of Object.keys(SE_POR_GRUPO)) g[nome] = totalGrupo(nome);

    const porMes = i => ({
      receitaOp:   g['RECEITA OPERACIONAL'].meses[i],
      receitaNOp:  g['RECEITA NÃO OPERACIONAL'].meses[i],
      tributaria:  g['DESP. TRIBUTÁRIA'].meses[i],
      custoMP:     g['CUSTO. MP OU REVENDA'].meses[i],
      operacional: g['DESP. OPERACIONAL'].meses[i] + g['DESP. COMERCIAL'].meses[i]
                 + g['DESP. LOGÍSTICA'].meses[i]   + g['DESP. ADM'].meses[i]
                 + g['MKT'].meses[i]               + g['MANUT. E CONSERVAÇÃO'].meses[i],
      financeira:  g['DESP. FINANCEIRA'].meses[i],
      socios:      g['PROLABORE E RETIRADA'].meses[i],
      investim:    g['INVESTIMENTOS'].meses[i]
    });

    const serie = { receitaLiquida:[], lucroBruto:[], ebitda:[],
                    antesSocios:[], lucroLiquido:[], geracaoCaixa:[] };

    for (let i = 0; i < 12; i++) {
      const m = porMes(i);
      const rl  = m.receitaOp - m.tributaria;
      const lb  = rl - m.custoMP;
      const eb  = lb - m.operacional;
      const as  = eb - m.financeira + m.receitaNOp;
      const ll  = as - m.socios;
      const gc  = ll - m.investim;
      serie.receitaLiquida.push(rl); serie.lucroBruto.push(lb);
      serie.ebitda.push(eb);         serie.antesSocios.push(as);
      serie.lucroLiquido.push(ll);   serie.geracaoCaixa.push(gc);
    }

    const somaRecorte = arr => {
      let t = 0;
      for (let i = estado.mesInicio; i <= estado.mesFim; i++) t += arr[i];
      return t;
    };

    const tot = {};
    for (const k of Object.keys(serie)) tot[k] = somaRecorte(serie[k]);

    return { grupos: g, serie, total: tot, base: tot.receitaLiquida };
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
    for (let i = estado.mesInicio; i <= estado.mesFim; i++) th.push(`<th>${MESES[i]}</th>`);
    th.push('<th class="fin-dre-col-tot">TOT</th>');
    th.push('<th>MÉD/ANO</th>');
    th.push('<th>%</th>');
    return `<thead><tr>${th.join('')}</tr></thead>`;
  }

  function renderBloco(item) {
    const g = totalGrupo(item.nome);
    const saida = seDoGrupo(item.nome) === 'S';
    const cls = v => num(v) === 0 ? 'fin-dre-val-zero'
                   : (saida ? 'fin-dre-val-saida' : 'fin-dre-val-entrada');

    if (!g.linhas.length) {
      return `<div class="fin-dre-bloco"><div class="fin-tabela-vazia">
        Sem contas cadastradas em ${esc(item.nome)}.</div></div>`;
    }

    const corpo = g.linhas.map(l => {
      const tds = [`<td class="fin-dre-col-conta">${esc(l.conta)}</td>`];
      for (let i = estado.mesInicio; i <= estado.mesFim; i++)
        tds.push(`<td class="${cls(l.meses[i])}">${fmt(l.meses[i])}</td>`);
      tds.push(`<td class="fin-dre-col-tot ${cls(l.total)}">${fmt(l.total)}</td>`);
      tds.push(`<td class="${cls(l.med)}">${fmt(l.med)}</td>`);
      tds.push(`<td class="fin-dre-col-pct">${fmtPct(l.pct)}</td>`);
      return `<tr>${tds.join('')}</tr>`;
    }).join('');

    const prefixo = saida ? '(-)' : (item.paralelo ? '(=)' : '(+)');
    const rodape = [`<td class="fin-dre-col-conta">${prefixo} TOTAL ${esc(item.nome)}</td>`];
    for (let i = estado.mesInicio; i <= estado.mesFim; i++)
      rodape.push(`<td>${fmt(g.meses[i])}</td>`);
    rodape.push(`<td>${fmt(g.total)}</td>`);
    rodape.push(`<td>${fmt(g.med)}</td>`);
    const receita = estado.bdDre.filter(l => l.s_e === 'E').reduce((s,l)=>s+l.total,0);
    rodape.push(`<td>${fmtPct(receita ? g.total / receita : 0)}</td>`);

    return `<div class="fin-dre-bloco${item.paralelo ? ' fin-dre-paralelo' : ''}">
      <div class="fin-dre-bloco-scroll">
        <table class="fin-dre-tabela">
          ${cabecalhoBloco(item.nome, item.paralelo)}
          <tbody>${corpo}</tbody>
          <tfoot><tr>${rodape.join('')}</tr></tfoot>
        </table>
      </div></div>`;
  }

  function renderResultado(item, res) {
    const v = res.total[item.chave];
    const margem = res.base ? v / res.base : 0;
    const cls = item.base ? '' : (v >= 0 ? ' fin-dre-pos' : ' fin-dre-neg');
    return `<div class="fin-dre-resultado${cls}">
      <span class="fin-dre-res-nome">${esc(item.nome)}</span>
      <span class="fin-dre-res-valor">${fmt(v)}</span>
      <span class="fin-dre-res-margem">${
        item.base ? 'base de margem' : 'margem ' + fmtPct(margem)}</span>
    </div>`;
  }

  function renderDRE() {
    const res = calcularResultado();
    const alvo = document.getElementById('fin-dre-corpo');
    if (!alvo) return res;
    alvo.innerHTML = ESTRUTURA.map(item =>
      item.tipo === 'grupo' ? renderBloco(item) : renderResultado(item, res)
    ).join('');
    return res;
  }

  /* ---------- 10. RENDER: MATRIZ BD_DRE ---------- */

  function renderBDDRE() {
    const alvo = document.getElementById('fin-dre-tab-bddre');
    if (!alvo) return;
    if (!estado.bdDre.length) {
      alvo.innerHTML = '<div class="fin-tabela-vazia">Sem dados.</div>';
      return;
    }
    const th = ['CÓDIGO','CONTA','GRUPO','S_E']
      .map(h => `<th>${h}</th>`)
      .concat(MESES.map(m => `<th class="num">${m}</th>`))
      .concat(['<th class="num">TOTAL</th>','<th class="num">MED</th>','<th class="num">%</th>'])
      .join('');

    const tb = estado.bdDre.map(l => `<tr>
      <td><span class="fin-dre-cod">${esc(l.codigo)}</span></td>
      <td>${esc(l.conta)}</td>
      <td><span class="fin-dre-chip-grupo">${esc(l.grupo)}</span></td>
      <td>${esc(l.s_e)}</td>
      ${l.meses.map(v => `<td class="num${l.s_e==='S'&&v?' neg':''}">${fmt(v)}</td>`).join('')}
      <td class="num"><strong>${fmt(l.total)}</strong></td>
      <td class="num">${fmt(l.med)}</td>
      <td class="num">${fmtPct(l.pct)}</td>
    </tr>`).join('');

    alvo.innerHTML = `<table class="dc-tabela"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`;
  }

  /* ---------- 11. RENDER: PLANO DE CONTAS COM TOGGLES F_V / D_I ---------- */

  function toggle(campo, cod, valor, opcoes) {
    const btns = opcoes.map(o =>
      `<button class="fin-dre-opt${valor === o ? ' active' : ''}" data-valor="${o}">${o}</button>`
    ).join('');
    return `<div class="fin-dre-toggle" data-campo="${campo}" data-cod="${esc(cod)}">${btns}</div>`;
  }

  function renderPlano() {
    const alvo = document.getElementById('fin-dre-tab-plano');
    if (!alvo) return;

    const busca  = norm(document.getElementById('fin-dre-busca-plano')?.value);
    const fGrupo = document.getElementById('fin-dre-filtro-grupo')?.value || '';
    const fFV    = document.getElementById('fin-dre-filtro-fv')?.value || '';
    const fDI    = document.getElementById('fin-dre-filtro-di')?.value || '';

    const lista = estado.plano.filter(c => {
      if (busca && !norm(c.conta).includes(busca) && !norm(c.cod).includes(busca)) return false;
      if (fGrupo && c.grupo !== fGrupo) return false;
      if (fFV && (c.fv || '-') !== fFV) return false;
      if (fDI && (c.di || '-') !== fDI) return false;
      return true;
    });

    if (!lista.length) {
      alvo.innerHTML = '<div class="fin-tabela-vazia">Nenhuma conta com esses filtros.</div>';
      return;
    }

    const tb = lista.map(c => `<tr>
      <td><span class="fin-dre-cod">${esc(c.cod)}</span></td>
      <td>${esc(c.conta)}</td>
      <td><span class="fin-dre-chip-grupo">${esc(c.grupo)}</span></td>
      <td>${esc(seDoGrupo(c.grupo))}</td>
      <td>${toggle('fv', c.cod, c.fv, ['F','V'])}</td>
      <td>${toggle('di', c.cod, c.di, ['D','I'])}</td>
    </tr>`).join('');

    alvo.innerHTML = `<table class="dc-tabela">
      <thead><tr>
        <th>COD</th><th>CONTA</th><th>GRUPO</th><th>S_E</th>
        <th>F_V</th><th>D_I</th>
      </tr></thead>
      <tbody>${tb}</tbody></table>`;
  }

  // Clicar de novo na opção já ativa desmarca — volta para "não marcado".
  function ligarToggles() {
    const alvo = document.getElementById('fin-dre-tab-plano');
    if (!alvo) return;
    alvo.addEventListener('click', e => {
      const btn = e.target.closest('.fin-dre-opt');
      if (!btn) return;
      const box   = btn.closest('.fin-dre-toggle');
      const campo = box.dataset.campo;
      const cod   = box.dataset.cod;
      const valor = btn.dataset.valor;
      const conta = estado.plano.find(c => String(c.cod) === cod);
      if (!conta) return;

      conta[campo] = (conta[campo] === valor) ? '' : valor;
      box.querySelectorAll('.fin-dre-opt').forEach(b =>
        b.classList.toggle('active', b.dataset.valor === conta[campo])
      );
      montarBDDRE();
      renderFVDI();
      salvar(conta, campo);
    });
  }

  // Ponto de integração: trocar por PATCH na API do sistema.
  function salvar(conta, campo) {
    console.log('[DRE] gravar', { cod: conta.cod, campo, valor: conta[campo] });
  }

  /* ---------- 12. RENDER: LANÇAMENTOS ---------- */

  function renderLancamentos() {
    const alvo = document.getElementById('fin-dre-tab-lancamentos');
    if (!alvo) return;
    const bd = enriquecerBD().filter(l => l.ano === estado.ano);
    if (!bd.length) {
      alvo.innerHTML = '<div class="fin-tabela-vazia">Sem lançamentos no período.</div>';
      return;
    }
    const tb = bd.map(l => `<tr>
      <td>${esc(l.id)}</td>
      <td>${esc(l.dt_caixa)}</td>
      <td>${esc(l.conta)}</td>
      <td><span class="fin-dre-chip-grupo">${esc(l.grupo)}</span></td>
      <td>${esc(l.s_e)}</td>
      <td class="num${l.s_e === 'S' ? ' neg' : ''}">${fmt(l.valor)}</td>
      <td>${esc(l.status)}</td>
      <td>${esc(l.banco)}</td>
      <td>${esc(l.forma)}</td>
    </tr>`).join('');
    alvo.innerHTML = `<table class="dc-tabela">
      <thead><tr><th>ID</th><th>DT_CAIXA</th><th>CONTA</th><th>GRUPO</th>
      <th>S_E</th><th class="num">VALOR</th><th>STATUS</th><th>BANCO</th><th>FORMA</th></tr></thead>
      <tbody>${tb}</tbody></table>`;
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
    el.innerHTML = `No recorte de <strong>${mesesDoRecorte()} meses</strong> de
      <strong>${estado.ano}</strong>, a receita líquida somou <strong>${fmt(t.receitaLiquida)}</strong>.
      O lucro bruto ficou em <strong>${fmt(t.lucroBruto)}</strong>
      (${fmtPct(t.lucroBruto/base)}), o EBITDA em <strong>${fmt(t.ebitda)}</strong>
      (${fmtPct(t.ebitda/base)}) e o lucro líquido em <strong>${fmt(t.lucroLiquido)}</strong>
      (${fmtPct(t.lucroLiquido/base)}). Depois de investimentos, a geração de caixa foi de
      <strong>${fmt(t.geracaoCaixa)}</strong>.`;

    const lbl = document.getElementById('fin-periodo-label');
    if (lbl) lbl.textContent =
      `${MESES[estado.mesInicio]} a ${MESES[estado.mesFim]} de ${estado.ano} · Empresa ${estado.cnpj}`;
  }

  /* ---------- 15. GRÁFICOS (Chart.js já integrado no sistema) ---------- */

  function grafico(id, cfg) {
    const el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return;
    estado.charts[id]?.destroy();
    estado.charts[id] = new Chart(el, cfg);
  }

  function renderGraficos(res) {
    const lbl = MESES.slice(estado.mesInicio, estado.mesFim + 1);
    const cut = arr => arr.slice(estado.mesInicio, estado.mesFim + 1);

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
    renderPlano();
    renderLancamentos();
    renderFVDI();
    renderGraficos(res);

    if (st) {
      st.textContent = `${estado.bdDre.length} linhas · ${estado.lancamentos.length} lançamentos`;
      st.className = 'fin-status';
    }
  }

  function ligarAbas() {
    document.querySelectorAll('.fin-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fin-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.fin-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.finPane)?.classList.add('active');
      });
    });
  }

  function montarFiltros() {
    const anos = [...new Set(estado.lancamentos
      .map(l => new Date(l.dt_caixa).getFullYear())
      .filter(Number.isFinite))].sort();
    if (!anos.length) anos.push(new Date().getFullYear());
    estado.ano = estado.ano ?? anos[anos.length - 1];

    const selAno = document.getElementById('fin-filtro-ano');
    if (selAno) {
      selAno.innerHTML = anos.map(a =>
        `<option value="${a}"${a === estado.ano ? ' selected' : ''}>${a}</option>`).join('');
      selAno.addEventListener('change', () => { estado.ano = +selAno.value; recalcular(); });
    }

    const selMes = document.getElementById('fin-filtro-mes');
    if (selMes) {
      selMes.innerHTML = '<option value="">Ano inteiro</option>' +
        MESES.map((m,i) => `<option value="${i}">${m}</option>`).join('');
      selMes.addEventListener('change', () => {
        if (selMes.value === '') { estado.mesInicio = 0; estado.mesFim = 11; }
        else { estado.mesInicio = estado.mesFim = +selMes.value; }
        recalcular();
      });
    }

    const selGrupo = document.getElementById('fin-dre-filtro-grupo');
    if (selGrupo) {
      selGrupo.innerHTML = '<option value="">Grupo: todos</option>' +
        Object.keys(SE_POR_GRUPO).map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    }

    ['fin-dre-busca-plano','fin-dre-filtro-grupo','fin-dre-filtro-fv','fin-dre-filtro-di']
      .forEach(id => document.getElementById(id)?.addEventListener('input', renderPlano));

    document.getElementById('fin-btn-atualizar')?.addEventListener('click', recalcular);
  }

  /* ---------- 17. API PÚBLICA ---------- */

  function init({ plano = [], lancamentos = [], empresa = '', cnpj = 1, ano = null } = {}) {
    estado.plano = plano.map(c => ({ ...c, fv: c.fv || '', di: c.di || '' }));
    estado.lancamentos = lancamentos;
    estado.cnpj = cnpj;
    estado.ano = ano;

    const el = document.getElementById('fin-empresa');
    if (el) el.textContent = empresa || 'RESUTE';

    ligarAbas();
    ligarToggles();
    montarFiltros();
    recalcular();
  }

  return { init, recalcular, estado, MESES, SE_POR_GRUPO, ESTRUTURA,
           montarBDDRE, calcularResultado, analiseFVDI, totalGrupo };
})();

if (typeof module !== 'undefined') module.exports = DRE;
