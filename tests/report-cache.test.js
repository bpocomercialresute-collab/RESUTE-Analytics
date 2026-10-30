const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/report-cache.js'), 'utf8');

// Servidor falso simulando o subconjunto do PostgREST que report-cache.js usa:
// eq./in./not.in. nos filtros, order=atualizado_em.desc&limit=N, upsert por
// POST (merge-duplicates no empresa_id+tipo+cache_key) e DELETE.
function criarServidor() {
  const linhas = [];
  let relogio = 0;

  function matchFiltro(filtro, valor) {
    if (filtro.startsWith('not.in.(') && filtro.endsWith(')')) {
      const lista = filtro.slice(8, -1).split(',').map(decodeURIComponent);
      return !lista.includes(valor);
    }
    if (filtro.startsWith('in.(') && filtro.endsWith(')')) {
      const lista = filtro.slice(4, -1).split(',').map(decodeURIComponent);
      return lista.includes(valor);
    }
    if (filtro.startsWith('eq.')) return valor === decodeURIComponent(filtro.slice(3));
    return true;
  }

  function bateComFiltros(linha, q) {
    return ['empresa_id', 'tipo', 'cache_key'].every((campo) => !q[campo] || matchFiltro(q[campo], linha[campo]));
  }

  async function fetchFake(url, opts) {
    const u = new URL(url);
    const q = {};
    u.searchParams.forEach((v, k) => { q[k] = v; });
    const metodo = (opts && opts.method) || 'GET';

    if (metodo === 'GET') {
      let resultado = linhas.filter((l) => bateComFiltros(l, q));
      if (q.order === 'atualizado_em.desc') resultado = resultado.slice().sort((a, b) => b.atualizado_em - a.atualizado_em);
      const limiteMatch = /(?:^|&)limit=(\d+)/.exec(u.search);
      if (limiteMatch) resultado = resultado.slice(0, Number(limiteMatch[1]));
      return { ok: true, status: 200, text: async () => JSON.stringify(resultado) };
    }

    if (metodo === 'POST') {
      relogio += 1;
      const corpo = JSON.parse(opts.body);
      const i = linhas.findIndex((l) => l.empresa_id === corpo.empresa_id && l.tipo === corpo.tipo && l.cache_key === corpo.cache_key);
      const registro = Object.assign({}, corpo, { atualizado_em: relogio });
      if (i >= 0) linhas[i] = registro; else linhas.push(registro);
      return { ok: true, status: 200, text: async () => '' };
    }

    if (metodo === 'DELETE') {
      const restantes = linhas.filter((l) => !bateComFiltros(l, q));
      linhas.length = 0;
      linhas.push(...restantes);
      return { ok: true, status: 200, text: async () => '' };
    }

    return { ok: false, status: 404, text: async () => '' };
  }

  return { linhas, fetchFake };
}

