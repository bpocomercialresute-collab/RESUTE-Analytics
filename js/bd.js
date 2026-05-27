// =============================================================================
// BD.JS — Banco de Dados: cola em partes, alimenta todas as abas
// Replica as fórmulas SUMIFS/COUNTIFS do Excel
// =============================================================================

const BD_DATA = { headers: [], rows: [], count: 0 };

// Mapeamento de mês texto → índice (0-11)
const MES_IDX = {
  jan:0, fev:1, mar:2, abr:3, mai:4, jun:5,
  jul:6, ago:7, set:8, out:9, nov:10, dez:11,
  janeiro:0, fevereiro:1, março:2, abril:3, maio:4, junho:5,
  julho:6, agosto:7, setembro:8, outubro:9, novembro:10, dezembro:11,
  '1':0,'2':1,'3':2,'4':3,'5':4,'6':5,
  '7':6,'8':7,'9':8,'10':9,'11':10,'12':11
};
const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Índices das colunas (descobertos dinamicamente)
let IDX = {};

// ── INICIALIZA ────────────────────────────────────────────────────────────────
function bdInit() {
  const zone = document.getElementById('bd-paste-zone');
  if (!zone) return;
  zone.addEventListener('paste', e => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text.trim()) bdProcessPaste(text);
  });
  zone.addEventListener('click', () => zone.focus());
  bdUpdateStatus();
}

// ── PROCESSA TEXTO COLADO (append mode) ──────────────────────────────────────
function bdProcessPaste(text) {
  const lines = text.trim().split('\n');
  if (!lines.length) return;

  // Detecta se primeira linha é cabeçalho
  const firstLine = lines[0].split('\t');
  const isHeader = firstLine.some(c =>
    ['ID','PEDIDO','PRODUTO','VALOR','VENDEDOR'].some(k =>
      c.toUpperCase().includes(k)
    )
  );

  let dataLines = lines;
  if (isHeader && BD_DATA.headers.length === 0) {
    BD_DATA.headers = firstLine.map(h => h.trim());
    bdMapColumns();
    dataLines = lines.slice(1);
  } else if (isHeader) {
    dataLines = lines.slice(1); // já tem cabeçalho, pula
  }

  // Adiciona linhas ao BD
  let added = 0;
  dataLines.forEach(line => {
    const row = line.split('\t');
    if (row.length > 3 && row.some(c => c.trim())) {
      BD_DATA.rows.push(row);
      added++;
    }
  });

  BD_DATA.count = BD_DATA.rows.length;
  bdRenderBDTable();
  bdUpdateAllTabs();
  bdUpdateStatus(added);
}

