// =============================================================================
// BD.JS — Auto-preenchimento das colunas vermelhas + alimenta relatórios
// =============================================================================

const BD_DATA = { headers: [], rows: [], count: 0 };

// Modo dos relatórios de produto: 'valor' ou 'qtd'
let RELATORIO_MODO = 'valor';
function toggleModo(qual) {
  RELATORIO_MODO = qual;
  bdUpdateVendaProduto();
  bdUpdateLaudoGrupo();
  bdUpdateLaudoMarca();
  bdUpdateLaudoGruposAno();
  bdUpdateLaudoGruposAno02();
}
// Retorna o valor da métrica conforme o modo
function metrica(row) {
  return RELATORIO_MODO === 'qtd'
    ? (parseFloat(g(row,'qtd')) || 0)
    : toNum(g(row,'valor'));
}
function fmtMetrica(v) {
  if (RELATORIO_MODO === 'qtd') return v > 0 ? v.toLocaleString('pt-BR',{maximumFractionDigits:0}) : '';
  return v > 0 ? 'R$ '+v.toLocaleString('pt-BR',{maximumFractionDigits:0}) : '';
}
function fmtMetricaFull(v) {
  if (RELATORIO_MODO === 'qtd') return v.toLocaleString('pt-BR',{maximumFractionDigits:0});
  return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2});
}

const MES_NOME = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MES_IDX  = {};
MES_NOME.forEach((m,i) => { MES_IDX[m]=i; MES_IDX[String(i+1).padStart(2,'0')]=i; MES_IDX[String(i+1)]=i; });


// ── ESTADO DO FILTRO DO LAUDO_GRUPO ──────────────────────────────────────────
const LG = { tipo:'', grupo:'', subgrupo:'' };

function lgSetFiltro(campo, val) {
  LG[campo] = val;
  bdUpdateLaudoGrupo();
}

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
  bdUpdateLaudoGruposAno();
  bdUpdateLaudoGruposAno02();
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

