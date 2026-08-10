// =============================================================================
// BD.JS — Auto-preenchimento das colunas vermelhas + alimenta relatórios
// =============================================================================

window.BD_DATA = { headers: [], rows: [], count: 0 };

// Modo dos relatórios de produto: 'valor' ou 'qtd'
window.RELATORIO_MODO = 'valor';
function toggleModo(qual) {
  window.RELATORIO_MODO = qual;
  relRenderAtual();
}
// Retorna o valor da métrica conforme o modo
function metrica(row) {
  return window.RELATORIO_MODO === 'qtd'
    ? (parseFloat(g(row,'qtd')) || 0)
    : toNum(g(row,'valor'));
}
function fmtMetrica(v) {
  if (window.RELATORIO_MODO === 'qtd') return v > 0 ? fmtInt(v) : '';
  return v > 0 ? fmtValor(v) : '';
}
function fmtMetricaFull(v) {
  if (window.RELATORIO_MODO === 'qtd') return fmtInt(v);
  return fmtValor(v);
}

const MES_NOME = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
var MES_IDX = {};
MES_NOME.forEach((m,i) => { MES_IDX[m]=i; MES_IDX[String(i+1).padStart(2,'0')]=i; MES_IDX[String(i+1)]=i; });


// ── ESTADO DO FILTRO DO LAUDO_GRUPO ──────────────────────────────────────────
window.LG = { tipo:'', grupo:'', subgrupo:'' };
window.REL_FILTER = window.REL_FILTER || { vendedor:'', produto:'', cliente:'', grupo:'', marca:'' };
window.REL_VENDA_PRODUTO_MODO = window.REL_VENDA_PRODUTO_MODO || 'detalhado';

function lgSetFiltro(campo, val) {
  window.LG[campo] = val;
  bdUpdateLaudoGrupo();
}

function relAbaAtiva() {
  var pane = document.querySelector('#av-rel-area .av-tab-pane.active');
  return pane ? pane.id : 'av-rel-cadastro-insights';
}

function relRenderAtual() {
  if (typeof relRenderTab === 'function') {
    relRenderTab(relAbaAtiva());
    return;
  }
  bdUpdateAllTabs();
}

function relEsc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function relBaseRows() {
  return (window.BD_DATA && Array.isArray(window.BD_DATA.rows)) ? window.BD_DATA.rows : [];
}

function relRows() {
  const f = window.REL_FILTER || {};
  return relBaseRows().filter(r => {
    if (f.vendedor && g(r,'vendedor') !== f.vendedor) return false;
    if (f.produto && g(r,'produto') !== f.produto) return false;
    if (f.cliente && g(r,'cliente') !== f.cliente) return false;
    if (f.grupo && (g(r,'grupo') || g(r,'grupoProd')) !== f.grupo) return false;
    if (f.marca && g(r,'marca') !== f.marca) return false;
    return true;
  });
}

function relUnique(campo) {
  const vals = relBaseRows().map(r => {
    if (campo === 'vendedor') return g(r,'vendedor');
    if (campo === 'produto') return g(r,'produto');
    if (campo === 'cliente') return g(r,'cliente');
    if (campo === 'grupo') return g(r,'grupo') || g(r,'grupoProd');
    if (campo === 'marca') return g(r,'marca');
    return '';
  }).filter(Boolean);
  return [...new Set(vals)].sort((a,b)=>a.localeCompare(b));
}

function relSetFiltro(campo, valor) {
  window.REL_FILTER[campo] = valor || '';
  relRenderAtual();
}

function relLimparFiltros() {
  window.REL_FILTER = { vendedor:'', produto:'', cliente:'', grupo:'', marca:'' };
  relRenderAtual();
}

function relFiltroSelect(campo, label) {
  const atual = (window.REL_FILTER && window.REL_FILTER[campo]) || '';
  const opts = relUnique(campo).map(v => `<option value="${relEsc(v)}" ${v===atual?'selected':''}>${relEsc((v||'').toUpperCase())}</option>`).join('');
  return `<label class="rep-filter-field"><span>${label}</span><select onchange="relSetFiltro('${campo}', this.value)">
    <option value="">Todos</option>${opts}
  </select></label>`;
}

function relFiltroHtml() {
  const filtrados = relRows().length;
  const total = relBaseRows().length;
  return `<div class="rep-filterbar">
    <div class="rep-filter-grid rel-filter-grid">
      ${relFiltroSelect('vendedor','Vendedor')}
      ${relFiltroSelect('produto','Produto')}
      ${relFiltroSelect('cliente','Cliente')}
      ${relFiltroSelect('grupo','Grupo')}
      ${relFiltroSelect('marca','Marca')}
    </div>
    <button class="rep-clear-filter" onclick="relLimparFiltros()">Limpar filtros</button>
    <span class="rep-filter-count">${filtrados.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} registros</span>
  </div>`;
}

// Índices das colunas do BD (mapeados dinamicamente)
window.IDX = {};

