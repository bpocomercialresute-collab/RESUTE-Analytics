// =============================================================================
// DASHBOARD_CLIENTE.JS — Dashboard executivo para clientes
// =============================================================================

var DC_DATA  = [];  // dados filtrados
var DC_RAW   = [];  // todos os dados do banco
var DC_CHARTS = {}; // instâncias Chart.js

var MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
var MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── ABRE O DASHBOARD ──────────────────────────────────────────────────────────
function _abrirDashCliente() {
  // Esconde layout admin
  ['cui-sidebar','cui-wrapper'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  var vc = document.getElementById('view-dash-cliente');
  if (vc) vc.style.display = 'flex';

  var emp = document.getElementById('dc-empresa');
  if (emp) emp.textContent = SESSION.empresa_nome || 'Cliente';

  // Carrega dados
  dcCarregarDados();
}

// ── CARREGA DADOS DO SUPABASE ─────────────────────────────────────────────────
async function dcCarregarDados() {
  dcStatus('⏳ Carregando dados...');
  try {
    var r = await fetch(
      SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + SESSION.empresa_id +
      '&select=*&order=dt_saida.asc&limit=100000',
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SVC_KEY } }
    );
    var vendas = await r.json();
    if (!Array.isArray(vendas) || !vendas.length) {
      dcStatus('⚠ Nenhum dado disponível ainda.');
      return;
    }

    DC_RAW = vendas;

    // Preenche filtro de anos
    var anos = [...new Set(vendas.map(function(v){ return v.ano; }).filter(Boolean))].sort();
    var selAno = document.getElementById('dc-filtro-ano');
    if (selAno) {
      selAno.innerHTML = '<option value="0">Todos os anos</option>';
      anos.forEach(function(a){ selAno.innerHTML += '<option value="'+a+'">'+a+'</option>'; });
      // Seleciona o ano mais recente
      if (anos.length) selAno.value = anos[anos.length-1];
    }

    dcAplicarFiltro();
    dcStatus('✓ ' + vendas.length.toLocaleString('pt-BR') + ' registros carregados', true);

  } catch(e) {
    dcStatus('✗ ' + e.message);
    console.error(e);
  }
}

// ── FILTRO DE PERÍODO ─────────────────────────────────────────────────────────
function dcAplicarFiltro() {
  var ano = parseInt(document.getElementById('dc-filtro-ano').value) || 0;
  var mes = parseInt(document.getElementById('dc-filtro-mes').value) || 0;

  DC_DATA = DC_RAW.filter(function(v){
    if (ano && v.ano != ano) return false;
    if (mes && v.mes != mes && parseInt(v.mes) != mes) return false;
    return true;
  });

  dcRenderizar();
}

// ── RENDERIZA TUDO ────────────────────────────────────────────────────────────
function dcRenderizar() {
  var rows = DC_DATA;
  if (!rows.length) { dcStatus('⚠ Nenhum dado no período selecionado.'); return; }

  var fatTotal   = rows.reduce(function(s,r){ return s + (parseFloat(r.valor)||0); }, 0);
  var nPedidos   = rows.length;
  var ticket     = nPedidos ? fatTotal / nPedidos : 0;
  var base       = Array.isArray(DC_RAW) && DC_RAW.length ? DC_RAW : rows;
  var clientes   = new Set(base.map(function(r){ return r.cliente; }).filter(Boolean)).size;
  var produtos   = new Set(base.map(function(r){ return r.produto; }).filter(Boolean)).size;
  var reps       = new Set(base.map(function(r){ return r.vendedor; }).filter(Boolean)).size;

  // KPIs
  function fmt(v){ return Number(v || 0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}); }
  function set(id,val){ var el=document.getElementById(id); if(el) el.textContent=val; }

  set('dc-faturamento', fmt(fatTotal));
  set('dc-pedidos',     nPedidos.toLocaleString('pt-BR'));
  set('dc-ticket',      fmt(ticket));
  set('dc-clientes',    clientes.toLocaleString('pt-BR'));
  set('dc-produtos',    produtos.toLocaleString('pt-BR'));
  set('dc-reps',        reps.toLocaleString('pt-BR'));

  // Gráficos e tabelas
  dcChartEvolucao(rows);
  dcChartTrimestre(rows);
  dcChartProdutos(rows);
  dcChartGrupos(rows);
  dcTabelaReps(rows, fatTotal);
  dcTabelaUFs(rows, fatTotal);
  dcTabelaClientes(rows, fatTotal);
  dcTabelaInativos(rows);
}

