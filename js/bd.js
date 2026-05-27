// =============================================================================
// BD — Banco de Dados: cola do Excel, alimenta todas as abas
// =============================================================================

const BD = {
  headers: [],
  rows: [],
  raw: []
};

// Colunas esperadas do BD
const BD_COLS = [
  'ID','N° PEDIDO','PRODUTO OU SERVIÇO','QTD','Dt. Emissão','Data de Saída',
  'VALOR','Vendedor','Indústria','Cliente','ANO','MÊS','GRUPO','SEM',
  'tipo mercado','SETOR','CIDADE','UF','TIPO VENDEDOR','Dias Sem Compra',
  'NOTA F','ROTA','DESCONTO','EMPRESA','cnpj','grupo_produto','GRUPO PAI',
  'subgrupo_produto','marca','familia_produto','classes'
];

// ── INICIALIZA ZONA DE COLA ───────────────────────────────────────────────────
function bdInit() {
  const zone = document.getElementById('bd-paste-zone');
  if (!zone) return;

  // Ctrl+V na zona
  zone.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    bdParseAndRender(text);
  });

  // Clique para focar e orientar
  zone.addEventListener('click', () => zone.focus());
}

// ── PARSE DO TEXTO COLADO ─────────────────────────────────────────────────────
function bdParseAndRender(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return;

  BD.headers = lines[0].split('\t').map(h => h.trim());
  BD.rows = lines.slice(1).map(line =>
    line.split('\t').map(c => c.trim())
  );
  BD.raw = lines;

  bdRenderTable();
  bdUpdateAllTabs();

  document.getElementById('bd-status').textContent =
    `✓ ${BD.rows.length.toLocaleString('pt-BR')} linhas carregadas`;
  document.getElementById('bd-status').style.color = 'var(--success)';
}

// ── RENDERIZA TABELA BD ───────────────────────────────────────────────────────
function bdRenderTable() {
  const table = document.getElementById('bd-main-table');
  if (!table) return;

  const maxRows = 200; // Mostra as primeiras 200 linhas

  let html = '<thead><tr>' +
    BD.headers.map(h => `<th>${h}</th>`).join('') +
    '</tr></thead><tbody>';

  const display = BD.rows.slice(0, maxRows);
  display.forEach(row => {
    html += '<tr>' + BD.headers.map((_, i) =>
      `<td>${row[i] !== undefined ? row[i] : ''}</td>`
    ).join('') + '</tr>';
  });

  if (BD.rows.length > maxRows) {
    html += `<tr><td colspan="${BD.headers.length}" style="text-align:center;color:var(--text-tertiary);padding:12px;font-style:italic">
      ... e mais ${(BD.rows.length - maxRows).toLocaleString('pt-BR')} linhas (total: ${BD.rows.length.toLocaleString('pt-BR')})
    </td></tr>`;
  }

  html += '</tbody>';
  table.innerHTML = html;
}

// ── HELPER: encontra índice de coluna ─────────────────────────────────────────
function col(name) {
  return BD.headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
}
function val(row, name) {
  const i = col(name);
  return i >= 0 && row[i] !== undefined ? row[i] : '';
}

// ── ATUALIZA TODAS AS ABAS ────────────────────────────────────────────────────
function bdUpdateAllTabs() {
  bdUpdateMarca();
  bdUpdateGrupos();
  bdUpdateRepresentantes();
  bdUpdateClientes();
  bdUpdateProduto();
  bdUpdateRelatorios();
}

// ── ABA MARCA ─────────────────────────────────────────────────────────────────
function bdUpdateMarca() {
  const marcas = [...new Set(BD.rows.map(r => val(r,'marca')).filter(Boolean))].sort();
  const table = document.getElementById('av-tab-marca').querySelector('table');
  if (!table) return;
  table.innerHTML = `<thead><tr><th>#</th><th>MARCA</th></tr></thead><tbody>` +
    marcas.map((m,i) => `<tr><td>${i+1}</td><td>${m}</td></tr>`).join('') +
    `</tbody>`;
}

