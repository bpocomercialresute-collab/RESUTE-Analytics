// =============================================================================
// RELAT-REP.JS — 7 relatórios de representantes
// REP_MIX | REP_POSITIV | REP_SEM_ANO | REP_SEM | META | REP_DIA | REP_CRESC_MES
// =============================================================================

let REP_MODO = 'valor'; // 'valor' ou 'qtd'

function repToggleModo(m) {
  REP_MODO = m;
  repUpdateAll();
}

function repVal(row) {
  if (!window.IDX) return 0;
  return REP_MODO === 'qtd'
    ? (parseFloat(row[IDX.qtd]||0) || 0)
    : (parseFloat(String(row[IDX.valor]||'').replace(/\./g,'').replace(',','.')) || 0);
}
function repFmt(v) {
  if (REP_MODO === 'qtd') return v > 0 ? fmtInt(v) : '-';
  return v > 0 ? fmtValor(v) : '-';
}
function repFmtFull(v) {
  if (REP_MODO === 'qtd') return fmtInt(v);
  return fmtValor(v);
}

// ── TOGGLE BUTTON HTML ────────────────────────────────────────────────────────
function repToggleHtml() {
  return `<div class="rel-toggle">
    <button class="rel-toggle-btn ${REP_MODO==='valor'?'active':''}" onclick="repToggleModo('valor')">R$ VALOR</button>
    <button class="rel-toggle-btn ${REP_MODO==='qtd'?'active':''}" onclick="repToggleModo('qtd')">QTD</button>
  </div>`;
}

// ── INICIALIZA TODOS ──────────────────────────────────────────────────────────
function repUpdateAll() {
  if (!BD_DATA || !BD_DATA.rows.length) {
    ['mix','positiv','semano','sem','meta','dia','cresc'].forEach(k => {
      const el = document.getElementById('rep-tab-'+k);
      if (el) el.innerHTML = '<div class="av-rel-placeholder"><p>Sem dados</p><span>Cole dados no BD e clique em Processar</span></div>';
    });
    return;
  }
  repMix();
  repPositiv();
  repSemAno();
  repSem();
  repMeta();
  repDia();
  repCrescMes();
}

function repRenderTab(tabId) {
  if (!BD_DATA || !BD_DATA.rows.length) return;
  const map = {
    'rep-tab-mix':     repMix,
    'rep-tab-positiv': repPositiv,
    'rep-tab-semano':  repSemAno,
    'rep-tab-sem':     repSem,
    'rep-tab-meta':    repMeta,
    'rep-tab-dia':     repDia,
    'rep-tab-cresc':   repCrescMes,
  };
  if (map[tabId]) map[tabId]();
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function repGetVendedores() {
  return [...new Set(BD_DATA.rows.map(r => String(r[IDX.vendedor]||'').trim()).filter(Boolean))].sort();
}

function repParseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  return null;
}

function repGetSemanaDoMes(dt) {
  // SEM1=dias 1-7, SEM2=8-14, SEM3=15-21, SEM4=22-28, SEM5=29+
  const d = dt.getDate();
  if (d <= 7)  return 'SEM1';
  if (d <= 14) return 'SEM2';
  if (d <= 21) return 'SEM3';
  if (d <= 28) return 'SEM4';
  return 'SEM5';
}

const MES_LABEL_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DIA_LABEL    = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