// ── EVOLUÇÃO MENSAL ───────────────────────────────────────────────────────────
function dcChartEvolucao(rows) {
  var por_mes = {};
  MESES.forEach(function(m,i){ por_mes[i+1] = 0; });
  rows.forEach(function(r){
    var m = parseInt(r.mes) || 0;
    if (m >= 1 && m <= 12) por_mes[m] = (por_mes[m]||0) + (parseFloat(r.valor)||0);
  });
  var labels = MESES;
  var data   = Object.values(por_mes);

  dcDestroyChart('dc-chart-evolucao');
  var ctx = document.getElementById('dc-chart-evolucao');
  if (!ctx) return;
  DC_CHARTS['evolucao'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Faturamento',
        data: data,
        borderColor: '#1C64C0',
        backgroundColor: 'rgba(28,100,192,0.12)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#1C64C0',
        pointRadius: 4
      }]
    },
    options: dcChartOpts('')
  });
}

// ── TRIMESTRES ────────────────────────────────────────────────────────────────
function dcChartTrimestre(rows) {
  var trim = {Q1:0,Q2:0,Q3:0,Q4:0};
  rows.forEach(function(r){
    var m = parseInt(r.mes)||0;
    var v = parseFloat(r.valor)||0;
    if (m<=3) trim.Q1+=v; else if(m<=6) trim.Q2+=v; else if(m<=9) trim.Q3+=v; else trim.Q4+=v;
  });
  dcDestroyChart('dc-chart-trimestre');
  var ctx = document.getElementById('dc-chart-trimestre');
  if (!ctx) return;
  DC_CHARTS['trimestre'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Jan-Mar','Abr-Jun','Jul-Set','Out-Dez'],
      datasets: [{ data: Object.values(trim), backgroundColor: '#1C64C0', borderWidth: 0 }]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:'bottom',labels:{color:'#5A7A74',font:{size:10}}}, tooltip:{callbacks:{label:function(c){ return ' '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:0}); }}} } }
  });
}

// ── TOP PRODUTOS ──────────────────────────────────────────────────────────────
function dcChartProdutos(rows) {
  var map = {};
  rows.forEach(function(r){ var k=r.produto||'—'; map[k]=(map[k]||0)+(parseFloat(r.valor)||0); });
  var sorted = Object.entries(map).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
  var labels = sorted.map(function(e){ return e[0].length>25?e[0].slice(0,25)+'…':e[0]; });
  var data   = sorted.map(function(e){ return e[1]; });

  dcDestroyChart('dc-chart-produtos');
  var ctx = document.getElementById('dc-chart-produtos');
  if (!ctx) return;
  DC_CHARTS['produtos'] = new Chart(ctx, {
    type: 'bar',
    data: { labels:labels, datasets:[{label:'Faturamento',data:data,backgroundColor:'#1C64C0',borderRadius:4}] },
    options: Object.assign(dcChartOpts(''),{indexAxis:'y'})
  });
}

