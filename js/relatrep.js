// =============================================================================
// RELAT-REP.JS — 7 relatórios de representantes
// REP_MIX | REP_POSITIV | REP_SEM_ANO | REP_SEM | META | REP_DIA | REP_CRESC_MES
// =============================================================================

let REP_MODO = 'valor'; // 'valor' ou 'qtd'
window.REP_FILTER = window.REP_FILTER || { vendedor:'', produto:'', cliente:'', grupo:'' };
window.REP_PREMIACAO_MODO = window.REP_PREMIACAO_MODO || 'geral';
window.REP_PREMIACAO_FIXA = window.REP_PREMIACAO_FIXA || [
  'ANDERSON DE LESSA COSTA',
  'PEDRO HENRIQUE SANTOS SALES',
  'WEDNA ROSA DE SOUZA'
];

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
  if (REP_MODO === 'qtd') return v > 0 ? v.toLocaleString('pt-BR',{maximumFractionDigits:0}) : '-';
  return v > 0 ? 'R$ '+v.toLocaleString('pt-BR',{maximumFractionDigits:0}) : '-';
}
function repFmtFull(v) {
  if (REP_MODO === 'qtd') return v.toLocaleString('pt-BR',{maximumFractionDigits:0});
  return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2});
}

function repMiniCell(valor, max) {
  const pct = max > 0 ? Math.max(3, Math.min(100, (valor / max) * 100)) : 0;
  return `<div class="rep-mini-cell">
    <span>${repFmt(valor)}</span>
    <i><b style="width:${pct}%"></b></i>
  </div>`;
}

function repShareCell(valor, total) {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  return `<div class="rep-share-cell">
    <strong>${pct.toFixed(1)}%</strong>
    <i><b style="width:${Math.max(3, Math.min(100, pct))}%"></b></i>
  </div>`;
}

// ── TOGGLE BUTTON HTML ────────────────────────────────────────────────────────
function repEsc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function repPedidoChave(row) {
  var pedido = String(row[IDX.pedido] || '').trim();
  if (pedido) return 'pedido:' + pedido;
  var id = String(row[IDX.id] || '').trim();
  if (id) return 'id:' + id;
  return [
    'fallback',
    String(row[IDX.cliente] || '').trim(),
    String(row[IDX.vendedor] || '').trim(),
    String(row[IDX.saida] || row[IDX.emissao] || '').trim(),
    String(row[IDX.produto] || '').trim(),
    String(row[IDX.qtd] || '').trim(),
    String(row[IDX.valor] || '').trim()
  ].join('|');
}

function repPremiacaoModo(modo) {
  window.REP_PREMIACAO_MODO = modo === 'atual' ? 'atual' : 'geral';
  repPremiacao();
}

