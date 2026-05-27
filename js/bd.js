// =============================================================================
// BD.JS — Auto-preenchimento das colunas vermelhas + alimenta relatórios
// =============================================================================

const BD_DATA = { headers: [], rows: [], count: 0 };

const MES_NOME = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MES_IDX  = {};
MES_NOME.forEach((m,i) => { MES_IDX[m]=i; MES_IDX[String(i+1).padStart(2,'0')]=i; MES_IDX[String(i+1)]=i; });

// Índices das colunas do BD (mapeados dinamicamente)
let IDX = {};

function bdMapColumns() {
  const h = BD_DATA.headers.map(x => x.toUpperCase().trim());
  IDX = {
    id:      h.findIndex(x => x==='ID'),
    pedido:  h.findIndex(x => x.includes('PEDIDO')),
    produto: h.findIndex(x => x.includes('PRODUTO') || x.includes('SERVIÇO')),
    qtd:     h.findIndex(x => x==='QTD'),
    emissao: h.findIndex(x => x.includes('EMISSÃO') || x.includes('EMISSAO')),
    saida:   h.findIndex(x => x.includes('SAÍDA') || x.includes('SAIDA')),
    valor:   h.findIndex(x => x==='VALOR'),
    vendedor:h.findIndex(x => x==='VENDEDOR'),
    industria:h.findIndex(x => x.includes('INDÚSTRIA') || x.includes('INDUSTRIA')),
    cliente: h.findIndex(x => x==='CLIENTE'),
    ano:     h.findIndex(x => x==='ANO'),
    mes:     h.findIndex(x => x==='MÊS' || x==='MES'),
    grupo:   h.findIndex(x => x==='GRUPO'),
    sem:     h.findIndex(x => x==='SEM'),
    mercado: h.findIndex(x => x.includes('MERCADO')),
    setor:   h.findIndex(x => x==='SETOR'),
    cidade:  h.findIndex(x => x==='CIDADE'),
    uf:      h.findIndex(x => x==='UF'),
    tipoVend:h.findIndex(x => x.includes('TIPO VENDEDOR')),
    diasSem: h.findIndex(x => x.includes('DIAS SEM')),
    notaF:   h.findIndex(x => x.includes('NOTA')),
    rota:    h.findIndex(x => x==='ROTA'),
    desconto:h.findIndex(x => x.includes('DESCONTO')),
    empresa: h.findIndex(x => x==='EMPRESA'),
    cnpj:    h.findIndex(x => x==='CNPJ'),
    grupoProd:h.findIndex(x => x.includes('GRUPO_PRODUTO') || x.includes('GRUPO PRODUTO')),
    grupoPai:h.findIndex(x => x.includes('GRUPO PAI')),
    subgrupo:h.findIndex(x => x.includes('SUBGRUPO')),
    marca:   h.findIndex(x => x==='MARCA'),
    familia: h.findIndex(x => x.includes('FAMILIA') || x.includes('FAMÍLIA')),
    classes: h.findIndex(x => x==='CLASSES'),
  };
}

function g(row, key) {
  const i = IDX[key];
  return (i >= 0 && row[i] !== undefined) ? String(row[i]).trim() : '';
}

function toNum(s) {
  return parseFloat(String(s||'').replace(/\./g,'').replace(',','.')) || 0;
}