// ── MAPEIA ÍNDICES DAS COLUNAS ────────────────────────────────────────────────
function bdMapColumns() {
  const h = BD_DATA.headers.map(x => x.toUpperCase().trim());
  IDX = {
    id:      h.findIndex(x => x === 'ID'),
    pedido:  h.findIndex(x => x.includes('PEDIDO')),
    produto: h.findIndex(x => x.includes('PRODUTO') || x.includes('SERVIÇO')),
    qtd:     h.findIndex(x => x === 'QTD'),
    emissao: h.findIndex(x => x.includes('EMISSÃO') || x.includes('EMISSAO')),
    saida:   h.findIndex(x => x.includes('SAÍDA') || x.includes('SAIDA')),
    valor:   h.findIndex(x => x === 'VALOR'),
    vendedor:h.findIndex(x => x === 'VENDEDOR'),
    industria:h.findIndex(x => x.includes('INDÚSTRIA') || x.includes('INDUSTRIA')),
    cliente: h.findIndex(x => x === 'CLIENTE'),
    ano:     h.findIndex(x => x === 'ANO'),
    mes:     h.findIndex(x => x === 'MÊS' || x === 'MES'),
    grupo:   h.findIndex(x => x === 'GRUPO'),
    sem:     h.findIndex(x => x === 'SEM'),
    mercado: h.findIndex(x => x.includes('MERCADO')),
    setor:   h.findIndex(x => x === 'SETOR'),
    cidade:  h.findIndex(x => x === 'CIDADE'),
    uf:      h.findIndex(x => x === 'UF'),
    tipoVend:h.findIndex(x => x.includes('TIPO VENDEDOR')),
    diasSem: h.findIndex(x => x.includes('DIAS SEM') || x.includes('DIAS S/')),
    notaF:   h.findIndex(x => x.includes('NOTA')),
    rota:    h.findIndex(x => x === 'ROTA'),
    desconto:h.findIndex(x => x.includes('DESCONTO')),
    empresa: h.findIndex(x => x === 'EMPRESA'),
    cnpj:    h.findIndex(x => x === 'CNPJ'),
    grupoProd:h.findIndex(x => x.includes('GRUPO_PRODUTO') || x.includes('GRUPO PRODUTO')),
    grupoPai:h.findIndex(x => x.includes('GRUPO PAI')),
    subgrupo:h.findIndex(x => x.includes('SUBGRUPO')),
    marca:   h.findIndex(x => x === 'MARCA'),
    familia: h.findIndex(x => x.includes('FAMILIA') || x.includes('FAMÍLIA')),
    classes: h.findIndex(x => x === 'CLASSES'),
  };
}

// Helper: pega valor de uma coluna em uma linha
function g(row, key) {
  const i = IDX[key];
  return (i >= 0 && row[i] !== undefined) ? String(row[i]).trim() : '';
}

// Helper: converte valor monetário
function toNum(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/\./g,'').replace(',','.')) || 0;
}