// ── GRUPOS ────────────────────────────────────────────────────────────────────
function dcChartGrupos(rows) {
  var map = {};
  rows.forEach(function(r){ var k=r.grupo||r.grupo_produto||'Sem grupo'; if(k&&k.trim()) map[k]=(map[k]||0)+(parseFloat(r.valor)||0); });
  var sorted = Object.entries(map).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  var cores = ['#1C64C0','#1C64C0','#1C64C0','#1C64C0','#1C64C0','#1C64C0','#1C64C0','#1C64C0'];

  dcDestroyChart('dc-chart-grupos');
  var ctx = document.getElementById('dc-chart-grupos');
  if (!ctx) return;
  DC_CHARTS['grupos'] = new Chart(ctx, {
    type: 'pie',
    data: { labels:sorted.map(function(e){return e[0];}), datasets:[{data:sorted.map(function(e){return e[1];}),backgroundColor:cores,borderWidth:0}] },
    options: { responsive:true,maintainAspectRatio:false, plugins:{ legend:{position:'right',labels:{color:'#5A7A74',font:{size:10},boxWidth:10}}, tooltip:{callbacks:{label:function(c){return ' '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:0})+' ('+((c.raw/(DC_DATA.reduce(function(s,r){return s+(parseFloat(r.valor)||0);},0))||0)*100).toFixed(1)+'%)';}}} } }
  });
}

// ── TABELA REPRESENTANTES ─────────────────────────────────────────────────────
function dcTabelaReps(rows, fatTotal) {
  var map = {};
  rows.forEach(function(r){ var k=r.vendedor||'—'; if(!map[k]) map[k]={fat:0,ped:0}; map[k].fat+=(parseFloat(r.valor)||0); map[k].ped++; });
  var sorted = Object.entries(map).sort(function(a,b){return b[1].fat-a[1].fat;});
  var max = sorted.length ? sorted[0][1].fat : 1;

  var html = '<table class="dc-tabela"><thead><tr><th>#</th><th>Representante</th><th>Pedidos</th><th style="text-align:right">Faturamento</th><th>%</th></tr></thead><tbody>';
  sorted.forEach(function(e,i){
    var pct = (e[1].fat/fatTotal*100).toFixed(1);
    var bar = (e[1].fat/max*100).toFixed(0);
    html += '<tr><td class="pos">'+(i+1)+'</td><td>'+e[0]+'</td><td>'+e[1].ped+'</td>'
          + '<td class="num">'+e[1].fat.toLocaleString('pt-BR',{minimumFractionDigits:0})+'</td>'
          + '<td style="min-width:80px"><div style="font-size:10px;color:#5A7A74;margin-bottom:2px">'+pct+'%</div>'
          + '<div class="dc-bar-wrap"><div class="dc-bar" style="width:'+bar+'%"></div></div></td></tr>';
  });
  html += '</tbody></table>';
  var el = document.getElementById('dc-tabela-reps');
  if (el) el.innerHTML = html;
}

// ── TABELA UFs ────────────────────────────────────────────────────────────────
function dcTabelaUFs(rows, fatTotal) {
  var map = {};
  rows.forEach(function(r){ var k=(r.uf||'—').trim()||'—'; map[k]=(map[k]||0)+(parseFloat(r.valor)||0); });
  var sorted = Object.entries(map).sort(function(a,b){return b[1]-a[1];});
  var max = sorted.length ? sorted[0][1] : 1;

  var html = '<table class="dc-tabela"><thead><tr><th>#</th><th>Estado</th><th style="text-align:right">Faturamento</th><th>Participação</th></tr></thead><tbody>';
  sorted.forEach(function(e,i){
    var pct = (e[1]/fatTotal*100).toFixed(1);
    var bar = (e[1]/max*100).toFixed(0);
    html += '<tr><td class="pos">'+(i+1)+'</td><td>'+e[0]+'</td>'
          + '<td class="num">'+e[1].toLocaleString('pt-BR',{minimumFractionDigits:0})+'</td>'
          + '<td style="min-width:80px"><div style="font-size:10px;color:#5A7A74;margin-bottom:2px">'+pct+'%</div>'
          + '<div class="dc-bar-wrap"><div class="dc-bar" style="width:'+bar+'%;background:#059669"></div></div></td></tr>';
  });
  html += '</tbody></table>';
  var el = document.getElementById('dc-tabela-ufs');
  if (el) el.innerHTML = html;
}