// ── AUTO-PREENCHE COLUNAS VERMELHAS DO BD ────────────────────────────────────
function bdAutoFill() {
  // Constrói tabelas de lookup das outras abas
  const prodMap  = buildProdMap();   // PRODUTO → {grupo, subgrupo, familia, marca, grupoPai}
  const cliMap   = buildCliMap();    // CLIENTE → {cidade, uf, setor, mercado, tipoVend, zona}
  const repMap   = buildRepMap();    // VENDEDOR → {tipo}
  const today    = new Date();

  BD_DATA.rows = BD_DATA.rows.map(row => {
    const r = [...row];

    // === DATA → ANO, MÊS, SEM ===
    const dtStr = g(r, 'saida') || g(r, 'emissao');
    if (dtStr) {
      const dt = parseDate(dtStr);
      if (dt) {
        const ano = String(dt.getFullYear());
        const mes = MES_NOME[dt.getMonth()];
        const sem = getSem(dt);
        if (IDX.ano >= 0  && !r[IDX.ano])  r[IDX.ano]  = ano;
        if (IDX.mes >= 0  && !r[IDX.mes])  r[IDX.mes]  = mes;
        if (IDX.sem >= 0  && !r[IDX.sem])  r[IDX.sem]  = sem;
      }
    }

    // === PRODUTO → GRUPO, subgrupo, familia, marca, grupoPai ===
    const prod = g(r, 'produto');
    if (prod && prodMap.has(prod)) {
      const p = prodMap.get(prod);
      if (IDX.grupo    >= 0 && !r[IDX.grupo])    r[IDX.grupo]    = p.grupo;
      if (IDX.subgrupo >= 0 && !r[IDX.subgrupo]) r[IDX.subgrupo] = p.subgrupo;
      if (IDX.familia  >= 0 && !r[IDX.familia])  r[IDX.familia]  = p.familia;
      if (IDX.marca    >= 0 && !r[IDX.marca])    r[IDX.marca]    = p.marca;
      if (IDX.grupoPai >= 0 && !r[IDX.grupoPai]) r[IDX.grupoPai] = p.grupoPai;
      if (IDX.grupoProd>= 0 && !r[IDX.grupoProd])r[IDX.grupoProd]= p.grupoProd;
    }

    // === CLIENTE → CIDADE, UF, SETOR, tipo mercado ===
    const cli = g(r, 'cliente');
    if (cli && cliMap.has(cli)) {
      const c = cliMap.get(cli);
      if (IDX.cidade  >= 0 && !r[IDX.cidade])  r[IDX.cidade]  = c.cidade;
      if (IDX.uf      >= 0 && !r[IDX.uf])      r[IDX.uf]      = c.uf;
      if (IDX.setor   >= 0 && !r[IDX.setor])   r[IDX.setor]   = c.setor;
      if (IDX.mercado >= 0 && !r[IDX.mercado]) r[IDX.mercado] = c.mercado;
    }

    // === VENDEDOR → TIPO VENDEDOR ===
    const vend = g(r, 'vendedor');
    if (vend && repMap.has(vend)) {
      const rv = repMap.get(vend);
      if (IDX.tipoVend >= 0 && !r[IDX.tipoVend]) r[IDX.tipoVend] = rv.tipo;
    }

    return r;
  });

  // === Dias Sem Compra por cliente ===
  const ultimaCompra = {};
  BD_DATA.rows.forEach(row => {
    const cli   = g(row, 'cliente');
    const dtStr = g(row, 'saida') || g(row, 'emissao');
    if (!cli || !dtStr) return;
    const dt = parseDate(dtStr);
    if (!dt) return;
    if (!ultimaCompra[cli] || dt > ultimaCompra[cli]) ultimaCompra[cli] = dt;
  });

  BD_DATA.rows = BD_DATA.rows.map(row => {
    const r   = [...row];
    const cli = g(r, 'cliente');
    if (cli && ultimaCompra[cli] && IDX.diasSem >= 0 && !r[IDX.diasSem]) {
      const dias = Math.floor((today - ultimaCompra[cli]) / 86400000);
      r[IDX.diasSem] = String(dias);
    }
    return r;
  });
}

// ── BUILDS DE LOOKUP ──────────────────────────────────────────────────────────
function buildProdMap() {
  const map  = new Map();
  const data = GRID_DATA_STORE?.produto || (window.GRIDS?.produto ? window.GRIDS.produto.getData().filter(r=>r&&r.some(c=>c!=='')) : []);
  // Colunas PRODUTO SERVIÇO: ID, CODPROD, DESCRIÇÃO, GRUPO, subgrupo, familia, ATIV_INAT, tipo_produto
  data.forEach(r => {
    const desc   = String(r[2]||'').trim();
    const grupo  = String(r[3]||'').trim();
    const sub    = String(r[4]||'').trim();
    const fam    = String(r[5]||'').trim();
    const marca  = '';
    const gpai   = '';
    if (desc) map.set(desc, {grupo, subgrupo:sub, familia:fam, marca, grupoPai:gpai, grupoProd:grupo});
  });
  return map;
}

function buildCliMap() {
  const map  = new Map();
  const data = GRID_DATA_STORE?.clientes || (window.GRIDS?.clientes ? window.GRIDS.clientes.getData().filter(r=>r&&r.some(c=>c!=='')) : []);
  // Colunas CLIENTES: ID, COD_CLI, CLIENTES(2), TIPO, ORIG, CNPJ, RG, CEP, Cidade(8), UF(9), End, Nro, Comp, Bairro, Tel, Cel, Email, Fantasia, VENDEDOR(18), Zona(19), ...
  data.forEach(r => {
    const nome   = String(r[2]||'').trim();
    const cidade = String(r[8]||'').trim();
    const uf     = String(r[9]||'').trim();
    const setor  = String(r[13]||'').trim(); // Bairro como proxy de SETOR
    const vend   = String(r[18]||'').trim();
    const zona   = String(r[19]||'').trim();
    if (nome) map.set(nome, {cidade, uf, setor, mercado:'VAREJO', tipoVend:vend, zona});
  });
  return map;
}