function carregar(servidor) {
  const ctx = {
    console,
    fetch: servidor.fetchFake,
    SUPA_URL: 'https://x.test',
    SUPA_KEY: 'chave-anon',
    SVC_KEY: 'chave-servico',
    window: {},
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return ctx.window.ReportCache;
}

test('ReportCache: snapshot pequeno (sem divisao) salva e le normal', async () => {
  const RC = carregar(criarServidor());
  const ok = await RC.save({
    empresa_id: 'E1', tipo: 'dashboard_cliente', cache_key: RC.cacheKey('api'), origem: 'api',
    total_registros: 2, dados: { vendas: [{ id: 1 }, { id: 2 }], gerado_em: 'agora' }
  });
  assert.equal(ok, true);

  const lido = await RC.getLatest('E1', 'dashboard_cliente', RC.cacheKey('api'));
  assert.deepEqual(JSON.parse(JSON.stringify(lido.dados.vendas)), [{ id: 1 }, { id: 2 }]);

  // Sem cache_key explicito (key=null) tambem acha, igual sempre foi.
  const lidoSemChave = await RC.getLatest('E1', 'dashboard_cliente', null);
  assert.deepEqual(JSON.parse(JSON.stringify(lidoSemChave.dados.vendas)), [{ id: 1 }, { id: 2 }]);
});

test('ReportCache: saveChunked grava manifesto + partes, getLatest remonta tudo', async () => {
  const servidor = criarServidor();
  const RC = carregar(servidor);
  const pedacos = [[{ id: 1 }, { id: 2 }], [{ id: 3 }], [{ id: 4 }, { id: 5 }]];
  const ok = await RC.saveChunked(
    { empresa_id: 'E1', tipo: 'dashboard_cliente', origem: 'api', total_registros: 5, gerado_em: 'agora' },
    pedacos
  );
  assert.equal(ok, true);

  // 1 manifesto + 3 partes = 4 linhas no banco
  assert.equal(servidor.linhas.length, 4);
  const manifesto = servidor.linhas.find((l) => l.tipo === 'dashboard_cliente');
  assert.equal(manifesto.dados.manifesto, true);
  assert.equal(manifesto.dados.partes, 3);

  const lido = await RC.getLatest('E1', 'dashboard_cliente', RC.cacheKey('api'));
  assert.deepEqual(JSON.parse(JSON.stringify(lido.dados.vendas)), [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
  assert.equal(lido.dados.total_registros, 5);
});

test('ReportCache: getLatest sem cache_key (key=null) acha o MANIFESTO, nunca uma parte solta', async () => {
  // Esse e o bug concreto que motivou o tipo separado pras partes: os 3
  // pontos do codigo que leem "o snapshot mais recente, de qualquer chave"
  // nao podiam arriscar pegar uma parte (so um pedaco dos dados) no lugar
  // do manifesto (que aponta pra todas as partes).
  const servidor = criarServidor();
  const RC = carregar(servidor);
  await RC.saveChunked(
    { empresa_id: 'E1', tipo: 'dashboard_cliente', origem: 'api', total_registros: 3, gerado_em: 'agora' },
    [[{ id: 1 }], [{ id: 2 }], [{ id: 3 }]]
  );

  const lido = await RC.getLatest('E1', 'dashboard_cliente', null);
  assert.deepEqual(JSON.parse(JSON.stringify(lido.dados.vendas)), [{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test('ReportCache: salvar de novo com MENOS pedacos apaga as partes orfas da geracao anterior', async () => {
  const servidor = criarServidor();
  const RC = carregar(servidor);
  await RC.saveChunked(
    { empresa_id: 'E1', tipo: 'dashboard_cliente', origem: 'api', total_registros: 6, gerado_em: 't1' },
    [[{ id: 1 }], [{ id: 2 }], [{ id: 3 }], [{ id: 4 }], [{ id: 5 }], [{ id: 6 }]]
  );
  assert.equal(servidor.linhas.filter((l) => l.tipo === 'dashboard_cliente_parte').length, 6);

  await RC.saveChunked(
    { empresa_id: 'E1', tipo: 'dashboard_cliente', origem: 'api', total_registros: 2, gerado_em: 't2' },
    [[{ id: 10 }], [{ id: 20 }]]
  );
  assert.equal(servidor.linhas.filter((l) => l.tipo === 'dashboard_cliente_parte').length, 2, 'partes antigas orfas deveriam ser apagadas');

  const lido = await RC.getLatest('E1', 'dashboard_cliente', null);
  assert.deepEqual(JSON.parse(JSON.stringify(lido.dados.vendas)), [{ id: 10 }, { id: 20 }]);
});

test('ReportCache: partes incompletas (faltando uma) nao devolve dado parcial, devolve null', async () => {
  const servidor = criarServidor();
  const RC = carregar(servidor);
  await RC.saveChunked(
    { empresa_id: 'E1', tipo: 'dashboard_cliente', origem: 'api', total_registros: 3, gerado_em: 'agora' },
    [[{ id: 1 }], [{ id: 2 }], [{ id: 3 }]]
  );
  // Simula corrupcao/perda de uma parte.
  const i = servidor.linhas.findIndex((l) => l.cache_key.endsWith(':p1'));
  servidor.linhas.splice(i, 1);

  const lido = await RC.getLatest('E1', 'dashboard_cliente', null);
  assert.equal(lido, null);
});

test('ReportCache: getLatestRapido so le o primeiro pedaco, marca parcial=true e avisa o total de partes', async () => {
  const servidor = criarServidor();
  const RC = carregar(servidor);
  await RC.saveChunked(
    { empresa_id: 'E1', tipo: 'dashboard_cliente', origem: 'api', total_registros: 5, gerado_em: 'agora' },
    [[{ id: 1 }, { id: 2 }], [{ id: 3 }], [{ id: 4 }, { id: 5 }]]
  );

  const antesDasChamadas = servidor.linhas.length;
  const rapido = await RC.getLatestRapido('E1', 'dashboard_cliente', RC.cacheKey('api'));
  assert.deepEqual(JSON.parse(JSON.stringify(rapido.dados.vendas)), [{ id: 1 }, { id: 2 }]);
  assert.equal(rapido.dados.parcial, true);
  assert.equal(rapido.dados.partes_total, 3);
  assert.equal(rapido.dados.total_registros, 5, 'total_registros e o total completo, mesmo so lendo 1 pedaco');
  assert.equal(servidor.linhas.length, antesDasChamadas, 'leitura nao deveria criar/alterar linha nenhuma');
});

test('ReportCache: getLatestRapido num snapshot sem divisao devolve completo direto, sem parcial', async () => {
  const RC = carregar(criarServidor());
  await RC.save({
    empresa_id: 'E1', tipo: 'dashboard_cliente', cache_key: RC.cacheKey('api'), origem: 'api',
    total_registros: 2, dados: { vendas: [{ id: 1 }, { id: 2 }], gerado_em: 'agora' }
  });
  const rapido = await RC.getLatestRapido('E1', 'dashboard_cliente', RC.cacheKey('api'));
  assert.deepEqual(JSON.parse(JSON.stringify(rapido.dados.vendas)), [{ id: 1 }, { id: 2 }]);
  assert.equal(rapido.dados.parcial, undefined);
});

test('ReportCache: empresas diferentes nunca se misturam (mesmo tipo/origem)', async () => {
  const servidor = criarServidor();
  const RC = carregar(servidor);
  await RC.saveChunked({ empresa_id: 'E1', tipo: 'dashboard_cliente', origem: 'api', total_registros: 1, gerado_em: 't' }, [[{ id: 'e1' }]]);
  await RC.save({ empresa_id: 'E2', tipo: 'dashboard_cliente', cache_key: RC.cacheKey('api'), origem: 'api', total_registros: 1, dados: { vendas: [{ id: 'e2' }] } });

  const e1 = await RC.getLatest('E1', 'dashboard_cliente', null);
  const e2 = await RC.getLatest('E2', 'dashboard_cliente', null);
  assert.deepEqual(JSON.parse(JSON.stringify(e1.dados.vendas)), [{ id: 'e1' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(e2.dados.vendas)), [{ id: 'e2' }]);
});
