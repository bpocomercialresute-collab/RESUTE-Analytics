// =============================================================================
// RELAT-REP.JS — 7 relatórios de representantes
// REP_MIX | REP_POSITIV | REP_SEM | META | REP_DIA | REP_CRESC_MES
// =============================================================================

let REP_MODO = 'valor'; // 'valor' ou 'qtd'
window.REP_FILTER = window.REP_FILTER || { vendedor:'', produto:'', cliente:'', grupo:'' };
window.REP_PREMIACAO_MODO = window.REP_PREMIACAO_MODO || 'geral';
window.REP_PREMIACAO_FIXA = window.REP_PREMIACAO_FIXA || [
  'ANDERSON DE LESSA COSTA',
  'PEDRO HENRIQUE SANTOS SALES',
  'WEDNA ROSA DE SOUZA'
];
window.REP_PREMIACAO_CAMPANHA = window.REP_PREMIACAO_CAMPANHA || 'semanal';
window.REP_PREMIACAO_FILTRO = window.REP_PREMIACAO_FILTRO || {
  semana: '',
  mes: '',
  trimestre: '',
  semestre: '',
  ano: ''
};
window.REP_PREMIACAO_CRESCIMENTO = window.REP_PREMIACAO_CRESCIMENTO || false;
window.REP_MENSAL_FILTER = window.REP_MENSAL_FILTER || { ano: '', vendedores: [], ocultarVazios: true };

window.REP_MERGE_EMPRESAS = window.REP_MERGE_EMPRESAS || (function() {
  try { return JSON.parse(localStorage.getItem('resute_rep_merge_empresas') || '[]'); } catch(e) { return []; }
})();
window.REP_EMPRESAS_CACHE = window.REP_EMPRESAS_CACHE || {};
window.REP_MERGE_PAINEL_ABERTO = window.REP_MERGE_PAINEL_ABERTO || false;

// ── MERGE DE EMPRESAS NA PREMIAÇÃO ────────────────────────────────────────────
// Toda leitura de outras empresas passa pelo /api/secure-proxy (SUPA_KEY/SVC_KEY
// em auth.js são placeholders '__SERVER_ONLY__', não funcionam no navegador).

function repProxyFetch(url, method) {
  return fetch('/api/secure-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-token': (window.SESSION && SESSION.token) || '',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({ url: url, method: method || 'GET' })
  });
}

function repMergeEmpresasSalvar() {
  try { localStorage.setItem('resute_rep_merge_empresas', JSON.stringify(window.REP_MERGE_EMPRESAS || [])); } catch(e) {}
}

function repMergeEmpresasToggle(empresa_id) {
  const arr = window.REP_MERGE_EMPRESAS || [];
  const idx = arr.indexOf(empresa_id);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(empresa_id);
  window.REP_MERGE_EMPRESAS = arr;
  repMergeEmpresasSalvar();
  repPremiacao();
}

async function repMergeEmpresasCarregarDados(empresa_id, nome) {
  if (!window.REP_EMPRESAS_CACHE) window.REP_EMPRESAS_CACHE = {};
  const btnId = 'rep-merge-load-' + empresa_id.replace(/[^a-z0-9]/gi, '_');
  const btn = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.textContent = 'Carregando...'; }
  try {
    const r = await repProxyFetch(SUPA_URL + '/rest/v1/vendas?empresa_id=eq.' + encodeURIComponent(empresa_id) + '&select=*&order=dt_saida.asc&limit=100000');
    const vendas = await r.json();
    if (r.ok && Array.isArray(vendas)) {
      const rows = vendas.map(function(v) { return [
        v.id_externo||'', v.num_pedido||'', v.produto||'', String(v.qtd||''),
        v.dt_emissao||'', v.dt_saida||'', String(v.valor||''),
        v.vendedor||'', v.industria||'', v.cliente||'',
        v.ano ? String(v.ano) : '', v.mes||'', v.grupo||'', v.semana||'',
        v.tipo_mercado||'', v.setor||'', v.cidade||'', v.uf||'',
        v.tipo_vendedor||'', '', '', '', '',
        v.empresa_nome || nome || '', v.cnpj||'', v.grupo_produto||'', v.grupo_pai||'',
        v.subgrupo||'', v.marca||'', v.familia||'', v.classes||''
      ]; });
      window.REP_EMPRESAS_CACHE[empresa_id] = { nome: nome, rows: rows };
    } else {
      console.error('Erro ao carregar empresa para merge:', vendas && vendas.erro);
      alert('Não foi possível carregar os dados de ' + nome + (vendas && vendas.erro ? ': ' + vendas.erro : '.'));
    }
  } catch(e) {
    console.error('Erro ao carregar empresa para merge:', e);
  }
  repPremiacao();
}

function repPremiacaoBaseRowsMerged() {
  const cache = window.REP_EMPRESAS_CACHE || {};
  const mergeIds = window.REP_MERGE_EMPRESAS || [];
  let allRows = repDataRows().slice();
  mergeIds.forEach(function(id) {
    if (cache[id]) allRows = allRows.concat(cache[id].rows);
  });
  return allRows;
}

function repMergePainelToggle() {
  window.REP_MERGE_PAINEL_ABERTO = !window.REP_MERGE_PAINEL_ABERTO;
  repPremiacao();
}

// Descobre quais empresas o usuário pode combinar:
// - console admin (super_admin): EMPRESAS_LISTA já carregada
// - login de cliente: SESSION.empresa_ids + filiais (empresa_filiais) do grupo
async function repPremiacaoCarregarEmpresasVinculadas() {
  const lista = [];
  const ativaId = (typeof EMPRESA_ATIVA !== 'undefined' && EMPRESA_ATIVA) ? EMPRESA_ATIVA.empresa_id : (window.SESSION && SESSION.empresa_id) || '';

  if (Array.isArray(window.EMPRESAS_LISTA) && window.EMPRESAS_LISTA.length) {
    window.EMPRESAS_LISTA.forEach(function(e) {
      if (e.empresa_id !== ativaId) lista.push({ empresa_id: e.empresa_id, nome: e.nome });
    });
    window.REP_EMPRESAS_VINCULADAS = lista;
    return lista;
  }

  if (!window.SESSION || !SESSION.token) { window.REP_EMPRESAS_VINCULADAS = lista; return lista; }

  const proprios = Array.isArray(SESSION.empresa_ids) ? SESSION.empresa_ids.slice() : (SESSION.empresa_id ? [SESSION.empresa_id] : []);
  let filiaisIds = [];
  if (SESSION.empresa_id) {
    try {
      const r = await repProxyFetch(SUPA_URL + '/rest/v1/empresa_filiais?empresa_pai_id=eq.' + encodeURIComponent(SESSION.empresa_id) + '&ativo=eq.true&select=empresa_filial_id');
      const d = await r.json();
      if (r.ok && Array.isArray(d)) filiaisIds = d.map(function(f) { return f.empresa_filial_id; }).filter(Boolean);
    } catch(e) { console.error('Erro ao buscar filiais:', e); }
  }

  const idsParaNome = Array.from(new Set(proprios.concat(filiaisIds))).filter(function(id) { return id && id !== ativaId; });

  for (const id of idsParaNome) {
    try {
      const r = await repProxyFetch(SUPA_URL + '/rest/v1/empresas?id=eq.' + encodeURIComponent(id) + '&select=id,nome');
      const d = await r.json();
      if (r.ok && Array.isArray(d) && d[0]) lista.push({ empresa_id: id, nome: d[0].nome || id });
    } catch(e) { console.error('Erro ao buscar nome da empresa:', e); }
  }

  window.REP_EMPRESAS_VINCULADAS = lista;
  return lista;
}

function repPremiacaoEmpresasMergeHtml() {
  // Primeira chamada: dispara descoberta assíncrona e não mostra nada até resolver
  if (!Array.isArray(window.REP_EMPRESAS_VINCULADAS)) {
    if (!window._repEmpresasVinculadasCarregando) {
      window._repEmpresasVinculadasCarregando = true;
      repPremiacaoCarregarEmpresasVinculadas().then(function() {
        window._repEmpresasVinculadasCarregando = false;
        repPremiacao();
      });
    }
    return '';
  }

  const outras = window.REP_EMPRESAS_VINCULADAS.slice();
  const cache = window.REP_EMPRESAS_CACHE || {};
  const mergeIds = window.REP_MERGE_EMPRESAS || [];
  const aberto = window.REP_MERGE_PAINEL_ABERTO;

  // Sem nada para combinar e sem merge ativo: oculta completamente
  if (!outras.length && !mergeIds.length) return '';

  const mergeCount = mergeIds.filter(function(id) { return !!cache[id]; }).length;
  const barLabel = mergeCount
    ? `Empresas combinadas · <strong>${mergeCount + 1} ativas</strong>`
    : 'Juntar empresas na premiação';
  const chevron = aberto ? '▲' : '▼';

  let expansaoHtml = '';
  if (aberto) {
    let corpoHtml;
    if (!outras.length) {
      corpoHtml = `<div class="rep-merge-empty">Nenhuma outra empresa vinculada a este login.</div>`;
    } else {
      const items = outras.map(function(e) {
        const sel = mergeIds.includes(e.empresa_id);
        const carregada = !!cache[e.empresa_id];
        const nRows = carregada ? cache[e.empresa_id].rows.length : 0;
        const safeId = e.empresa_id.replace(/[^a-z0-9]/gi, '_');
        const infoHtml = carregada
          ? `<span class="rep-merge-info">${nRows.toLocaleString('pt-BR')} reg.</span>`
          : `<button id="rep-merge-load-${repEsc(safeId)}" class="rep-merge-load-btn" onclick="repMergeEmpresasCarregarDados('${repEsc(e.empresa_id)}','${repEsc(e.nome)}')">Carregar</button>`;
        return `<div class="rep-merge-item">
          <label class="rep-merge-check">
            <input type="checkbox" ${sel ? 'checked' : ''} ${!carregada ? 'disabled title="Carregue os dados primeiro"' : ''} onchange="repMergeEmpresasToggle('${repEsc(e.empresa_id)}')">
            <span>${repEsc(e.nome)}</span>
          </label>
          ${infoHtml}
        </div>`;
      }).join('');
      corpoHtml = `<div class="rep-merge-lista">${items}</div>`;
    }
    expansaoHtml = `<div class="rep-merge-corpo">${corpoHtml}</div>`;
  }

  return `<div class="rep-merge-panel ${aberto ? 'aberto' : ''}">
    <button class="rep-merge-toggle" onclick="repMergePainelToggle()">
      <span>${barLabel}</span>
      ${mergeCount ? `<span class="rep-merge-active-count">${mergeCount} incluída${mergeCount > 1 ? 's' : ''}</span>` : ''}
      <span class="rep-merge-chevron">${chevron}</span>
    </button>
    ${expansaoHtml}
  </div>`;
}

function repToggleModo(m) {
  REP_MODO = m;
  repUpdateAll();
}

function repVal(row) {
  if (!window.IDX) return 0;
  return REP_MODO === 'qtd'
    ? (parseFloat(row[IDX.qtd]||0) || 0)
    : (typeof parseSmartNumber === 'function' ? parseSmartNumber(row[IDX.valor]) : (Number(row[IDX.valor]) || 0));
}
function repFmt(v) {
  if (REP_MODO === 'qtd') return v > 0 ? fmtInt(v) : '-';
  return v > 0 ? fmtValor(v) : '-';
}
function repFmtFull(v) {
  if (REP_MODO === 'qtd') return fmtInt(v);
  return fmtValor(v);
}

function repMiniCell(valor, max) {
  return repFmt(valor);
}

