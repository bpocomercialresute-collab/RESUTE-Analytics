const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dreSource = fs.readFileSync(path.join(root, 'js/dre/dre-view.js'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');

function extrair(src, nome) {
  const m = src.match(new RegExp('(async\\s+)?function\\s+' + nome + '\\s*\\('));
  assert.ok(m, `funcao ${nome} nao encontrada`);
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') depth -= 1;
    if (depth === 0) return src.slice(m.index, i + 1);
  }
  throw new Error(`funcao ${nome} incompleta`);
}

function carregar(extra) {
  const ctx = Object.assign({
    console, Math, JSON, Array, Number, String, Date, Object, setTimeout,
    SUPA_URL: 'https://x.test', SUPA_KEY: 'k', SVC_KEY: 's',
  }, extra || {});
  vm.createContext(ctx);
  // dcComTimeout real usa 180000ms -- nos testes que nao testam o timeout em
  // si, troca por um passthrough sem timer nenhum, pra nao deixar um
  // setTimeout real de 3 minutos pendurado impedindo o processo de terminar.
  if (!extra || !extra.dcComTimeout) {
    ctx.dcComTimeout = function(promise) { return promise; };
  }
  vm.runInContext(extrair(authSource, '_fetchAll'), ctx);
  vm.runInContext(extrair(dreSource, '_dreCacheKey'), ctx);
  vm.runInContext(extrair(dreSource, '_dreAssinatura'), ctx);
  vm.runInContext(extrair(dreSource, '_dreParseNum'), ctx);
  vm.runInContext(extrair(dreSource, '_dreNormalizarData'), ctx);
  vm.runInContext(extrair(dreSource, '_dreDataParaBR'), ctx);
  vm.runInContext(extrair(dreSource, '_dreParseDataUTC'), ctx);
  vm.runInContext(extrair(dreSource, '_dreCarregarDados'), ctx);
  return ctx;
}

// ── _dreCacheKey ─────────────────────────────────────────────────────────────
test('_dreCacheKey: uma chave por empresa, nunca uma chave global', () => {
  const ctx = carregar();
  assert.equal(ctx._dreCacheKey('EMP1'), 'resute_dre_cache_EMP1');
  assert.notEqual(ctx._dreCacheKey('EMP1'), ctx._dreCacheKey('EMP2'));
});

// ── _dreAssinatura ───────────────────────────────────────────────────────────
test('_dreAssinatura: mesma quantidade e soma = mesma assinatura', () => {
  const ctx = carregar();
  const a = ctx._dreAssinatura({ plano: [{}, {}], lancamentos: [{ valor: 10 }, { valor: 20.5 }] });
  const b = ctx._dreAssinatura({ plano: [{}, {}], lancamentos: [{ valor: 10 }, { valor: 20.5 }] });
  assert.equal(a, b);
});

test('_dreAssinatura: muda se o valor de um lancamento mudar, mesmo com a mesma quantidade', () => {
  const ctx = carregar();
  const a = ctx._dreAssinatura({ plano: [], lancamentos: [{ valor: 10 }] });
  const b = ctx._dreAssinatura({ plano: [], lancamentos: [{ valor: 10.01 }] });
  assert.notEqual(a, b);
});

// ── _dreParseNum ─────────────────────────────────────────────────────────────
test('_dreParseNum: formato BR normal', () => {
  const ctx = carregar();
  assert.equal(ctx._dreParseNum('1.234,56'), 1234.56);
  assert.equal(ctx._dreParseNum('R$ 10'), 10);
  assert.equal(ctx._dreParseNum(''), null);
  assert.equal(ctx._dreParseNum(null), null);
});

test('_dreParseNum: negativo em qualquer formato (parenteses, sinal no fim, R$ no meio)', () => {
  const ctx = carregar();
  assert.equal(ctx._dreParseNum('(1.234,56)'), -1234.56);
  assert.equal(ctx._dreParseNum('1.234,56-'), -1234.56);
  assert.equal(ctx._dreParseNum('R$ -10'), -10);
});

test('_dreParseNum: ponto de milhar sem virgula nao vira decimal (1.234 = mil, nao 1,234)', () => {
  const ctx = carregar();
  assert.equal(ctx._dreParseNum('1.234'), 1234);
  assert.equal(ctx._dreParseNum('12.345.678'), 12345678);
});

test('_dreParseNum: milhar americano com varias virgulas em grupos de 3', () => {
  const ctx = carregar();
  assert.equal(ctx._dreParseNum('1,234,567'), 1234567);
});

// ── _dreNormalizarData / _dreDataParaBR / _dreParseDataUTC ───────────────────
test('_dreNormalizarData: BR e ISO viram o mesmo ISO, data impossivel vira null', () => {
  const ctx = carregar();
  assert.equal(ctx._dreNormalizarData('05/03/2026'), '2026-03-05');
  assert.equal(ctx._dreNormalizarData('2026-03-05'), '2026-03-05');
  assert.equal(ctx._dreNormalizarData('31/02/2026'), null, '31 de fevereiro nao existe');
  assert.equal(ctx._dreNormalizarData(''), null);
});

test('_dreNormalizarData: serial de data do Excel', () => {
  const ctx = carregar();
  assert.equal(ctx._dreNormalizarData('43466'), '2019-01-01');
});

test('_dreDataParaBR: ISO vira BR pra exibir, BR fica como esta', () => {
  const ctx = carregar();
  assert.equal(ctx._dreDataParaBR('2026-03-05'), '05/03/2026');
  assert.equal(ctx._dreDataParaBR('05/03/2026'), '05/03/2026');
  assert.equal(ctx._dreDataParaBR(''), '');
});

test('_dreParseDataUTC: nao deixa o fuso do Brasil jogar a data pro dia anterior', () => {
  const ctx = carregar();
  const d = ctx._dreParseDataUTC('05/03/2026');
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 2);
  assert.equal(d.getUTCDate(), 5);
});