function bdMapColumns() {
  const h = window.BD_DATA.headers.map(x => x.toUpperCase().trim());
  window.IDX = {
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
  const i = window.IDX[key];
  return (i >= 0 && row[i] !== undefined) ? String(row[i]).trim() : '';
}

function toNum(s) {
  return typeof parseSmartNumber === 'function' ? parseSmartNumber(s) : (Number(s) || 0);
}

// ── AUTO-PREENCHE COLUNAS VERMELHAS DO BD ────────────────────────────────────
function bdAutoFill() {
  // Constrói tabelas de lookup das outras abas
  const prodMap  = buildProdMap();   // PRODUTO → {grupo, subgrupo, familia, marca, grupoPai}
  const cliMap   = buildCliMap();    // CLIENTE → {cidade, uf, setor, mercado, tipoVend, zona}
  const repMap   = buildRepMap();    // VENDEDOR → {tipo}
  const today    = new Date();

  window.BD_DATA.rows = window.BD_DATA.rows.map(row => {
    const r = [...row];

    // === DATA → ANO, MÊS, SEM ===
    const dtStr = g(r, 'saida') || g(r, 'emissao');
    if (dtStr) {
      const dt = parseDate(dtStr);
      if (dt) {
        const ano = String(dt.getFullYear());
        const mes = MES_NOME[dt.getMonth()];
        const sem = getSem(dt);
        if (window.IDX.ano >= 0  && !r[window.IDX.ano])  r[window.IDX.ano]  = ano;
        if (window.IDX.mes >= 0  && !r[window.IDX.mes])  r[window.IDX.mes]  = mes;
        if (window.IDX.sem >= 0  && !r[window.IDX.sem])  r[window.IDX.sem]  = sem;
      }
    }

    // === PRODUTO → GRUPO, subgrupo, familia, marca, grupoPai ===
    const prod = g(r, 'produto');
    if (prod && prodMap.has(prod)) {
      const p = prodMap.get(prod);
      if (window.IDX.grupo    >= 0 && !r[window.IDX.grupo])    r[window.IDX.grupo]    = p.grupo;
      if (window.IDX.subgrupo >= 0 && !r[window.IDX.subgrupo]) r[window.IDX.subgrupo] = p.subgrupo;
      if (window.IDX.familia  >= 0 && !r[window.IDX.familia])  r[window.IDX.familia]  = p.familia;
      if (window.IDX.marca    >= 0 && !r[window.IDX.marca])    r[window.IDX.marca]    = p.marca;
      if (window.IDX.grupoPai >= 0 && !r[window.IDX.grupoPai]) r[window.IDX.grupoPai] = p.grupoPai;
      if (window.IDX.grupoProd>= 0 && !r[window.IDX.grupoProd])r[window.IDX.grupoProd]= p.grupoProd;
    }

    // === CLIENTE → CIDADE, UF, SETOR, tipo mercado ===
    const cli = g(r, 'cliente');
    if (cli && cliMap.has(cli)) {
      const c = cliMap.get(cli);
      if (window.IDX.cidade  >= 0 && !r[window.IDX.cidade])  r[window.IDX.cidade]  = c.cidade;
      if (window.IDX.uf      >= 0 && !r[window.IDX.uf])      r[window.IDX.uf]      = c.uf;
      if (window.IDX.setor   >= 0 && !r[window.IDX.setor])   r[window.IDX.setor]   = c.setor;
      if (window.IDX.mercado >= 0 && !r[window.IDX.mercado]) r[window.IDX.mercado] = c.mercado;
    }

    // === VENDEDOR → TIPO VENDEDOR ===
    const vend = g(r, 'vendedor');
    if (vend && repMap.has(vend)) {
      const rv = repMap.get(vend);
      if (window.IDX.tipoVend >= 0 && !r[window.IDX.tipoVend]) r[window.IDX.tipoVend] = rv.tipo;
    }

    // === FALLBACKS das colunas automáticas para deixar o BD mais consistente ===
    if (window.IDX.grupoProd >= 0 && !r[window.IDX.grupoProd] && g(r, 'grupo')) r[window.IDX.grupoProd] = g(r, 'grupo');
    if (window.IDX.grupoPai  >= 0 && !r[window.IDX.grupoPai]  && g(r, 'grupo')) r[window.IDX.grupoPai]  = g(r, 'grupo');
    if (window.IDX.marca     >= 0 && !r[window.IDX.marca]     && g(r, 'industria')) r[window.IDX.marca] = g(r, 'industria');
    if (window.IDX.familia   >= 0 && !r[window.IDX.familia]   && g(r, 'subgrupo')) r[window.IDX.familia] = g(r, 'subgrupo');
    if (window.IDX.classes   >= 0 && !r[window.IDX.classes]) {
      r[window.IDX.classes] = g(r, 'familia') || g(r, 'subgrupo') || g(r, 'grupo') || '';
    }

    return r;
  });

  // === Dias Sem Compra por cliente ===
  const ultimaCompra = {};
  window.BD_DATA.rows.forEach(row => {
    const cli   = g(row, 'cliente');
    const dtStr = g(row, 'saida') || g(row, 'emissao');
    if (!cli || !dtStr) return;
    const dt = parseDate(dtStr);
    if (!dt) return;
    if (!ultimaCompra[cli] || dt > ultimaCompra[cli]) ultimaCompra[cli] = dt;
  });

  window.BD_DATA.rows = window.BD_DATA.rows.map(row => {
    const r   = [...row];
    const cli = g(r, 'cliente');
    if (cli && ultimaCompra[cli] && window.IDX.diasSem >= 0 && !r[window.IDX.diasSem]) {
      const dias = Math.floor((today - ultimaCompra[cli]) / 86400000);
      r[window.IDX.diasSem] = String(dias);
    }
    return r;
  });
}

// ── BUILDS DE LOOKUP ──────────────────────────────────────────────────────────
function buildProdMap() {
  const map  = new Map();
  const data = window.GRID_DATA_STORE?.produto || ((window.GRIDS && window.GRIDS.produto) ? window.GRIDS.produto.getData().filter(r=>r&&r.some(c=>c!=='')) : []);
  // Colunas PRODUTO SERVIÇO: ID, CODPROD, DESCRIÇÃO, GRUPO, subgrupo/marca, familia/unidade, ATIV_INAT, tipo_produto/marca
  data.forEach(r => {
    const desc   = String(r[2]||'').trim();
    const grupo  = String(r[3]||'').trim();
    const sub    = String(r[4]||'').trim();
    const fam    = String(r[5]||'').trim();
    const marca  = String(r[7]||r[4]||'').trim();
    const gpai   = '';
    if (desc) map.set(desc, {grupo, subgrupo:sub, familia:fam, marca, grupoPai:gpai, grupoProd:grupo});
  });
  return map;
}

function buildCliMap() {
  const map  = new Map();
  const data = window.GRID_DATA_STORE?.clientes || ((window.GRIDS && window.GRIDS.clientes) ? window.GRIDS.clientes.getData().filter(r=>r&&r.some(c=>c!=='')) : []);
  // Compatibiliza o layout atual da grade com versões antigas do projeto.
  data.forEach(r => {
    const nome   = String(r[2]||'').trim();
    const cidade = String(r[6]||r[8]||'').trim();
    const uf     = String(r[7]||r[9]||'').trim();
    const setor  = String(r[8]||r[13]||'').trim();
    const vend   = String(r[12]||r[18]||'').trim();
    const zona   = String(r[13]||r[19]||'').trim();
    const mercado = String(r[3]||'VAREJO').trim() || 'VAREJO';
    if (nome) map.set(nome, {cidade, uf, setor, mercado, tipoVend:vend, zona});
  });
  return map;
}

function buildRepMap() {
  const map  = new Map();
  const data = window.GRID_DATA_STORE?.representantes || ((window.GRIDS && window.GRIDS.representantes) ? window.GRIDS.representantes.getData().filter(r=>r&&r.some(c=>c!=='')) : []);
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
  // Relatórios primeiro (mais importantes)
  const relatorios = [
    bdUpdateCadastroInsights, bdUpdateVendaProduto, bdUpdateLaudoGrupo,
    bdUpdateLaudoGruposAno, bdUpdateLaudoGruposAno02
  ];
  relatorios.forEach(fn => { try { fn(); } catch(e) { console.warn(fn.name, e); } });

  // Abas de cadastro (secundárias)
  const cadastros = [
    bdUpdateMarca, bdUpdateGrupos,
    bdUpdateRepresentantes, bdUpdateClientes, bdUpdateProdutoServico
  ];
  cadastros.forEach(fn => { try { fn(); } catch(e) { console.warn(fn.name, e); } });
}

function relRenderTab(tabId) {
  var map = {
    'av-rel-cadastro-insights': bdUpdateCadastroInsights,
    'av-rel-venda-produto': bdUpdateVendaProduto,
    'av-rel-laudo-grupo': bdUpdateLaudoGrupo,
    'av-rel-laudo-ano': bdUpdateLaudoGruposAno,
    'av-rel-laudo-ano02': bdUpdateLaudoGruposAno02
  };
  if (map[tabId]) {
    try { map[tabId](); } catch (e) { console.warn(tabId, e); }
  }
}

const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ── MARCA ─────────────────────────────────────────────────────────────────────
function bdUpdateMarca() {
  // Usa dados da aba MARCA ou extrai do BD
  const marcasGrid = window.GRID_DATA_STORE?.marca ||
    ((window.GRIDS && window.GRIDS.marca) ? window.GRIDS.marca.getData().filter(r=>r&&r.some(c=>c!=='')) : []);

  if (marcasGrid.length > 0) return; // Tem dados manuais, não sobrescreve

  const marcas = [...new Set(window.BD_DATA.rows.map(r => g(r,'marca')).filter(Boolean))].sort();
  const grd = (window.GRIDS && window.GRIDS.marca);
  if (!grd) return;
  const newData = marcas.map((m,i) => [String(i+1), m, m]);
  newData.push(...Array(Math.max(0, 200-newData.length)).fill(Array(3).fill('')));
  grd.setData(newData);
}

// ── GRUPOS ────────────────────────────────────────────────────────────────────
function bdUpdateGrupos() {
  const gruposGrid = window.GRID_DATA_STORE?.grupos ||
    ((window.GRIDS && window.GRIDS.grupos) ? window.GRIDS.grupos.getData().filter(r=>r&&r.some(c=>c!=='')) : []);
  if (gruposGrid.length > 0) return;

  const seen = new Map();
  window.BD_DATA.rows.forEach(r => {
    const gr = g(r,'grupo'), gp = g(r,'grupoPai') || '';
    if (gr && !seen.has(gr)) seen.set(gr, gp);
  });
  const lista = [...seen.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const grd = (window.GRIDS && window.GRIDS.grupos);
  if (!grd) return;
  const newData = lista.map(([gr,gp],i) => [String(i+1), '', gr, gp]);
  newData.push(...Array(Math.max(0,200-newData.length)).fill(Array(4).fill('')));
  grd.setData(newData);
}

// ── REPRESENTANTES — calcula vendas por semana/período ────────────────────────
function bdUpdateRepresentantes() {
  // Descobr 7 datas mais recentes
  const datas = [...new Set(window.BD_DATA.rows.map(r=>g(r,'saida')||g(r,'emissao')).filter(Boolean))]
    .filter(d=>parseDate(d)).sort((a,b)=>{
      const da=parseDate(a),db=parseDate(b);
      return da-db;
    }).slice(-7);

  const grd = (window.GRIDS && window.GRIDS.representantes);
  if (!grd) return;
  const repData = grd.getData().filter(r=>r&&r[2]&&r[2]!=='');
  if (!repData.length) return;

  const newData = repData.map(r => {
    const nome = String(r[2]||'').trim();
    const newRow = [...r];
    // Preenche colunas DT_1..DT_7 (índices 10-16 no grid de representantes)
    while (newRow.length < 18) newRow.push('');
    let totMix = 0;
    datas.forEach((dt, i) => {
      const count = window.BD_DATA.rows.filter(br =>
        (g(br,'vendedor')===nome) && (g(br,'saida')===dt || g(br,'emissao')===dt)
      ).length;
      newRow[10+i] = count > 0 ? String(count) : '';
      totMix += count;
    });
    newRow[17] = totMix > 0 ? String(totMix) : ''; // TOT_MIX
    return newRow;
  });
  grd.setData(newData);
}

// ── CLIENTES — calcula todas as colunas vermelhas ───────────────────────────
function bdUpdateClientes() {
  const grd = (window.GRIDS && window.GRIDS.clientes);
  if (!grd) return;
  const cliData = grd.getData().filter(r => r && (r[1] || r[2]) && String(r[1]||r[2]||'').trim() !== '');
  if (!cliData.length) return;
  if (!window.BD_DATA.rows.length) return;

  const today = new Date();

  // Constrói mapas de compras por NOME e por COD_CLI
  const comprasPorNome = {};
  const comprasPorCod  = {};
  window.BD_DATA.rows.forEach(row => {
    const cli   = g(row,'cliente');
    const dtStr = g(row,'saida') || g(row,'emissao');
    if (!cli || !dtStr) return;
    const dt = parseDate(dtStr);
    if (!dt) return;
    // Por nome
    if (!comprasPorNome[cli]) comprasPorNome[cli] = [];
    comprasPorNome[cli].push(dt);
    // Por cod (coluna COD_CLI está no BD? Não diretamente, mas Cliente basta)
  });

  // Normaliza nome para matching menos sensível
  const norm = s => String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  const normMap = {};
  Object.keys(comprasPorNome).forEach(k => { normMap[norm(k)] = k; });

  function findCompras(cliNome, cliCod) {
    // 1. Tenta match exato
    if (comprasPorNome[cliNome]) return comprasPorNome[cliNome];
    // 2. Tenta match normalizado
    const nk = norm(cliNome);
    if (normMap[nk]) return comprasPorNome[normMap[nk]];
    // 3. Tenta match parcial (começa com)
    const keys = Object.keys(comprasPorNome);
    const found = keys.find(k => norm(k).startsWith(nk.slice(0,10)));
    if (found) return comprasPorNome[found];
    return null;
  }

  const calcMetrica = (datas) => {
    datas.sort((a,b) => a-b);
    const ultima    = datas[datas.length-1];
    const penultima = datas.length > 1 ? datas[datas.length-2] : null;
    const primeira  = datas[0];
    const nCompras  = datas.length;
    const diasSem   = Math.floor((today - ultima) / 86400000);
    const mesesSem  = parseFloat((diasSem / 30).toFixed(1));
    let ciclo;
    if (nCompras === 1) {
      ciclo = '1compraBD';
    } else {
      const intervalo = Math.floor((ultima - primeira) / 86400000);
      ciclo = Math.max(1, Math.round(intervalo / (nCompras - 1)));
    }
    const diasCiclo = (ciclo !== '1compraBD' && diasSem <= ciclo) ? 'ok' : 'enviar_Vendedor';
    const ligar = (typeof ciclo === 'number' && diasSem > ciclo * 2) ? 'LIGAR' : '';
    const fmtDt = dt => dt ? `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}` : '';
    return {
      diasSem, mesesSem, ciclo, ligar,
      ultVdBd: fmtDt(ultima),
      diasCiclo,
      penultDt: fmtDt(penultima),
    };
  };

  const newData = cliData.map(r => {
    const nome  = String(r[2]||'').trim();
    const cod   = String(r[1]||'').trim();
    const newRow = [...r];
    while (newRow.length < 21) newRow.push('');

    const datas = findCompras(nome, cod);
    if (!datas || !datas.length) {
      newRow[14] = 'SEM';
      newRow[15] = '';
      newRow[16] = '1compraBD';
      newRow[17] = '';
      newRow[18] = 'SEM';
      newRow[19] = 'enviar_Vendedor';
      newRow[20] = '';
    } else {
      const m = calcMetrica([...datas]);
      newRow[14] = m.diasSem;
      newRow[15] = m.mesesSem;
      newRow[16] = m.ciclo;
      newRow[17] = m.ligar;
      newRow[18] = m.ultVdBd;
      newRow[19] = m.diasCiclo;
      newRow[20] = m.penultDt;
    }
    return newRow;
  });

  grd.setData(newData);
  setTimeout(() => jssColorAutoHeaders('clientes'), 300);

  // KPIs
  const total = cliData.length;
  const comCompra = newData.filter(r => r[14] !== 'SEM' && r[14] !== '' && r[14] !== undefined).length;
  const semCompra = total - comCompra;
  const cicloNums = newData.filter(r => typeof r[16] === 'number').map(r => r[16]);
  const fluxoMed = cicloNums.length ? Math.round(cicloNums.reduce((s,v)=>s+v,0)/cicloNums.length) : 0;

  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('kpi-bd-total',    window.BD_DATA.count.toLocaleString('pt-BR'));
  set('kpi-cli-total',   total.toLocaleString('pt-BR'));
  set('kpi-sem-compra',  semCompra.toLocaleString('pt-BR'));
  set('kpi-fluxo',       fluxoMed > 0 ? fluxoMed+' dias' : '—');
}


// ── PRODUTO SERVIÇO — COUNTIFS por produto × data ────────────────────────────
function bdUpdateProdutoServico() {
  const grd = (window.GRIDS && window.GRIDS.produto);
  if (!grd) return;
  const prodData = grd.getData().filter(r=>r&&r[2]&&r[2]!=='');
  if (!prodData.length) return;

  const datas = [...new Set(window.BD_DATA.rows.map(r=>g(r,'saida')||g(r,'emissao')).filter(Boolean))]
    .filter(d=>parseDate(d)).sort((a,b)=>parseDate(a)-parseDate(b)).slice(-7);

  const newData = prodData.map(r => {
    const desc = String(r[2]||'').trim();
    const newRow = [...r];
    let tot = 0;
    datas.forEach((dt, i) => {
      const count = window.BD_DATA.rows.filter(br =>
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
  return `<div class="rep-report-tools">
    <div class="rel-toggle">
      <button class="rel-toggle-btn ${window.RELATORIO_MODO==='valor'?'active':''}" onclick="toggleModo('valor')">VALOR</button>
      <button class="rel-toggle-btn ${window.RELATORIO_MODO==='qtd'?'active':''}" onclick="toggleModo('qtd')">QTD</button>
    </div>
    ${relFiltroHtml()}
  </div>`;
}

function relMiniBarCell(valor, max, label) {
  const pct = max > 0 ? Math.max(3, Math.min(100, (valor / max) * 100)) : 0;
  return `<div class="rel-mini-cell">
    <span class="rel-mini-value">${label || fmtMetrica(valor)}</span>
    <span class="rel-mini-track"><span style="width:${pct}%"></span></span>
  </div>`;
}

function relShareCell(valor, total) {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  return `<div class="rel-share-cell">
    <strong>${pct.toFixed(1)}%</strong>
    <span class="rel-mini-track"><span style="width:${Math.max(3, Math.min(100, pct))}%"></span></span>
  </div>`;
}

function relToggleVendaProduto(modo) {
  window.REL_VENDA_PRODUTO_MODO = modo === 'agrupado' ? 'agrupado' : 'detalhado';
  bdUpdateVendaProduto();
}

function relProdutoAgrupadoNome(nome) {
  var base = String(nome || '').trim();
  if (!base) return 'SEM PRODUTO';
  base = base
    .replace(/\b(C\/CABO|S\/CABO)\b/gi, '')
    .replace(/\b(COM CABO|SEM CABO)\b/gi, '')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return (base || String(nome || '').trim()).toUpperCase();
}

function relVendaProdutoTabs() {
  return `<div class="rel-inline-tabs">
    <button class="rel-inline-tab ${window.REL_VENDA_PRODUTO_MODO==='detalhado'?'active':''}" onclick="relToggleVendaProduto('detalhado')">Produtos detalhados</button>
    <button class="rel-inline-tab ${window.REL_VENDA_PRODUTO_MODO==='agrupado'?'active':''}" onclick="relToggleVendaProduto('agrupado')">Produtos agrupados</button>
  </div>`;
}

function bdUpdateCadastroInsights() {
  const pane = document.getElementById('av-rel-cadastro-insights');
  if (!pane) return;
  if (!window.BD_DATA.rows.length) {
    pane.innerHTML = '<div class="av-rel-placeholder"><p>VISÃO CADASTRAL</p><span>Carregue ou sincronize os dados para gerar os indicadores automáticos.</span></div>';
    return;
  }

  const rows = relRows();
  if (!rows.length) {
    pane.innerHTML = `<div class="rel-header-bar">${toggleBtnHtml()}<div class="rel-title">Sem dados para os filtros selecionados</div></div>`;
    return;
  }
  const total = rows.length;
  const totalClientes = new Set(rows.map(r => g(r,'cliente')).filter(Boolean)).size;
  const totalProdutos = new Set(rows.map(r => g(r,'produto')).filter(Boolean)).size;
  const totalVendedores = new Set(rows.map(r => g(r,'vendedor')).filter(Boolean)).size;
  const campos = [
    { key:'grupo', label:'Grupo' },
    { key:'subgrupo', label:'Subgrupo' },
    { key:'familia', label:'Família' },
    { key:'marca', label:'Marca' },
    { key:'setor', label:'Setor' },
    { key:'cidade', label:'Cidade' },
    { key:'uf', label:'UF' },
    { key:'mercado', label:'Tipo de mercado' },
    { key:'tipoVend', label:'Tipo de vendedor' },
    { key:'diasSem', label:'Dias sem compra' }
  ];

  const cards = campos.map(function(campo) {
    const preenchidos = rows.filter(r => !!g(r, campo.key)).length;
    const percentual = total ? Math.round((preenchidos / total) * 100) : 0;
    return `<div class="cad-card">
      <div class="cad-card-top">
        <span class="cad-card-label">${campo.label}</span>
        <span class="cad-card-pct">${percentual}%</span>
      </div>
      <div class="cad-card-val">${preenchidos.toLocaleString('pt-BR')}</div>
      <div class="cad-card-sub">de ${total.toLocaleString('pt-BR')} linhas com preenchimento automático</div>
      <div class="cad-card-bar"><span style="width:${percentual}%"></span></div>
    </div>`;
  }).join('');

  function topValores(key, max) {
    const mapa = {};
    rows.forEach(function(r) {
      const valor = g(r, key);
      if (!valor) return;
      mapa[valor] = (mapa[valor] || 0) + metrica(r);
    });
    return Object.entries(mapa)
      .sort((a,b) => b[1] - a[1])
      .slice(0, max)
      .map(function(entry, idx) {
        return `<tr><td>${idx + 1}</td><td>${(entry[0]||'').toUpperCase()}</td><td class="num">${fmtMetricaFull(entry[1])}</td></tr>`;
      }).join('');
  }

  pane.innerHTML = `
    <div class="rel-header-bar">
      ${toggleBtnHtml()}
      <div class="rel-title">VISÃO CADASTRAL E COLUNAS AUTOMÁTICAS</div>
    </div>
    <div class="cad-kpis">
      <div class="cad-kpi"><span class="cad-kpi-label">Linhas no BD</span><strong>${total.toLocaleString('pt-BR')}</strong></div>
      <div class="cad-kpi"><span class="cad-kpi-label">Clientes</span><strong>${totalClientes.toLocaleString('pt-BR')}</strong></div>
      <div class="cad-kpi"><span class="cad-kpi-label">Produtos</span><strong>${totalProdutos.toLocaleString('pt-BR')}</strong></div>
      <div class="cad-kpi"><span class="cad-kpi-label">Representantes</span><strong>${totalVendedores.toLocaleString('pt-BR')}</strong></div>
    </div>
    <div class="cad-grid">${cards}</div>
    <div class="cad-tables">
      <div class="cad-table-box">
        <div class="cad-table-title">Top grupos por desempenho</div>
        <table class="cad-table"><thead><tr><th>#</th><th>Grupo</th><th>Resultado</th></tr></thead><tbody>${topValores('grupo', 8)}</tbody></table>
      </div>
      <div class="cad-table-box">
        <div class="cad-table-title">Top marcas por desempenho</div>
        <table class="cad-table"><thead><tr><th>#</th><th>Marca</th><th>Resultado</th></tr></thead><tbody>${topValores('marca', 8)}</tbody></table>
      </div>
      <div class="cad-table-box">
        <div class="cad-table-title">Top cidades por desempenho</div>
        <table class="cad-table"><thead><tr><th>#</th><th>Cidade</th><th>Resultado</th></tr></thead><tbody>${topValores('cidade', 8)}</tbody></table>
      </div>
    </div>`;
}

// ── VENDA POR PRODUTO ─────────────────────────────────────────────────────────
function bdUpdateVendaProduto() {
  const pane = document.getElementById('av-rel-venda-produto');
  if (!pane) return;
  if (!window.BD_DATA.rows.length) return;

  const rows = relRows();
  if (!rows.length) {
    pane.innerHTML = `<div class="rel-header-bar">${toggleBtnHtml()}<div class="rel-title">Sem dados para os filtros selecionados</div></div>`;
    return;
  }
  const modoAgrupado = window.REL_VENDA_PRODUTO_MODO === 'agrupado';
  const anos = [...new Set(rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  const tituloPeriodo = anos.length === 1 ? anos[0] : 'PERIODO CARREGADO';

  const pivot = new Map();
  let totalGeral = 0;
  rows.forEach(r => {
    const produtoOriginal = g(r,'produto');
    const p  = modoAgrupado ? relProdutoAgrupadoNome(produtoOriginal) : produtoOriginal;
    const mi = MES_IDX[g(r,'mes').toLowerCase()] ?? -1;
    const v  = metrica(r);
    const gr = g(r,'grupo');
    if (!p || mi < 0) return;
    var marcaFinal = (produtoOriginal || '').toUpperCase().indexOf('PLASTRIO') >= 0 ? 'PLASTRIO' : 'VARREMASTER';
    var nomeLimpo = p.replace(/\s*PLASTRIO\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!pivot.has(nomeLimpo)) pivot.set(nomeLimpo, {meses:Array(12).fill(0), total:0, grupo:gr, marca:marcaFinal, label:nomeLimpo});
    pivot.get(nomeLimpo).meses[mi] += v;
    pivot.get(nomeLimpo).total += v;
    totalGeral += v;
  });

  const lista = [...pivot.entries()].sort((a,b)=>b[1].total-a[1].total);
  const totMes = Array(12).fill(0);
  lista.forEach(([,d]) => d.meses.forEach((v,i)=>totMes[i]+=v));
  const maxCell = Math.max(1, ...lista.flatMap(([,d]) => d.meses), ...totMes);
  const totalProdutos = lista.length;
  const ticketMedioProduto = totalProdutos ? totalGeral / totalProdutos : 0;

  // Linha de evolução mensal (% vs mês anterior)
  const evol = totMes.map((v,i) => {
    if (i===0 || totMes[i-1]===0) return null;
    return ((v - totMes[i-1]) / totMes[i-1]) * 100;
  });

  let html = `<div class="rel-header-bar">
      ${toggleBtnHtml()}
      <div class="rel-title">VENDA POR PRODUTO - ${tituloPeriodo}</div>
    </div>
    ${relVendaProdutoTabs()}
    <div class="rel-kpi-strip">
      <div class="rel-kpi-card"><span>${modoAgrupado ? 'Produtos agrupados' : 'Produtos'}</span><strong>${totalProdutos.toLocaleString('pt-BR')}</strong></div>
      <div class="rel-kpi-card"><span>Total</span><strong>${fmtMetricaFull(totalGeral)}</strong></div>
      <div class="rel-kpi-card"><span>${modoAgrupado ? 'Media por familia base' : 'Media por produto'}</span><strong>${fmtMetricaFull(ticketMedioProduto)}</strong></div>
      <div class="rel-kpi-card"><span>Maior mes</span><strong>${fmtMetricaFull(Math.max(...totMes))}</strong></div>
    </div>
    <div class="av-table-wrap" style="border-top:none"><table class="av-table">
    <thead>
      <tr class="rel-subtotal-row">
        <td colspan="3">SUBTOTAL MENSAL</td>
        ${totMes.map(v=>`<td>${fmtMetrica(v)}</td>`).join('')}
        <td></td>
        <td><strong>${fmtMetricaFull(totalGeral)}</strong></td>
        <td></td>
      </tr>
      <tr class="rel-evol-row">
        <td colspan="3">EVOLUÇÃO MENSAL</td>
        ${evol.map(e=>{
          if (e===null) return '<td></td>';
          const cls = e>=0?'up':'down';
          const arrow = e>=0?'▲':'▼';
          return `<td><span class="rel-trend ${cls}">${arrow} ${Math.abs(e).toFixed(1)}%</span></td>`;
        }).join('')}
        <td colspan="3"></td>
      </tr>
      <tr>
        <th>PRODUTO</th><th>GRUPO</th><th>MARCA</th>
        ${MESES_LABEL.map(m=>`<th>${m}</th>`).join('')}
        <th>MEDIA</th><th>TOT</th><th>%</th>
      </tr>
    </thead><tbody>`;

  lista.forEach(([p,d]) => {
    const ativos = d.meses.filter(v=>v>0);
    const media  = ativos.length ? ativos.reduce((s,v)=>s+v,0)/ativos.length : 0;
    const pct    = totalGeral > 0 ? ((d.total/totalGeral)*100).toFixed(1) : '0.0';
    const nomeProduto = (d.label || p || '').toUpperCase();
    html += `<tr>
      <td><span class="rel-prod-name">${nomeProduto}</span></td><td>${(d.grupo || 'Sem grupo').toUpperCase()}</td><td>${d.marca || 'VARREMASTER'}</td>
      ${d.meses.map(v=>`<td>${fmtMetrica(v)}</td>`).join('')}
      <td>${fmtMetrica(media)}</td>
      <td><strong>${fmtMetricaFull(d.total)}</strong></td>
      <td>${relShareCell(d.total, totalGeral)}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  pane.innerHTML = html;
}


function bdUpdateLaudoGrupo() {
  const pane = document.getElementById('av-rel-laudo-grupo');
  if (!pane) return;

  if (!window.BD_DATA.rows.length) {
    pane.innerHTML = '<div class="av-rel-placeholder"><p>LAUDO_GRUPO</p><span>Cole os dados no BD e clique em Processar</span></div>';
    return;
  }

  // Lê GRUPO/SUBGRUPO SEMPRE do BD (após auto-fill) + complementa com PRODUTO SERVIÇO
  const gruposBD   = [...new Set(window.BD_DATA.rows.map(r=>g(r,'grupo')).filter(Boolean))].sort();
  const subgruposBD= [...new Set(window.BD_DATA.rows.map(r=>g(r,'subgrupo')).filter(Boolean))].sort();
  const tiposBD    = [...new Set(window.BD_DATA.rows.map(r=>g(r,'mercado')).filter(Boolean))].sort();

  // Complementa com dados da aba PRODUTO SERVIÇO se disponível
  const prodInfo = typeof jssGetProdutoGrupos === 'function' ? jssGetProdutoGrupos() : { grupos:[], subgrupos:[], tipos:[] };
  const grupos   = [...new Set([...gruposBD,   ...prodInfo.grupos  ])].filter(Boolean).sort();
  const subgrupos= [...new Set([...subgruposBD,...prodInfo.subgrupos])].filter(Boolean).sort();
  const tipos    = [...new Set([...tiposBD,    ...prodInfo.tipos   ])].filter(Boolean).sort();

  // Filtra linhas conforme seleção
  let rows = relRows();
  if (window.LG.tipo    && window.LG.tipo !== 'Todos') rows = rows.filter(r=>g(r,'mercado')===window.LG.tipo);
  if (window.LG.grupo)    rows = rows.filter(r=>g(r,'grupo')===window.LG.grupo);
  if (window.LG.subgrupo) rows = rows.filter(r=>g(r,'subgrupo')===window.LG.subgrupo);

  const anos = [...new Set(rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  if (!anos.length) {
    pane.innerHTML = '<div class="av-rel-placeholder"><p>Sem dados para o filtro selecionado</p><span>Altere o filtro de GRUPO ou SUBGRUPO</span></div>';
    return;
  }

  const titulo = window.LG.grupo || 'TODOS OS GRUPOS';
  const CORES  = ['#14746F','#2DD4BF','#059669','#D97706','#7C3AED','#0D4F4F'];
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
            ${tipos.map(t=>`<option value="${t}" ${window.LG.tipo===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="laudo-filtro-item">
          <label>SUBGRUPO</label>
          <select onchange="lgSetFiltro('subgrupo',this.value)">
            <option value="">Todos</option>
            ${subgrupos.map(s=>`<option value="${s}" ${window.LG.subgrupo===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="laudo-filtro-item">
          <label>GRUPO</label>
          <select onchange="lgSetFiltro('grupo',this.value)">
            <option value="">Todos os Grupos</option>
            ${grupos.map(s=>`<option value="${s}" ${window.LG.grupo===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <button class="jss-btn" style="align-self:flex-end;height:34px" onclick="window.LG.tipo='';window.LG.grupo='';window.LG.subgrupo='';bdUpdateLaudoGrupo()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="13" height="13"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          Limpar Filtros
        </button>
        <span style="align-self:flex-end;font-size:11px;color:var(--text-tertiary);padding-bottom:8px">${grupos.length} grupos · ${subgrupos.length} subgrupos</span>
      </div>
    </div>

    <div class="laudo-doc" style="gap:14px;padding:16px">
      <div class="laudo-doc-head" style="padding-bottom:10px">
        <div>
          <div class="laudo-titulo-rel" style="font-size:18px">LAUDO — ${titulo}</div>
          <div class="laudo-sub">${new Date().toLocaleDateString('pt-BR')} · ${rows.length.toLocaleString('pt-BR')} registros · ${RELATORIO_MODO.toUpperCase()}</div>
        </div>
      </div>

      <div class="laudo-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <div class="laudo-section-title" style="margin-bottom:8px">FLUXO POR TRIMESTRE</div>
          <table class="laudo-tbl" style="font-size:12px">
            <thead><tr><th>TRIM</th>${anos.map(a=>`<th style="color:${anosColors[a]}">${a}</th>`).join('')}</tr></thead>
            <tbody>
              ${['1º TRIM','2º TRIM','3º TRIM','4º TRIM'].map((lbl,ti)=>
                `<tr><td class="laudo-lbl">${lbl}</td>${anos.map(a=>`<td>${fmtMetrica(trimData[a][ti])}</td>`).join('')}</tr>`
              ).join('')}
              <tr class="laudo-tot"><td>TOT</td>${anos.map(a=>`<td>${fmtMetrica(trimData[a].reduce((s,v)=>s+v,0))}</td>`).join('')}</tr>
              <tr class="laudo-med"><td>MED</td>${anos.map(a=>`<td>${fmtMetrica(trimData[a].reduce((s,v)=>s+v,0)/4)}</td>`).join('')}</tr>
            </tbody>
          </table>
        </div>
        <div>
          <div class="laudo-section-title" style="margin-bottom:8px">% MENSAL SOBRE TOTAL ANUAL</div>
          <table class="laudo-tbl" style="font-size:12px">
            <thead><tr><th>MÊS</th>${anos.map(a=>`<th style="color:${anosColors[a]}">${a}</th>`).join('')}</tr></thead>
            <tbody>
              ${MESES_LABEL.map((mlbl,mi)=>
                `<tr><td class="laudo-lbl">${mlbl}</td>${anos.map(a=>`<td>${pctMesAno[a][mi].toFixed(1)}%</td>`).join('')}</tr>`
              ).join('')}
              <tr class="laudo-med"><td>MED</td>${anos.map(a=>`<td>${(pctMesAno[a].reduce((s,v)=>s+v,0)/12).toFixed(1)}%</td>`).join('')}</tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div class="laudo-section-title" style="margin-bottom:8px">FLUXO MENSAL</div>
        <table class="laudo-tbl" style="font-size:12px">
          <thead><tr><th>MÊS</th>${anos.map(a=>`<th style="color:${anosColors[a]}">${a}</th>`).join('')}${anos.length>=2?'<th>VAR %</th>':''}</tr></thead>
          <tbody>
            ${MESES_LABEL.map((mlbl,mi)=>{
              let varHtml = '';
              if (anos.length >= 2) {
                const vAtual = pivotMesAno[anos[anos.length-1]][mi];
                const vAnt   = pivotMesAno[anos[anos.length-2]][mi];
                if (vAnt > 0) {
                  const cr = ((vAtual-vAnt)/vAnt)*100;
                  const cor = cr>=0?'#059669':'#DC2626';
                  varHtml = `<td style="color:${cor};font-weight:700">${cr>=0?'▲':'▼'} ${Math.abs(cr).toFixed(1)}%</td>`;
                } else { varHtml = '<td>—</td>'; }
              }
              return `<tr><td class="laudo-lbl">${mlbl}</td>${anos.map(a=>`<td>${fmtMetrica(pivotMesAno[a][mi])}</td>`).join('')}${varHtml}</tr>`;
            }).join('')}
            <tr class="laudo-tot"><td>TOT</td>${anos.map(a=>`<td>${fmtMetrica(pivotMesAno[a].reduce((s,v)=>s+v,0))}</td>`).join('')}${anos.length>=2?(()=>{
              const at=pivotMesAno[anos[anos.length-1]].reduce((s,v)=>s+v,0);
              const an=pivotMesAno[anos[anos.length-2]].reduce((s,v)=>s+v,0);
              const cr=an>0?((at-an)/an)*100:0;
              const cor=cr>=0?'#059669':'#DC2626';
              return `<td style="color:${cor};font-weight:700">${cr>=0?'▲':'▼'} ${Math.abs(cr).toFixed(1)}%</td>`;
            })():''}</tr>
            <tr class="laudo-med"><td>MED</td>${anos.map(a=>`<td>${fmtMetrica(pivotMesAno[a].reduce((s,v)=>s+v,0)/12)}</td>`).join('')}${anos.length>=2?'<td></td>':''}</tr>
          </tbody>
        </table>
      </div>

      <div class="laudo-charts-row" style="gap:12px">
        <div class="laudo-chart-box" style="min-height:240px;padding:12px">
          <div class="laudo-chart-title">FLUXO MENSAL POR ANO</div>
          <canvas id="chart-laudo-linha" height="200"></canvas>
        </div>
        <div class="laudo-chart-box" style="min-height:240px;padding:12px">
          <div class="laudo-chart-title">BARRAS POR MÊS E ANO</div>
          <canvas id="chart-laudo-barra" height="200"></canvas>
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
        plugins: { legend: { labels: { color:'#0A2F2F', font:{size:11} } } },
        scales: {
          x: { ticks:{color:'#5A7A74'}, grid:{color:'#D5EDE8'} },
          y: { ticks:{color:'#5A7A74'}, grid:{color:'#D5EDE8'} }
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
        plugins: { legend: { labels: { color:'#0A2F2F', font:{size:11} } } },
        scales: {
          x: { ticks:{color:'#5A7A74'}, grid:{color:'#D5EDE8'} },
          y: { ticks:{color:'#5A7A74'}, grid:{color:'#D5EDE8'} }
        }
      }
    });
  }
}


function bdUpdateLaudoMarca() {
  const pane = document.getElementById('av-rel-laudo-marca');
  if (!pane) return;
  if (!window.BD_DATA.rows.length) return;
  const rows = relRows();
  if (!rows.length) {
    pane.innerHTML = `<div class="rel-header-bar">${toggleBtnHtml()}<div class="rel-title">Sem dados para os filtros selecionados</div></div>`;
    return;
  }
  const anos = [...new Set(rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  const anoAtual = anos[anos.length-1] || String(new Date().getFullYear());
  const pivot = new Map(); let totalGeral = 0;

  rows.forEach(r => {
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
      <td>${(m||'').toUpperCase()}</td>
      ${meses.map(v=>`<td>${fmtMetrica(v)}</td>`).join('')}
      <td><strong>${fmtMetricaFull(tot)}</strong></td>
      <td>${pct}%</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  pane.innerHTML = html;
}

// ── LAUDO_GRUPOS_ANO — grupos × anos × meses (como Excel) ───────────────────
function bdUpdateLaudoGruposAno() {
  const pane = document.getElementById('av-rel-laudo-ano');
  if (!pane) return;
  if (!window.BD_DATA.rows.length) return;

  const rows = relRows();
  if (!rows.length) {
    pane.innerHTML = `<div class="rel-header-bar">${toggleBtnHtml()}<div class="rel-title">Sem dados para os filtros selecionados</div></div>`;
    return;
  }
  const anos   = [...new Set(rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  const grupos = [...new Set(rows.map(r=>g(r,'grupo')).filter(Boolean))].sort();

  if (!grupos.length) {
    pane.innerHTML = '<div class="av-rel-placeholder"><p>LAUDO_GRUPOS_ANO</p><span>Cole PRODUTO SERVIÇO e processe o BD para ver grupos</span></div>';
    return;
  }

  // Pivot: grupo → ano → [12 meses]
  const pivot = {};
  grupos.forEach(gr => { pivot[gr] = {}; anos.forEach(a => { pivot[gr][a] = Array(12).fill(0); }); });

  rows.forEach(r => {
    const gr = g(r,'grupo'), an = g(r,'ano');
    const mi = MES_IDX[g(r,'mes').toLowerCase()] ?? -1;
    const v  = metrica(r);
    if (!gr || !an || mi < 0 || !pivot[gr] || !pivot[gr][an]) return;
    pivot[gr][an][mi] += v;
  });

  // Totais por ano
  const totAno = {};
  anos.forEach(a => { totAno[a] = grupos.reduce((s,gr) => s + pivot[gr][a].reduce((s2,v)=>s2+v,0), 0); });
  const totGeral = Object.values(totAno).reduce((s,v)=>s+v,0);

  const CORES = ['#14746F','#2DD4BF','#059669','#D97706','#7C3AED','#0D4F4F'];

  let html = `<div class="rel-header-bar">
    ${toggleBtnHtml()}
    <div class="rel-title">LAUDO GRUPOS POR ANO — TODOS OS ANOS</div>
  </div>
  <div class="av-table-wrap" style="border-top:none">
  <table class="av-table">
    <thead>
      <tr class="av-th-top">
        <th rowspan="2" style="vertical-align:middle">GRUPO</th>
        ${anos.map((a,i) => `<th colspan="13" style="background:#F0FAF8;color:${CORES[i%CORES.length]};text-align:center;border-bottom:2px solid ${CORES[i%CORES.length]}">${a}</th>`).join('')}
      </tr>
      <tr>
        ${anos.map(() => [...MESES_LABEL,'TOT'].map(m=>`<th>${m}</th>`).join('')).join('')}
      </tr>
    </thead>
    <tbody>`;

  grupos.forEach(gr => {
    const totGr = anos.reduce((s,a) => s + pivot[gr][a].reduce((s2,v)=>s2+v,0), 0);
    if (totGr === 0) return;
    html += `<tr>
      <td style="font-weight:600;color:#0A2F2F;min-width:140px">${(gr||'').toUpperCase()}</td>
      ${anos.map(a => {
        const meses = pivot[gr][a];
        const tot   = meses.reduce((s,v)=>s+v,0);
        return [...meses, tot].map(v => `<td>${fmtMetrica(v)}</td>`).join('');
      }).join('')}
    </tr>`;
  });

  // Linha TOTAL
  html += `<tr class="laudo-tot">
    <td>TOTAL</td>
    ${anos.map(a => {
      const totMes = Array(12).fill(0);
      grupos.forEach(gr => pivot[gr][a].forEach((v,i) => totMes[i]+=v));
      const tot = totMes.reduce((s,v)=>s+v,0);
      return [...totMes, tot].map(v => `<td>${fmtMetrica(v)}</td>`).join('');
    }).join('')}
  </tr>`;

  // Linha % PARTICIPAÇÃO
  html += `<tr class="rep-row-pct">
    <td>% PART.</td>
    ${anos.map(a => {
      const totMes = Array(12).fill(0);
      grupos.forEach(gr => pivot[gr][a].forEach((v,i) => totMes[i]+=v));
      const tot = totMes.reduce((s,v)=>s+v,0);
      return [...totMes.map(v => totAno[a]>0?((v/totAno[a])*100).toFixed(1)+'%':'-'), totGeral>0?((tot/totGeral)*100).toFixed(1)+'%':'-'].map(v=>`<td>${v}</td>`).join('');
    }).join('')}
  </tr>`;

  html += `</tbody></table></div>`;
  pane.innerHTML = html;
}


// ── LAUDO_GRUPOS_ANO_01_ANO_02 — comparativo entre 2 anos ────────────────────
function bdUpdateLaudoGruposAno02() {
  const pane = document.getElementById('av-rel-laudo-ano02');
  if (!pane) return;
  if (!window.BD_DATA.rows.length) return;

  const rows = relRows();
  if (!rows.length) {
    pane.innerHTML = `<div class="rel-header-bar">${toggleBtnHtml()}<div class="rel-title">Sem dados para os filtros selecionados</div></div>`;
    return;
  }
  const anos = [...new Set(rows.map(r=>g(r,'ano')).filter(Boolean))].sort();
  if (anos.length < 2) { 
    pane.innerHTML = '<div class="av-rel-placeholder"><p>Comparativo entre 2 anos</p><span>São necessários dados de pelo menos 2 anos diferentes</span></div>';
    return;
  }
  const ano1 = anos[anos.length-2];
  const ano2 = anos[anos.length-1];

  const pivot = new Map();
  rows.forEach(r => {
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
    const cor = dif>=0?'#059669':'#DC2626';
    const arrow = dif>=0?'▲':'▼';
    html += `<tr>
      <td>${(gr||'').toUpperCase()}</td>
      <td>${fmtMetrica(v1)}</td>
      <td>${fmtMetrica(v2)}</td>
      <td style="color:${cor}">${fmtMetrica(Math.abs(dif))}</td>
      <td style="color:${cor};font-weight:700">${arrow} ${Math.abs(varp).toFixed(1)}%</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  pane.innerHTML = html;
}