function repShareCell(valor, total) {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  return `${pct.toFixed(1)}%`;
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

function repPremiacaoToggleCrescimento() {
  window.REP_PREMIACAO_CRESCIMENTO = !window.REP_PREMIACAO_CRESCIMENTO;
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

const REP_PREMIACAO_CAMPANHAS = [
  {
    id: 'semanal',
    badge: '1º prêmio',
    titulo: 'Prêmio Semanal',
    subtitulo: 'Sorteio entre representantes',
    criterio: 'Maior mix semanal acima da média',
    itens: ['Vale R$ 50,00', 'Vale R$ 25,00', 'Kit 5 itens', 'Presente surpresa'],
    filtro: 'semana'
  },
  {
    id: 'mensal',
    badge: '2º prêmio',
    titulo: 'Prêmio Mensal',
    subtitulo: 'Reativação de clientes',
    criterio: 'Inativos (+6 meses)',
    itens: ['Recompensa: R$ 80,00 por cliente reativado', 'Pagamento no mês seguinte'],
    filtro: 'mes'
  },
  {
    id: 'trimestral',
    badge: '3º prêmio',
    titulo: 'Prêmio Trimestral',
    subtitulo: 'Quantidade de itens',
    criterio: 'Maior crescimento quantitativo acima da média própria',
    itens: ['Exemplo: de 1.480 para 2.048 = +38,378%', 'Brinde variado (cada trimestre terá um exibido)'],
    filtro: 'trimestre'
  },
  {
    id: 'semestral',
    badge: '4º prêmio',
    titulo: 'Prêmio Semestral',
    subtitulo: 'Consistência',
    criterio: 'Consistência de vendas positivas (últimos 6 meses)',
    itens: ['Rodízio para casal'],
    filtro: 'semestre'
  },
  {
    id: 'anual',
    badge: '5º prêmio',
    titulo: 'Prêmio Anual',
    subtitulo: 'Maior média mensal de quantidade',
    criterio: 'Crescimento mínimo de 30% sobre 2025',
    itens: ['Viagem para Caldas Novas + hotel casal c/ café + vale combustível'],
    filtro: 'ano'
  },
  {
    id: 'ranking-mensal-a',
    badge: '6º prêmio',
    titulo: 'Prêmio Ranking Mensal',
    subtitulo: 'Faixa de valor',
    criterio: 'R$ de pedidos faturados e entregues',
    itens: ['5 a 10 mil: R$ 25,00', '11 a 15 mil: R$ 50,00', '20 a 30 mil: R$ 100,00', '31 a 50 mil: R$ 150,00'],
    filtro: 'mes'
  },
  {
    id: 'ranking-mensal-b',
    badge: '6º prêmio',
    titulo: 'Prêmio Ranking Mensal',
    subtitulo: 'Faixa de valor',
    criterio: 'R$ de pedidos faturados e entregues',
    itens: ['51 a 75 mil: R$ 100,00 + kit Churrasco', '76 a 100 mil: R$ 150,00 + Prêmio Secreto', '101 a 125 mil: R$ 200,00 + Restaurante Casal', '126 a 150 mil: R$ 250,00 + Passeio Turístico'],
    filtro: 'mes'
  }
];

function repPremiacaoCampanhasLista() {
  const rankingA = REP_PREMIACAO_CAMPANHAS.find(c => c.id === 'ranking-mensal-a');
  const rankingB = REP_PREMIACAO_CAMPANHAS.find(c => c.id === 'ranking-mensal-b');
  const base = REP_PREMIACAO_CAMPANHAS.filter(c => c.id !== 'ranking-mensal-a' && c.id !== 'ranking-mensal-b');
  if (rankingA) {
    base.push({
      id: 'ranking-mensal',
      badge: rankingA.badge,
      titulo: rankingA.titulo,
      subtitulo: rankingA.subtitulo,
      criterio: rankingA.criterio,
      itens: [...(rankingA.itens || []), ...(rankingB?.itens || [])],
      filtro: rankingA.filtro
    });
  }
  return base;
}

function repPremiacaoCampanhaAtual() {
  const atual = String(window.REP_PREMIACAO_CAMPANHA || '').trim();
  const normalizado = (atual === 'ranking-mensal-a' || atual === 'ranking-mensal-b') ? 'ranking-mensal' : atual;
  if (normalizado !== atual) window.REP_PREMIACAO_CAMPANHA = normalizado;
  return repPremiacaoCampanhasLista().find(c => c.id === normalizado) || repPremiacaoCampanhasLista()[0];
}

function repPremiacaoSetCampanha(id) {
  const existe = repPremiacaoCampanhasLista().some(c => c.id === id);
  window.REP_PREMIACAO_CAMPANHA = existe ? id : 'semanal';
  repPremiacao();
}

function repPremiacaoSetFiltro(campo, valor) {
  if (!window.REP_PREMIACAO_FILTRO) window.REP_PREMIACAO_FILTRO = {};
  window.REP_PREMIACAO_FILTRO[campo] = String(valor || '');
  repPremiacao();
}

function repPremiacaoLimparFiltros() {
  window.REP_PREMIACAO_FILTRO = {
    semana: '',
    mes: '',
    trimestre: '',
    semestre: '',
    ano: ''
  };
  repPremiacao();
}

function repPremiacaoChavePadrao(tipoFiltro, ref) {
  if (tipoFiltro === 'semana') return repPremiacaoCalcularIntervaloSemana(ref).chave;
  if (tipoFiltro === 'mes') return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
  if (tipoFiltro === 'trimestre') return `${ref.getFullYear()}-T${Math.floor(ref.getMonth() / 3) + 1}`;
  if (tipoFiltro === 'semestre') return `${ref.getFullYear()}-S${ref.getMonth() < 6 ? '1' : '2'}`;
  return String(ref.getFullYear());
}

function repPremiacaoCalcularIntervaloSemana(dt) {
  const base = new Date(dt);
  base.setHours(0, 0, 0, 0);
  const offset = (base.getDay() + 6) % 7;
  const inicio = new Date(base);
  inicio.setDate(base.getDate() - offset);
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);
  return { inicio, fim, chave: inicio.toISOString().slice(0, 10) };
}

function repPremiacaoDataRowsBase() {
  return repPremiacaoRowsBase();
}

function repPremiacaoDisponiveis(rows) {
  const lista = Array.isArray(rows) ? rows : [];
  const semanas = [];
  const meses = [];
  const trimestres = [];
  const semestres = [];
  const anos = [];
  const vistos = { semana: new Set(), mes: new Set(), trim: new Set(), sem: new Set(), ano: new Set() };

  lista.forEach(r => {
    const dt = repParseDate(String(r[IDX.saida] || r[IDX.emissao] || '').trim());
    if (!dt) return;
    const sem = repPremiacaoCalcularIntervaloSemana(dt);
    const mesKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const trimKey = `${dt.getFullYear()}-T${Math.floor(dt.getMonth() / 3) + 1}`;
    const semKey = `${dt.getFullYear()}-S${dt.getMonth() < 6 ? '1' : '2'}`;
    const anoKey = String(dt.getFullYear());

    if (!vistos.semana.has(sem.chave)) {
      vistos.semana.add(sem.chave);
      semanas.push({
        key: sem.chave,
        label: `${sem.inicio.toLocaleDateString('pt-BR')} a ${sem.fim.toLocaleDateString('pt-BR')}`
      });
    }
    if (!vistos.mes.has(mesKey)) {
      vistos.mes.add(mesKey);
      meses.push({
        key: mesKey,
        label: `${MES_LABEL_PT[dt.getMonth()]} / ${dt.getFullYear()}`
      });
    }
    if (!vistos.trim.has(trimKey)) {
      vistos.trim.add(trimKey);
      trimestres.push({
        key: trimKey,
        label: `${trimKey.split('-T')[1]}º trim / ${dt.getFullYear()}`
      });
    }
    if (!vistos.sem.has(semKey)) {
      vistos.sem.add(semKey);
      semestres.push({
        key: semKey,
        label: `${semKey.endsWith('1') ? '1º' : '2º'} semestre / ${dt.getFullYear()}`
      });
    }
    if (!vistos.ano.has(anoKey)) {
      vistos.ano.add(anoKey);
      anos.push({
        key: anoKey,
        label: anoKey
      });
    }
  });

  semanas.sort((a, b) => a.key < b.key ? 1 : -1);
  meses.sort((a, b) => a.key < b.key ? 1 : -1);
  trimestres.sort((a, b) => a.key < b.key ? 1 : -1);
  semestres.sort((a, b) => a.key < b.key ? 1 : -1);
  anos.sort((a, b) => a.key < b.key ? 1 : -1);
  return { semanas, meses, trimestres, semestres, anos };
}

function repPremiacaoAplicarFiltroPeriodo(rows) {
  const filtro = window.REP_PREMIACAO_FILTRO || {};
  const campanha = repPremiacaoCampanhaAtual();
  const tipoFiltro = campanha.filtro || 'mes';
  const lista = Array.isArray(rows) ? rows : [];
  if (!lista.length) return [];

  const datas = lista.map(r => ({
    row: r,
    dt: repParseDate(String(r[IDX.saida] || r[IDX.emissao] || '').trim())
  })).filter(x => x.dt).sort((a, b) => a.dt - b.dt);

  const ultima = datas[datas.length - 1].dt;
  if (tipoFiltro === 'semana') {
    const disponiveis = repPremiacaoDisponiveis(lista).semanas.map(x => x.key);
    const padrao = repPremiacaoChavePadrao('semana', ultima);
    const alvo = disponiveis.includes(filtro.semana) ? filtro.semana : padrao;
    if (window.REP_PREMIACAO_FILTRO && window.REP_PREMIACAO_FILTRO.semana !== alvo) window.REP_PREMIACAO_FILTRO.semana = alvo;
    return datas.filter(x => repPremiacaoCalcularIntervaloSemana(x.dt).chave === alvo).map(x => x.row);
  }
  if (tipoFiltro === 'mes') {
    const disponiveis = repPremiacaoDisponiveis(lista).meses.map(x => x.key);
    const padrao = repPremiacaoChavePadrao('mes', ultima);
    const alvo = disponiveis.includes(filtro.mes) ? filtro.mes : padrao;
    if (window.REP_PREMIACAO_FILTRO && window.REP_PREMIACAO_FILTRO.mes !== alvo) window.REP_PREMIACAO_FILTRO.mes = alvo;
    return datas.filter(x => `${x.dt.getFullYear()}-${String(x.dt.getMonth() + 1).padStart(2, '0')}` === alvo).map(x => x.row);
  }
  if (tipoFiltro === 'trimestre') {
    const disponiveis = repPremiacaoDisponiveis(lista).trimestres.map(x => x.key);
    const padrao = repPremiacaoChavePadrao('trimestre', ultima);
    const alvo = disponiveis.includes(filtro.trimestre) ? filtro.trimestre : padrao;
    if (window.REP_PREMIACAO_FILTRO && window.REP_PREMIACAO_FILTRO.trimestre !== alvo) window.REP_PREMIACAO_FILTRO.trimestre = alvo;
    return datas.filter(x => `${x.dt.getFullYear()}-T${Math.floor(x.dt.getMonth() / 3) + 1}` === alvo).map(x => x.row);
  }
  if (tipoFiltro === 'semestre') {
    const disponiveis = repPremiacaoDisponiveis(lista).semestres.map(x => x.key);
    const padrao = repPremiacaoChavePadrao('semestre', ultima);
    const alvo = disponiveis.includes(filtro.semestre) ? filtro.semestre : padrao;
    if (window.REP_PREMIACAO_FILTRO && window.REP_PREMIACAO_FILTRO.semestre !== alvo) window.REP_PREMIACAO_FILTRO.semestre = alvo;
    return datas.filter(x => `${x.dt.getFullYear()}-S${x.dt.getMonth() < 6 ? '1' : '2'}` === alvo).map(x => x.row);
  }
  if (tipoFiltro === 'ano') {
    const disponiveis = repPremiacaoDisponiveis(lista).anos.map(x => x.key);
    const padrao = repPremiacaoChavePadrao('ano', ultima);
    const alvo = disponiveis.includes(filtro.ano) ? filtro.ano : padrao;
    if (window.REP_PREMIACAO_FILTRO && window.REP_PREMIACAO_FILTRO.ano !== alvo) window.REP_PREMIACAO_FILTRO.ano = alvo;
    return datas.filter(x => String(x.dt.getFullYear()) === alvo).map(x => x.row);
  }
  return lista;
}

function repPremiacaoRows() {
  return repPremiacaoAplicarFiltroPeriodo(repFiltrarRowsPremiacao(repDataRows()));
}

function repPremiacaoRowsBase() {
  return repFiltrarRowsPremiacao(repDataRows());
}

function repPremiacaoPeriodoCampo(campanha) {
  const id = String(campanha || repPremiacaoCampanhaAtual().id || '');
  const atual = repPremiacaoCampanhasLista().find(c => c.id === id) || repPremiacaoCampanhasLista()[0];
  return atual ? atual.filtro : 'mes';
}

function repPremiacaoPeriodoAtual(rows) {
  const lista = Array.isArray(rows) ? rows : repPremiacaoRowsBase();
  const datas = lista
    .map(r => repParseDate(String(r[IDX.saida] || r[IDX.emissao] || '').trim()))
    .filter(Boolean)
    .sort((a, b) => a - b);
  return datas[datas.length - 1] || new Date();
}

function repPremiacaoPeriodoSelecionado(rows) {
  const campanha = repPremiacaoCampanhaAtual();
  const filtro = window.REP_PREMIACAO_FILTRO || {};
  const ref = repPremiacaoPeriodoAtual(rows);
  const campo = repPremiacaoPeriodoCampo(campanha.id);

  if (campo === 'semana') {
    const alvo = filtro.semana || repPremiacaoCalcularIntervaloSemana(ref).chave;
    const periodo = repPremiacaoDisponiveis(rows).semanas.find(x => x.key === alvo);
    return periodo ? periodo.label : 'Semana selecionada';
  }
  if (campo === 'mes') {
    const alvo = filtro.mes || `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
    const periodo = repPremiacaoDisponiveis(rows).meses.find(x => x.key === alvo);
    return periodo ? periodo.label : 'Mês selecionado';
  }
  if (campo === 'trimestre') {
    const alvo = filtro.trimestre || `${ref.getFullYear()}-T${Math.floor(ref.getMonth() / 3) + 1}`;
    const periodo = repPremiacaoDisponiveis(rows).trimestres.find(x => x.key === alvo);
    return periodo ? periodo.label : 'Trimestre selecionado';
  }
  if (campo === 'semestre') {
    const alvo = filtro.semestre || `${ref.getFullYear()}-S${ref.getMonth() < 6 ? '1' : '2'}`;
    const periodo = repPremiacaoDisponiveis(rows).semestres.find(x => x.key === alvo);
    return periodo ? periodo.label : 'Semestre selecionado';
  }
  const alvo = filtro.ano || String(ref.getFullYear());
  const periodo = repPremiacaoDisponiveis(rows).anos.find(x => x.key === alvo);
  return periodo ? periodo.label : 'Ano selecionado';
}

function repPremiacaoCampoOptions(lista, selecionado, labelPadrao) {
  const opts = (Array.isArray(lista) ? lista : []).map(v => `<option value="${repEsc(v.key)}" ${v.key === selecionado ? 'selected' : ''}>${repEsc(v.label)}</option>`).join('');
  return `<option value="">${repEsc(labelPadrao || 'Último disponível')}</option>${opts}`;
}

function repPremiacaoFiltroHtml(rows) {
  const campanha = repPremiacaoCampanhaAtual();
  const campo = repPremiacaoPeriodoCampo(campanha.id);
  const baseRows = Array.isArray(rows) && rows.length ? rows : repPremiacaoRowsBase();
  const disponiveis = repPremiacaoDisponiveis(baseRows);
  const filtro = window.REP_PREMIACAO_FILTRO || {};
  const selecionado =
    campo === 'semana' ? (filtro.semana || '') :
    campo === 'mes' ? (filtro.mes || '') :
    campo === 'trimestre' ? (filtro.trimestre || '') :
    campo === 'semestre' ? (filtro.semestre || '') :
    (filtro.ano || '');
  const lista =
    campo === 'semana' ? disponiveis.semanas :
    campo === 'mes' ? disponiveis.meses :
    campo === 'trimestre' ? disponiveis.trimestres :
    campo === 'semestre' ? disponiveis.semestres :
    disponiveis.anos;
  const label =
    campo === 'semana' ? 'Semana' :
    campo === 'mes' ? 'Mês' :
    campo === 'trimestre' ? 'Trimestre' :
    campo === 'semestre' ? 'Semestre' : 'Ano';

  const labelPadrao =
    campo === 'semana' ? 'Última semana disponível' :
    campo === 'mes' ? 'Último mês disponível' :
    campo === 'trimestre' ? 'Último trimestre disponível' :
    campo === 'semestre' ? 'Último semestre disponível' : 'Último ano disponível';

  return `<div class="premio-periodo-filtros">
    <label class="premio-periodo-field">
      <span>${label} do relatório</span>
      <select class="premio-periodo-select" onchange="repPremiacaoSetFiltro('${campo}', this.value)">
        ${repPremiacaoCampoOptions(lista, selecionado, labelPadrao)}
      </select>
    </label>
    <button type="button" class="premio-periodo-reset" onclick="repPremiacaoLimparFiltros()">Limpar período</button>
  </div>`;
}

function repPremiacaoCampanhasHtml(rows) {
  const ativos = repPremiacaoCampanhaAtual();
  return `<div class="premio-campanha-grid">
    ${repPremiacaoCampanhasLista().map(campanha => `
      <article class="premio-campanha-card ${campanha.id === ativos.id ? 'active' : ''}">
        <div class="premio-campanha-head">
          <div>
            <span class="premio-campanha-badge">${repEsc(campanha.badge)}</span>
            <h3 class="premio-campanha-title">${repEsc(campanha.titulo)}</h3>
            <p class="premio-campanha-sub">${repEsc(campanha.subtitulo)}</p>
          </div>
          <button type="button" class="premio-campanha-btn" onclick="repPremiacaoSetCampanha('${campanha.id}')">
            ${campanha.id === ativos.id ? 'Selecionada' : 'Selecionar'}
          </button>
        </div>
        <div class="premio-campanha-criterio">
          <strong>Critério</strong>
          <span>${repEsc(campanha.criterio)}</span>
        </div>
        <ul class="premio-campanha-list">
          ${campanha.itens.map(item => `<li>${repEsc(item)}</li>`).join('')}
        </ul>
      </article>
    `).join('')}
  </div>`;
}

function repPremiacaoResumoHtml(rows) {
  const lista = Array.isArray(rows) ? rows : [];
  const reps = {};
  lista.forEach(r => {
    const vend = String(r[IDX.vendedor] || '').trim() || 'Sem representante';
    if (!reps[vend]) reps[vend] = { fat: 0, qtd: 0, pedidos: new Set(), clientes: new Set(), produtos: new Set() };
    reps[vend].fat += (typeof parseSmartNumber === 'function' ? parseSmartNumber(r[IDX.valor]) : (Number(r[IDX.valor]) || 0));
    reps[vend].qtd += parseFloat(r[IDX.qtd] || 0) || 0;
    reps[vend].pedidos.add(repPedidoChave(r));
    if (r[IDX.cliente]) reps[vend].clientes.add(String(r[IDX.cliente]).trim());
    if (r[IDX.produto]) reps[vend].produtos.add(String(r[IDX.produto]).trim());
  });
  const arr = Object.values(reps);
  const totalFat = arr.reduce((s, r) => s + r.fat, 0);
  const totalQtd = arr.reduce((s, r) => s + r.qtd, 0);
  const totalPedidos = arr.reduce((s, r) => s + r.pedidos.size, 0);
  const totalClientes = new Set(lista.map(r => String(r[IDX.cliente] || '').trim()).filter(Boolean)).size;
  return `<div class="premio-campanha-hero">
    <div>
      <span class="premio-kicker">Premiação organizada</span>
      <h3>${repEsc(repPremiacaoCampanhaAtual().titulo)}</h3>
      <p>Período ativo: <strong>${repEsc(repPremiacaoPeriodoSelecionado(lista))}</strong>. O recorte abaixo já está limitado ao período e à disputa escolhida.</p>
    </div>
    <div class="premio-campanha-resumo">
      <div><span>Faturamento</span><strong>${fmtValor(totalFat)}</strong></div>
      <div><span>Quantidade</span><strong>${fmtInt(totalQtd)}</strong></div>
      <div><span>Pedidos</span><strong>${fmtInt(totalPedidos)}</strong></div>
      <div><span>Clientes</span><strong>${fmtInt(totalClientes)}</strong></div>
    </div>
  </div>`;
}

function repPremiacaoRowDate(row) {
  return repParseDate(String(row[IDX.saida] || row[IDX.emissao] || '').trim());
}

function repPremiacaoAgruparRepresentantes(rows) {
  const mapa = {};
  (Array.isArray(rows) ? rows : []).forEach(r => {
    const nome = String(r[IDX.vendedor] || '').trim() || 'Sem representante';
    if (!mapa[nome]) mapa[nome] = { nome, fat: 0, qtd: 0, pedidos: new Set(), clientes: new Set(), produtos: new Set() };
    mapa[nome].fat += (typeof parseSmartNumber === 'function' ? parseSmartNumber(r[IDX.valor]) : (Number(r[IDX.valor]) || 0));
    mapa[nome].qtd += parseFloat(r[IDX.qtd] || 0) || 0;
    mapa[nome].pedidos.add(repPedidoChave(r));
    if (r[IDX.cliente]) mapa[nome].clientes.add(String(r[IDX.cliente]).trim());
    if (r[IDX.produto]) mapa[nome].produtos.add(String(r[IDX.produto]).trim());
  });
  return Object.values(mapa).map(item => ({
    nome: item.nome,
    tipo: repGetTipo(item.nome),
    fat: item.fat,
    qtd: item.qtd,
    pedidos: item.pedidos.size,
    clientes: item.clientes.size,
    produtos: item.produtos.size
  }));
}

function repPremiacaoPeriodoLimites(rows) {
  const campanha = repPremiacaoCampanhaAtual();
  const ref = repPremiacaoPeriodoAtual(rows);
  let inicio = new Date(ref);
  let fim = new Date(ref);
  if (campanha.filtro === 'semana') {
    const sem = repPremiacaoCalcularIntervaloSemana(ref);
    inicio = sem.inicio;
    fim = sem.fim;
  } else if (campanha.filtro === 'mes') {
    inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
    fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  } else if (campanha.filtro === 'trimestre') {
    const mesInicio = Math.floor(ref.getMonth() / 3) * 3;
    inicio = new Date(ref.getFullYear(), mesInicio, 1);
    fim = new Date(ref.getFullYear(), mesInicio + 3, 0);
  } else if (campanha.filtro === 'semestre') {
    const mesInicio = ref.getMonth() < 6 ? 0 : 6;
    inicio = new Date(ref.getFullYear(), mesInicio, 1);
    fim = new Date(ref.getFullYear(), mesInicio + 6, 0);
  } else {
    inicio = new Date(ref.getFullYear(), 0, 1);
    fim = new Date(ref.getFullYear(), 11, 31);
  }
  inicio.setHours(0, 0, 0, 0);
  fim.setHours(23, 59, 59, 999);
  return { inicio, fim };
}

function repPremiacaoTabelaRelatorio(titulo, colunas, linhas) {
  return `<div class="premio-card premio-full">
    <div class="premio-card-title">${repEsc(titulo)}</div>
    <div class="rep-scroll-area">
      <table class="rep-tbl">
        <thead><tr>${colunas.map(c => `<td>${repEsc(c)}</td>`).join('')}</tr></thead>
        <tbody>${linhas || '<tr><td colspan="' + colunas.length + '">Sem dados para este prêmio no recorte atual.</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
}

function repPremiacaoRelatorioHtml(rows, baseRows) {
  const campanha = repPremiacaoCampanhaAtual();
  const atuais = repPremiacaoAgruparRepresentantes(rows);
  const limites = repPremiacaoPeriodoLimites(rows);

  if (campanha.id === 'semanal') {
    const mediaMix = atuais.length ? atuais.reduce((s, r) => s + r.produtos, 0) / atuais.length : 0;
    const linhas = atuais.sort((a, b) => b.produtos - a.produtos || b.fat - a.fat).map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="rep-lbl">${repEsc((r.nome||'').toUpperCase())}</td>
        <td>${fmtInt(r.produtos)}</td>
        <td>${fmtValor(r.fat)}</td>
        <td>${r.produtos >= mediaMix ? 'Acima da média' : 'Abaixo da média'}</td>
      </tr>`).join('');
    return repPremiacaoTabelaRelatorio('Relatório do prêmio semanal · maior mix acima da média', ['#', 'Representante', 'Mix semanal', 'Faturamento', 'Situação'], linhas);
  }

  if (campanha.id === 'mensal') {
    const bonusPorCliente = 80;
    const porRep = {};
    rows.forEach(r => {
      const cliente = String(r[IDX.cliente] || '').trim();
      const vendedor = String(r[IDX.vendedor] || '').trim() || 'Sem representante';
      if (!cliente) return;
      const anteriores = (Array.isArray(baseRows) ? baseRows : []).filter(base => {
        const mesmoCliente = String(base[IDX.cliente] || '').trim() === cliente;
        const dt = repPremiacaoRowDate(base);
        return mesmoCliente && dt && dt < limites.inicio;
      }).map(repPremiacaoRowDate).filter(Boolean).sort((a, b) => b - a);
      if (!anteriores.length) return;
      const diffDias = Math.floor((limites.inicio - anteriores[0]) / 86400000);
      if (diffDias < 180) return;
      if (!porRep[vendedor]) porRep[vendedor] = { nome: vendedor, clientes: new Set() };
      porRep[vendedor].clientes.add(cliente);
    });
    const linhas = Object.values(porRep).map(item => ({
      nome: item.nome,
      reativados: item.clientes.size,
      bonus: item.clientes.size * bonusPorCliente,
      clientes: Array.from(item.clientes).slice(0, 4).join(', ')
    })).sort((a, b) => b.reativados - a.reativados || b.bonus - a.bonus).map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="rep-lbl">${repEsc((r.nome||'').toUpperCase())}</td>
        <td>${fmtInt(r.reativados)}</td>
        <td>${fmtValor(r.bonus)}</td>
        <td>${repEsc(r.clientes || '-')}</td>
      </tr>`).join('');
    return repPremiacaoTabelaRelatorio('Relatório do prêmio mensal · reativação de clientes', ['#', 'Representante', 'Clientes reativados', 'Bônus projetado', 'Exemplos'], linhas);
  }

  if (campanha.id === 'trimestral') {
    const inicioAtual = limites.inicio;
    const fimAtual = limites.fim;
    const inicioAnterior = new Date(inicioAtual.getFullYear(), inicioAtual.getMonth() - 3, 1);
    const fimAnterior = new Date(inicioAtual.getFullYear(), inicioAtual.getMonth(), 0);
    const atualMap = repPremiacaoAgruparRepresentantes(rows);
    const anteriorMap = repPremiacaoAgruparRepresentantes((Array.isArray(baseRows) ? baseRows : []).filter(r => {
      const dt = repPremiacaoRowDate(r);
      return dt && dt >= inicioAnterior && dt <= fimAnterior;
    }));
    const anteriorIdx = Object.fromEntries(anteriorMap.map(r => [r.nome, r]));
    const linhas = atualMap.map(r => {
      const ant = anteriorIdx[r.nome]?.qtd || 0;
      const cresc = ant > 0 ? ((r.qtd - ant) / ant) * 100 : (r.qtd > 0 ? 100 : 0);
      return { nome: r.nome, atual: r.qtd, anterior: ant, cresc };
    }).sort((a, b) => b.cresc - a.cresc || b.atual - a.atual).map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="rep-lbl">${repEsc((r.nome||'').toUpperCase())}</td>
        <td>${fmtInt(r.anterior)}</td>
        <td>${fmtInt(r.atual)}</td>
        <td>${r.cresc.toFixed(1)}%</td>
      </tr>`).join('');
    return repPremiacaoTabelaRelatorio('Relatório do prêmio trimestral · crescimento quantitativo', ['#', 'Representante', 'Trimestre anterior', 'Trimestre atual', 'Crescimento'], linhas);
  }

  if (campanha.id === 'semestral') {
    const meses = {};
    rows.forEach(r => {
      const nome = String(r[IDX.vendedor] || '').trim() || 'Sem representante';
      const dt = repPremiacaoRowDate(r);
      if (!dt) return;
      const chaveMes = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (!meses[nome]) meses[nome] = {};
      meses[nome][chaveMes] = (meses[nome][chaveMes] || 0) + ((typeof parseSmartNumber === 'function' ? parseSmartNumber(r[IDX.valor]) : (Number(r[IDX.valor]) || 0)));
    });
    const linhas = Object.entries(meses).map(([nome, mapaMes]) => {
      const positivos = Object.values(mapaMes).filter(v => v > 0).length;
      const total = Object.values(mapaMes).reduce((s, v) => s + v, 0);
      return { nome, positivos, total };
    }).sort((a, b) => b.positivos - a.positivos || b.total - a.total).map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="rep-lbl">${repEsc((r.nome||'').toUpperCase())}</td>
        <td>${fmtInt(r.positivos)} / 6</td>
        <td>${fmtValor(r.total)}</td>
        <td>${r.positivos === 6 ? 'Consistência máxima' : 'Em acompanhamento'}</td>
      </tr>`).join('');
    return repPremiacaoTabelaRelatorio('Relatório do prêmio semestral · consistência', ['#', 'Representante', 'Meses positivos', 'Faturamento semestral', 'Status'], linhas);
  }

  if (campanha.id === 'anual') {
    const anoAtual = limites.inicio.getFullYear();
    const atualMap = repPremiacaoAgruparRepresentantes(rows);
    const anteriorMap = repPremiacaoAgruparRepresentantes((Array.isArray(baseRows) ? baseRows : []).filter(r => {
      const dt = repPremiacaoRowDate(r);
      return dt && dt.getFullYear() === (anoAtual - 1);
    }));
    const anteriorIdx = Object.fromEntries(anteriorMap.map(r => [r.nome, r]));
    const linhas = atualMap.map(r => {
      const antFat = anteriorIdx[r.nome]?.fat || 0;
      const cresc = antFat > 0 ? ((r.fat - antFat) / antFat) * 100 : 0;
      const mediaMensalQtd = r.qtd / 12;
      return { nome: r.nome, fat: r.fat, mediaMensalQtd, cresc, elegivel: cresc >= 30 };
    }).sort((a, b) => b.fat - a.fat || b.mediaMensalQtd - a.mediaMensalQtd).map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="rep-lbl">${repEsc((r.nome||'').toUpperCase())}</td>
        <td>${fmtValor(r.fat)}</td>
        <td>${fmtInt(r.mediaMensalQtd)}</td>
        <td>${r.cresc.toFixed(1)}%</td>
        <td>${r.elegivel ? 'Elegível' : 'Abaixo da meta'}</td>
      </tr>`).join('');
    return repPremiacaoTabelaRelatorio('Relatório do prêmio anual · volume e crescimento', ['#', 'Representante', 'Faturamento anual', 'Média mensal de qtd', 'Crescimento vs ano anterior', 'Elegibilidade'], linhas);
  }

  const faixas = [
    { min: 5000, max: 10000, premio: 'R$ 25,00' },
    { min: 11000, max: 15000, premio: 'R$ 50,00' },
    { min: 20000, max: 30000, premio: 'R$ 100,00' },
    { min: 31000, max: 50000, premio: 'R$ 150,00' },
    { min: 51000, max: 75000, premio: 'R$ 100,00 + kit Churrasco' },
    { min: 76000, max: 100000, premio: 'R$ 150,00 + Prêmio Secreto' },
    { min: 101000, max: 125000, premio: 'R$ 200,00 + Restaurante Casal' },
    { min: 126000, max: 150000, premio: 'R$ 250,00 + Passeio Turístico' }
  ];
  const linhas = atuais.sort((a, b) => b.fat - a.fat).map((r, i) => {
    const faixa = faixas.find(f => r.fat >= f.min && r.fat <= f.max);
    return `
      <tr>
        <td>${i + 1}</td>
        <td class="rep-lbl">${repEsc((r.nome||'').toUpperCase())}</td>
        <td>${fmtValor(r.fat)}</td>
        <td>${faixa ? `${fmtValor(faixa.min)} a ${fmtValor(faixa.max)}` : 'Fora das faixas'}</td>
        <td>${repEsc(faixa?.premio || 'Sem prêmio nesta faixa')}</td>
      </tr>`;
  }).join('');
  return repPremiacaoTabelaRelatorio('Relatório do prêmio ranking mensal · faixa de valor', ['#', 'Representante', 'Faturamento mensal', 'Faixa', 'Premiação'], linhas);
}

function repPremiacaoCompetidores(rows) {
  const mapa = {};
  (Array.isArray(rows) ? rows : []).forEach(r => {
    const vend = String(r[IDX.vendedor] || '').trim() || 'Sem representante';
    if (!mapa[vend]) mapa[vend] = { nome: vend, fat: 0, qtd: 0, pedidos: new Set(), clientes: new Set(), produtos: new Set(), dias: new Set() };
    const dtStr = String(r[IDX.saida] || r[IDX.emissao] || '').trim();
    mapa[vend].fat += (typeof parseSmartNumber === 'function' ? parseSmartNumber(r[IDX.valor]) : (Number(r[IDX.valor]) || 0));
    mapa[vend].qtd += parseFloat(r[IDX.qtd] || 0) || 0;
    mapa[vend].pedidos.add(repPedidoChave(r));
    if (r[IDX.cliente]) mapa[vend].clientes.add(String(r[IDX.cliente]).trim());
    if (r[IDX.produto]) mapa[vend].produtos.add(String(r[IDX.produto]).trim());
    if (dtStr) mapa[vend].dias.add(dtStr);
  });
  const arr = Object.values(mapa).map(r => ({
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
  ['fat', 'qtd', 'clientes', 'produtos', 'pedidos'].forEach(pontuar);
  arr.forEach(r => {
    r.score = (r.p_fat * 0.35) + (r.p_qtd * 0.20) + (r.p_clientes * 0.20) + (r.p_produtos * 0.15) + (r.p_pedidos * 0.10);
  });
  return arr.sort((a, b) => b.score - a.score);
}

function repPremiacaoTabelaTop(titulo, lista, campo, fmt) {
  const itens = Array.isArray(lista) ? lista.slice(0, 6) : [];
  const max = Math.max(1, ...itens.map(r => r[campo] || 0));
  const vazio = !itens.length ? '<tr><td colspan="4">Sem dados para este recorte.</td></tr>' : '';
  return `<div class="premio-card">
    <div class="premio-card-title">${repEsc(titulo)}</div>
    <table class="premio-table"><tbody>
      ${itens.map((r, i) => `<tr>
        <td class="premio-pos">${i + 1}</td>
        <td><strong>${repEsc((r.nome||'').toUpperCase())}</strong><span>${repEsc(r.tipo || 'Representante')}</span></td>
        <td>${campo === 'score'
          ? Number(r[campo] || 0).toFixed(1)
          : repMiniCell(r[campo] || 0, max)}</td>
        <td>${fmt ? fmt(r[campo] || 0, r) : repFmtFull(r[campo] || 0)}</td>
      </tr>`).join('')}
      ${vazio}
    </tbody></table>
  </div>`;
}

function repPremiacaoGanhosHtml(rows) {
  const arr = repPremiacaoCompetidores(rows);
  if (!arr.length) return '<div class="premio-card premio-full"><div class="premio-card-title">Relatórios de vencedores</div><p>Sem dados para calcular vencedores.</p></div>';
  const geral = arr[0];
  const porFat = [...arr].sort((a, b) => b.fat - a.fat);
  const porQtd = [...arr].sort((a, b) => b.qtd - a.qtd);
  const porClientes = [...arr].sort((a, b) => b.clientes - a.clientes);
  const porMix = [...arr].sort((a, b) => b.produtos - a.produtos);
  const porPedidos = [...arr].sort((a, b) => b.pedidos - a.pedidos);
  return `<div class="premio-card premio-full">
    <div class="premio-card-title">Relatórios de vencedores</div>
    <div class="premio-kpis">
      <div><span>1º geral</span><strong>${repEsc((geral?.nome || '-').toUpperCase())}</strong></div>
      <div><span>Score</span><strong>${(geral?.score || 0).toFixed(1)}</strong></div>
      <div><span>Maior faturamento</span><strong>${repEsc((porFat[0]?.nome || '-').toUpperCase())}</strong></div>
      <div><span>Maior quantidade</span><strong>${repEsc((porQtd[0]?.nome || '-').toUpperCase())}</strong></div>
    </div>
    <div class="premio-grid">
      ${repPremiacaoTabelaTop('Pontuação geral', arr, 'score', (v) => v.toFixed(1))}
      ${repPremiacaoTabelaTop('Maior faturamento', porFat, 'fat', fmtValor)}
      ${repPremiacaoTabelaTop('Maior quantidade', porQtd, 'qtd', fmtInt)}
      ${repPremiacaoTabelaTop('Mais clientes', porClientes, 'clientes', fmtInt)}
      ${repPremiacaoTabelaTop('Melhor mix', porMix, 'produtos', fmtInt)}
      ${repPremiacaoTabelaTop('Mais pedidos', porPedidos, 'pedidos', fmtInt)}
    </div>
  </div>`;
}

function repFiltrarRowsPremiacao(rows) {
  const lista = Array.isArray(rows) ? rows : [];
  if (window.REP_PREMIACAO_MODO !== 'atual') return lista;
  return lista.filter(r => repPremiacaoEhNomeFixo(r[IDX.vendedor]));
}

function repStorage() {
  try {
    return window.localStorage || null;
  } catch (e) {
    return null;
  }
}

function repRoletaEstadoPadrao() {
  return {
    itens: [],
    angulo: 0,
    ganhador: '',
    ultimoPremio: '',
    historico: []
  };
}

function repRoletaLerEstado() {
  const storage = repStorage();
  let estado = repRoletaEstadoPadrao();
  if (storage) {
    try {
      const raw = storage.getItem('resute_rep_roleta');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') estado = Object.assign(estado, parsed);
      }
    } catch (e) {}
  }
  estado.itens = Array.isArray(estado.itens)
    ? estado.itens.map(v => String(v || '').trim()).filter(Boolean)
    : [];
  estado.angulo = Number.isFinite(Number(estado.angulo)) ? Number(estado.angulo) : 0;
  estado.ganhador = String(estado.ganhador || '').trim();
  estado.ultimoPremio = String(estado.ultimoPremio || '').trim();
  estado.historico = Array.isArray(estado.historico)
    ? estado.historico.map(function(item) {
        return {
          ganhador: String(item?.ganhador || '').trim(),
          premio: String(item?.premio || '').trim(),
          data: String(item?.data || '').trim()
        };
      }).filter(function(item) {
        return item.ganhador || item.premio || item.data;
      })
    : [];
  return estado;
}

function repRoletaSalvarEstado(estado) {
  const storage = repStorage();
  if (!storage) return;
  try {
    storage.setItem('resute_rep_roleta', JSON.stringify({
      itens: estado.itens || [],
      angulo: Number(estado.angulo || 0),
      ganhador: String(estado.ganhador || '').trim(),
      ultimoPremio: String(estado.ultimoPremio || '').trim(),
      historico: Array.isArray(estado.historico) ? estado.historico : []
    }));
  } catch (e) {}
}

function repRoletaDataHoje() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function repRoletaRepresentantesSugestoes() {
  const base = Array.isArray(window.REP_PREMIACAO_FIXA) ? window.REP_PREMIACAO_FIXA.slice() : [];
  const rows = repPremiacaoRowsBase();
  rows.forEach(function(r) {
    const nome = String(r[IDX.vendedor] || '').trim();
    if (nome && !base.some(function(item) { return repNomeNormalizado(item) === repNomeNormalizado(nome); })) {
      base.push(nome);
    }
  });
  return base.sort(function(a, b) { return a.localeCompare(b); });
}

function repRoletaHistoricoHtml(estado) {
  const lista = Array.isArray(estado.historico) ? estado.historico : [];
  if (!lista.length) {
    return '<div class="premio-roleta-empty-list">Nenhum ganhador registrado ainda. Preencha nome, prêmio e data para montar o histórico.</div>';
  }
  return lista.map(function(item, idx) {
    return `<article class="roleta-history-item">
      <div class="roleta-history-main">
        <strong>${repEsc(item.ganhador || 'Sem nome')}</strong>
        <span>${repEsc(item.premio || 'Sem prêmio')}</span>
      </div>
      <div class="roleta-history-meta">
        <time>${repEsc(item.data || '-')}</time>
        <button type="button" onclick="repRoletaRemoverHistorico(${idx})" aria-label="Remover histórico">Remover</button>
      </div>
    </article>`;
  }).join('');
}

function repRoletaProdutosBase(rows) {
  const lista = [];
  const vistos = new Set();
  (Array.isArray(rows) ? rows : repDataRows()).forEach(r => {
    const prod = String(r[IDX.produto] || '').trim();
    if (!prod) return;
    const chave = repNomeNormalizado(prod);
    if (vistos.has(chave)) return;
    vistos.add(chave);
    lista.push(prod);
  });
  return lista;
}

function repRoletaGarantirSeed() {
  const estado = repRoletaLerEstado();
  if (estado.itens.length) return estado;
  estado.itens = repRoletaProdutosBase(repPremiacaoRows()).slice(0, 8);
  repRoletaSalvarEstado(estado);
  return estado;
}

function repRoletaItensAtuais() {
  return repRoletaGarantirSeed().itens;
}

function repRoletaFormatarItem(v) {
  return String(v || '').trim();
}

function repRoletaConicGradient(itens) {
  const paleta = ['#14746F', '#2DD4BF', '#059669', '#0D4F4F', '#D97706', '#7C3AED', '#DC2626', '#0A2F2F'];
  const n = Math.max(1, itens.length);
  const ang = 360 / n;
  return itens.map((_, i) => {
    const c = paleta[i % paleta.length];
    const a1 = i * ang;
    const a2 = (i + 1) * ang;
    return `${c} ${a1}deg ${a2}deg`;
  }).join(', ');
}

function repRoletaNomeAtual() {
  const input = document.getElementById('rep-roleta-ganhador-input');
  return String((input && input.value) || '').trim();
}

function repRoletaRecarregarArea() {
  repPremiacao();
}

function repRoletaImportarProdutos() {
  const estado = repRoletaLerEstado();
  estado.itens = repRoletaProdutosBase(repPremiacaoRows()).slice(0, 16);
  if (!estado.itens.length) estado.itens = [];
  if (!estado.angulo) estado.angulo = 0;
  repRoletaSalvarEstado(estado);
  repRoletaRecarregarArea();
}

function repRoletaAdicionarItem() {
  const input = document.getElementById('rep-roleta-produto-input');
  if (!input) return;
  const valor = String(input.value || '').trim();
  if (!valor) return;
  const estado = repRoletaLerEstado();
  const chave = repNomeNormalizado(valor);
  if (!estado.itens.some(item => repNomeNormalizado(item) === chave)) {
    estado.itens.push(valor);
  }
  repRoletaSalvarEstado(estado);
  input.value = '';
  repRoletaRecarregarArea();
}

function repRoletaRemoverItem(idx) {
  const estado = repRoletaLerEstado();
  estado.itens.splice(idx, 1);
  if (estado.ultimoPremio && !estado.itens.length) estado.ultimoPremio = '';
  repRoletaSalvarEstado(estado);
  repRoletaRecarregarArea();
}

function repRoletaLimparItens() {
  const estado = repRoletaLerEstado();
  estado.itens = [];
  estado.ultimoPremio = '';
  repRoletaSalvarEstado(estado);
  repRoletaRecarregarArea();
}

function repRoletaSalvarGanhador() {
  const input = document.getElementById('rep-roleta-ganhador-input');
  if (!input) return;
  const estado = repRoletaLerEstado();
  estado.ganhador = String(input.value || '').trim();
  repRoletaSalvarEstado(estado);
  repRoletaAtualizarResumo();
}

function repRoletaPreencherAtual() {
  const estado = repRoletaLerEstado();
  const premioInput = document.getElementById('rep-roleta-premio-input');
  const dataInput = document.getElementById('rep-roleta-data-input');
  if (premioInput) premioInput.value = estado.ultimoPremio || '';
  if (dataInput) dataInput.value = dataInput.value || repRoletaDataHoje();
}

function repRoletaAdicionarHistorico() {
  const ganhadorInput = document.getElementById('rep-roleta-ganhador-input');
  const premioInput = document.getElementById('rep-roleta-premio-input');
  const dataInput = document.getElementById('rep-roleta-data-input');
  if (!ganhadorInput || !premioInput || !dataInput) return;
  const ganhador = String(ganhadorInput.value || '').trim();
  const premio = String(premioInput.value || '').trim();
  const data = String(dataInput.value || '').trim();
  if (!ganhador || !premio || !data) {
    alert('Preencha nome, prêmio e data para adicionar ao histórico.');
    return;
  }
  const estado = repRoletaLerEstado();
  estado.ganhador = ganhador;
  estado.ultimoPremio = premio;
  estado.historico = Array.isArray(estado.historico) ? estado.historico : [];
  estado.historico.unshift({ ganhador, premio, data });
  estado.historico = estado.historico.slice(0, 30);
  repRoletaSalvarEstado(estado);
  repRoletaRecarregarArea();
}

function repRoletaRemoverHistorico(idx) {
  const estado = repRoletaLerEstado();
  estado.historico = Array.isArray(estado.historico) ? estado.historico : [];
  estado.historico.splice(idx, 1);
  repRoletaSalvarEstado(estado);
  repRoletaRecarregarArea();
}

function repRoletaHtml() {
  const estado = repRoletaGarantirSeed();
  const itens = estado.itens;
  const ang = itens.length ? 360 / itens.length : 0;
  const ativo = estado.ultimoPremio || itens[0] || '';
  const reps = repRoletaRepresentantesSugestoes();
  const repsOptions = reps.map(function(nome) {
    return `<option value="${repEsc(nome)}"></option>`;
  }).join('');
  const labels = itens.map((item, i) => {
    const rot = (i * ang) + (ang / 2);
    return `<span class="roleta-label" style="transform: rotate(${rot}deg) translateY(-128px) rotate(${-rot}deg);">${repEsc(item)}</span>`;
  }).join('');
  const chips = itens.map((item, idx) => `<div class="roleta-chip">
    <span>${repEsc(item)}</span>
    <button type="button" onclick="repRoletaRemoverItem(${idx})" aria-label="Remover">x</button>
  </div>`).join('');

  return `<div class="premio-roleta-wrap premio-roleta-wrap-updated">
    <div class="premio-roleta-card">
      <div class="premio-roleta-head">
        <div>
          <div class="premio-card-title">Roleta animada de premios</div>
          <p class="premio-roleta-sub">Sorteie o premio, destaque o ganhador e mantenha o historico sempre organizado.</p>
        </div>
        <span class="premio-roleta-badge">Premiacao atual</span>
      </div>
      <div class="premio-roleta-stage">
        <div class="premio-roleta-pointer"></div>
        <div class="premio-roleta-wheel" id="rep-roleta-wheel" style="transform: rotate(${Number(estado.angulo || 0)}deg); ${itens.length ? `background: conic-gradient(${repRoletaConicGradient(itens)});` : 'background: radial-gradient(circle at center, #14746F, #0A2F2F);'}">
          ${labels || '<span class="roleta-empty">Adicione produtos para liberar a roleta.</span>'}
          <div class="premio-roleta-center" id="rep-roleta-center" style="transform: translate(-50%, -50%) rotate(${-Number(estado.angulo || 0)}deg);">
            <span>RESUTE</span>
            <strong>Gire para sortear</strong>
          </div>
        </div>
      </div>
      <div class="premio-roleta-actions">
        <button type="button" class="premio-roleta-btn primary" onclick="repRoletaSortear()">Girar roleta</button>
        <button type="button" class="premio-roleta-btn" onclick="repRoletaImportarProdutos()">Importar produtos do recorte</button>
        <button type="button" class="premio-roleta-btn" onclick="repRoletaLimparItens()">Limpar produtos</button>
      </div>
      <div class="premio-roleta-highlight">
        <article class="premio-roleta-highlight-card">
          <span>Ultimo premio</span>
          <strong id="rep-roleta-ultimo">${repEsc(ativo || 'Sem sorteio')}</strong>
        </article>
        <article class="premio-roleta-highlight-card">
          <span>Representante</span>
          <strong id="rep-roleta-ganhador-text">${repEsc(estado.ganhador || 'nao definido')}</strong>
        </article>
        <article class="premio-roleta-highlight-card">
          <span>Itens ativos</span>
          <strong id="rep-roleta-count">${itens.length}</strong>
        </article>
      </div>
      <div id="rep-roleta-celebration" class="premio-roleta-celebration" hidden></div>
    </div>
    <div class="premio-roleta-side">
      <div class="premio-card-title">Representante e historico</div>
      <p class="premio-roleta-side-sub">Defina o ganhador, registre a data do premio e mantenha os ultimos sorteios visiveis.</p>
      <datalist id="rep-roleta-reps">${repsOptions}</datalist>
      <label class="premio-roleta-field">
        <span>Nome do representante</span>
        <input id="rep-roleta-ganhador-input" type="text" value="${repEsc(estado.ganhador || '')}" placeholder="Digite o nome do ganhador" list="rep-roleta-reps">
      </label>
      <label class="premio-roleta-field">
        <span>Premio registrado</span>
        <input id="rep-roleta-premio-input" type="text" value="${repEsc(estado.ultimoPremio || '')}" placeholder="Digite ou use o premio sorteado">
      </label>
      <label class="premio-roleta-field">
        <span>Data do premio</span>
        <input id="rep-roleta-data-input" type="date" value="${repEsc(repRoletaDataHoje())}">
      </label>
      <div class="premio-roleta-actions premio-roleta-actions-side">
        <button type="button" class="premio-roleta-save" onclick="repRoletaSalvarGanhador()">Salvar representante</button>
        <button type="button" class="premio-roleta-btn" onclick="repRoletaPreencherAtual()">Usar ultimo sorteio</button>
        <button type="button" class="premio-roleta-btn primary" onclick="repRoletaAdicionarHistorico()">Adicionar ao historico</button>
      </div>
      <div class="premio-card-title premio-roleta-title-gap">Historico de ganhadores</div>
      <div class="premio-roleta-history" id="rep-roleta-history">
        ${repRoletaHistoricoHtml(estado)}
      </div>
      <div class="premio-card-title premio-roleta-title-gap">Produtos da roleta</div>
      <div class="premio-roleta-add">
        <input id="rep-roleta-produto-input" type="text" placeholder="Adicionar produto ou premio">
        <button type="button" onclick="repRoletaAdicionarItem()">Adicionar</button>
      </div>
      <div class="premio-roleta-list" id="rep-roleta-list">
        ${chips || '<div class="premio-roleta-empty-list">Sem produtos cadastrados. Use o recorte atual ou adicione manualmente.</div>'}
      </div>
    </div>
  </div>`;
}

function repRoletaAtualizarResumo() {
  const estado = repRoletaLerEstado();
  const count = document.getElementById('rep-roleta-count');
  if (count) count.textContent = String(estado.itens.length);
  const ganhador = document.getElementById('rep-roleta-ganhador-text');
  if (ganhador) ganhador.textContent = estado.ganhador || 'nao definido';
  const ultimo = document.getElementById('rep-roleta-ultimo');
  if (ultimo && estado.ultimoPremio) ultimo.textContent = estado.ultimoPremio;
  const premioInput = document.getElementById('rep-roleta-premio-input');
  if (premioInput && !String(premioInput.value || '').trim() && estado.ultimoPremio) {
    premioInput.value = estado.ultimoPremio;
  }
}

function repRoletaCelebracaoHtml(premio, ganhador) {
  const confetes = new Array(18).fill('').map(function(_, idx) {
    return `<span class="premio-roleta-confetti c${(idx % 6) + 1}" style="--i:${idx};"></span>`;
  }).join('');
  return `<div class="premio-roleta-celebration-backdrop"></div>
    <div class="premio-roleta-celebration-burst">${confetes}</div>
    <div class="premio-roleta-celebration-card">
      <button type="button" class="premio-roleta-celebration-close" onclick="repRoletaFecharCelebracao()" aria-label="Fechar">x</button>
      <div class="premio-roleta-celebration-kicker">Premio confirmado</div>
      <h3>${repEsc(ganhador || 'Representante definido')}</h3>
      <p>Ganhou <strong>${repEsc(premio || 'Premio sorteado')}</strong></p>
      <div class="premio-roleta-celebration-note">Registre o ganhador no historico para manter a premiacao organizada.</div>
    </div>`;
}

function repRoletaCelebrar(premio, ganhador) {
  const box = document.getElementById('rep-roleta-celebration');
  if (!box) return;
  box.innerHTML = repRoletaCelebracaoHtml(premio, ganhador);
  box.hidden = false;
  requestAnimationFrame(function() {
    box.classList.add('active');
  });
}

function repRoletaFecharCelebracao() {
  const box = document.getElementById('rep-roleta-celebration');
  if (!box) return;
  box.classList.remove('active');
  setTimeout(function() {
    box.hidden = true;
    box.innerHTML = '';
  }, 260);
}

function repRoletaSortear() {
  const estado = repRoletaLerEstado();
  const itens = estado.itens;
  if (!itens.length) {
    alert('Adicione ao menos um produto para girar a roleta.');
    return;
  }
  const wheel = document.getElementById('rep-roleta-wheel');
  if (!wheel) return;
  if (wheel.dataset.spinning === '1') return;
  const resultado = document.getElementById('rep-roleta-ultimo');
  const count = itens.length;
  const chosen = Math.floor(Math.random() * count);
  const segmento = 360 / count;
  const atual = Number(estado.angulo || 0);
  const giros = 16 + Math.floor(Math.random() * 4);
  const anguloAlvo = 360 - (chosen * segmento + (segmento / 2));
  const atualNormalizado = ((atual % 360) + 360) % 360;
  const delta = ((anguloAlvo - atualNormalizado) + 360) % 360;
  const novoAngulo = atual + (giros * 360) + delta;
  const centro = document.getElementById('rep-roleta-center');
  const nomeAtual = repRoletaNomeAtual();
  if (nomeAtual) estado.ganhador = nomeAtual;
  wheel.classList.add('is-spinning');
  wheel.style.transition = 'transform 6.4s cubic-bezier(.11,.82,.15,1)';
  wheel.style.transform = `rotate(${novoAngulo}deg)`;
  if (centro) {
    centro.style.transition = 'transform 6.4s cubic-bezier(.11,.82,.15,1)';
    centro.style.transform = `translate(-50%, -50%) rotate(${-novoAngulo}deg)`;
  }
  wheel.dataset.spinning = '1';
  setTimeout(() => {
    estado.angulo = novoAngulo;
    estado.ultimoPremio = itens[chosen];
    repRoletaSalvarEstado(estado);
    if (resultado) resultado.textContent = itens[chosen];
    repRoletaAtualizarResumo();
    repRoletaPreencherAtual();
    wheel.dataset.spinning = '0';
    wheel.classList.remove('is-spinning');
    repRoletaCelebrar(itens[chosen], estado.ganhador || 'Representante a definir');
    setTimeout(() => {
      wheel.style.transition = '';
      if (centro) centro.style.transition = '';
    }, 80);
  }, 6500);
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
  const opts = repUnique(campo).map(v => `<option value="${repEsc(v)}" ${v===atual?'selected':''}>${repEsc((v||'').toUpperCase())}</option>`).join('');
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
      <button class="rel-toggle-btn ${REP_MODO==='valor'?'active':''}" onclick="repToggleModo('valor')">VALOR</button>
      <button class="rel-toggle-btn ${REP_MODO==='qtd'?'active':''}" onclick="repToggleModo('qtd')">QTD</button>
    </div>
    ${repFilterHtml()}
  </div>`;
}

// ── INICIALIZA TODOS ──────────────────────────────────────────────────────────
function repMensalDisponiveis() {
  const anos = new Set();
  const vendedores = new Set();
  const filtro = window.REP_MENSAL_FILTER || {};

  repBaseRows().forEach(row => {
    const dt = repParseDate(String(row[IDX.saida] || row[IDX.emissao] || '').trim());
    if (!dt) return;
    anos.add(dt.getFullYear());
  });

  const anosLista = Array.from(anos).sort((a, b) => b - a);
  const anoAtivo = Number(filtro.ano || anosLista[0] || new Date().getFullYear());

  repBaseRows().forEach(row => {
    const dt = repParseDate(String(row[IDX.saida] || row[IDX.emissao] || '').trim());
    if (!dt || dt.getFullYear() !== anoAtivo) return;
    const vendedor = String(row[IDX.vendedor] || '').trim();
    if (vendedor) vendedores.add(vendedor);
  });

  return {
    anos: anosLista,
    anoAtivo,
    vendedores: Array.from(vendedores).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  };
}

function repMensalFiltroAtual() {
  window.REP_MENSAL_FILTER = window.REP_MENSAL_FILTER || { ano: '', vendedores: [], ocultarVazios: true };
  const filtro = window.REP_MENSAL_FILTER;
  if (!Array.isArray(filtro.vendedores)) {
    filtro.vendedores = filtro.vendedor ? [String(filtro.vendedor)] : [];
  }
  if (typeof filtro.ocultarVazios !== 'boolean') filtro.ocultarVazios = true;
  return filtro;
}

function repMensalSetFiltro(campo, valor) {
  const filtro = repMensalFiltroAtual();
  if (campo === 'ocultarVazios') {
    filtro.ocultarVazios = Boolean(valor);
  } else {
    filtro[campo] = valor || '';
  }
  if (campo === 'ano') filtro.vendedores = [];
  repMensalRep();
}

function repMensalToggleVendedor(valor, checked) {
  if (!valor) return;
  const filtro = repMensalFiltroAtual();
  const atual = new Set((filtro.vendedores || []).map(String));
  if (checked) atual.add(String(valor));
  else atual.delete(String(valor));
  filtro.vendedores = Array.from(atual);
  repMensalRep();
}

function repMensalSelecionarTodosVendedores() {
  const info = repMensalDisponiveis();
  const filtro = repMensalFiltroAtual();
  filtro.vendedores = [...info.vendedores];
  repMensalRep();
}

function repMensalLimparVendedores() {
  const filtro = repMensalFiltroAtual();
  filtro.vendedores = [];
  repMensalRep();
}

function repMensalFmtNumero(v) {
  const n = Number(v) || 0;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.round(n));
}

function repMensalFmtPercent(v) {
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}%`;
}

function repMensalSpark(values) {
  const lista = Array.isArray(values) ? values.map(v => Number(v) || 0) : [];
  const max = Math.max(0, ...lista);
  if (!max) return '<span class="rep-mensal-graf-empty">-</span>';
  const width = 92;
  const height = 28;
  const step = lista.length > 1 ? width / (lista.length - 1) : width;
  const points = lista.map((v, i) => {
    const x = Math.round(i * step);
    const y = Math.round(height - ((v / max) * (height - 4)) - 2);
    return `${x},${y}`;
  }).join(' ');
  return `<svg class="rep-mensal-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="#14746F" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>`;
}

