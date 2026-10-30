const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8') + '\n'
  + fs.readFileSync(path.join(root, 'js/relatrep.js'), 'utf8');

function g(row, key) {
  const i = (typeof window !== 'undefined' && window.IDX) ? window.IDX[key] : undefined;
  return (i >= 0 && row[i] !== undefined) ? String(row[i]).trim() : '';
}

function fetchMock(chamadas, metasArmazenadas) {
  return async function(_url, opts) {
    const envelope = JSON.parse(opts.body);
    chamadas.push(envelope);
    const alvo = new URL(envelope.url);
    if (alvo.pathname !== '/rest/v1/metas') return { ok: false, status: 404, json: async () => ({}) };
    const metodo = (envelope.method || 'GET').toUpperCase();
    if (metodo === 'GET') {
      return { ok: true, status: 200, json: async () => metasArmazenadas.slice() };
    }
    const corpo = JSON.parse(envelope.body);
    corpo.forEach((registro) => {
      const i = metasArmazenadas.findIndex((m) => m.vendedor === registro.vendedor && m.mes === registro.mes);
      const linha = { vendedor: registro.vendedor, mes: registro.mes, valor_meta: registro.valor_meta };
      if (i >= 0) metasArmazenadas[i] = linha; else metasArmazenadas.push(linha);
    });
    return { ok: true, status: 200, json: async () => ({}) };
  };
}

function carregar(opts) {
  const elMeta = { innerHTML: '' };
  const chamadas = [];
  const metasArmazenadas = (opts && opts.metasIniciais) || [];
  const ctx = {
    document: {
      addEventListener() {},
      getElementById(id) { return id === 'rep-tab-meta' ? elMeta : null; },
      querySelector() { return null; },
    },
    console,
    g,
    fetch: fetchMock(chamadas, metasArmazenadas),
    SUPA_URL: 'https://x.test',
    alert() {},
    prompt: () => null,
    confirm: () => true,
    URL,
  };
  ctx.window = ctx; // no navegador real, window === globalThis
  ctx.BD_DATA = { headers: [], rows: [], count: 0 };
  ctx.SESSION = (opts && opts.session) || { papel: 'admin', empresa_id: 'EMP1' };
  ctx.EMPRESA_ATIVA = (opts && opts.empresaAtiva) !== undefined ? opts.empresaAtiva : { empresa_id: 'EMP1' };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  ctx.window.IDX = { vendedor: 1, produto: 2, cliente: 3, grupo: 4, marca: 5, ano: 6, mes: 7, valor: 8, qtd: 9, saida: 10, emissao: 11 };
  return { ctx, elMeta, chamadas, metasArmazenadas };
}

function linha(ctx, campos) {
  const r = [];
  Object.keys(campos).forEach((k) => { r[ctx.window.IDX[k]] = campos[k]; });
  return r;
}

function esperar(cond, ms) {
  return new Promise((resolve, reject) => {
    const limite = Date.now() + (ms || 1000);
    (function checar() {
      if (cond()) return resolve();
      if (Date.now() > limite) return reject(new Error('timeout esperando condicao'));
      setTimeout(checar, 5);
    })();
  });
}

test('repMetasAnosDisponiveis: sempre inclui o ano atual e o seguinte, mesmo sem dados', () => {
  const { ctx } = carregar();
  const anos = ctx.repMetasAnosDisponiveis([]);
  const anoAtual = String(new Date().getFullYear());
  const anoSeguinte = String(new Date().getFullYear() + 1);
  assert.ok(anos.includes(anoAtual));
  assert.ok(anos.includes(anoSeguinte));
});

test('repMeta: mostra "carregando" primeiro, depois renderiza realizado e meta vindos do banco', async () => {
  const ano = String(new Date().getFullYear());
  const { ctx, elMeta } = carregar({
    metasIniciais: [{ vendedor: 'JOAO', mes: 3, valor_meta: 1000 }],
  });
  ctx.window.BD_DATA.rows = [
    linha(ctx, { vendedor: 'JOAO', ano, mes: 'mar', valor: 800 }),
  ];

  ctx.repMeta();
  assert.match(elMeta.innerHTML, /Carregando metas/);

  await esperar(() => /JOAO/.test(elMeta.innerHTML));
  assert.match(elMeta.innerHTML, /JOAO/);
  assert.match(elMeta.innerHTML, /Meta: 1\.000/);
  // 800 realizado / 1000 meta = 80% -> faixa "alerta" (70-99%), nao "ok"
  assert.match(elMeta.innerHTML, /rep-meta-alerta/);
});

test('repMeta: sem meta definida mostra traco, sem quebrar', async () => {
  const ano = String(new Date().getFullYear());
  const { ctx, elMeta } = carregar();
  ctx.window.BD_DATA.rows = [
    linha(ctx, { vendedor: 'MARIA', ano, mes: 'jan', valor: 500 }),
  ];
  ctx.repMeta();
  await esperar(() => /MARIA/.test(elMeta.innerHTML));
  assert.match(elMeta.innerHTML, /Meta: —/);
});

test('repMeta: cliente (sem permissao de editar) nao recebe atributo de clique nas celulas', async () => {
  const ano = String(new Date().getFullYear());
  const { ctx, elMeta } = carregar({ session: { papel: 'cliente', empresa_id: 'EMP1' }, empresaAtiva: null });
  ctx.window.BD_DATA.rows = [
    linha(ctx, { vendedor: 'JOAO', ano, mes: 'jan', valor: 500 }),
  ];
  ctx.repMeta();
  await esperar(() => /JOAO/.test(elMeta.innerHTML));
  assert.doesNotMatch(elMeta.innerHTML, /onclick="repMetaAbrirEdicao/);
  assert.doesNotMatch(elMeta.innerHTML, /Clique num valor de meta/);
});

test('repMetaAbrirEdicao: salva a meta digitada e atualiza o cache local sem recarregar do zero', async () => {
  const ano = String(new Date().getFullYear());
  const { ctx, elMeta, metasArmazenadas } = carregar();
  ctx.window.BD_DATA.rows = [
    linha(ctx, { vendedor: 'JOAO', ano, mes: 'fev', valor: 500 }),
  ];
  ctx.repMeta();
  await esperar(() => /JOAO/.test(elMeta.innerHTML));

  ctx.prompt = () => '2.000,00';
  const elCelula = { dataset: { vendedor: 'JOAO', mes: '2', ano } };
  await ctx.repMetaAbrirEdicao(elCelula);

  assert.equal(metasArmazenadas.find((m) => m.vendedor === 'JOAO' && m.mes === 2).valor_meta, 2000);
  assert.match(elMeta.innerHTML, /Meta: 2\.000/);
});

test('repMetaAbrirEdicao: cancelar o prompt nao salva nada', async () => {
  const ano = String(new Date().getFullYear());
  const { ctx, elMeta, metasArmazenadas, chamadas } = carregar();
  ctx.window.BD_DATA.rows = [linha(ctx, { vendedor: 'JOAO', ano, mes: 'jan', valor: 100 })];
  ctx.repMeta();
  await esperar(() => /JOAO/.test(elMeta.innerHTML));

  const chamadasAntes = chamadas.length;
  ctx.prompt = () => null;
  await ctx.repMetaAbrirEdicao({ dataset: { vendedor: 'JOAO', mes: '1', ano } });
  assert.equal(chamadas.length, chamadasAntes, 'nao deve chamar o proxy se cancelou o prompt');
  assert.equal(metasArmazenadas.length, 0);
});