function buildRepMap() {
  const map  = new Map();
  const data = GRID_DATA_STORE?.representantes || (window.GRIDS?.representantes ? window.GRIDS.representantes.getData().filter(r=>r&&r.some(c=>c!=='')) : []);
  // Colunas REP: ID, COD, REPRESENTANTE(2), TIPO(3), ...
  data.forEach(r => {
    const nome = String(r[2]||'').trim();
    const tipo = String(r[3]||'').trim();
    if (nome) map.set(nome, {tipo});
  });
  return map;
}

// ── UTILITÁRIOS DE DATA ───────────────────────────────────────────────────────
function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  // dd/mm/yyyy
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  // yyyy-mm-dd
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  // Excel serial number
  const n = parseFloat(s);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = new Date(1900, 0, 1);
    d.setDate(d.getDate() + n - 2);
    return d;
  }
  return null;
}

function getSem(dt) {
  const inicio = new Date(dt.getFullYear(), 0, 1);
  const semana = Math.ceil(((dt - inicio) / 86400000 + inicio.getDay() + 1) / 7);
  return 'SEM' + semana;
}

// ── ATUALIZA TODAS AS ABAS ────────────────────────────────────────────────────
function bdUpdateAllTabs() {
  bdUpdateMarca();
  bdUpdateGrupos();
  bdUpdateRepresentantes();
  bdUpdateClientes();
  bdUpdateProdutoServico();
  bdUpdateVendaProduto();
  bdUpdateLaudoGrupo();
  bdUpdateLaudoMarca();
}

const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ── MARCA ─────────────────────────────────────────────────────────────────────
function bdUpdateMarca() {
  // Usa dados da aba MARCA ou extrai do BD
  const marcasGrid = GRID_DATA_STORE?.marca ||
    (window.GRIDS?.marca ? window.GRIDS.marca.getData().filter(r=>r&&r.some(c=>c!=='')) : []);

  if (marcasGrid.length > 0) return; // Tem dados manuais, não sobrescreve

  const marcas = [...new Set(BD_DATA.rows.map(r => g(r,'marca')).filter(Boolean))].sort();
  const grd = window.GRIDS?.marca;
  if (!grd) return;
  const newData = marcas.map((m,i) => [String(i+1), m, m]);
  newData.push(...Array(Math.max(0, 200-newData.length)).fill(Array(3).fill('')));
  grd.setData(newData);
}