function _repMensalDropdownAberto() {
  return window._repMensalDropOpen === true;
}

function repMensalToggleDropdown() {
  window._repMensalDropOpen = !_repMensalDropdownAberto();
  var panel = document.getElementById('rep-mensal-drop-panel');
  if (panel) panel.style.display = window._repMensalDropOpen ? 'block' : 'none';
  var chevron = document.getElementById('rep-mensal-drop-chevron');
  if (chevron) chevron.textContent = window._repMensalDropOpen ? '▲' : '▼';
}

function repMensalBuscaRep(query) {
  var items = document.querySelectorAll('#rep-mensal-drop-panel .rep-mensal-check');
  var q = (query || '').trim().toUpperCase();
  items.forEach(function(label) {
    var texto = label.textContent.toUpperCase();
    label.style.display = (!q || texto.indexOf(q) >= 0) ? '' : 'none';
  });
}

function repMensalRep() {
  const el = document.getElementById('rep-tab-mensal');
  if (!el) return;

  const mesesFull = ['JANEIRO','FEVEREIRO','MARCO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  const info = repMensalDisponiveis();
  const filtro = repMensalFiltroAtual();
  const anoAtivo = info.anoAtivo;
  const vendedoresAtivos = new Set((filtro.vendedores || []).map(String));
  const ocultarVazios = filtro.ocultarVazios !== false;

  const totalReps = info.vendedores.length;
  const selCount = vendedoresAtivos.size;
  const selLabel = selCount === 0 ? 'Todos (' + totalReps + ')' : selCount + ' de ' + totalReps + ' selecionados';
  const dropAberto = _repMensalDropdownAberto();

  const anoOptions = info.anos.map(ano => `<option value="${ano}" ${String(ano) === String(anoAtivo) ? 'selected' : ''}>${ano}</option>`).join('');
  const vendedorChecks = info.vendedores.map(v => `<label class="rep-mensal-check"><input type="checkbox" data-vendedor="${repEsc(v)}" ${vendedoresAtivos.has(v) ? 'checked' : ''} onchange="repMensalToggleVendedor(this.dataset.vendedor, this.checked)"><span>${repEsc((v||'').toUpperCase())}</span></label>`).join('');

  const headerHtml = `<div class="rel-header-bar rep-mensal-bar"><div class="rel-title">VENDAS MENSAIS POR REPRESENTANTE EM ${anoAtivo}</div><div class="rep-mensal-filter-row"><label class="rep-filter-field"><span>Ano</span><select onchange="repMensalSetFiltro('ano', this.value)">${anoOptions}</select></label><label class="rep-filter-field rep-mensal-toggle"><span>Meses</span><button type="button" class="rel-toggle-btn ${ocultarVazios ? 'active' : ''}" onclick="repMensalSetFiltro('ocultarVazios', ${!ocultarVazios})">${ocultarVazios ? 'Ocultar vazios' : 'Mostrar todos'}</button></label></div></div>`;

  const repsFilterHtml = `<div class="rep-mensal-subfilters" data-export-ignore="true">
    <div class="rep-mensal-dropdown-header" onclick="repMensalToggleDropdown()">
      <span class="rep-mensal-dropdown-label">Representantes</span>
      <span class="rep-mensal-dropdown-badge">${selLabel}</span>
      <span id="rep-mensal-drop-chevron" class="rep-mensal-dropdown-chevron">${dropAberto ? '▲' : '▼'}</span>
    </div>
    <div id="rep-mensal-drop-panel" class="rep-mensal-dropdown-panel" style="display:${dropAberto ? 'block' : 'none'}">
      <div class="rep-mensal-dropdown-toolbar">
        <input type="text" class="rep-mensal-search" placeholder="Buscar representante..." oninput="repMensalBuscaRep(this.value)">
        <div class="rep-mensal-actions">
          <button type="button" class="rel-toggle-btn" onclick="repMensalSelecionarTodosVendedores()">Todos</button>
          <button type="button" class="rel-toggle-btn" onclick="repMensalLimparVendedores()">Limpar</button>
        </div>
      </div>
      <div class="rep-mensal-checklist">${vendedorChecks || '<span class="rep-mensal-check-empty">Sem representantes</span>'}</div>
    </div>
  </div>`;

  const rows = repBaseRows().filter(row => {
    const dt = repParseDate(String(row[IDX.saida] || row[IDX.emissao] || '').trim());
    if (!dt || dt.getFullYear() !== anoAtivo) return false;
    const vendedor = String(row[IDX.vendedor] || '').trim();
    if (vendedoresAtivos.size && !vendedoresAtivos.has(vendedor)) return false;
    return true;
  });

  if (!rows.length) {
    el.innerHTML = `${headerHtml}${repsFilterHtml}<div class="av-rel-placeholder"><p>Sem dados para este recorte</p><span>Escolha outro ano ou ajuste os representantes marcados.</span></div>`;
    return;
  }

  const reps = {};
  const totalMes = Array(12).fill(0);
  rows.forEach(row => {
    const dt = repParseDate(String(row[IDX.saida] || row[IDX.emissao] || '').trim());
    const vendedor = String(row[IDX.vendedor] || '').trim() || 'Sem representante';
    const valor = typeof parseSmartNumber === 'function' ? parseSmartNumber(row[IDX.valor]) : (Number(row[IDX.valor]) || 0);
    if (!reps[vendedor]) reps[vendedor] = { nome: vendedor, meses: Array(12).fill(0), total: 0 };
    reps[vendedor].meses[dt.getMonth()] += valor;
    reps[vendedor].total += valor;
    totalMes[dt.getMonth()] += valor;
  });

  const lista = Object.values(reps).sort((a, b) => b.total - a.total);
  const totalGeral = totalMes.reduce((s, v) => s + v, 0);
  const mesesIdx = ocultarVazios ? totalMes.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0) : totalMes.map((_, i) => i);
  const mesesVisiveis = mesesIdx.length ? mesesIdx : totalMes.map((_, i) => i);
  const mediaMensal = totalGeral / Math.max(1, mesesVisiveis.length);
  const shareMes = totalMes.map(v => totalGeral ? (v / totalGeral) * 100 : 0);
  const evolMes = totalMes.map((v, i) => {
    if (!i) return null;
    const anterior = totalMes[i - 1];
    if (!anterior) return null;
    return ((v - anterior) / anterior) * 100;
  });

  let html = `${headerHtml}${repsFilterHtml}`;
  html += `<div class="rep-scroll-area rep-mensal-wrap"><table class="rep-tbl rep-mensal-table"><thead><tr><td rowspan="2" class="rep-mensal-col-rep">REPRESENTANTE</td><td colspan="${mesesVisiveis.length}">TOTAIS MENSAIS</td><td rowspan="2" class="rep-mensal-col-med">MED</td><td rowspan="2" class="rep-mensal-col-total">TOTAL</td><td rowspan="2" class="rep-mensal-col-share">%</td><td rowspan="2" class="rep-mensal-col-graf">Graf.</td></tr><tr>${mesesVisiveis.map(i => `<td>${mesesFull[i]}</td>`).join('')}</tr></thead><tbody>`;

  lista.forEach(item => {
    const mesesAtivos = item.meses.filter(v => v > 0).length || 1;
    const med = item.total / mesesAtivos;
    const share = totalGeral ? (item.total / totalGeral) * 100 : 0;
    html += `<tr><td class="rep-mensal-rep-name">${repEsc((item.nome||'').toUpperCase())}</td>${mesesVisiveis.map(i => `<td class="rep-mensal-num">${repMensalFmtNumero(item.meses[i])}</td>`).join('')}<td class="rep-mensal-med">${repMensalFmtNumero(med)}</td><td class="rep-mensal-total">${repMensalFmtNumero(item.total)}</td><td class="rep-mensal-share">${repMensalFmtPercent(share)}</td><td class="rep-mensal-graf">${repMensalSpark(mesesVisiveis.map(i => item.meses[i]))}</td></tr>`;
  });

  html += `<tr class="rep-row-total rep-mensal-total-row"><td>TOTAL</td>${mesesVisiveis.map(i => `<td>${repMensalFmtNumero(totalMes[i])}</td>`).join('')}<td>${repMensalFmtNumero(mediaMensal)}</td><td>${repMensalFmtNumero(totalGeral)}</td><td>100%</td><td>${repMensalSpark(mesesVisiveis.map(i => totalMes[i]))}</td></tr>`;
  html += `<tr class="rep-mensal-foot-row"><td>% DO TOTAL</td>${mesesVisiveis.map(i => `<td>${repMensalFmtPercent(shareMes[i])}</td>`).join('')}<td>-</td><td>100%</td><td>-</td><td>-</td></tr>`;
  html += `<tr class="rep-mensal-foot-row"><td>% EVOLUCAO MES</td>${mesesVisiveis.map(i => { if (!i || evolMes[i] == null) return '<td>-</td>'; const valor = evolMes[i]; const cls = valor >= 0 ? 'up' : 'down'; const seta = valor >= 0 ? '▲' : '▼'; return `<td class="rep-mensal-evol ${cls}">${seta} ${repMensalFmtPercent(Math.abs(valor))}</td>`; }).join('')}<td>-</td><td>-</td><td>-</td><td>-</td></tr>`;
  html += `</tbody></table></div>`;
  el.innerHTML = html;
}