// ── ABA GRUPOS ────────────────────────────────────────────────────────────────
function bdUpdateGrupos() {
  const seen = new Set();
  const grupos = [];
  BD.rows.forEach(r => {
    const g = val(r,'GRUPO'), gp = val(r,'GRUPO PAI');
    if (g && !seen.has(g)) { seen.add(g); grupos.push({g, gp}); }
  });
  grupos.sort((a,b) => a.g.localeCompare(b.g));
  const table = document.getElementById('av-tab-grupos').querySelector('table');
  if (!table) return;
  table.innerHTML = `<thead><tr><th>#</th><th>GRUPO</th><th>GRUPO PAI</th></tr></thead><tbody>` +
    grupos.map((x,i) => `<tr><td>${i+1}</td><td>${x.g}</td><td>${x.gp}</td></tr>`).join('') +
    `</tbody>`;
}

// ── ABA REPRESENTANTES ────────────────────────────────────────────────────────
function bdUpdateRepresentantes() {
  const vendedores = [...new Set(BD.rows.map(r => val(r,'Vendedor')).filter(Boolean))].sort();
  const table = document.getElementById('av-tab-representantes').querySelector('table');
  if (!table) return;
  table.innerHTML = `<thead><tr><th>#</th><th>VENDEDOR / REPRESENTANTE</th><th>Qtd Pedidos</th><th>Total R$</th></tr></thead><tbody>` +
    vendedores.map((v,i) => {
      const rows = BD.rows.filter(r => val(r,'Vendedor') === v);
      const total = rows.reduce((s,r) => {
        const n = parseFloat(val(r,'VALOR').replace(',','.')) || 0;
        return s + n;
      }, 0);
      return `<tr><td>${i+1}</td><td>${v}</td><td>${rows.length}</td><td>R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>`;
    }).join('') +
    `</tbody>`;
}

// ── ABA CLIENTES ──────────────────────────────────────────────────────────────
function bdUpdateClientes() {
  const seen = new Set();
  const clientes = [];
  BD.rows.forEach(r => {
    const c = val(r,'Cliente');
    if (c && !seen.has(c)) {
      seen.add(c);
      clientes.push({
        nome: c,
        cidade: val(r,'CIDADE'),
        uf: val(r,'UF'),
        setor: val(r,'SETOR'),
        vendedor: val(r,'Vendedor')
      });
    }
  });
  clientes.sort((a,b) => a.nome.localeCompare(b.nome));

  const pane = document.getElementById('av-tab-clientes');
  const table = pane.querySelector('table');
  if (!table) return;
  table.innerHTML = `<thead><tr>
    <th>#</th><th>CLIENTE</th><th>CIDADE</th><th>UF</th>
    <th>SETOR</th><th>VENDEDOR</th><th>Pedidos</th><th>Total R$</th>
  </tr></thead><tbody>` +
    clientes.map((c,i) => {
      const rows = BD.rows.filter(r => val(r,'Cliente') === c.nome);
      const total = rows.reduce((s,r) => {
        const n = parseFloat(val(r,'VALOR').replace(',','.')) || 0;
        return s + n;
      }, 0);
      return `<tr>
        <td>${i+1}</td><td>${c.nome}</td><td>${c.cidade}</td><td>${c.uf}</td>
        <td>${c.setor}</td><td>${c.vendedor}</td><td>${rows.length}</td>
        <td>R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      </tr>`;
    }).join('') + `</tbody>`;

  // Atualiza KPIs
  const kpis = pane.querySelectorAll('.av-kpi-val');
  if (kpis[0]) kpis[0].textContent = BD.rows.length;
  if (kpis[1]) kpis[1].textContent = clientes.length;
}

// ── ABA PRODUTO SERVIÇO ───────────────────────────────────────────────────────
function bdUpdateProduto() {
  const seen = new Set();
  const produtos = [];
  BD.rows.forEach(r => {
    const p = val(r,'PRODUTO OU SERVIÇO');
    if (p && !seen.has(p)) {
      seen.add(p);
      produtos.push({
        nome: p,
        grupo: val(r,'GRUPO'),
        marca: val(r,'marca'),
        familia: val(r,'familia_produto')
      });
    }
  });
  produtos.sort((a,b) => a.nome.localeCompare(b.nome));

  const table = document.getElementById('av-tab-produto').querySelector('table');
  if (!table) return;
  table.innerHTML = `<thead><tr>
    <th>#</th><th>PRODUTO</th><th>GRUPO</th><th>MARCA</th><th>FAMÍLIA</th>
    <th>Qtd Vendida</th><th>Total R$</th>
  </tr></thead><tbody>` +
    produtos.map((p,i) => {
      const rows = BD.rows.filter(r => val(r,'PRODUTO OU SERVIÇO') === p.nome);
      const qtd = rows.reduce((s,r) => s + (parseFloat(val(r,'QTD')) || 0), 0);
      const total = rows.reduce((s,r) => {
        const n = parseFloat(val(r,'VALOR').replace(',','.')) || 0;
        return s + n;
      }, 0);
      return `<tr>
        <td>${i+1}</td><td>${p.nome}</td><td>${p.grupo}</td>
        <td>${p.marca}</td><td>${p.familia}</td>
        <td>${qtd.toLocaleString('pt-BR')}</td>
        <td>R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      </tr>`;
    }).join('') + `</tbody>`;
}