// ── _dreCarregarDados: timeout e deduplicacao ────────────────────────────────
test('_dreCarregarDados: trava sem resposta agora tem limite de tempo (nao fica preso pra sempre)', async () => {
  const ctx = carregar({ fetch: () => new Promise(() => {}) }); // nunca resolve nem rejeita
  // dcComTimeout real usa 180000ms (3 min) -- troca por uma versao com o
  // mesmo comportamento mas limite curto, so pra nao esperar 3 minutos de
  // verdade aqui. O que importa testar e que _dreCarregarDados PROPAGA a
  // rejeicao do timeout, nao o valor exato de 180000.
  ctx.dcComTimeout = function(promise, _timeoutMs, mensagem) {
    return Promise.race([
      promise,
      new Promise(function(_, reject) { setTimeout(function() { reject(new Error(mensagem)); }, 20); })
    ]);
  };
  await assert.rejects(
    () => ctx._dreCarregarDados('EMP1'),
    (e) => /demorou mais de 3 minutos/i.test(e.message)
  );
});

test('_dreCarregarDados: remove lancamento duplicado (mesmo id vindo de paginas diferentes)', async () => {
  const ctx = carregar({
    fetch: async (url) => {
      if (url.indexOf('fin_dre_plano_contas') >= 0) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => [] };
      }
      // fin_dre_lancamentos: devolve id=1 duas vezes (paginacao sobrepondo),
      // igual o comentario do codigo real descreve ter acontecido de verdade.
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => [{ id: 1, valor: 10 }, { id: 1, valor: 10 }, { id: 2, valor: 20 }] };
    }
  });
  const dados = await ctx._dreCarregarDados('EMP1');
  assert.equal(dados.lancamentos.length, 2, 'id duplicado so deveria contar uma vez');
});

test('_dreCarregarDados: sem empresa_id devolve vazio sem bater no banco', async () => {
  let chamou = false;
  const ctx = carregar({ fetch: async () => { chamou = true; return { ok: true, status: 200, headers: { get: () => null }, json: async () => [] }; } });
  const dados = await ctx._dreCarregarDados(null);
  assert.deepEqual(JSON.parse(JSON.stringify(dados)), { plano: [], lancamentos: [] });
  assert.equal(chamou, false);
});