// ── TOP CLIENTES ──────────────────────────────────────────────────────────────
function dcTabelaClientes(rows, fatTotal) {
  var map = {};
  rows.forEach(function(r){ var k=r.cliente||'—'; if(!map[k]) map[k]={fat:0,ped:0}; map[k].fat+=(parseFloat(r.valor)||0); map[k].ped++; });
  var sorted = Object.entries(map).sort(function(a,b){return b[1].fat-a[1].fat;}).slice(0,10);

  var html = '<table class="dc-tabela"><thead><tr><th>#</th><th>Cliente</th><th>Pedidos</th><th style="text-align:right">Faturamento</th></tr></thead><tbody>';
  sorted.forEach(function(e,i){
    html += '<tr><td class="pos">'+(i+1)+'</td><td>'+e[0]+'</td><td>'+e[1].ped+'</td>'
          + '<td class="num">'+e[1].fat.toLocaleString('pt-BR',{minimumFractionDigits:0})+'</td></tr>';
  });
  html += '</tbody></table>';
  var el = document.getElementById('dc-tabela-clientes');
  if (el) el.innerHTML = html;
}

// ── CLIENTES INATIVOS ─────────────────────────────────────────────────────────
function dcTabelaInativos(rows) {
  // Pega a data mais recente de compra por cliente
  var mapa = {};
  rows.forEach(function(r){
    var k = r.cliente||'—';
    var d = r.dt_saida ? new Date(r.dt_saida) : null;
    if (d && (!mapa[k] || d > mapa[k].ultima)) {
      mapa[k] = { ultima: d, fat: (mapa[k]?mapa[k].fat:0)+(parseFloat(r.valor)||0) };
    }
  });
  var hoje = new Date();
  var inativos = Object.entries(mapa).map(function(e){
    var dias = Math.floor((hoje - e[1].ultima) / 86400000);
    return { nome: e[0], dias: dias, ultima: e[1].ultima.toLocaleDateString('pt-BR'), fat: e[1].fat };
  }).filter(function(e){ return e.dias >= 30; }).sort(function(a,b){ return b.dias-a.dias; }).slice(0,10);

  if (!inativos.length) {
    var el = document.getElementById('dc-tabela-inativos');
    if (el) el.innerHTML = '<div style="color:#5A7A74;font-size:13px;padding:20px;text-align:center">Nenhum cliente inativo no período ✓</div>';
    return;
  }

  var html = '<table class="dc-tabela"><thead><tr><th>Cliente</th><th style="text-align:right">Dias sem compra</th><th>Última compra</th></tr></thead><tbody>';
  inativos.forEach(function(e){
    var cor = e.dias > 90 ? '#DC2626' : e.dias > 60 ? '#D97706' : '#5A7A74';
    html += '<tr><td>'+e.nome+'</td>'
          + '<td style="text-align:right;font-weight:800;color:'+cor+'">'+e.dias+' dias</td>'
          + '<td style="color:#5A7A74">'+e.ultima+'</td></tr>';
  });
  html += '</tbody></table>';
  var el = document.getElementById('dc-tabela-inativos');
  if (el) el.innerHTML = html;
}

// ── UTILITÁRIOS ───────────────────────────────────────────────────────────────
function dcDestroyChart(id) {
  var key = id.replace('dc-chart-','');
  if (DC_CHARTS[key]) { try{ DC_CHARTS[key].destroy(); }catch(e){} delete DC_CHARTS[key]; }
}

function dcChartOpts(prefix) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: function(c){ return ' '+(prefix||'')+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:0}); } } }
    },
    scales: {
      x: { ticks: { color: '#5A7A74', font: { size: 10 } }, grid: { color: '#D5EDE8' } },
      y: { ticks: { color: '#5A7A74', font: { size: 10 }, callback: function(v){ return v.toLocaleString('pt-BR',{minimumFractionDigits:0}); } }, grid: { color: '#D5EDE8' } }
    }
  };
}

function dcStatus(msg, ok) {
  var el = document.getElementById('dc-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? '#059669' : (msg.startsWith('✗') ? '#DC2626' : '#5A7A74');
}