// ── RELATÓRIOS ────────────────────────────────────────────────────────────────
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function bdUpdateRelatorios() {
  bdUpdateVendaProduto();
  bdUpdateLaudoGrupo();
}

function bdUpdateVendaProduto() {
  const table = document.getElementById('av-rel-venda-produto').querySelector('table');
  if (!table) return;

  // Descobre anos disponíveis
  const anos = [...new Set(BD.rows.map(r => val(r,'ANO')).filter(Boolean))].sort();
  const anoAtual = anos[anos.length - 1] || new Date().getFullYear();

  // Agrupa por produto × mês
  const produtos = {};
  BD.rows.forEach(r => {
    if (val(r,'ANO') !== String(anoAtual)) return;
    const p = val(r,'PRODUTO OU SERVIÇO');
    const mes = parseInt(val(r,'MÊS')) || 0;
    const valor = parseFloat(val(r,'VALOR').replace(',','.')) || 0;
    const grupo = val(r,'GRUPO');
    if (!p || mes < 1 || mes > 12) return;
    if (!produtos[p]) produtos[p] = { grupo, meses: Array(12).fill(0), total: 0 };
    produtos[p].meses[mes-1] += valor;
    produtos[p].total += valor;
  });

  const lista = Object.entries(produtos).sort((a,b) => b[1].total - a[1].total);
  const totalGeral = lista.reduce((s,[,v]) => s + v.total, 0);

  let html = `<thead>
    <tr class="av-th-top"><th colspan="2"></th><th class="av-th-year" colspan="12">ANO ${anoAtual}</th><th colspan="3"></th></tr>
    <tr>
      <th>PRODUTO</th><th>GRUPO</th>
      ${MESES.map(m=>`<th>${m}</th>`).join('')}
      <th>TOTAL</th><th>%</th>
    </tr>
  </thead><tbody>`;

  lista.forEach(([nome, d]) => {
    const pct = totalGeral > 0 ? ((d.total/totalGeral)*100).toFixed(1) : '0.0';
    html += `<tr>
      <td>${nome}</td><td>${d.grupo}</td>
      ${d.meses.map(v => `<td>${v > 0 ? 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2}) : ''}</td>`).join('')}
      <td><strong>R$ ${d.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
      <td>${pct}%</td>
    </tr>`;
  });

  html += '</tbody>';
  table.innerHTML = html;
}

function bdUpdateLaudoGrupo() {
  const pane = document.getElementById('av-rel-laudo-grupo');
  if (!pane) return;

  const grupos = {};
  BD.rows.forEach(r => {
    const g = val(r,'GRUPO');
    const mes = parseInt(val(r,'MÊS')) || 0;
    const valor = parseFloat(val(r,'VALOR').replace(',','.')) || 0;
    if (!g || mes < 1 || mes > 12) return;
    if (!grupos[g]) grupos[g] = { meses: Array(12).fill(0), total: 0 };
    grupos[g].meses[mes-1] += valor;
    grupos[g].total += valor;
  });

  const lista = Object.entries(grupos).sort((a,b) => b[1].total - a[1].total);
  const totalGeral = lista.reduce((s,[,v]) => s + v.total, 0);

  let html = `<div class="av-table-wrap" style="border-top:none"><table class="av-table">
    <thead><tr>
      <th>GRUPO</th>${MESES.map(m=>`<th>${m}</th>`).join('')}<th>TOTAL</th><th>%</th>
    </tr></thead><tbody>`;

  lista.forEach(([nome, d]) => {
    const pct = totalGeral > 0 ? ((d.total/totalGeral)*100).toFixed(1) : '0.0';
    html += `<tr>
      <td>${nome}</td>
      ${d.meses.map(v => `<td>${v > 0 ? 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2}) : ''}</td>`).join('')}
      <td><strong>R$ ${d.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
      <td>${pct}%</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  pane.innerHTML = html;
}

// Inicia quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', bdInit);