function repNomeNormalizado(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function repPremiacaoNomesFixos() {
  return new Set((window.REP_PREMIACAO_FIXA || []).map(repNomeNormalizado).filter(Boolean));
}

function repPremiacaoEhNomeFixo(nome) {
  const atual = repNomeNormalizado(nome);
  if (!atual) return false;
  return Array.from(repPremiacaoNomesFixos()).some(fixo =>
    atual === fixo || atual.includes(fixo) || fixo.includes(atual)
  );
}

function repFiltrarRowsPremiacao(rows) {
  const lista = Array.isArray(rows) ? rows : [];
  if (window.REP_PREMIACAO_MODO !== 'atual') return lista;
  return lista.filter(r => repPremiacaoEhNomeFixo(r[IDX.vendedor]));
}

function repBaseRows() {
  return (window.BD_DATA && Array.isArray(window.BD_DATA.rows)) ? window.BD_DATA.rows : [];
}

function repDataRows() {
  const f = window.REP_FILTER || {};
  return repBaseRows().filter(r => {
    if (f.vendedor && String(r[IDX.vendedor]||'').trim() !== f.vendedor) return false;
    if (f.produto && String(r[IDX.produto]||'').trim() !== f.produto) return false;
    if (f.cliente && String(r[IDX.cliente]||'').trim() !== f.cliente) return false;
    if (f.grupo && String(g(r,'grupo') || g(r,'grupoProd')).trim() !== f.grupo) return false;
    return true;
  });
}

function repUnique(campo) {
  const vals = repBaseRows().map(r => {
    if (campo === 'vendedor') return String(r[IDX.vendedor]||'').trim();
    if (campo === 'produto') return String(r[IDX.produto]||'').trim();
    if (campo === 'cliente') return String(r[IDX.cliente]||'').trim();
    if (campo === 'grupo') return String(g(r,'grupo') || g(r,'grupoProd')).trim();
    return '';
  }).filter(Boolean);
  return [...new Set(vals)].sort((a,b)=>a.localeCompare(b));
}

function repSetFiltro(campo, valor) {
  window.REP_FILTER[campo] = valor || '';
  repUpdateAll();
}

function repLimparFiltros() {
  window.REP_FILTER = { vendedor:'', produto:'', cliente:'', grupo:'' };
  repUpdateAll();
}

function repSelectFiltro(campo, label) {
  const atual = (window.REP_FILTER && window.REP_FILTER[campo]) || '';
  const opts = repUnique(campo).map(v => `<option value="${repEsc(v)}" ${v===atual?'selected':''}>${repEsc(v)}</option>`).join('');
  return `<label class="rep-filter-field"><span>${label}</span><select onchange="repSetFiltro('${campo}', this.value)">
    <option value="">Todos</option>${opts}
  </select></label>`;
}

function repFilterHtml() {
  const filtrados = repDataRows().length;
  const total = repBaseRows().length;
  return `<div class="rep-filterbar">
    <div class="rep-filter-grid">
      ${repSelectFiltro('vendedor','Vendedor')}
      ${repSelectFiltro('produto','Produto')}
      ${repSelectFiltro('cliente','Cliente')}
      ${repSelectFiltro('grupo','Grupo')}
    </div>
    <button class="rep-clear-filter" onclick="repLimparFiltros()">Limpar filtros</button>
    <span class="rep-filter-count">${filtrados.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} registros</span>
  </div>`;
}

function repToggleHtml() {
  return `<div class="rep-report-tools">
    <div class="rel-toggle">
      <button class="rel-toggle-btn ${REP_MODO==='valor'?'active':''}" onclick="repToggleModo('valor')">R$ VALOR</button>
      <button class="rel-toggle-btn ${REP_MODO==='qtd'?'active':''}" onclick="repToggleModo('qtd')">QTD</button>
    </div>
    ${repFilterHtml()}
  </div>`;
}

// ── INICIALIZA TODOS ──────────────────────────────────────────────────────────
function repUpdateAll() {
  if (!BD_DATA || !BD_DATA.rows.length) {
    ['mix','positiv','semano','sem','meta','dia','cresc','premiacao'].forEach(k => {
      const el = document.getElementById('rep-tab-'+k);
      if (el) el.innerHTML = '<div class="av-rel-placeholder"><p>Sem dados</p><span>Cole dados no BD e clique em Processar</span></div>';
    });
    return;
  }
  if (!repDataRows().length) {
    ['mix','positiv','semano','sem','meta','dia','cresc','premiacao'].forEach(k => {
      const el = document.getElementById('rep-tab-'+k);
      if (el) el.innerHTML = `<div class="rel-header-bar">${repToggleHtml()}<div class="rel-title">Sem dados para os filtros selecionados</div></div>`;
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
  repPremiacao();
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
    'rep-tab-premiacao': repPremiacao,
  };
  if (map[tabId]) map[tabId]();
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function repGetVendedores() {
  return [...new Set(repDataRows().map(r => String(r[IDX.vendedor]||'').trim()).filter(Boolean))].sort();
}

function repParseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
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
  repDataRows().forEach(r => {
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
    const maxDia = Math.max(1, ...Object.values(semanas[chave]).flat());

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
      const cor = result >= 0 ? '#10b981' : '#ef4444';
      html += `<tr>
        <td colspan="2" class="rep-lbl">${vend}</td>
        ${dias7.map(v=>`<td>${repMiniCell(v, maxDia)}</td>`).join('')}
        <td>${repMiniCell(media, maxDia)}</td>
        <td class="rep-total-cell">${repMiniCell(tot, Math.max(1, tot))}</td>
        <td>${repMiniCell(medAnt, maxDia)}</td>
        <td><span class="rep-trend" style="color:${cor}">${result>=0?'▲':'▼'} ${Math.abs(result).toFixed(1)}%</span></td>
      </tr>`;
    });

    // Totais da semana
    const totSemana = Array(7).fill(0);
    vendedores.forEach(v => { const d=semanas[chave][v]||Array(7).fill(0); d.forEach((vv,i)=>totSemana[i]+=vv); });
    html += `<tr class="rep-row-total">
      <td colspan="2">TOTAL</td>
      ${totSemana.map(v=>`<td>${repMiniCell(v, Math.max(1, ...totSemana))}</td>`).join('')}
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

  const rows = repFiltrarRowsPremiacao(repDataRows());
  const anos = [...new Set(rows.map(r=>String(r[IDX.ano]||'').trim()).filter(Boolean))].sort();
  const anoAtual = anos[anos.length-1] || String(new Date().getFullYear());
  const vendedores = repGetVendedores();
  const SEMS = ['SEM1','SEM2','SEM3','SEM4','SEM5'];

  // pivot: vend → mes → sem → valor
  const pivot = {};
  vendedores.forEach(v => {
    pivot[v] = {};
    for (let m=0;m<12;m++) { pivot[v][m] = {}; SEMS.forEach(s=>pivot[v][m][s]=0); }
  });

  rows.forEach(r => {
    if (String(r[IDX.ano]||'').trim() !== anoAtual) return;
    const vend = String(r[IDX.vendedor]||'').trim();
    const dtStr = String(r[IDX.saida]||r[IDX.emissao]||'').trim();
    const dt = repParseDate(dtStr);
    if (!vend || !dt || !pivot[vend]) return;
    const mes = dt.getMonth();
    const sem = repGetSemanaDoMes(dt);
    pivot[vend][mes][sem] += repVal(r);
  });

  const mesesAtivos = [...new Set(rows
    .filter(r=>String(r[IDX.ano]||'')=== anoAtual)
    .map(r=>{ const dt=repParseDate(String(r[IDX.saida]||r[IDX.emissao]||'').trim()); return dt?dt.getMonth():-1; })
    .filter(m=>m>=0))].sort((a,b)=>a-b);

  let totalGeral = 0;
  const totVend = {};
  vendedores.forEach(v => {
    totVend[v] = mesesAtivos.reduce((s,m) => s+SEMS.reduce((ss,sem)=>ss+pivot[v][m][sem],0),0);
    totalGeral += totVend[v];
  });
  const maxGeral = Math.max(1, ...vendedores.flatMap(v => mesesAtivos.flatMap(m => SEMS.map(s => pivot[v][m][s]))), ...Object.values(totVend));

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
    const celulas = mesesAtivos.map(m => SEMS.map(s=>`<td>${repMiniCell(pivot[vend][m][s], maxGeral)}</td>`).join('')).join('');
    const mesesComValor = mesesAtivos.filter(m => SEMS.some(s=>pivot[vend][m][s]>0)).length;
    const media = mesesComValor > 0 ? tot/mesesComValor : 0;
    html += `<tr>
      <td class="rep-lbl">${vend}</td>
      ${celulas}
      <td>${repMiniCell(media, maxGeral)}</td>
      <td class="rep-total-cell">${repFmtFull(tot)}</td>
      <td>${repShareCell(tot, totalGeral)}</td>
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

  repDataRows().forEach(r => {
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
  const maxSem = Math.max(1, ...vendedores.flatMap(v => SEMS.map(s => pivot[v][s])), ...Object.values(totVend));

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
    const cor = varp >= 0 ? '#10b981' : '#ef4444';
    html += `<tr>
      <td class="rep-lbl">${vend}</td>
      ${SEMS.map(s=>`<td>${repMiniCell(pivot[vend][s], maxSem)}</td>`).join('')}
      <td>${repMiniCell(media, maxSem)}</td>
      <td class="rep-total-cell">${repFmtFull(tot)}</td>
      <td>${repShareCell(tot, totalGeral)}</td>
      <td>${repMiniCell(ant, maxSem)}</td>
      <td><span class="rep-trend" style="color:${cor}">${varp>=0?'▲':'▼'} ${Math.abs(varp).toFixed(1)}%</span></td>
    </tr>`;
  });

  // TOTAL linha
  const totSems = SEMS.map(s=>vendedores.reduce((sum,v)=>sum+pivot[v][s],0));
  html += `<tr class="rep-row-total">
    <td>TOTAL</td>
    ${totSems.map(v=>`<td>${repMiniCell(v, Math.max(1, ...totSems))}</td>`).join('')}
    <td></td><td class="rep-total-cell">${repFmtFull(totalGeral)}</td>
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
  repDataRows().forEach(r => {
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
  const maxDiaMeta = Math.max(1, ...vendedores.flatMap(v => diasArr.map(d => vendasDia[`${v}|${d}`] || 0)), ...Object.values(totVend));

  vendedores.forEach(vend => {
    const tot = totVend[vend];
    if (tot===0) return;
    const pct = totalGeral>0?(tot/totalGeral*100).toFixed(1):'0.0';
    const diasComVenda = diasArr.filter(d=>(vendasDia[`${vend}|${d}`]||0)>0).length;
    const media = diasComVenda>0 ? tot/diasComVenda : 0;
    html += `<tr>
      <td class="rep-lbl">${vend}</td>
      ${diasArr.map(d=>`<td>${repMiniCell(vendasDia[`${vend}|${d}`]||0, maxDiaMeta)}</td>`).join('')}
      <td>${repMiniCell(media, maxDiaMeta)}</td>
      <td class="rep-total-cell">${repFmtFull(tot)}</td>
      <td>${repShareCell(tot, totalGeral)}</td>
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

  const rows = repFiltrarRowsPremiacao(repDataRows());
  const anos = [...new Set(rows.map(r=>String(r[IDX.ano]||'').trim()).filter(Boolean))].sort();
  const anoAtual = anos[anos.length-1] || String(new Date().getFullYear());
  const MES_IDX_LOCAL = {jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};
  const vendedores = repGetVendedores();

  // pivot: vend → [12 meses]
  const pivot = {};
  vendedores.forEach(v => pivot[v] = Array(12).fill(0));

  rows.forEach(r => {
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
  const maxCresc = Math.max(1, ...vendedores.flatMap(v => mesesAtivos.map(m => pivot[v][m])), ...Object.values(totVend));

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
      ${mesesAtivos.map(m=>`<td>${repMiniCell(pivot[vend][m], maxCresc)}</td>`).join('')}
      <td>${repMiniCell(media, maxCresc)}</td>
      <td class="rep-total-cell">${repFmtFull(tot)}</td>
      <td>${repShareCell(tot, totalGeral)}</td>
      <td style="color:#ef4444">${nQueda}</td>
      <td style="color:#10b981">${nCresc}</td>
    </tr>`;
  });

  // Totais por mês
  const totMes = mesesAtivos.map(m=>vendedores.reduce((s,v)=>s+(pivot[v][m]||0),0));
  html += `<tr class="rep-row-total">
    <td colspan="2">TOTAL</td>
    ${totMes.map(v=>`<td>${repMiniCell(v, Math.max(1, ...totMes))}</td>`).join('')}
    <td></td>
    <td class="rep-total-cell">${repFmtFull(totalGeral)}</td>
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
      const cor=ev>=0?'#10b981':'#ef4444';
      return `<td style="color:${cor}">${ev>=0?'▲':'▼'} ${Math.abs(ev).toFixed(1)}%</td>`;
    }).join('')}
    <td colspan="4"></td>
  </tr>`;

  html += '</tbody></table></div>';
  el.innerHTML = html;
}

function repPremiacao() {
  const el = document.getElementById('rep-tab-premiacao');
  if (!el) return;
  const rows = repFiltrarRowsPremiacao(repDataRows());
  if (!rows.length) {
    el.innerHTML = `<div class="av-rel-placeholder"><p>Sem dados para premiação</p><span>Altere os filtros ou sincronize vendas para gerar rankings.</span></div>`;
    return;
  }

  const reps = {};
  rows.forEach(r => {
    const vend = String(r[IDX.vendedor]||'').trim() || 'Sem representante';
    if (!reps[vend]) reps[vend] = { nome: vend, fat:0, qtd:0, pedidos:new Set(), clientes:new Set(), produtos:new Set(), dias:new Set() };
    const dtStr = String(r[IDX.saida]||r[IDX.emissao]||'').trim();
    reps[vend].fat += parseFloat(String(r[IDX.valor]||'').replace(/\./g,'').replace(',','.')) || 0;
    reps[vend].qtd += parseFloat(r[IDX.qtd]||0) || 0;
    reps[vend].pedidos.add(repPedidoChave(r));
    if (r[IDX.cliente]) reps[vend].clientes.add(String(r[IDX.cliente]).trim());
    if (r[IDX.produto]) reps[vend].produtos.add(String(r[IDX.produto]).trim());
    if (dtStr) reps[vend].dias.add(dtStr);
  });

  const arr = Object.values(reps).map(r => ({
    nome: r.nome,
    fat: r.fat,
    qtd: r.qtd,
    pedidos: r.pedidos.size,
    clientes: r.clientes.size,
    produtos: r.produtos.size,
    dias: r.dias.size,
    ticket: r.pedidos.size ? r.fat / r.pedidos.size : 0,
    mediaDia: r.dias.size ? r.fat / r.dias.size : 0,
    tipo: repGetTipo(r.nome)
  }));

  function pontuar(campo) {
    const max = Math.max(1, ...arr.map(r => r[campo] || 0));
    arr.forEach(r => r['p_' + campo] = ((r[campo] || 0) / max) * 100);
  }
  ['fat','qtd','clientes','produtos','pedidos'].forEach(pontuar);
  arr.forEach(r => {
    r.score = (r.p_fat * 0.35) + (r.p_qtd * 0.20) + (r.p_clientes * 0.20) + (r.p_produtos * 0.15) + (r.p_pedidos * 0.10);
  });

  const geral = [...arr].sort((a,b)=>b.score-a.score);
  const porFat = [...arr].sort((a,b)=>b.fat-a.fat).slice(0,10);
  const porQtd = [...arr].sort((a,b)=>b.qtd-a.qtd).slice(0,10);
  const porCliente = [...arr].sort((a,b)=>b.clientes-a.clientes).slice(0,10);
  const porMix = [...arr].sort((a,b)=>b.produtos-a.produtos).slice(0,10);
  const totalFat = arr.reduce((s,r)=>s+r.fat,0);
  const datasValidas = rows.map(r => repParseDate(String(r[IDX.saida]||r[IDX.emissao]||'').trim())).filter(Boolean).sort((a,b)=>a-b);
  const dataRef = datasValidas[datasValidas.length - 1] || new Date();
  const semanaInicio = new Date(dataRef);
  semanaInicio.setDate(dataRef.getDate() - ((dataRef.getDay() + 6) % 7));
  semanaInicio.setHours(0,0,0,0);
  const semanaFim = new Date(semanaInicio);
  semanaFim.setDate(semanaInicio.getDate() + 6);
  semanaFim.setHours(23,59,59,999);
  const diasSemana = Array.from({length:7}, (_,i) => {
    const d = new Date(semanaInicio);
    d.setDate(semanaInicio.getDate() + i);
    return d;
  });
  const mesNomeRef = MES_LABEL_PT[dataRef.getMonth()] + '/' + dataRef.getFullYear();
  const semanaLabel = diasSemana[0].toLocaleDateString('pt-BR') + ' a ' + diasSemana[6].toLocaleDateString('pt-BR');

  function filtrarPorData(baseRows, fn) {
    return baseRows.filter(r => {
      const dt = repParseDate(String(r[IDX.saida]||r[IDX.emissao]||'').trim());
      return dt && fn(dt);
    });
  }
  const rowsMes = filtrarPorData(rows, dt => dt.getFullYear() === dataRef.getFullYear() && dt.getMonth() === dataRef.getMonth());
  const rowsSemana = filtrarPorData(rows, dt => dt >= semanaInicio && dt <= semanaFim);

  function resumoPeriodo(baseRows) {
    const mapa = {};
    baseRows.forEach(r => {
      const vend = String(r[IDX.vendedor]||'').trim() || 'Sem representante';
      if (!mapa[vend]) mapa[vend] = { nome:vend, fat:0, qtd:0, pedidos:new Set(), clientes:new Set(), produtos:new Set() };
      mapa[vend].fat += parseFloat(String(r[IDX.valor]||'').replace(/\./g,'').replace(',','.')) || 0;
      mapa[vend].qtd += parseFloat(r[IDX.qtd]||0) || 0;
      mapa[vend].pedidos.add(repPedidoChave(r));
      if (r[IDX.cliente]) mapa[vend].clientes.add(String(r[IDX.cliente]).trim());
      if (r[IDX.produto]) mapa[vend].produtos.add(String(r[IDX.produto]).trim());
    });
    return Object.values(mapa).map(r => ({
      nome:r.nome,
      fat:r.fat,
      qtd:r.qtd,
      pedidos:r.pedidos.size,
      clientes:r.clientes.size,
      produtos:r.produtos.size,
      ticket:r.pedidos.size ? r.fat / r.pedidos.size : 0,
      tipo:repGetTipo(r.nome)
    }));
  }

  const mensal = resumoPeriodo(rowsMes).sort((a,b)=>b.fat-a.fat);
  const semanal = resumoPeriodo(rowsSemana).sort((a,b)=>b.fat-a.fat);
  const diaPivot = {};
  rowsSemana.forEach(r => {
    const vend = String(r[IDX.vendedor]||'').trim() || 'Sem representante';
    const dt = repParseDate(String(r[IDX.saida]||r[IDX.emissao]||'').trim());
    if (!dt) return;
    const idx = Math.floor((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()) - semanaInicio) / 86400000);
    if (idx < 0 || idx > 6) return;
    if (!diaPivot[vend]) diaPivot[vend] = Array(7).fill(0);
    diaPivot[vend][idx] += repVal(r);
  });

  function moeda(v) { return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0 }); }
  function rankingTable(titulo, lista, campo, fmt) {
    const max = Math.max(1, ...lista.map(r=>r[campo] || 0));
    return `<div class="premio-card"><div class="premio-card-title">${titulo}</div><table class="premio-table"><tbody>
      ${lista.map((r,i)=>`<tr>
        <td class="premio-pos">${i+1}</td>
        <td><strong>${repEsc(r.nome)}</strong><span>${repEsc(r.tipo || 'Representante')}</span></td>
        <td>${repMiniCell(r[campo] || 0, max)}</td>
        <td>${fmt ? fmt(r[campo] || 0, r) : (r[campo] || 0).toLocaleString('pt-BR')}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
  }
  function periodoRanking(titulo, subtitulo, lista) {
    const top = lista.slice(0, 6);
    const max = Math.max(1, ...top.map(r=>r.fat || 0));
    return `<div class="premio-card premio-periodo">
      <div class="premio-card-title">${titulo}</div>
      <p>${subtitulo}</p>
      <table class="premio-table"><tbody>
        ${top.map((r,i)=>`<tr>
          <td class="premio-pos">${i+1}</td>
          <td><strong>${repEsc(r.nome)}</strong><span>${r.pedidos} pedidos · ${r.clientes} clientes · ${r.produtos} produtos</span></td>
          <td>${repMiniCell(r.fat, max)}</td>
          <td>${moeda(r.fat)}</td>
        </tr>`).join('') || '<tr><td>Sem vendas neste periodo.</td></tr>'}
      </tbody></table>
    </div>`;
  }
  function tabelaSemana() {
    const repsSemana = Object.keys(diaPivot).sort((a,b) => {
      const ta = diaPivot[a].reduce((s,v)=>s+v,0);
      const tb = diaPivot[b].reduce((s,v)=>s+v,0);
      return tb - ta;
    });
    const max = Math.max(1, ...Object.values(diaPivot).flat());
    return `<div class="premio-card premio-full">
      <div class="premio-card-title">Semana detalhada · segunda a domingo</div>
      <div class="rep-scroll-area"><table class="rep-tbl"><thead><tr>
        <td>Representante</td>
        ${diasSemana.map(d=>`<td>${DIA_LABEL[d.getDay()]}<br>${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}</td>`).join('')}
        <td>Total</td>
      </tr></thead><tbody>
        ${repsSemana.map(vend => {
          const dias = diaPivot[vend];
          const total = dias.reduce((s,v)=>s+v,0);
          return `<tr>
            <td class="rep-lbl">${repEsc(vend)}</td>
            ${dias.map(v=>`<td>${repMiniCell(v, max)}</td>`).join('')}
            <td class="rep-total-cell">${repFmtFull(total)}</td>
          </tr>`;
        }).join('') || '<tr><td>Sem vendas nesta semana.</td></tr>'}
      </tbody></table></div>
    </div>`;
  }

  el.innerHTML = `<div class="rel-header-bar premio-header">
    ${repToggleHtml()}
    <div class="rel-title">PREMIAÇÃO DOS REPRESENTANTES</div>
  </div>
  <div class="rel-inline-tabs premio-inline-tabs">
    <button class="rel-inline-tab ${window.REP_PREMIACAO_MODO==='geral'?'active':''}" onclick="repPremiacaoModo('geral')">Premiacao geral</button>
    <button class="rel-inline-tab ${window.REP_PREMIACAO_MODO==='atual'?'active':''}" onclick="repPremiacaoModo('atual')">Premiacao atual</button>
  </div>
  <div class="premio-hero">
    <div>
      <span class="premio-kicker">${window.REP_PREMIACAO_MODO === 'atual' ? 'Campanha comercial · disputa atual' : 'Campanha comercial · ranking geral'}</span>
      <h3>Ranking pronto para escolher prêmios por desempenho.</h3>
      <p>${window.REP_PREMIACAO_MODO === 'atual'
        ? 'Disputa atual focada somente em Anderson de Lessa Costa, Pedro Henrique Santos Sales e Wedna Rosa de Souza.'
        : 'O placar geral combina faturamento, quantidade vendida, clientes atendidos, mix de produtos e numero de pedidos unicos.'}</p>
    </div>
    <div class="premio-winner">
      <span>1º lugar geral</span>
      <strong>${repEsc(geral[0]?.nome || '-')}</strong>
      <small>${(geral[0]?.score || 0).toFixed(1)} pontos</small>
    </div>
  </div>
  <div class="premio-kpis">
    <div><span>Total no recorte</span><strong>${moeda(totalFat)}</strong></div>
    <div><span>Representantes</span><strong>${arr.length}</strong></div>
    <div><span>Pedidos</span><strong>${arr.reduce((s,r)=>s+r.pedidos,0).toLocaleString('pt-BR')}</strong></div>
    <div><span>Clientes atendidos</span><strong>${new Set(rows.map(r=>String(r[IDX.cliente]||'').trim()).filter(Boolean)).size}</strong></div>
  </div>
  <div class="premio-periodo-grid">
    ${periodoRanking('Premiacao mensal', 'Mes de referencia: ' + mesNomeRef, mensal)}
    ${periodoRanking('Premiacao semanal', 'Semana: ' + semanaLabel, semanal)}
  </div>
  ${tabelaSemana()}
  <div class="premio-grid">
    <div class="premio-chart-box"><div class="premio-card-title">Top pontuação geral</div><canvas id="rep-premio-score"></canvas></div>
    <div class="premio-chart-box"><div class="premio-card-title">Distribuição por faturamento</div><canvas id="rep-premio-fat"></canvas></div>
  </div>
  <div class="premio-grid">
    ${rankingTable('Prêmio maior faturamento', porFat, 'fat', moeda)}
    ${rankingTable('Prêmio maior quantidade', porQtd, 'qtd')}
    ${rankingTable('Prêmio mais clientes atendidos', porCliente, 'clientes')}
    ${rankingTable('Prêmio melhor mix de produtos', porMix, 'produtos')}
  </div>
  <div class="premio-card premio-full">
    <div class="premio-card-title">Placar geral ponderado</div>
    <div class="rep-scroll-area"><table class="rep-tbl"><thead><tr>
      <td>#</td><td>Representante</td><td>Tipo</td><td>Faturamento</td><td>Qtd</td><td>Clientes</td><td>Produtos</td><td>Pedidos</td><td>Ticket</td><td>Pontos</td>
    </tr></thead><tbody>
      ${geral.map((r,i)=>`<tr>
        <td class="premio-pos">${i+1}</td><td class="rep-lbl">${repEsc(r.nome)}</td><td>${repEsc(r.tipo)}</td>
        <td>${moeda(r.fat)}</td><td>${r.qtd.toLocaleString('pt-BR')}</td><td>${r.clientes}</td><td>${r.produtos}</td><td>${r.pedidos}</td>
        <td>${moeda(r.ticket)}</td><td><strong>${r.score.toFixed(1)}</strong></td>
      </tr>`).join('')}
    </tbody></table></div>
  </div>`;

  setTimeout(() => repRenderPremiacaoCharts(geral, porFat), 50);
}

function repRenderPremiacaoCharts(geral, porFat) {
  if (typeof Chart === 'undefined') return;
  ['rep-premio-score','rep-premio-fat'].forEach(id => {
    const old = Chart.getChart(id);
    if (old) old.destroy();
  });
  const scoreCtx = document.getElementById('rep-premio-score');
  if (scoreCtx) new Chart(scoreCtx, {
    type: 'bar',
    data: {
      labels: geral.slice(0,8).map(r=>r.nome.length>18?r.nome.slice(0,18)+'...':r.nome),
      datasets: [{ data: geral.slice(0,8).map(r=>Number(r.score.toFixed(1))), backgroundColor:'#3b82f6', borderRadius:8 }]
    },
    options: { responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{ticks:{color:'#7d91af'},grid:{color:'rgba(255,255,255,.05)'}},y:{ticks:{color:'#9fb5d3'},grid:{display:false}}} }
  });
  const fatCtx = document.getElementById('rep-premio-fat');
  if (fatCtx) new Chart(fatCtx, {
    type: 'doughnut',
    data: {
      labels: porFat.slice(0,6).map(r=>r.nome),
      datasets: [{ data: porFat.slice(0,6).map(r=>r.fat), backgroundColor:['#3b82f6','#22c55e','#f59e0b','#ec4899','#8b5cf6','#14b8a6'], borderWidth:0 }]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'right', labels:{color:'#8ea3c0', boxWidth:10, font:{size:10}}}} }
  });
}

// Helper: tipo do representante
function repGetTipo(nome) {
  const data = window.GRID_DATA_STORE?.representantes || [];
  const row = data.find(r => String(r[2]||'').trim() === nome);
  return row ? String(row[3]||'').trim() : 'REPRESENTANTE';
}