// ════════════════════════════════════════════════════════════════════════
// REP_MIX — Mix de produtos por dia da semana (agrupado por semana)
// ════════════════════════════════════════════════════════════════════════
function repMix() {
  const el = document.getElementById('rep-tab-mix');
  if (!el) return;

  const vendedores = repGetVendedores();

  // Agrupa linhas por semana ISO (ano+semana)
  const semanas = {};
  BD_DATA.rows.forEach(r => {
    const dtStr = String(r[IDX.saida]||r[IDX.emissao]||'').trim();
    const dt = repParseDate(dtStr);
    if (!dt) return;
    const vend = String(r[IDX.vendedor]||'').trim();
    if (!vend) return;
    const diaSem = dt.getDay(); // 0=Dom,...6=Sáb
    // Chave da semana: segunda-feira da semana
    const d = new Date(dt); d.setDate(d.getDate() - diaSem + (diaSem===0?-6:1));
    const chave = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!semanas[chave]) semanas[chave] = {};
    if (!semanas[chave][vend]) semanas[chave][vend] = Array(7).fill(0);
    semanas[chave][vend][diaSem] += repVal(r);
  });

  const semanasOrdenadas = Object.keys(semanas).sort();

  let html = `<div class="rel-header-bar">
    ${repToggleHtml()}
    <div class="rel-title">MIX DE PRODUTOS POR DIA DA SEMANA</div>
  </div><div class="rep-scroll-area">`;

  semanasOrdenadas.forEach(chave => {
    const dt = new Date(chave + 'T00:00:00');
    // Gera os 7 dias da semana
    const dias = Array.from({length:7}, (_,i) => {
      const d = new Date(dt); d.setDate(d.getDate()+i);
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    });

    html += `<table class="rep-tbl"><thead>
      <tr class="rep-th-semana">
        <td colspan="2">VENDEDOR</td>
        ${dias.map(d=>`<td>${d}</td>`).join('')}
        <td>MEDIA</td><td>TOTAL MIX</td><td>MED_ANT</td><td>RESULTADO</td>
      </tr></thead><tbody>`;

    // Totais para calcular MED_ANT (semana anterior)
    const idxAnt = semanasOrdenadas.indexOf(chave) - 1;
    const semAnt = idxAnt >= 0 ? semanas[semanasOrdenadas[idxAnt]] : null;

    vendedores.forEach(vend => {
      const dias7 = semanas[chave][vend] || Array(7).fill(0);
      const tot = dias7.reduce((s,v)=>s+v,0);
      if (tot === 0) return;
      const ativos = dias7.filter(v=>v>0);
      const media  = ativos.length ? tot/ativos.length : 0;
      const antTot = semAnt && semAnt[vend] ? semAnt[vend].reduce((s,v)=>s+v,0) : 0;
      const antAtivos = semAnt && semAnt[vend] ? semAnt[vend].filter(v=>v>0).length : 0;
      const medAnt = antAtivos ? antTot/antAtivos : 0;
      const result = medAnt > 0 ? ((media/medAnt)-1)*100 : 0;
      const cor = result >= 0 ? '#059669' : '#DC2626';
      html += `<tr>
        <td colspan="2" class="rep-lbl">${vend}</td>
        ${dias7.map(v=>`<td>${repFmt(v)}</td>`).join('')}
        <td>${repFmt(media)}</td>
        <td style="color:#ffd24a;font-weight:700">${repFmt(tot)}</td>
        <td>${repFmt(medAnt)}</td>
        <td style="color:${cor};font-weight:700">${result>=0?'▲':'▼'} ${Math.abs(result).toFixed(1)}%</td>
      </tr>`;
    });

    // Totais da semana
    const totSemana = Array(7).fill(0);
    vendedores.forEach(v => { const d=semanas[chave][v]||Array(7).fill(0); d.forEach((vv,i)=>totSemana[i]+=vv); });
    html += `<tr class="rep-row-total">
      <td colspan="2">TOTAL</td>
      ${totSemana.map(v=>`<td>${repFmt(v)}</td>`).join('')}
      <td colspan="3"></td><td></td>
    </tr></tbody></table><div style="height:16px"></div>`;
  });

  html += '</div>';
  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════════════