// ── CLIENTES — calcula todas as colunas vermelhas ───────────────────────────
function bdUpdateClientes() {
  const grd = window.GRIDS?.clientes;
  if (!grd) return;
  const cliData = grd.getData().filter(r => r && r[2] && r[2] !== '');
  if (!cliData.length) return;

  const today = new Date();

  // Mapa cliente → todas as datas de compra (do BD)
  const compras = {}; // nome → [Date, ...]
  BD_DATA.rows.forEach(row => {
    const cli   = g(row,'cliente');
    const dtStr = g(row,'saida') || g(row,'emissao');
    if (!cli || !dtStr) return;
    const dt = parseDate(dtStr);
    if (!dt) return;
    if (!compras[cli]) compras[cli] = [];
    compras[cli].push(dt);
  });

  // Ordena e calcula métricas por cliente
  const metricas = {};
  Object.entries(compras).forEach(([cli, datas]) => {
    datas.sort((a,b) => a-b);
    const ultima    = datas[datas.length-1];
    const penultima = datas.length > 1 ? datas[datas.length-2] : null;
    const primeira  = datas[0];
    const nCompras  = datas.length;

    // Ciclo médio (dias entre compras)
    let ciclo;
    if (nCompras === 1) {
      ciclo = '1compraBD';
    } else {
      const intervalo = Math.floor((ultima - primeira) / 86400000);
      ciclo = Math.round(intervalo / (nCompras - 1));
    }

    // Dias sem venda
    const diasSem = Math.floor((today - ultima) / 86400000);
    const mesesSem = parseFloat((diasSem / 30).toFixed(2));

    // dias>ciclo
    let diasCiclo = '-';
    if (ciclo !== '1compraBD' && typeof ciclo === 'number') {
      diasCiclo = diasSem > ciclo ? 'ok' : 'enviar_Vendedor';
    } else {
      diasCiclo = 'enviar_Vendedor';
    }

    // LIGAR = same logic
    const ligar = diasCiclo === 'ok' ? 'LIGAR' : 'enviar_Vendedor';

    // dias_ultima_recompra = dias entre penúltima e última compra
    const diasUltRecompra = penultima
      ? Math.floor((ultima - penultima) / 86400000)
      : '';

    // REATIV = inativo > 6 meses
    const reativ = diasSem > 180 ? 'REATIVAR' : '';

    // Formata datas
    const fmtDt = dt => dt
      ? `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
      : '';

    metricas[cli] = {
      diasSem,
      mesesSem,
      ciclo,
      ligar,
      ultVdBd:   fmtDt(ultima),
      diasCiclo,
      penultDt:  fmtDt(penultima),
      diasUltRecompra,
      reativ,
    };
  });

  // Aplica nos dados do grid
  // Índices das colunas no grid CLIENTES (baseado na definição do jss.js):
  // 0:ID, 1:COD_CLI, 2:CLIENTES, 3:TIPO, 4:ORIG, 5:CNPJ/CPF, 6:RG/IE, 7:CEP
  // 8:Cidade, 9:UF, 10:Endereço, 11:Endereço Nro, 12:Complemento, 13:Bairro
  // 14:Telefone, 15:Celular, 16:E-mail, 17:Fantasia, 18:VENDEDOR
  // 19:Ult Compra, 20:Zona de Venda
  // AUTO: 21:dias sem venda, 22:meses sem venda, 23:DIAS_CICLO, 24:LIGAR
  //       25:ULT_VD_BD, 26:dias>ciclo, 27:dt_penulte_ped
  //       28:dias_ultima_recompra, 29:REATIV_inat_>6meses, 30:deletar
  const COLS = {diasSem:21,mesesSem:22,ciclo:23,ligar:24,ultVdBd:25,
                diasCiclo:26,penultDt:27,diasUltRecompra:28,reativ:29};

  const newData = cliData.map(r => {
    const nome = String(r[2]||'').trim();
    const newRow = [...r];
    while (newRow.length < 31) newRow.push('');
    const m = metricas[nome];
    if (!m) {
      // Sem compras no BD
      newRow[21] = 'SEM';
      newRow[22] = '';
      newRow[23] = '1compraBD';
      newRow[24] = 'enviar_Vendedor';
      newRow[25] = 'SEM';
      newRow[26] = 'enviar_Vendedor';
      newRow[27] = '';
      newRow[28] = '';
      newRow[29] = '';
    } else {
      newRow[21] = m.diasSem;
      newRow[22] = m.mesesSem;
      newRow[23] = m.ciclo;
      newRow[24] = m.ligar;
      newRow[25] = m.ultVdBd;
      newRow[26] = m.diasCiclo;
      newRow[27] = m.penultDt;
      newRow[28] = m.diasUltRecompra;
      newRow[29] = m.reativ;
    }
    return newRow;
  });

  grd.setData(newData);

  // Atualiza KPIs
  bdUpdateClientesKPIs(metricas, cliData.length);
}

// ── KPIs DO TOPO DO CLIENTES ──────────────────────────────────────────────────
function bdUpdateClientesKPIs(metricas, totalCad) {
  const totalBD     = BD_DATA.count;
  const semCompra   = Object.values(metricas).filter(m => m.diasSem === 'SEM' || m.diasSem === undefined).length
                    + (totalCad - Object.keys(metricas).length);
  const fluxoMedio  = Object.values(metricas)
    .filter(m => typeof m.ciclo === 'number')
    .reduce((s,m,_,a) => s + m.ciclo/a.length, 0);

  const kpis = [
    {id:'kpi-bd-total',    val: totalBD.toLocaleString('pt-BR')},
    {id:'kpi-cli-total',   val: totalCad.toLocaleString('pt-BR')},
    {id:'kpi-sem-compra',  val: Object.values(metricas).filter(m=>m.diasSem>180).length.toLocaleString('pt-BR')},
    {id:'kpi-fluxo',       val: fluxoMedio > 0 ? Math.round(fluxoMedio)+' dias' : '—'},
  ];
  kpis.forEach(k => {
    const el = document.getElementById(k.id);
    if (el) el.textContent = k.val;
  });
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
// ── BOTÃO TOGGLE QTD/VALOR (HTML reutilizável) ───────────────────────────────
function toggleBtnHtml() {
  return `<div class="rel-toggle">
    <button class="rel-toggle-btn ${RELATORIO_MODO==='valor'?'active':''}" onclick="toggleModo('valor')">R$ VALOR</button>
    <button class="rel-toggle-btn ${RELATORIO_MODO==='qtd'?'active':''}" onclick="toggleModo('qtd')">QTD</button>
  </div>`;
}

// ── VENDA POR PRODUTO ─────────────────────────────────────────────────────────
function bdUpdateVendaProduto() {
  const pane = document.getElementById('av-rel-venda-produto');
  if (!pane) return;
  if (!BD_DATA.rows.length) return;

  const anos = [...new Set(BD_DATA.rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  const anoAtual = anos[anos.length-1] || String(new Date().getFullYear());

  const pivot = new Map();
  let totalGeral = 0;
  BD_DATA.rows.forEach(r => {
    if (g(r,'ano') !== anoAtual) return;
    const p  = g(r,'produto');
    const mi = MES_IDX[g(r,'mes').toLowerCase()] ?? -1;
    const v  = metrica(r);
    const gr = g(r,'grupo'), ma = g(r,'marca');
    if (!p || mi < 0) return;
    if (!pivot.has(p)) pivot.set(p, {meses:Array(12).fill(0), total:0, grupo:gr, marca:ma});
    pivot.get(p).meses[mi] += v;
    pivot.get(p).total += v;
    totalGeral += v;
  });

  const lista = [...pivot.entries()].sort((a,b)=>b[1].total-a[1].total);
  const totMes = Array(12).fill(0);
  lista.forEach(([,d]) => d.meses.forEach((v,i)=>totMes[i]+=v));

  // Linha de evolução mensal (% vs mês anterior)
  const evol = totMes.map((v,i) => {
    if (i===0 || totMes[i-1]===0) return null;
    return ((v - totMes[i-1]) / totMes[i-1]) * 100;
  });

  let html = `<div class="rel-header-bar">
      ${toggleBtnHtml()}
      <div class="rel-title">VENDA POR PRODUTO — ${anoAtual}</div>
    </div>
    <div class="av-table-wrap" style="border-top:none"><table class="av-table">
    <thead>
      <tr class="rel-subtotal-row">
        <td colspan="2" style="background:#1a1a00;color:#ffd24a;font-weight:800;padding:7px 12px">SUBTOTAL MENSAL</td>
        ${totMes.map(v=>`<td style="background:#1a1a00;color:#ffd24a;font-weight:700;padding:7px 8px">${fmtMetrica(v)}</td>`).join('')}
        <td style="background:#1a1a00"></td>
        <td style="background:#1a1a00;color:#ffd24a;font-weight:800;padding:7px 8px">${fmtMetricaFull(totalGeral)}</td>
        <td style="background:#1a1a00"></td>
      </tr>
      <tr class="rel-evol-row">
        <td colspan="2" style="background:#10131f;color:#8aa;font-size:10px;padding:5px 12px">EVOLUÇÃO MENSAL</td>
        ${evol.map(e=>{
          if (e===null) return '<td style="background:#10131f"></td>';
          const cor = e>=0?'#10b981':'#ef4444';
          const arrow = e>=0?'▲':'▼';
          return `<td style="background:#10131f;color:${cor};font-size:10px;font-weight:700;padding:5px 8px">${arrow} ${Math.abs(e).toFixed(1)}%</td>`;
        }).join('')}
        <td colspan="3" style="background:#10131f"></td>
      </tr>
      <tr>
        <th>PRODUTO</th><th>GRUPO</th>
        ${MESES_LABEL.map(m=>`<th>${m}</th>`).join('')}
        <th>MEDIA</th><th>TOT</th><th>%</th>
      </tr>
    </thead><tbody>`;

  lista.forEach(([p,d]) => {
    const ativos = d.meses.filter(v=>v>0);
    const media  = ativos.length ? ativos.reduce((s,v)=>s+v,0)/ativos.length : 0;
    const pct    = totalGeral > 0 ? ((d.total/totalGeral)*100).toFixed(1) : '0.0';
    html += `<tr>
      <td>${p}</td><td>${d.grupo}</td>
      ${d.meses.map(v=>`<td>${fmtMetrica(v)}</td>`).join('')}
      <td>${fmtMetrica(media)}</td>
      <td><strong>${fmtMetricaFull(d.total)}</strong></td>
      <td>${pct}%</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  pane.innerHTML = html;
}


function bdUpdateLaudoGrupo() {
  const pane = document.getElementById('av-rel-laudo-grupo');
  if (!pane) return;

  if (!BD_DATA.rows.length) {
    pane.innerHTML = '<div class="av-rel-placeholder"><p>LAUDO_GRUPO</p><span>Cole os dados no BD e clique em Processar</span></div>';
    return;
  }

  // ── Lê GRUPO e SUBGRUPO da aba PRODUTO SERVIÇO ──
  const prodInfo = typeof jssGetProdutoGrupos === 'function'
    ? jssGetProdutoGrupos()
    : { grupos: [], subgrupos: [], tipos: [] };

  // Fallback: lê do BD se PRODUTO SERVIÇO estiver vazio
  const grupos = prodInfo.grupos.length > 0
    ? prodInfo.grupos
    : [...new Set(BD_DATA.rows.map(r=>g(r,'grupo')).filter(Boolean))].sort();
  const subgrupos = prodInfo.subgrupos.length > 0
    ? prodInfo.subgrupos
    : [...new Set(BD_DATA.rows.map(r=>g(r,'subgrupo')).filter(Boolean))].sort();
  const tipos = prodInfo.tipos.length > 0
    ? prodInfo.tipos
    : [...new Set(BD_DATA.rows.map(r=>g(r,'mercado')).filter(Boolean))].sort();

  // Filtra linhas conforme seleção
  let rows = BD_DATA.rows;
  if (LG.tipo    && LG.tipo !== 'Todos') rows = rows.filter(r=>g(r,'mercado')===LG.tipo);
  if (LG.grupo)    rows = rows.filter(r=>g(r,'grupo')===LG.grupo);
  if (LG.subgrupo) rows = rows.filter(r=>g(r,'subgrupo')===LG.subgrupo);

  const anos = [...new Set(rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  if (!anos.length) {
    pane.innerHTML = '<div class="av-rel-placeholder"><p>Sem dados para o filtro selecionado</p><span>Altere o filtro de GRUPO ou SUBGRUPO</span></div>';
    return;
  }

  const titulo = LG.grupo || 'TODOS OS GRUPOS';
  const CORES  = ['#4a90d9','#f59e0b','#10b981','#e05252','#a78bfa','#06b6d4'];
  const anosColors = Object.fromEntries(anos.map((a,i)=>[a, CORES[i%CORES.length]]));

  // Pivot mês × ano
  const pivotMesAno = {};
  anos.forEach(a => pivotMesAno[a] = Array(12).fill(0));
  rows.forEach(r => {
    const an = g(r,'ano');
    const mi = MES_IDX[g(r,'mes').toLowerCase()] ?? -1;
    const v  = metrica(r);
    if (!an || mi < 0 || !pivotMesAno[an]) return;
    pivotMesAno[an][mi] += v;
  });

  const trimData = {};
  anos.forEach(a => {
    const m = pivotMesAno[a];
    trimData[a] = [m[0]+m[1]+m[2], m[3]+m[4]+m[5], m[6]+m[7]+m[8], m[9]+m[10]+m[11]];
  });

  const pctMesAno = {};
  anos.forEach(a => {
    const tot = pivotMesAno[a].reduce((s,v)=>s+v,0);
    pctMesAno[a] = pivotMesAno[a].map(v => tot > 0 ? (v/tot)*100 : 0);
  });

  pane.innerHTML = `
    <div class="rel-header-bar">
      ${toggleBtnHtml()}
      <div class="laudo-filtros">
        <div class="laudo-filtro-item">
          <label>TIPO</label>
          <select onchange="lgSetFiltro('tipo',this.value)">
            <option value="">Todos</option>
            ${tipos.map(t=>`<option value="${t}" ${LG.tipo===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="laudo-filtro-item">
          <label>SUBGRUPO</label>
          <select onchange="lgSetFiltro('subgrupo',this.value)">
            <option value="">Todos</option>
            ${subgrupos.map(s=>`<option value="${s}" ${LG.subgrupo===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="laudo-filtro-item">
          <label>GRUPO</label>
          <select onchange="lgSetFiltro('grupo',this.value)">
            <option value="">Todos</option>
            ${grupos.map(s=>`<option value="${s}" ${LG.grupo===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="laudo-doc">
      <div class="laudo-doc-head">
        <div>
          <div class="laudo-titulo-rel">LAUDO — ${titulo}</div>
          <div class="laudo-sub">Emitido em ${new Date().toLocaleDateString('pt-BR')} · ${rows.length.toLocaleString('pt-BR')} registros · modo: ${RELATORIO_MODO.toUpperCase()}</div>
        </div>
      </div>

      <div class="laudo-section-title">FLUXO POR TRIMESTRE</div>
      <table class="laudo-tbl">
        <thead><tr><th>TRIM</th>${anos.map(a=>`<th style="color:${anosColors[a]}">${a}</th>`).join('')}</tr></thead>
        <tbody>
          ${['1º TRIM','2º TRIM','3º TRIM','4º TRIM'].map((lbl,ti)=>
            `<tr><td class="laudo-lbl">${lbl}</td>${anos.map(a=>`<td>${fmtMetrica(trimData[a][ti])}</td>`).join('')}</tr>`
          ).join('')}
          <tr class="laudo-tot"><td>TOT</td>${anos.map(a=>`<td>${fmtMetrica(trimData[a].reduce((s,v)=>s+v,0))}</td>`).join('')}</tr>
          <tr class="laudo-med"><td>MED</td>${anos.map(a=>`<td>${fmtMetrica(trimData[a].reduce((s,v)=>s+v,0)/4)}</td>`).join('')}</tr>
        </tbody>
      </table>

      <div class="laudo-section-title" style="margin-top:24px">FLUXO MENSAL</div>
      <table class="laudo-tbl">
        <thead><tr><th>MÊS</th>${anos.map(a=>`<th style="color:${anosColors[a]}">${a}</th>`).join('')}</tr></thead>
        <tbody>
          ${MESES_LABEL.map((mlbl,mi)=>
            `<tr><td class="laudo-lbl">${mlbl}</td>${anos.map(a=>`<td>${fmtMetrica(pivotMesAno[a][mi])}</td>`).join('')}</tr>`
          ).join('')}
          <tr class="laudo-tot"><td>TOT</td>${anos.map(a=>`<td>${fmtMetrica(pivotMesAno[a].reduce((s,v)=>s+v,0))}</td>`).join('')}</tr>
          <tr class="laudo-med"><td>MED</td>${anos.map(a=>`<td>${fmtMetrica(pivotMesAno[a].reduce((s,v)=>s+v,0)/12)}</td>`).join('')}</tr>
          <tr class="laudo-cresc"><td>CRESC</td>${anos.map((a,i)=>{
            if(i===0) return '<td>—</td>';
            const at=pivotMesAno[a].reduce((s,v)=>s+v,0);
            const an=pivotMesAno[anos[i-1]].reduce((s,v)=>s+v,0);
            const cr=an>0?((at-an)/an)*100:0;
            const cor=cr>=0?'#10b981':'#ef4444';
            return `<td style="color:${cor};font-weight:700">${cr>=0?'▲':'▼'} ${Math.abs(cr).toFixed(1)}%</td>`;
          }).join('')}</tr>
        </tbody>
      </table>

      <div class="laudo-section-title" style="margin-top:24px">% MENSAL SOBRE TOTAL ANUAL</div>
      <table class="laudo-tbl">
        <thead><tr><th>MÊS</th>${anos.map(a=>`<th style="color:${anosColors[a]}">${a}</th>`).join('')}</tr></thead>
        <tbody>
          ${MESES_LABEL.map((mlbl,mi)=>
            `<tr><td class="laudo-lbl">${mlbl}</td>${anos.map(a=>`<td>${pctMesAno[a][mi].toFixed(2)}%</td>`).join('')}</tr>`
          ).join('')}
          <tr class="laudo-med"><td>MED</td>${anos.map(a=>`<td>${(pctMesAno[a].reduce((s,v)=>s+v,0)/12).toFixed(2)}%</td>`).join('')}</tr>
        </tbody>
      </table>

      <div class="laudo-section-title" style="margin-top:24px">GRÁFICOS</div>
      <div class="laudo-charts-row">
        <div class="laudo-chart-box">
          <div class="laudo-chart-title">FLUXO MENSAL POR ANO</div>
          <canvas id="chart-laudo-linha" height="220"></canvas>
        </div>
        <div class="laudo-chart-box">
          <div class="laudo-chart-title">BARRAS POR MÊS E ANO</div>
          <canvas id="chart-laudo-barra" height="220"></canvas>
        </div>
      </div>
    </div>`;

  setTimeout(() => lgRenderCharts(anos, pivotMesAno, anosColors), 80);
}


function lgRenderCharts(anos, pivotMesAno, anosColors) {
  // Destroi instâncias anteriores
  ['chart-laudo-linha','chart-laudo-barra'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
  });

  const labelsMes = MESES_LABEL;

  // ── GRÁFICO DE LINHA ──
  const ctxL = document.getElementById('chart-laudo-linha');
  if (ctxL) {
    new Chart(ctxL, {
      type: 'line',
      data: {
        labels: labelsMes,
        datasets: anos.map(a => ({
          label: a,
          data: pivotMesAno[a],
          borderColor: anosColors[a],
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.3,
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color:'#c8d8f0', font:{size:11} } } },
        scales: {
          x: { ticks:{color:'#7a9cc8'}, grid:{color:'rgba(255,255,255,0.05)'} },
          y: { ticks:{color:'#7a9cc8'}, grid:{color:'rgba(255,255,255,0.05)'} }
        }
      }
    });
  }

  // ── GRÁFICO DE BARRAS ──
  const ctxB = document.getElementById('chart-laudo-barra');
  if (ctxB) {
    new Chart(ctxB, {
      type: 'bar',
      data: {
        labels: labelsMes,
        datasets: anos.map(a => ({
          label: a,
          data: pivotMesAno[a],
          backgroundColor: anosColors[a] + 'cc',
          borderColor: anosColors[a],
          borderWidth: 1,
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color:'#c8d8f0', font:{size:11} } } },
        scales: {
          x: { ticks:{color:'#7a9cc8'}, grid:{color:'rgba(255,255,255,0.05)'} },
          y: { ticks:{color:'#7a9cc8'}, grid:{color:'rgba(255,255,255,0.05)'} }
        }
      }
    });
  }
}


function bdUpdateLaudoMarca() {
  const pane = document.getElementById('av-rel-laudo-marca');
  if (!pane) return;
  if (!BD_DATA.rows.length) return;
  const anos = [...new Set(BD_DATA.rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  const anoAtual = anos[anos.length-1] || String(new Date().getFullYear());
  const pivot = new Map(); let totalGeral = 0;

  BD_DATA.rows.forEach(r => {
    if (g(r,'ano') !== anoAtual) return;
    const m  = g(r,'marca');
    const mi = MES_IDX[g(r,'mes').toLowerCase()] ?? -1;
    const v  = metrica(r);
    if (!m || mi < 0) return;
    if (!pivot.has(m)) pivot.set(m, Array(12).fill(0));
    pivot.get(m)[mi] += v;
    totalGeral += v;
  });

  const lista = [...pivot.entries()].sort((a,b)=>b[1].reduce((s,v)=>s+v,0)-a[1].reduce((s,v)=>s+v,0));
  let html = `<div class="rel-header-bar">
      ${toggleBtnHtml()}
      <div class="rel-title">LAUDO POR MARCA — ${anoAtual}</div>
    </div>
    <div class="av-table-wrap" style="border-top:none"><table class="av-table">
    <thead><tr><th>MARCA</th>${MESES_LABEL.map(m=>`<th>${m}</th>`).join('')}<th>TOTAL</th><th>%</th></tr></thead><tbody>`;

  lista.forEach(([m,meses]) => {
    const tot = meses.reduce((s,v)=>s+v,0);
    const pct = totalGeral>0?((tot/totalGeral)*100).toFixed(1):'0.0';
    html += `<tr>
      <td>${m}</td>
      ${meses.map(v=>`<td>${fmtMetrica(v)}</td>`).join('')}
      <td><strong>${fmtMetricaFull(tot)}</strong></td>
      <td>${pct}%</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  pane.innerHTML = html;
}

// ── LAUDO_GRUPOS_ANO — totais por grupo em cada ano ──────────────────────────
function bdUpdateLaudoGruposAno() {
  const pane = document.getElementById('av-rel-laudo-ano');
  if (!pane) return;
  if (!BD_DATA.rows.length) return;

  const anos = [...new Set(BD_DATA.rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  const pivot = new Map();
  BD_DATA.rows.forEach(r => {
    const gr = g(r,'grupo'), an = g(r,'ano'), v = metrica(r);
    if (!gr || !an) return;
    if (!pivot.has(gr)) pivot.set(gr, {});
    pivot.get(gr)[an] = (pivot.get(gr)[an]||0) + v;
  });

  const grupos = [...pivot.keys()].sort();
  const totAno = {};
  anos.forEach(a => totAno[a] = grupos.reduce((s,gr)=>s+(pivot.get(gr)[a]||0),0));

  let html = `<div class="rel-header-bar">
      ${toggleBtnHtml()}
      <div class="rel-title">LAUDO GRUPOS POR ANO</div>
    </div>
    <div class="av-table-wrap" style="border-top:none"><table class="av-table">
    <thead><tr><th>GRUPO</th>${anos.map(a=>`<th>${a}</th>`).join('')}<th>TOTAL</th></tr></thead><tbody>`;

  grupos.forEach(gr => {
    const valores = anos.map(a => pivot.get(gr)[a]||0);
    const tot = valores.reduce((s,v)=>s+v,0);
    html += `<tr><td>${gr}</td>${valores.map(v=>`<td>${fmtMetrica(v)}</td>`).join('')}<td><strong>${fmtMetricaFull(tot)}</strong></td></tr>`;
  });
  html += `<tr class="laudo-tot"><td>TOTAL</td>${anos.map(a=>`<td>${fmtMetrica(totAno[a])}</td>`).join('')}<td>${fmtMetricaFull(Object.values(totAno).reduce((s,v)=>s+v,0))}</td></tr>`;
  html += '</tbody></table></div>';
  pane.innerHTML = html;
}

// ── LAUDO_GRUPOS_ANO_01_ANO_02 — comparativo entre 2 anos ────────────────────
function bdUpdateLaudoGruposAno02() {
  const pane = document.getElementById('av-rel-laudo-ano02');
  if (!pane) return;
  if (!BD_DATA.rows.length) return;

  const anos = [...new Set(BD_DATA.rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  if (anos.length < 2) { 
    pane.innerHTML = '<div class="av-rel-placeholder"><p>Comparativo entre 2 anos</p><span>São necessários dados de pelo menos 2 anos diferentes</span></div>';
    return;
  }
  const ano1 = anos[anos.length-2];
  const ano2 = anos[anos.length-1];

  const pivot = new Map();
  BD_DATA.rows.forEach(r => {
    const gr = g(r,'grupo'), an = g(r,'ano'), v = metrica(r);
    if (!gr || (an!==ano1 && an!==ano2)) return;
    if (!pivot.has(gr)) pivot.set(gr, {[ano1]:0,[ano2]:0});
    pivot.get(gr)[an] += v;
  });

  const grupos = [...pivot.keys()].sort();
  let html = `<div class="rel-header-bar">
      ${toggleBtnHtml()}
      <div class="rel-title">COMPARATIVO ${ano1} × ${ano2}</div>
    </div>
    <div class="av-table-wrap" style="border-top:none"><table class="av-table">
    <thead><tr><th>GRUPO</th><th>${ano1}</th><th>${ano2}</th><th>DIFERENÇA</th><th>VARIAÇÃO %</th></tr></thead><tbody>`;

  grupos.forEach(gr => {
    const v1 = pivot.get(gr)[ano1]||0;
    const v2 = pivot.get(gr)[ano2]||0;
    const dif = v2 - v1;
    const varp = v1>0 ? (dif/v1)*100 : 0;
    const cor = dif>=0?'#10b981':'#ef4444';
    const arrow = dif>=0?'▲':'▼';
    html += `<tr>
      <td>${gr}</td>
      <td>${fmtMetrica(v1)}</td>
      <td>${fmtMetrica(v2)}</td>
      <td style="color:${cor}">${fmtMetrica(Math.abs(dif))}</td>
      <td style="color:${cor};font-weight:700">${arrow} ${Math.abs(varp).toFixed(1)}%</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  pane.innerHTML = html;
}