// ── GRUPOS ────────────────────────────────────────────────────────────────────
function bdUpdateGrupos() {
  const gruposGrid = GRID_DATA_STORE?.grupos ||
    (window.GRIDS?.grupos ? window.GRIDS.grupos.getData().filter(r=>r&&r.some(c=>c!=='')) : []);
  if (gruposGrid.length > 0) return;

  const seen = new Map();
  BD_DATA.rows.forEach(r => {
    const gr = g(r,'grupo'), gp = g(r,'grupoPai') || '';
    if (gr && !seen.has(gr)) seen.set(gr, gp);
  });
  const lista = [...seen.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const grd = window.GRIDS?.grupos;
  if (!grd) return;
  const newData = lista.map(([gr,gp],i) => [String(i+1), '', gr, gp]);
  newData.push(...Array(Math.max(0,200-newData.length)).fill(Array(4).fill('')));
  grd.setData(newData);
}

// ── REPRESENTANTES — calcula vendas por semana/período ────────────────────────
function bdUpdateRepresentantes() {
  // Descobr 7 datas mais recentes
  const datas = [...new Set(BD_DATA.rows.map(r=>g(r,'saida')||g(r,'emissao')).filter(Boolean))]
    .filter(d=>parseDate(d)).sort((a,b)=>{
      const da=parseDate(a),db=parseDate(b);
      return da-db;
    }).slice(-7);

  const grd = window.GRIDS?.representantes;
  if (!grd) return;
  const repData = grd.getData().filter(r=>r&&r[2]&&r[2]!=='');
  if (!repData.length) return;

  const newData = repData.map(r => {
    const nome = String(r[2]||'').trim();
    const newRow = [...r];
    // Preenche colunas DT_1 a DT_7 (índices 8-14) com COUNTIFS
    datas.forEach((dt, i) => {
      const count = BD_DATA.rows.filter(br => 
        (g(br,'vendedor')===nome) && (g(br,'saida')===dt || g(br,'emissao')===dt)
      ).length;
      if (newRow.length > 8+i) newRow[8+i] = count > 0 ? String(count) : '';
    });
    return newRow;
  });
  grd.setData(newData);
}

// ── CLIENTES — calcula dias sem compra, última compra ────────────────────────
function bdUpdateClientes() {
  const grd = window.GRIDS?.clientes;
  if (!grd) return;
  const cliData = grd.getData().filter(r=>r&&r[2]&&r[2]!=='');
  if (!cliData.length) return;

  // Mapa: cliente → última data de compra
  const ultimaCompra = {};
  const totalCompras = {};
  BD_DATA.rows.forEach(row => {
    const cli = g(row,'cliente');
    const dtStr = g(row,'saida') || g(row,'emissao');
    if (!cli || !dtStr) return;
    const dt = parseDate(dtStr);
    if (!dt) return;
    if (!ultimaCompra[cli] || dt > ultimaCompra[cli]) ultimaCompra[cli] = dt;
    totalCompras[cli] = (totalCompras[cli]||0)+1;
  });

  const today = new Date();
  const newData = cliData.map(r => {
    const nome = String(r[2]||'').trim();
    const newRow = [...r];
    const ult = ultimaCompra[nome];
    if (ult) {
      const dias  = Math.floor((today - ult) / 86400000);
      const meses = Math.floor(dias / 30);
      const ultStr = `${String(ult.getDate()).padStart(2,'0')}/${String(ult.getMonth()+1).padStart(2,'0')}/${ult.getFullYear()}`;
      // Índices: Ult Compra=19, dias sem venda=21, meses sem venda=22, ULT_VD_BD=25
      while (newRow.length < 28) newRow.push('');
      newRow[19] = ultStr;
      newRow[21] = String(dias);
      newRow[22] = String(meses);
      newRow[25] = ultStr;
    }
    return newRow;
  });
  grd.setData(newData);
}

// ── PRODUTO SERVIÇO — COUNTIFS por produto × data ────────────────────────────
function bdUpdateProdutoServico() {
  const grd = window.GRIDS?.produto;
  if (!grd) return;
  const prodData = grd.getData().filter(r=>r&&r[2]&&r[2]!=='');
  if (!prodData.length) return;

  const datas = [...new Set(BD_DATA.rows.map(r=>g(r,'saida')||g(r,'emissao')).filter(Boolean))]
    .filter(d=>parseDate(d)).sort((a,b)=>parseDate(a)-parseDate(b)).slice(-7);

  const newData = prodData.map(r => {
    const desc = String(r[2]||'').trim();
    const newRow = [...r];
    let tot = 0;
    datas.forEach((dt, i) => {
      const count = BD_DATA.rows.filter(br =>
        (g(br,'produto')===desc) && (g(br,'saida')===dt || g(br,'emissao')===dt)
      ).reduce((s,br) => s + (parseFloat(g(br,'qtd'))||1), 0);
      while (newRow.length < 8+i+1) newRow.push('');
      newRow[8+i] = count > 0 ? String(count) : '';
      tot += count;
    });
    while (newRow.length < 16) newRow.push('');
    newRow[15] = tot > 0 ? String(tot) : '';
    return newRow;
  });
  grd.setData(newData);
}

// ── RELATÓRIOS ────────────────────────────────────────────────────────────────
function bdUpdateVendaProduto() {
  const pane = document.getElementById('av-rel-venda-produto');
  if (!pane) return;
  const anos = [...new Set(BD_DATA.rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  const anoAtual = anos[anos.length-1] || String(new Date().getFullYear());

  const pivot = new Map();
  let totalGeral = 0;
  BD_DATA.rows.forEach(r => {
    if (g(r,'ano') !== anoAtual) return;
    const p  = g(r,'produto');
    const mi = MES_IDX[g(r,'mes').toLowerCase()] ?? -1;
    const v  = toNum(g(r,'valor'));
    const gr = g(r,'grupo');
    const ma = g(r,'marca');
    if (!p || mi < 0) return;
    if (!pivot.has(p)) pivot.set(p, {meses:Array(12).fill(0), total:0, grupo:gr, marca:ma});
    pivot.get(p).meses[mi] += v;
    pivot.get(p).total += v;
    totalGeral += v;
  });

  const lista = [...pivot.entries()].sort((a,b)=>b[1].total-a[1].total);
  const totMes = Array(12).fill(0);
  lista.forEach(([,d]) => d.meses.forEach((v,i) => totMes[i]+=v));

  let html = `<div class="av-table-wrap" style="border-top:none"><table class="av-table">
  <thead>
    <tr style="background:#060e24">
      <td colspan="2" style="background:#060e24;font-size:10px;font-weight:700;color:var(--brand-blue-2);padding:6px 12px">ANO ${anoAtual}</td>
      <td colspan="14" style="background:#060e24"></td>
    </tr>
    <tr>
      <th>PRODUTO</th><th>GRUPO</th>
      ${MESES_LABEL.map(m=>`<th>${m}</th>`).join('')}
      <th>MEDIA</th><th>TOTAL</th><th>%</th>
    </tr>
    <tr style="background:#060e24">
      <td style="font-weight:700;color:var(--text-primary);padding:7px 12px">SUBTOTAL</td><td></td>
      ${totMes.map(v=>`<td style="font-weight:700;color:var(--brand-blue-2);padding:7px 12px">${v>0?'R$ '+v.toLocaleString('pt-BR',{maximumFractionDigits:0}):''}</td>`).join('')}
      <td></td>
      <td style="font-weight:700;color:var(--success);padding:7px 12px">R$ ${totalGeral.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td style="padding:7px 12px;color:var(--text-secondary)">100%</td>
    </tr>
  </thead><tbody>`;

  lista.forEach(([p,d]) => {
    const ativos = d.meses.filter(v=>v>0);
    const media  = ativos.length ? ativos.reduce((s,v)=>s+v,0)/ativos.length : 0;
    const pct    = totalGeral > 0 ? ((d.total/totalGeral)*100).toFixed(1) : '0.0';
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

function bdUpdateLaudoGrupo() {
  const pane = document.getElementById('av-rel-laudo-grupo');
  if (!pane) return;
  const anos = [...new Set(BD_DATA.rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  const pivot = new Map();
  let totalGeral = 0;

  BD_DATA.rows.forEach(r => {
    const gr = g(r,'grupo'), an = g(r,'ano');
    const mi = MES_IDX[g(r,'mes').toLowerCase()] ?? -1;
    const v  = toNum(g(r,'valor'));
    if (!gr || !an || mi < 0) return;
    if (!pivot.has(gr)) pivot.set(gr, {});
    if (!pivot.get(gr)[an]) pivot.get(gr)[an] = Array(12).fill(0);
    pivot.get(gr)[an][mi] += v;
    totalGeral += v;
  });

  const grupos = [...pivot.keys()].sort();
  let html = `<div class="av-table-wrap" style="border-top:none"><table class="av-table">
  <thead><tr><th>GRUPO</th>${MESES_LABEL.map(m=>`<th>${m}</th>`).join('')}<th>TOTAL</th><th>%</th></tr></thead><tbody>`;

  anos.forEach(ano => {
    const totMes = Array(12).fill(0); let totAno = 0;
    grupos.forEach(gr => { const m=pivot.get(gr)?.[ano]||Array(12).fill(0); m.forEach((v,i)=>totMes[i]+=v); totAno+=m.reduce((s,v)=>s+v,0); });
    html += `<tr style="background:var(--brand-navy-3)">
      <td style="font-weight:800;color:var(--brand-blue-2)">${ano}</td>
      ${totMes.map(v=>`<td style="font-weight:700;color:var(--text-primary)">${v>0?'R$ '+v.toLocaleString('pt-BR',{maximumFractionDigits:0}):''}</td>`).join('')}
      <td style="font-weight:800;color:var(--success)">R$ ${totAno.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td>${totalGeral>0?((totAno/totalGeral)*100).toFixed(1)+'%':''}</td>
    </tr>`;
    grupos.forEach(gr => {
      const m = pivot.get(gr)?.[ano] || Array(12).fill(0);
      const tot = m.reduce((s,v)=>s+v,0);
      if (!tot) return;
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

function bdUpdateLaudoMarca() {
  const pane = document.getElementById('av-rel-laudo-marca');
  if (!pane) return;
  const anos = [...new Set(BD_DATA.rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  const anoAtual = anos[anos.length-1] || String(new Date().getFullYear());
  const pivot = new Map(); let totalGeral = 0;

  BD_DATA.rows.forEach(r => {
    if (g(r,'ano') !== anoAtual) return;
    const m  = g(r,'marca');
    const mi = MES_IDX[g(r,'mes').toLowerCase()] ?? -1;
    const v  = toNum(g(r,'valor'));
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