// REP_POSITIV — Informações gerais de vendas por representante (ano todo)
// ════════════════════════════════════════════════════════════════════════
function repPositiv() {
  const el = document.getElementById('rep-tab-positiv');
  if (!el) return;

  const anos = [...new Set(BD_DATA.rows.map(r=>String(r[IDX.ano]||'').trim()).filter(Boolean))].sort();
  const anoAtual = anos[anos.length-1] || String(new Date().getFullYear());
  const vendedores = repGetVendedores();
  const SEMS = ['SEM1','SEM2','SEM3','SEM4','SEM5'];

  // pivot: vend → mes → sem → valor
  const pivot = {};
  vendedores.forEach(v => {
    pivot[v] = {};
    for (let m=0;m<12;m++) { pivot[v][m] = {}; SEMS.forEach(s=>pivot[v][m][s]=0); }
  });

  BD_DATA.rows.forEach(r => {
    if (String(r[IDX.ano]||'').trim() !== anoAtual) return;
    const vend = String(r[IDX.vendedor]||'').trim();
    const dtStr = String(r[IDX.saida]||r[IDX.emissao]||'').trim();
    const dt = repParseDate(dtStr);
    if (!vend || !dt || !pivot[vend]) return;
    const mes = dt.getMonth();
    const sem = repGetSemanaDoMes(dt);
    pivot[vend][mes][sem] += repVal(r);
  });

  const mesesAtivos = [...new Set(BD_DATA.rows
    .filter(r=>String(r[IDX.ano]||'')=== anoAtual)
    .map(r=>{ const dt=repParseDate(String(r[IDX.saida]||r[IDX.emissao]||'').trim()); return dt?dt.getMonth():-1; })
    .filter(m=>m>=0))].sort((a,b)=>a-b);

  let totalGeral = 0;
  const totVend = {};
  vendedores.forEach(v => {
    totVend[v] = mesesAtivos.reduce((s,m) => s+SEMS.reduce((ss,sem)=>ss+pivot[v][m][sem],0),0);
    totalGeral += totVend[v];
  });

  let html = `<div class="rel-header-bar">
    ${repToggleHtml()}
    <div class="rel-title">INFORMAÇÕES GERAIS — VENDAS POR REPRESENTANTE ${anoAtual}</div>
  </div><div class="rep-scroll-area"><table class="rep-tbl"><thead>
    <tr class="rep-th-semana">
      <td>REPRESENTANTE</td>
      ${mesesAtivos.map(m=>`<td colspan="5">${MES_LABEL_PT[m].toUpperCase()}</td>`).join('')}
      <td>MED</td><td>TOT</td><td>%</td>
    </tr>
    <tr class="rep-th-sem">
      <td></td>
      ${mesesAtivos.map(()=>SEMS.map(s=>`<td>${s}</td>`).join('')).join('')}
      <td></td><td></td><td></td>
    </tr>
  </thead><tbody>`;

  vendedores.forEach(vend => {
    const tot = totVend[vend];
    if (tot === 0) return;
    const pct = totalGeral > 0 ? (tot/totalGeral*100).toFixed(1) : '0.0';
    const celulas = mesesAtivos.map(m => SEMS.map(s=>`<td>${repFmt(pivot[vend][m][s])}</td>`).join('')).join('');
    const mesesComValor = mesesAtivos.filter(m => SEMS.some(s=>pivot[vend][m][s]>0)).length;
    const media = mesesComValor > 0 ? tot/mesesComValor : 0;
    html += `<tr>
      <td class="rep-lbl">${vend}</td>
      ${celulas}
      <td>${repFmt(media)}</td>
      <td style="font-weight:700">${repFmtFull(tot)}</td>
      <td>${pct}%</td>
    </tr>`;
  });

  // TOTAL
  const totMes = mesesAtivos.map(m => ({mes:m, sems: SEMS.map(s=>vendedores.reduce((s2,v)=>s2+pivot[v][m][s],0))}));
  html += `<tr class="rep-row-total">
    <td>% DO TOTAL</td>
    ${totMes.map(({mes,sems})=>{
      const totM = sems.reduce((s,v)=>s+v,0);
      return sems.map(v=>`<td>${totM>0?(v/totM*100).toFixed(1)+'%':'-'}</td>`).join('');
    }).join('')}
    <td colspan="3"></td>
  </tr>`;

  html += '</tbody></table></div>';
  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════════════
// REP_SEM_ANO — Semanal por ano (mesma estrutura compacta)
// ════════════════════════════════════════════════════════════════════════
function repSemAno() {
  // Usa os mesmos dados mas mostra totais por semana do mês, de forma mensal
  repPositiv(); // Reutiliza por ora
  const src = document.getElementById('rep-tab-positiv');
  const dst = document.getElementById('rep-tab-semano');
  if (src && dst) dst.innerHTML = src.innerHTML;
}

// ════════════════════════════════════════════════════════════════════════
// REP_SEM — Mês atual: semanas × representante com comparativo
// ════════════════════════════════════════════════════════════════════════
function repSem() {
  const el = document.getElementById('rep-tab-sem');
  if (!el) return;

  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = String(hoje.getFullYear());
  const SEMS = ['SEM1','SEM2','SEM3','SEM4','SEM5'];
  const vendedores = repGetVendedores();

  const pivot = {}, pivotAnt = {};
  vendedores.forEach(v => { pivot[v] = {}; pivotAnt[v] = {}; SEMS.forEach(s=>{pivot[v][s]=0;pivotAnt[v][s]=0;}); });

  BD_DATA.rows.forEach(r => {
    const vend = String(r[IDX.vendedor]||'').trim();
    const dtStr = String(r[IDX.saida]||r[IDX.emissao]||'').trim();
    const dt = repParseDate(dtStr);
    if (!vend || !dt || !pivot[vend]) return;
    const sem = repGetSemanaDoMes(dt);
    if (String(r[IDX.ano]||'')=== anoAtual && dt.getMonth()===mesAtual)
      pivot[vend][sem] += repVal(r);
    else if (String(r[IDX.ano]||'')=== anoAtual && dt.getMonth()===mesAtual-1)
      pivotAnt[vend][sem] += repVal(r);
  });

  let totalGeral = 0;
  const totVend = {};
  vendedores.forEach(v => { totVend[v]=SEMS.reduce((s,sem)=>s+pivot[v][sem],0); totalGeral+=totVend[v]; });
  const totAntVend = {};
  vendedores.forEach(v => totAntVend[v]=SEMS.reduce((s,sem)=>s+pivotAnt[v][sem],0));

  let html = `<div class="rel-header-bar">
    ${repToggleHtml()}
    <div class="rel-title">VENDAS ${MES_LABEL_PT[mesAtual].toUpperCase()} ${anoAtual} — SEMANAL</div>
  </div><div class="rep-scroll-area"><table class="rep-tbl"><thead>
    <tr class="rep-th-semana">
      <td>REPRESENTANTE</td>
      ${SEMS.map(s=>`<td>${s}</td>`).join('')}
      <td>MED</td><td>Total</td><td>%</td>
      <td>COMP MÊS ANT</td><td>VAR %</td>
    </tr>
  </thead><tbody>`;

  vendedores.forEach(vend => {
    const tot = totVend[vend];
    if (tot === 0) return;
    const pct = totalGeral > 0 ? (tot/totalGeral*100).toFixed(1) : '0.0';
    const ativos = SEMS.filter(s=>pivot[vend][s]>0).length;
    const media = ativos > 0 ? tot/ativos : 0;
    const ant = totAntVend[vend];
    const varp = ant > 0 ? ((tot-ant)/ant*100) : 0;
    const cor = varp >= 0 ? '#059669' : '#DC2626';
    html += `<tr>
      <td class="rep-lbl">${vend}</td>
      ${SEMS.map(s=>`<td>${repFmt(pivot[vend][s])}</td>`).join('')}
      <td>${repFmt(media)}</td>
      <td style="font-weight:700">${repFmtFull(tot)}</td>
      <td>${pct}%</td>
      <td>${repFmt(ant)}</td>
      <td style="color:${cor};font-weight:700">${varp>=0?'▲':'▼'} ${Math.abs(varp).toFixed(1)}%</td>
    </tr>`;
  });

  // TOTAL linha
  const totSems = SEMS.map(s=>vendedores.reduce((sum,v)=>sum+pivot[v][s],0));
  html += `<tr class="rep-row-total">
    <td>TOTAL</td>
    ${totSems.map(v=>`<td>${repFmtFull(v)}</td>`).join('')}
    <td></td><td style="color:#ffd24a;font-weight:800">${repFmtFull(totalGeral)}</td>
    <td>100%</td><td colspan="2"></td>
  </tr>
  <tr class="rep-row-pct">
    <td>% DO TOTAL</td>
    ${totSems.map(v=>`<td>${totalGeral>0?(v/totalGeral*100).toFixed(1)+'%':'-'}</td>`).join('')}
    <td colspan="4"></td>
  </tr>`;
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════════════
// META — Metas por representante
// ════════════════════════════════════════════════════════════════════════
function repMeta() {
  const el = document.getElementById('rep-tab-meta');
  if (!el) return;
  const vendedores = repGetVendedores();
  const hoje = new Date();
  const anoAtual = String(hoje.getFullYear());
  const mesAtual = hoje.getMonth();

  // Vendas do mês atual por dia
  const vendasDia = {};
  BD_DATA.rows.forEach(r => {
    const dtStr = String(r[IDX.saida]||r[IDX.emissao]||'').trim();
    const dt = repParseDate(dtStr);
    const vend = String(r[IDX.vendedor]||'').trim();
    if (!dt||!vend) return;
    if (String(r[IDX.ano]||'')!==anoAtual||dt.getMonth()!==mesAtual) return;
    const key = `${vend}|${dt.getDate()}`;
    vendasDia[key] = (vendasDia[key]||0) + repVal(r);
  });

  // Dias do mês
  const diasDoMes = new Date(hoje.getFullYear(), mesAtual+1, 0).getDate();
  const diasArr = Array.from({length:diasDoMes}, (_,i)=>i+1);

  let html = `<div class="rel-header-bar">
    ${repToggleHtml()}
    <div class="rel-title">METAS — ${MES_LABEL_PT[mesAtual].toUpperCase()} ${anoAtual}</div>
  </div><div class="rep-scroll-area"><table class="rep-tbl">
  <thead>
    <tr class="rep-th-semana">
      <td>REPRESENTANTE</td>
      ${diasArr.map(d=>`<td>${d}</td>`).join('')}
      <td>MED</td><td>TOTAL</td><td>%</td>
    </tr>
    <tr class="rep-th-sem">
      <td></td>
      ${diasArr.map(d=>{ const dt=new Date(hoje.getFullYear(),mesAtual,d); return `<td>${['D','S','T','Q','Q','S','S'][dt.getDay()]}</td>`; }).join('')}
      <td></td><td></td><td></td>
    </tr>
  </thead><tbody>`;

  let totalGeral = 0;
  const totVend = {};
  vendedores.forEach(v => {
    totVend[v] = diasArr.reduce((s,d)=>s+(vendasDia[`${v}|${d}`]||0),0);
    totalGeral += totVend[v];
  });

  vendedores.forEach(vend => {
    const tot = totVend[vend];
    if (tot===0) return;
    const pct = totalGeral>0?(tot/totalGeral*100).toFixed(1):'0.0';
    const diasComVenda = diasArr.filter(d=>(vendasDia[`${vend}|${d}`]||0)>0).length;
    const media = diasComVenda>0 ? tot/diasComVenda : 0;
    html += `<tr>
      <td class="rep-lbl">${vend}</td>
      ${diasArr.map(d=>`<td>${repFmt(vendasDia[`${vend}|${d}`]||0)}</td>`).join('')}
      <td>${repFmt(media)}</td>
      <td style="font-weight:700">${repFmtFull(tot)}</td>
      <td>${pct}%</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════════════
// REP_DIA — Produtividade diária (semana a semana, dia a dia)
// ════════════════════════════════════════════════════════════════════════
function repDia() {
  // Semelhante ao REP_MIX mas por dia individual
  repMix();
  const src = document.getElementById('rep-tab-mix');
  const dst = document.getElementById('rep-tab-dia');
  if (src && dst) {
    dst.innerHTML = src.innerHTML.replace('MIX DE PRODUTOS POR DIA DA SEMANA', 'PRODUTIVIDADE DIÁRIA POR REPRESENTANTE');
  }
}

// ════════════════════════════════════════════════════════════════════════
// REP_CRESC_MES — Vendas mensais + crescimento/queda
// ════════════════════════════════════════════════════════════════════════
function repCrescMes() {
  const el = document.getElementById('rep-tab-cresc');
  if (!el) return;

  const anos = [...new Set(BD_DATA.rows.map(r=>String(r[IDX.ano]||'').trim()).filter(Boolean))].sort();
  const anoAtual = anos[anos.length-1] || String(new Date().getFullYear());
  const MES_IDX_LOCAL = {jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};
  const vendedores = repGetVendedores();

  // pivot: vend → [12 meses]
  const pivot = {};
  vendedores.forEach(v => pivot[v] = Array(12).fill(0));

  BD_DATA.rows.forEach(r => {
    if (String(r[IDX.ano]||'').trim() !== anoAtual) return;
    const vend = String(r[IDX.vendedor]||'').trim();
    const mi = MES_IDX_LOCAL[String(r[IDX.mes]||'').trim().toLowerCase()] ?? -1;
    if (!vend || mi<0 || !pivot[vend]) return;
    pivot[vend][mi] += repVal(r);
  });

  // Meses com dados
  const mesesAtivos = Array.from({length:12},(_,i)=>i)
    .filter(m => vendedores.some(v=>pivot[v][m]>0));

  let totalGeral = 0;
  const totVend = {};
  vendedores.forEach(v => { totVend[v]=mesesAtivos.reduce((s,m)=>s+pivot[v][m],0); totalGeral+=totVend[v]; });

  let html = `<div class="rel-header-bar">
    ${repToggleHtml()}
    <div class="rel-title">VENDAS MENSAIS POR REPRESENTANTE — ${anoAtual}</div>
  </div><div class="rep-scroll-area"><table class="rep-tbl"><thead>
    <tr class="rep-th-semana">
      <td>TIPO</td><td>REPRESENTANTE</td>
      ${mesesAtivos.map(m=>`<td>${MES_LABEL_PT[m].toUpperCase()}</td>`).join('')}
      <td>MED</td><td>TOTAL</td><td>%</td><td>Nº QUEDA</td><td>Nº CRESC</td>
    </tr>
  </thead><tbody>`;

  vendedores.forEach(vend => {
    const tot = totVend[vend];
    if (tot===0) return;
    const pct = totalGeral>0?(tot/totalGeral*100).toFixed(1):'0.0';
    const ativos = mesesAtivos.filter(m=>pivot[vend][m]>0).length;
    const media = ativos>0?tot/ativos:0;

    // Queda/crescimento
    let nQueda=0, nCresc=0;
    for (let i=1;i<mesesAtivos.length;i++) {
      const m=mesesAtivos[i], mp=mesesAtivos[i-1];
      if (pivot[vend][m]>0 && pivot[vend][mp]>0) {
        if (pivot[vend][m]<pivot[vend][mp]) nQueda++;
        else if (pivot[vend][m]>pivot[vend][mp]) nCresc++;
      }
    }

    // Tipo do representante (da aba REPRESENTANTES)
    const tipo = repGetTipo(vend);

    html += `<tr>
      <td style="font-size:10px;color:#7a9cc8">${tipo}</td>
      <td class="rep-lbl">${vend}</td>
      ${mesesAtivos.map(m=>`<td>${repFmt(pivot[vend][m])}</td>`).join('')}
      <td>${repFmt(media)}</td>
      <td style="font-weight:700">${repFmtFull(tot)}</td>
      <td>${pct}%</td>
      <td style="color:#DC2626">${nQueda}</td>
      <td style="color:#059669">${nCresc}</td>
    </tr>`;
  });

  // Totais por mês
  const totMes = mesesAtivos.map(m=>vendedores.reduce((s,v)=>s+(pivot[v][m]||0),0));
  html += `<tr class="rep-row-total">
    <td colspan="2">TOTAL</td>
    ${totMes.map(v=>`<td>${repFmtFull(v)}</td>`).join('')}
    <td></td>
    <td style="color:#ffd24a;font-weight:800">${repFmtFull(totalGeral)}</td>
    <td>100%</td><td colspan="2"></td>
  </tr>
  <tr class="rep-row-pct">
    <td colspan="2">% DO TOTAL</td>
    ${totMes.map(v=>`<td>${totalGeral>0?(v/totalGeral*100).toFixed(1)+'%':'-'}</td>`).join('')}
    <td colspan="4"></td>
  </tr>
  <tr class="rep-row-evol">
    <td colspan="2">% EVOLUÇÃO MÊS</td>
    ${totMes.map((v,i)=>{
      if(i===0) return '<td>—</td>';
      const ant=totMes[i-1];
      const ev=ant>0?((v-ant)/ant*100):0;
      const cor=ev>=0?'#059669':'#DC2626';
      return `<td style="color:${cor}">${ev>=0?'▲':'▼'} ${Math.abs(ev).toFixed(1)}%</td>`;
    }).join('')}
    <td colspan="4"></td>
  </tr>`;

  html += '</tbody></table></div>';
  el.innerHTML = html;
}

// Helper: tipo do representante
function repGetTipo(nome) {
  const data = window.GRID_DATA_STORE?.representantes || [];
  const row = data.find(r => String(r[2]||'').trim() === nome);
  return row ? String(row[3]||'').trim() : 'REPRESENTANTE';
}