function repUpdateAll() {
  if (typeof garantirAbaPremiacaoRepresentantes === 'function') {
    garantirAbaPremiacaoRepresentantes();
  }
  if (!BD_DATA || !BD_DATA.rows.length) {
    ['mix','positiv','semano','sem','meta','dia','cresc','mensal','premiacao'].forEach(k => {
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
    repMensalRep();
    return;
  }
  repMix();
  repPositiv();
  repSemAno();
  repSem();
  repMeta();
  repDia();
  repCrescMes();
  repMensalRep();
  repPremiacao();
}

function repRenderTab(tabId) {
  if (typeof garantirAbaPremiacaoRepresentantes === 'function') {
    garantirAbaPremiacaoRepresentantes();
  }
  if (!BD_DATA || !BD_DATA.rows.length) return;
  const map = {
    'rep-tab-mix':     repMix,
    'rep-tab-positiv': repPositiv,
    'rep-tab-sem':     repSem,
    'rep-tab-meta':    repMeta,
    'rep-tab-dia':     repDia,
    'rep-tab-cresc':   repCrescMes,
    'rep-tab-mensal':  repMensalRep,
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
        <td>MEDIA</td><td>TOTAL MIX</td>
      </tr></thead><tbody>`;

    const maxDia = Math.max(1, ...Object.values(semanas[chave]).flat());

    vendedores.forEach(vend => {
      const dias7 = semanas[chave][vend] || Array(7).fill(0);
      const tot = dias7.reduce((s,v)=>s+v,0);
      if (tot === 0) return;
      const ativos = dias7.filter(v=>v>0);
      const media  = ativos.length ? tot/ativos.length : 0;
      html += `<tr>
        <td colspan="2" class="rep-lbl">${vend.toUpperCase()}</td>
        ${dias7.map(v=>`<td>${repMiniCell(v, maxDia)}</td>`).join('')}
        <td>${repMiniCell(media, maxDia)}</td>
        <td class="rep-total-cell">${repMiniCell(tot, Math.max(1, tot))}</td>
      </tr>`;
    });

    // Totais da semana
    const totSemana = Array(7).fill(0);
    vendedores.forEach(v => { const d=semanas[chave][v]||Array(7).fill(0); d.forEach((vv,i)=>totSemana[i]+=vv); });
    html += `<tr class="rep-row-total">
      <td colspan="2">TOTAL</td>
      ${totSemana.map(v=>`<td>${repMiniCell(v, Math.max(1, ...totSemana))}</td>`).join('')}
      <td colspan="2"></td>
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
      <td class="rep-lbl">${vend.toUpperCase()}</td>
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

  const pivot = {};
  vendedores.forEach(v => { pivot[v] = {}; SEMS.forEach(s=>{pivot[v][s]=0;}); });

  repDataRows().forEach(r => {
    const vend = String(r[IDX.vendedor]||'').trim();
    const dtStr = String(r[IDX.saida]||r[IDX.emissao]||'').trim();
    const dt = repParseDate(dtStr);
    if (!vend || !dt || !pivot[vend]) return;
    const sem = repGetSemanaDoMes(dt);
    if (String(r[IDX.ano]||'')=== anoAtual && dt.getMonth()===mesAtual)
      pivot[vend][sem] += repVal(r);
  });

  let totalGeral = 0;
  const totVend = {};
  vendedores.forEach(v => { totVend[v]=SEMS.reduce((s,sem)=>s+pivot[v][sem],0); totalGeral+=totVend[v]; });
  const maxSem = Math.max(1, ...vendedores.flatMap(v => SEMS.map(s => pivot[v][s])), ...Object.values(totVend));

  let html = `<div class="rel-header-bar">
    ${repToggleHtml()}
    <div class="rel-title">VENDAS ${MES_LABEL_PT[mesAtual].toUpperCase()} ${anoAtual} — SEMANAL</div>
  </div><div class="rep-scroll-area"><table class="rep-tbl"><thead>
    <tr class="rep-th-semana">
      <td>REPRESENTANTE</td>
      ${SEMS.map(s=>`<td>${s}</td>`).join('')}
      <td>MED</td><td>Total</td><td>%</td>
    </tr>
  </thead><tbody>`;

  vendedores.forEach(vend => {
    const tot = totVend[vend];
    if (tot === 0) return;
    const ativos = SEMS.filter(s=>pivot[vend][s]>0).length;
    const media = ativos > 0 ? tot/ativos : 0;
    html += `<tr>
      <td class="rep-lbl">${vend.toUpperCase()}</td>
      ${SEMS.map(s=>`<td>${repMiniCell(pivot[vend][s], maxSem)}</td>`).join('')}
      <td>${repMiniCell(media, maxSem)}</td>
      <td class="rep-total-cell">${repFmtFull(tot)}</td>
      <td>${repShareCell(tot, totalGeral)}</td>
    </tr>`;
  });

  // TOTAL linha
  const totSems = SEMS.map(s=>vendedores.reduce((sum,v)=>sum+pivot[v][s],0));
  html += `<tr class="rep-row-total">
    <td>TOTAL</td>
    ${totSems.map(v=>`<td>${repMiniCell(v, Math.max(1, ...totSems))}</td>`).join('')}
    <td></td><td class="rep-total-cell">${repFmtFull(totalGeral)}</td>
    <td>100%</td>
  </tr>
  <tr class="rep-row-pct">
    <td>% DO TOTAL</td>
    ${totSems.map(v=>`<td>${totalGeral>0?(v/totalGeral*100).toFixed(1)+'%':'-'}</td>`).join('')}
    <td colspan="3"></td>
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
      <td class="rep-lbl">${vend.toUpperCase()}</td>
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
      <td class="rep-lbl">${vend.toUpperCase()}</td>
      ${mesesAtivos.map(m=>`<td>${repMiniCell(pivot[vend][m], maxCresc)}</td>`).join('')}
      <td>${repMiniCell(media, maxCresc)}</td>
      <td class="rep-total-cell">${repFmtFull(tot)}</td>
      <td>${repShareCell(tot, totalGeral)}</td>
      <td style="color:#DC2626">${nQueda}</td>
      <td style="color:#059669">${nCresc}</td>
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
      const cor=ev>=0?'#059669':'#DC2626';
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

  // Combina dados de empresas selecionadas para merge
  const mergeIds = window.REP_MERGE_EMPRESAS || [];
  const cache = window.REP_EMPRESAS_CACHE || {};
  const temMerge = mergeIds.some(function(id) { return !!cache[id]; });
  const baseRows = temMerge
    ? repFiltrarRowsPremiacao(repPremiacaoBaseRowsMerged())
    : repPremiacaoRowsBase();

  const rows = repPremiacaoAplicarFiltroPeriodo(baseRows);
  const mergeHtml = repPremiacaoEmpresasMergeHtml();

  if (!rows.length) {
    el.innerHTML = `${mergeHtml}<div class="av-rel-placeholder"><p>Sem dados para premiação</p><span>Sincronize as vendas ou ajuste o período/campanha selecionado.</span></div>`;
    return;
  }

  el.innerHTML = `<div class="rel-header-bar premio-header">
    ${repToggleHtml()}
    <div class="rel-title">PREMIAÇÃO DOS REPRESENTANTES</div>
  </div>
  ${mergeHtml}
  <div class="rel-inline-tabs premio-inline-tabs">
    <button class="rel-inline-tab ${window.REP_PREMIACAO_MODO === 'geral' ? 'active' : ''}" onclick="repPremiacaoModo('geral')">Premiação geral</button>
    <button class="rel-inline-tab ${window.REP_PREMIACAO_MODO === 'atual' ? 'active' : ''}" onclick="repPremiacaoModo('atual')">Premiação atual</button>
  </div>
  ${repPremiacaoCampanhasHtml(baseRows)}
  ${repPremiacaoFiltroHtml(baseRows)}
  ${repPremiacaoResumoHtml(rows)}
  ${repPremiacaoRelatorioHtml(rows, baseRows)}
  ${window.REP_PREMIACAO_MODO === 'atual' ? repRoletaHtml() : ''}
  <div class="premio-campanha-foot">
    <div class="premio-campanha-alert">
      <strong>Modo ativo:</strong> ${repEsc(repPremiacaoCampanhaAtual().titulo)} · <strong>Período:</strong> ${repEsc(repPremiacaoPeriodoSelecionado(baseRows))}
      ${temMerge ? ` · <strong>Empresas:</strong> ${1 + mergeIds.filter(function(id){return !!cache[id];}).length} combinadas` : ''}
    </div>
    ${window.REP_PREMIACAO_MODO === 'atual'
      ? `<div class="premio-campanha-alert muted">A disputa atual usa somente Anderson de Lessa Costa, Pedro Henrique Santos Sales e Wedna Rosa de Souza.</div>`
      : `<div class="premio-campanha-alert muted">Troque para <strong>Premiação atual</strong> para ver a disputa dos 3 representantes fixos.</div>`}
  </div>`;
  return;
  const rowsLegacy = repFiltrarRowsPremiacao(repDataRows());
  if (false && !rows.length) {
    el.innerHTML = `<div class="av-rel-placeholder"><p>Sem dados para premiação</p><span>Altere os filtros ou sincronize vendas para gerar rankings.</span></div>`;
    return;
  }

  const reps = {};
  rows.forEach(r => {
    const vend = String(r[IDX.vendedor]||'').trim() || 'Sem representante';
    if (!reps[vend]) reps[vend] = { nome: vend, fat:0, qtd:0, pedidos:new Set(), clientes:new Set(), produtos:new Set(), dias:new Set() };
    const dtStr = String(r[IDX.saida]||r[IDX.emissao]||'').trim();
    reps[vend].fat += (typeof parseSmartNumber === 'function' ? parseSmartNumber(r[IDX.valor]) : (Number(r[IDX.valor]) || 0));
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
      mapa[vend].fat += (typeof parseSmartNumber === 'function' ? parseSmartNumber(r[IDX.valor]) : (Number(r[IDX.valor]) || 0));
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

  function moeda(v) { return fmtValor(v); }
  function rankingTable(titulo, lista, campo, fmt) {
    const max = Math.max(1, ...lista.map(r=>r[campo] || 0));
    return `<div class="premio-card"><div class="premio-card-title">${titulo}</div><table class="premio-table"><tbody>
      ${lista.map((r,i)=>`<tr>
        <td class="premio-pos">${i+1}</td>
        <td><strong>${repEsc((r.nome||'').toUpperCase())}</strong><span>${repEsc(r.tipo || 'Representante')}</span></td>
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
          <td><strong>${repEsc((r.nome||'').toUpperCase())}</strong><span>${r.pedidos} pedidos · ${r.clientes} clientes · ${r.produtos} produtos</span></td>
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
            <td class="rep-lbl">${repEsc(vend.toUpperCase())}</td>
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
  ${window.REP_PREMIACAO_MODO === 'atual' ? repRoletaHtml() : ''}
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
      <strong>${repEsc((geral[0]?.nome || '-').toUpperCase())}</strong>
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
        <td class="premio-pos">${i+1}</td><td class="rep-lbl">${repEsc((r.nome||'').toUpperCase())}</td><td>${repEsc(r.tipo)}</td>
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
      datasets: [{ data: geral.slice(0,8).map(r=>Number(r.score.toFixed(1))), backgroundColor:'#14746F', borderRadius:8 }]
    },
    options: { responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{ticks:{color:'#5A7A74'},grid:{color:'#D5EDE8'}},y:{ticks:{color:'#5A7A74'},grid:{display:false}}} }
  });
  const fatCtx = document.getElementById('rep-premio-fat');
  if (fatCtx) new Chart(fatCtx, {
    type: 'doughnut',
    data: {
      labels: porFat.slice(0,6).map(r=>r.nome),
      datasets: [{ data: porFat.slice(0,6).map(r=>r.fat), backgroundColor:['#14746F','#2DD4BF','#059669','#0D4F4F','#D97706','#7C3AED'], borderWidth:0 }]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'right', labels:{color:'#5A7A74', boxWidth:10, font:{size:10}}}} }
  });
}

// Helper: tipo do representante
function repGetTipo(nome) {
  const data = window.GRID_DATA_STORE?.representantes || [];
  const row = data.find(r => String(r[2]||'').trim() === nome);
  return row ? String(row[3]||'').trim() : 'REPRESENTANTE';
}

function repPremiacaoNomeFixoBase(nome) {
  const atual = repNomeNormalizado(nome);
  const lista = Array.isArray(window.REP_PREMIACAO_FIXA) ? window.REP_PREMIACAO_FIXA : [];
  for (let i = 0; i < lista.length; i++) {
    const item = String(lista[i] || '').trim();
    const normalizado = repNomeNormalizado(item);
    if (!normalizado) continue;
    if (atual === normalizado || atual.includes(normalizado) || normalizado.includes(atual)) return item;
  }
  return String(nome || '').trim() || 'Sem representante';
}

function repPremiacaoAnoReferencia(rows) {
  const lista = Array.isArray(rows) && rows.length ? rows : repPremiacaoRowsBase();
  const campo = repPremiacaoPeriodoCampo(repPremiacaoCampanhaAtual().id);
  const filtro = window.REP_PREMIACAO_FILTRO || {};
  const fallback = repPremiacaoPeriodoAtual(lista);

  if (campo === 'semana') {
    const chave = String(filtro.semana || repPremiacaoChavePadrao('semana', fallback) || '');
    const ano = Number(chave.slice(0, 4));
    if (Number.isFinite(ano)) return ano;
  }
  if (campo === 'mes') {
    const chave = String(filtro.mes || repPremiacaoChavePadrao('mes', fallback) || '');
    const ano = Number(chave.slice(0, 4));
    if (Number.isFinite(ano)) return ano;
  }
  if (campo === 'trimestre') {
    const chave = String(filtro.trimestre || repPremiacaoChavePadrao('trimestre', fallback) || '');
    const ano = Number(chave.slice(0, 4));
    if (Number.isFinite(ano)) return ano;
  }
  if (campo === 'semestre') {
    const chave = String(filtro.semestre || repPremiacaoChavePadrao('semestre', fallback) || '');
    const ano = Number(chave.slice(0, 4));
    if (Number.isFinite(ano)) return ano;
  }
  const ano = Number(filtro.ano || repPremiacaoChavePadrao('ano', fallback) || fallback.getFullYear());
  return Number.isFinite(ano) ? ano : fallback.getFullYear();
}

function repPremiacaoVariacaoInfo(atual, anterior) {
  const atualNum = Number(atual) || 0;
  const anteriorNum = Number(anterior) || 0;
  if (anteriorNum <= 0 && atualNum <= 0) return { valor: null, label: 'Sem base anterior', classe: 'neutral', seta: '—' };
  if (anteriorNum <= 0) return { valor: 100, label: 'Início de crescimento', classe: 'up', seta: '▲' };
  const valor = ((atualNum - anteriorNum) / anteriorNum) * 100;
  return {
    valor,
    label: `${valor >= 0 ? 'Subiu' : 'Caiu'} ${Math.abs(valor).toFixed(1)}%`,
    classe: valor >= 0 ? 'up' : 'down',
    seta: valor >= 0 ? '▲' : '▼'
  };
}

function repPremiacaoVariacaoHtml(info) {
  const classe = info?.classe || 'neutral';
  if (info?.valor == null) return `<span class="premio-growth-var ${classe}">—</span>`;
  return `<span class="premio-growth-var ${classe}">${info.seta} ${Math.abs(info.valor).toFixed(1)}%</span>`;
}

function repPremiacaoCrescimentoDados(rows) {
  const lista = Array.isArray(rows) ? rows : [];
  if (!lista.length) return null;
  const ano = repPremiacaoAnoReferencia(lista);
  const repsBase = (Array.isArray(window.REP_PREMIACAO_FIXA) ? window.REP_PREMIACAO_FIXA : []).map(nome => ({
    nome,
    key: repNomeNormalizado(nome),
    meses: Array.from({ length: 12 }, (_, mes) => ({
      mes,
      label: `${MES_LABEL_PT[mes]} / ${ano}`,
      short: MES_LABEL_PT[mes].slice(0, 3),
      fat: 0,
      qtd: 0,
      pedidos: new Set(),
      clientes: new Set()
    }))
  }));
  const mapa = {};
  repsBase.forEach(rep => { mapa[rep.key] = rep; });

  lista.forEach(r => {
    const dt = repParseDate(String(r[IDX.saida] || r[IDX.emissao] || '').trim());
    if (!dt || dt.getFullYear() !== ano) return;
    const nomeBase = repPremiacaoNomeFixoBase(r[IDX.vendedor]);
    const chave = repNomeNormalizado(nomeBase);
    const alvo = mapa[chave];
    if (!alvo) return;
    const item = alvo.meses[dt.getMonth()];
    item.fat += (typeof parseSmartNumber === 'function' ? parseSmartNumber(r[IDX.valor]) : (Number(r[IDX.valor]) || 0));
    item.qtd += parseFloat(r[IDX.qtd] || 0) || 0;
    item.pedidos.add(repPedidoChave(r));
    if (r[IDX.cliente]) item.clientes.add(String(r[IDX.cliente]).trim());
  });

  const representantes = repsBase.map(rep => {
    const meses = rep.meses.map((mes, idx) => {
      const anterior = idx > 0 ? rep.meses[idx - 1] : null;
      return {
        mes: mes.mes,
        label: mes.label,
        short: mes.short,
        fat: mes.fat,
        qtd: mes.qtd,
        pedidos: mes.pedidos.size,
        clientes: mes.clientes.size,
        variacaoFat: repPremiacaoVariacaoInfo(mes.fat, anterior ? anterior.fat : 0),
        variacaoQtd: repPremiacaoVariacaoInfo(mes.qtd, anterior ? anterior.qtd : 0)
      };
    });
    const ultimoAtivo = meses.reduce((acc, item, idx) => (item.fat > 0 || item.qtd > 0 || item.pedidos > 0 ? idx : acc), -1);
    const idxResumo = ultimoAtivo >= 0 ? ultimoAtivo : new Date().getMonth();
    return {
      nome: rep.nome,
      key: rep.key,
      meses,
      totalFat: meses.reduce((s, item) => s + item.fat, 0),
      totalQtd: meses.reduce((s, item) => s + item.qtd, 0),
      totalPedidos: meses.reduce((s, item) => s + item.pedidos, 0),
      totalClientes: meses.reduce((s, item) => s + item.clientes, 0),
      resumoMes: meses[idxResumo]
    };
  });

  const meses = Array.from({ length: 12 }, (_, mes) => {
    const fat = representantes.reduce((s, rep) => s + rep.meses[mes].fat, 0);
    const qtd = representantes.reduce((s, rep) => s + rep.meses[mes].qtd, 0);
    const pedidos = representantes.reduce((s, rep) => s + rep.meses[mes].pedidos, 0);
    const clientes = representantes.reduce((s, rep) => s + rep.meses[mes].clientes, 0);
    const anteriorFat = mes > 0 ? representantes.reduce((s, rep) => s + rep.meses[mes - 1].fat, 0) : 0;
    return {
      mes,
      label: `${MES_LABEL_PT[mes]} / ${ano}`,
      short: MES_LABEL_PT[mes].slice(0, 3),
      fat,
      qtd,
      pedidos,
      clientes,
      variacaoFat: repPremiacaoVariacaoInfo(fat, anteriorFat)
    };
  });

  const ultimoMesAtivo = meses.reduce((acc, item, idx) => (item.fat > 0 || item.qtd > 0 || item.pedidos > 0 ? idx : acc), -1);
  const mesDestaque = meses[ultimoMesAtivo >= 0 ? ultimoMesAtivo : new Date().getMonth()];

  return { ano, representantes, meses, mesDestaque };
}

function repPremiacaoCrescimentoTabelaHtml(dados) {
  return `<div class="premio-card premio-full premio-growth-table-wrap">
    <div class="premio-card-title">Crescimento mensal detalhado</div>
    <div class="rep-scroll-area">
      <table class="rep-tbl premio-growth-table">
        <thead>
          <tr>
            <th>Mês</th>
            ${dados.representantes.map(rep => `<th>${repEsc((rep.nome||'').toUpperCase())}</th><th>Variação</th>`).join('')}
            <th>Total do mês</th>
          </tr>
        </thead>
        <tbody>
          ${dados.meses.map((mes, idx) => `<tr>
            <td class="rep-lbl">${repEsc(mes.label)}</td>
            ${dados.representantes.map(rep => {
              const item = rep.meses[idx];
              return `<td>
                  <strong>${fmtValor(item.fat)}</strong>
                  <span>${fmtInt(item.qtd)} itens · ${fmtInt(item.pedidos)} pedidos</span>
                </td>
                <td>${repPremiacaoVariacaoHtml(item.variacaoFat)}</td>`;
            }).join('')}
            <td>
              <strong>${fmtValor(mes.fat)}</strong>
              <span>${fmtInt(mes.qtd)} itens · ${fmtInt(mes.pedidos)} pedidos</span>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function repPremiacaoCrescimentoHtml(dados) {
  if (!dados) return '';
  return `<section class="premio-growth-panel">
    <div class="premio-growth-head">
      <div>
        <span class="premio-kicker">Crescimento mensal dos 3 representantes</span>
        <h3>Comparativo mês a mês · ${repEsc(String(dados.ano))}</h3>
        <p>Valores mensais, evolução percentual e ritmo comercial dos representantes fixos da disputa atual.</p>
      </div>
      <div class="premio-growth-head-side">
        <span>Mês em destaque</span>
        <strong>${repEsc(dados.mesDestaque?.label || String(dados.ano))}</strong>
      </div>
    </div>
    <div class="premio-growth-cards">
      ${dados.representantes.map(rep => `<article class="premio-growth-card">
        <span class="premio-growth-card-kicker">${repEsc((rep.nome||'').toUpperCase())}</span>
        <strong>${fmtValor(rep.resumoMes?.fat || 0)}</strong>
        <p>${repEsc(rep.resumoMes?.label || `Ano ${dados.ano}`)}</p>
        <div class="premio-growth-card-meta">
          <div><span>Quantidade</span><b>${fmtInt(rep.resumoMes?.qtd || 0)}</b></div>
          <div><span>Pedidos</span><b>${fmtInt(rep.resumoMes?.pedidos || 0)}</b></div>
          <div><span>Variação</span><b>${repPremiacaoVariacaoHtml(rep.resumoMes?.variacaoFat || {})}</b></div>
        </div>
      </article>`).join('')}
    </div>
    <div class="premio-grid premio-growth-charts">
      <div class="premio-chart-box">
        <div class="premio-card-title">Faturamento mensal dos 3 representantes</div>
        <canvas id="rep-premio-growth-fat"></canvas>
      </div>
      <div class="premio-chart-box">
        <div class="premio-card-title">Variação percentual mês a mês</div>
        <canvas id="rep-premio-growth-var"></canvas>
      </div>
    </div>
    ${repPremiacaoCrescimentoTabelaHtml(dados)}
  </section>`;
}

function repPremiacaoRenderCrescimentoCharts(dados) {
  if (typeof Chart === 'undefined' || !dados) return;
  ['rep-premio-growth-fat', 'rep-premio-growth-var'].forEach(id => {
    const old = Chart.getChart(id);
    if (old) old.destroy();
  });

  const labels = dados.meses.map(m => m.short);
  const cores = ['#14746F', '#2DD4BF', '#059669'];

  const fatCtx = document.getElementById('rep-premio-growth-fat');
  if (fatCtx) new Chart(fatCtx, {
    type: 'line',
    data: {
      labels,
      datasets: dados.representantes.map((rep, idx) => ({
        label: rep.nome,
        data: rep.meses.map(item => Number(item.fat.toFixed(2))),
        borderColor: cores[idx % cores.length],
        backgroundColor: `${cores[idx % cores.length]}33`,
        borderWidth: 3,
        tension: .32,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1', boxWidth: 10 } },
        tooltip: {
          callbacks: {
            label: function(ctx) { return `${ctx.dataset.label}: ${fmtValor(ctx.parsed.y || 0)}`; }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#8ea3c0' }, grid: { color: 'rgba(255,255,255,.05)' } },
        y: {
          ticks: {
            color: '#8ea3c0',
            callback: function(v) { return fmtValor(v); }
          },
          grid: { color: 'rgba(255,255,255,.05)' }
        }
      }
    }
  });

  const varCtx = document.getElementById('rep-premio-growth-var');
  if (varCtx) new Chart(varCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: dados.representantes.map((rep, idx) => ({
        label: rep.nome,
        data: rep.meses.map(item => item.variacaoFat?.valor == null ? 0 : Number(item.variacaoFat.valor.toFixed(1))),
        backgroundColor: `${cores[idx % cores.length]}cc`,
        borderRadius: 6
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1', boxWidth: 10 } },
        tooltip: {
          callbacks: {
            label: function(ctx) { return `${ctx.dataset.label}: ${Number(ctx.parsed.y || 0).toFixed(1)}%`; }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#8ea3c0' }, grid: { display: false } },
        y: {
          ticks: {
            color: '#8ea3c0',
            callback: function(v) { return `${v}%`; }
          },
          grid: { color: 'rgba(255,255,255,.05)' }
        }
      }
    }
  });
}