// Helper: converte mês texto → índice
function mesIdx(s) {
  return MES_IDX[String(s).toLowerCase().trim()] ?? -1;
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function bdUpdateStatus(added) {
  const el = document.getElementById('bd-status');
  if (!el) return;
  if (!BD_DATA.count) {
    el.textContent = 'Aguardando dados...';
    el.style.color = '';
    return;
  }
  el.textContent = `✓ ${BD_DATA.count.toLocaleString('pt-BR')} linhas${added ? ` (+${added.toLocaleString('pt-BR')} agora)` : ''}`;
  el.style.color = 'var(--success)';

  // Botão limpar
  const btn = document.getElementById('bd-clear-btn');
  if (btn) btn.style.display = 'inline-flex';
}

function bdClear() {
  BD_DATA.headers = [];
  BD_DATA.rows = [];
  BD_DATA.count = 0;
  IDX = {};
  bdRenderBDTable();
  bdUpdateStatus();
  document.getElementById('bd-clear-btn').style.display = 'none';
}

// ── RENDERIZA TABELA BD ───────────────────────────────────────────────────────
function bdRenderBDTable() {
  const table = document.getElementById('bd-main-table');
  if (!table) return;

  if (!BD_DATA.rows.length) {
    table.innerHTML = `<thead><tr><th>ID</th><th>N° PEDIDO</th><th>PRODUTO OU SERVIÇO</th><th>QTD</th><th>Dt. Emissão</th><th>Data de Saída</th><th>VALOR</th><th>Vendedor</th><th>Indústria</th><th>Cliente</th><th>ANO</th><th>MÊS</th><th>GRUPO</th><th>SEM</th><th>tipo mercado</th><th>SETOR</th><th>CIDADE</th><th>UF</th><th>TIPO VENDEDOR</th><th>Dias Sem Compra</th></tr></thead><tbody><tr class="av-empty"><td colspan="20">Nenhum dado — cole os dados acima</td></tr></tbody>`;
    return;
  }

  const SHOW = 300;
  const heads = BD_DATA.headers.length
    ? BD_DATA.headers
    : ['ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída','VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM','tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra'];

  let html = '<thead><tr>' + heads.map(h=>`<th>${h}</th>`).join('') + '</tr></thead><tbody>';
  BD_DATA.rows.slice(0, SHOW).forEach(r => {
    html += '<tr>' + heads.map((_,i) => `<td>${r[i]??''}</td>`).join('') + '</tr>';
  });
  if (BD_DATA.rows.length > SHOW) {
    html += `<tr><td colspan="${heads.length}" class="bd-more-rows">
      Exibindo ${SHOW.toLocaleString('pt-BR')} de ${BD_DATA.rows.length.toLocaleString('pt-BR')} linhas
    </td></tr>`;
  }
  html += '</tbody>';
  table.innerHTML = html;
}

// ── ATUALIZA TODAS AS ABAS ────────────────────────────────────────────────────
function bdUpdateAllTabs() {
  if (!BD_DATA.rows.length) return;
  if (!Object.keys(IDX).length) bdMapColumns();

  bdUpdateMarca();
  bdUpdateGrupos();
  bdUpdateRepresentantes();
  bdUpdateClientes();
  bdUpdateProdutoServico();
  bdUpdateVendaProduto();
  bdUpdateLaudoGrupo();
  bdUpdateLaudoMarca();
}

// ── MARCA ─────────────────────────────────────────────────────────────────────
function bdUpdateMarca() {
  const t = document.getElementById('av-tab-marca')?.querySelector('table');
  if (!t) return;
  const marcas = [...new Set(BD_DATA.rows.map(r=>g(r,'marca')).filter(Boolean))].sort();
  t.innerHTML = `<thead><tr><th>#</th><th>MARCA</th><th>Total Vendas R$</th></tr></thead><tbody>` +
    marcas.map((m,i) => {
      const tot = BD_DATA.rows.filter(r=>g(r,'marca')===m)
        .reduce((s,r)=>s+toNum(g(r,'valor')),0);
      return `<tr><td>${i+1}</td><td>${m}</td><td>R$ ${tot.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>`;
    }).join('') + '</tbody>';
}

// ── GRUPOS ────────────────────────────────────────────────────────────────────
function bdUpdateGrupos() {
  const t = document.getElementById('av-tab-grupos')?.querySelector('table');
  if (!t) return;
  const seen = new Map();
  BD_DATA.rows.forEach(r => {
    const gr = g(r,'grupo'), gp = g(r,'grupoPai') || g(r,'grupoProd');
    if (gr && !seen.has(gr)) seen.set(gr, gp);
  });
  const lista = [...seen.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  t.innerHTML = `<thead><tr><th>#</th><th>GRUPO</th><th>GRUPO PAI</th><th>Total R$</th></tr></thead><tbody>` +
    lista.map(([gr,gp],i) => {
      const tot = BD_DATA.rows.filter(r=>g(r,'grupo')===gr)
        .reduce((s,r)=>s+toNum(g(r,'valor')),0);
      return `<tr><td>${i+1}</td><td>${gr}</td><td>${gp}</td><td>R$ ${tot.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>`;
    }).join('') + '</tbody>';
}

// ── REPRESENTANTES ────────────────────────────────────────────────────────────
function bdUpdateRepresentantes() {
  const t = document.getElementById('av-tab-representantes')?.querySelector('table');
  if (!t) return;
  const vends = new Map();
  BD_DATA.rows.forEach(r => {
    const v = g(r,'vendedor');
    if (!v) return;
    if (!vends.has(v)) vends.set(v, {pedidos:new Set(), valor:0, clientes:new Set()});
    const d = vends.get(v);
    d.pedidos.add(g(r,'pedido'));
    d.valor += toNum(g(r,'valor'));
    d.clientes.add(g(r,'cliente'));
  });
  const lista = [...vends.entries()].sort((a,b)=>b[1].valor-a[1].valor);
  t.innerHTML = `<thead><tr><th>#</th><th>VENDEDOR</th><th>Pedidos</th><th>Clientes</th><th>Total R$</th></tr></thead><tbody>` +
    lista.map(([v,d],i) =>
      `<tr><td>${i+1}</td><td>${v}</td><td>${d.pedidos.size}</td><td>${d.clientes.size}</td><td>R$ ${d.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>`
    ).join('') + '</tbody>';
}

// ── CLIENTES ──────────────────────────────────────────────────────────────────
function bdUpdateClientes() {
  const pane = document.getElementById('av-tab-clientes');
  if (!pane) return;
  const t = pane.querySelector('table');
  const cli = new Map();
  BD_DATA.rows.forEach(r => {
    const c = g(r,'cliente');
    if (!c) return;
    if (!cli.has(c)) cli.set(c, {cidade:g(r,'cidade'),uf:g(r,'uf'),vendedor:g(r,'vendedor'),valor:0,pedidos:0});
    const d = cli.get(c);
    d.valor += toNum(g(r,'valor'));
    d.pedidos++;
  });
  const lista = [...cli.entries()].sort((a,b)=>b[1].valor-a[1].valor);

  // KPIs
  const kpis = pane.querySelectorAll('.av-kpi-val');
  if (kpis[0]) kpis[0].textContent = BD_DATA.rows.length.toLocaleString('pt-BR');
  if (kpis[1]) kpis[1].textContent = cli.size.toLocaleString('pt-BR');

  if (!t) return;
  t.innerHTML = `<thead><tr><th>#</th><th>CLIENTE</th><th>CIDADE</th><th>UF</th><th>VENDEDOR</th><th>Pedidos</th><th>Total R$</th></tr></thead><tbody>` +
    lista.map(([c,d],i) =>
      `<tr><td>${i+1}</td><td>${c}</td><td>${d.cidade}</td><td>${d.uf}</td><td>${d.vendedor}</td><td>${d.pedidos}</td><td>R$ ${d.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>`
    ).join('') + '</tbody>';
}

// ── PRODUTO SERVIÇO — SUMIFS por produto × semana ────────────────────────────
function bdUpdateProdutoServico() {
  const t = document.getElementById('av-tab-produto')?.querySelector('table');
  if (!t) return;

  // Descobre 7 semanas mais recentes do BD
  const datas = [...new Set(BD_DATA.rows.map(r=>g(r,'saida')||g(r,'emissao')).filter(Boolean))]
    .filter(d=>d.length>=8).sort().reverse().slice(0,7).reverse();

  // Agrupa por produto
  const prods = new Map();
  BD_DATA.rows.forEach(r => {
    const p = g(r,'produto'), dt = g(r,'saida')||g(r,'emissao'), gr = g(r,'grupo'), m = g(r,'marca');
    if (!p || !dt) return;
    if (!prods.has(p)) prods.set(p, {grupo:gr, marca:m, datas:{}});
    const d = prods.get(p);
    d.datas[dt] = (d.datas[dt]||0) + (parseFloat(g(r,'qtd'))||1);
  });

  const lista = [...prods.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const dtHeaders = datas.length ? datas : ['DT_1','DT_2','DT_3','DT_4','DT_5','DT_6','DT_7'];

  let html = `<thead>
    <tr><th>PRODUTO</th><th>GRUPO</th><th>MARCA</th>
    ${dtHeaders.map(d=>`<th>${d.length>10?d.slice(0,10):d}</th>`).join('')}
    </tr></thead><tbody>`;
  lista.forEach(([p,d]) => {
    html += `<tr><td>${p}</td><td>${d.grupo}</td><td>${d.marca}</td>` +
      dtHeaders.map(dt=>`<td>${d.datas[dt]||''}</td>`).join('') + '</tr>';
  });
  html += '</tbody>';
  t.innerHTML = html;
}

// ── VENDA POR PRODUTO — SUMIFS por produto × mês (réplica do Excel) ──────────
function bdUpdateVendaProduto() {
  const pane = document.getElementById('av-rel-venda-produto');
  if (!pane) return;

  const anos = [...new Set(BD_DATA.rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  const anoAtual = anos[anos.length-1] || String(new Date().getFullYear());

  // Pivot: produto → [12 meses de valor]
  const pivot = new Map();
  let totalGeral = 0;
  BD_DATA.rows.forEach(r => {
    if (g(r,'ano') !== anoAtual) return;
    const p = g(r,'produto'), mi = mesIdx(g(r,'mes')), v = toNum(g(r,'valor'));
    const gr = g(r,'grupo'), ma = g(r,'marca');
    if (!p || mi < 0) return;
    if (!pivot.has(p)) pivot.set(p, {meses:Array(12).fill(0), total:0, grupo:gr, marca:ma});
    const d = pivot.get(p);
    d.meses[mi] += v;
    d.total += v;
    totalGeral += v;
  });

  const lista = [...pivot.entries()].sort((a,b)=>b[1].total-a[1].total);

  // Totais por mês
  const totMes = Array(12).fill(0);
  lista.forEach(([,d]) => d.meses.forEach((v,i) => totMes[i]+=v));

  let html = `<div class="av-table-wrap" style="border-top:none"><table class="av-table">
  <thead>
    <tr class="av-th-top">
      <td colspan="2" style="background:var(--surface-2);font-size:10px;font-weight:700;color:var(--brand-blue-2);padding:6px 12px">ANO ${anoAtual}</td>
      <td colspan="14" style="background:var(--surface-2)"></td>
    </tr>
    <tr>
      <th>PRODUTO</th><th>GRUPO</th>
      ${MESES_LABEL.map(m=>`<th>${m}</th>`).join('')}
      <th>MEDIA</th><th>TOTAL</th><th>%</th>
    </tr>
    <tr style="background:#060e24">
      <td style="font-weight:700;color:var(--text-primary);padding:7px 14px">SUBTOTAL</td>
      <td></td>
      ${totMes.map(v=>`<td style="font-weight:700;color:var(--text-primary);padding:7px 14px">${v>0?'R$ '+v.toLocaleString('pt-BR',{maximumFractionDigits:0}):''}</td>`).join('')}
      <td></td>
      <td style="font-weight:700;color:var(--success);padding:7px 14px">R$ ${totalGeral.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td style="padding:7px 14px">100%</td>
    </tr>
  </thead><tbody>`;

  lista.forEach(([p,d]) => {
    const ativos = d.meses.filter(v=>v>0);
    const media = ativos.length ? ativos.reduce((s,v)=>s+v,0)/ativos.length : 0;
    const pct = totalGeral > 0 ? ((d.total/totalGeral)*100).toFixed(1) : '0.0';
    html += `<tr>
      <td>${p}</td><td>${d.grupo}</td>
      ${d.meses.map(v=>`<td>${v>0?'R$ '+v.toLocaleString('pt-BR',{maximumFractionDigits:0}):''}</td>`).join('')}
      <td>${media>0?'R$ '+media.toLocaleString('pt-BR',{maximumFractionDigits:0}):''}</td>
      <td><strong>R$ ${d.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
      <td>${pct}%</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  pane.innerHTML = html;
}

// ── LAUDO_GRUPO — SUMIFS por grupo × mês × ano ───────────────────────────────
function bdUpdateLaudoGrupo() {
  const pane = document.getElementById('av-rel-laudo-grupo');
  if (!pane) return;

  const anos = [...new Set(BD_DATA.rows.map(r=>g(r,'ano')).filter(Boolean))].sort();

  // Pivot: grupo → ano → [12 meses]
  const pivot = new Map();
  let totalGeral = 0;
  BD_DATA.rows.forEach(r => {
    const gr = g(r,'grupo'), an = g(r,'ano'), mi = mesIdx(g(r,'mes')), v = toNum(g(r,'valor'));
    if (!gr || !an || mi < 0) return;
    if (!pivot.has(gr)) pivot.set(gr, {});
    if (!pivot.get(gr)[an]) pivot.get(gr)[an] = Array(12).fill(0);
    pivot.get(gr)[an][mi] += v;
    totalGeral += v;
  });

  const grupos = [...pivot.keys()].sort();
  const anoAtual = anos[anos.length-1];

  let html = `<div class="av-table-wrap" style="border-top:none"><table class="av-table">
  <thead>
    <tr><th>GRUPO</th>${MESES_LABEL.map(m=>`<th>${m}</th>`).join('')}<th>TOTAL</th><th>%</th></tr>
  </thead><tbody>`;

  // Para cada ano (linha de ano + linhas por grupo)
  anos.forEach(ano => {
    const totMes = Array(12).fill(0);
    let totAno = 0;
    grupos.forEach(gr => {
      const m = pivot.get(gr)?.[ano] || Array(12).fill(0);
      m.forEach((v,i)=>totMes[i]+=v);
      totAno += m.reduce((s,v)=>s+v,0);
    });

    html += `<tr style="background:var(--brand-navy-3)">
      <td style="font-weight:800;color:var(--brand-blue-2)">${ano}</td>
      ${totMes.map(v=>`<td style="font-weight:700;color:var(--text-primary)">${v>0?'R$ '+v.toLocaleString('pt-BR',{maximumFractionDigits:0}):''}</td>`).join('')}
      <td style="font-weight:800;color:var(--success)">R$ ${totAno.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td>${totalGeral>0?((totAno/totalGeral)*100).toFixed(1)+'%':''}</td>
    </tr>`;

    grupos.forEach(gr => {
      const m = pivot.get(gr)?.[ano] || Array(12).fill(0);
      const tot = m.reduce((s,v)=>s+v,0);
      if (tot === 0 && ano !== anoAtual) return;
      html += `<tr>
        <td style="padding-left:20px">${gr}</td>
        ${m.map(v=>`<td>${v>0?'R$ '+v.toLocaleString('pt-BR',{maximumFractionDigits:0}):''}</td>`).join('')}
        <td><strong>R$ ${tot.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
        <td>${totAno>0?((tot/totAno)*100).toFixed(1)+'%':''}</td>
      </tr>`;
    });
  });

  html += '</tbody></table></div>';
  pane.innerHTML = html;
}

// ── LAUDO_GRUPO_MARCA — SUMIFS por marca × mês ───────────────────────────────
function bdUpdateLaudoMarca() {
  const pane = document.getElementById('av-rel-laudo-marca');
  if (!pane) return;

  const anos = [...new Set(BD_DATA.rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  const anoAtual = anos[anos.length-1] || String(new Date().getFullYear());

  const pivot = new Map();
  let totalGeral = 0;
  BD_DATA.rows.forEach(r => {
    if (g(r,'ano') !== anoAtual) return;
    const m = g(r,'marca'), mi = mesIdx(g(r,'mes')), v = toNum(g(r,'valor'));
    if (!m || mi < 0) return;
    if (!pivot.has(m)) pivot.set(m, Array(12).fill(0));
    pivot.get(m)[mi] += v;
    totalGeral += v;
  });

  const lista = [...pivot.entries()].sort((a,b)=>b[1].reduce((s,v)=>s+v,0)-a[1].reduce((s,v)=>s+v,0));

  let html = `<div class="av-table-wrap" style="border-top:none"><table class="av-table">
  <thead><tr><th>MARCA</th>${MESES_LABEL.map(m=>`<th>${m}</th>`).join('')}<th>TOTAL</th><th>%</th></tr></thead><tbody>`;

  lista.forEach(([m,meses]) => {
    const tot = meses.reduce((s,v)=>s+v,0);
    const pct = totalGeral>0?((tot/totalGeral)*100).toFixed(1):'0.0';
    html += `<tr>
      <td>${m}</td>
      ${meses.map(v=>`<td>${v>0?'R$ '+v.toLocaleString('pt-BR',{maximumFractionDigits:0}):''}</td>`).join('')}
      <td><strong>R$ ${tot.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
      <td>${pct}%</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  pane.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', bdInit);