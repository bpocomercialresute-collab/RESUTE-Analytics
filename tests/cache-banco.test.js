const assert = require('node:assert/strict');
const test = require('node:test');
const { criarContexto, criarServidor, gerarLinhas, esperar, impressao } = require('./helpers/dashboard-vm.js');

const CHAVE = 'resute_dc_cache_EMP1';

// Uma "abertura do painel" = pagina recarregada: contexto novo, mesmo IndexedDB e mesmo servidor.
async function abrir(servidor, armazem, opcoes) {
  const { ctx, elementos } = criarContexto({ servidor, armazem });
  if (opcoes && opcoes.antes) opcoes.antes(ctx);
  await ctx.dcCarregarDados('EMP1');
  return { ctx, elementos };
}

test('1a abertura baixa do banco e grava o cache local; 2a abertura nao baixa nada', async () => {
  const servidor = criarServidor(gerarLinhas(2500));
  const armazem = new Map();

  const a = await abrir(servidor, armazem);
  assert.equal(a.ctx.DC_RAW.length, 2500);
  assert.equal(servidor.paginas >= 3, true, 'a primeira abertura pagina o banco');
  await esperar(() => armazem.has(CHAVE));
  const entrada = armazem.get(CHAVE);
  assert.equal(entrada.fonte, 'banco');
  assert.equal(entrada.vendas.length, 2500);
  assert.equal(entrada.origem, 'api');

  const paginasAntes = servidor.paginas;
  const b = await abrir(servidor, armazem);
  assert.equal(b.ctx.DC_RAW.length, 2500, 'renderiza a partir do cache');
  await esperar(() => servidor.sondas >= 1);
  assert.equal(servidor.paginas, paginasAntes, 'nenhuma pagina de vendas baixada na 2a abertura');
  assert.equal(servidor.sondas, 1, 'so a sonda barata de assinatura');
});

test('o que aparece na tela com o cache e IDENTICO ao da primeira abertura (linhas brutas, nao enxutas)', async () => {
  const servidor = criarServidor(gerarLinhas(1800));
  const armazem = new Map();
  const a = await abrir(servidor, armazem);
  const primeira = impressao(a.elementos);
  await esperar(() => armazem.has(CHAVE));
  const b = await abrir(servidor, armazem);
  const segunda = impressao(b.elementos);
  assert.equal(segunda, primeira);
  assert.ok(primeira.length > 1000, 'a impressao tem conteudo de verdade');
});

test('dado novo no banco: mostra o cache na hora, depois baixa de novo e troca', async () => {
  const servidor = criarServidor(gerarLinhas(1200));
  const armazem = new Map();
  await abrir(servidor, armazem);
  await esperar(() => armazem.has(CHAVE));

  const novas = gerarLinhas(30, '2026-10-20T10:00:00Z').map((l, i) => Object.assign(l, { id: 'novo-' + i, id_externo: 'novo_' + i }));
  servidor.linhas = servidor.linhas.concat(novas);

  const b = await abrir(servidor, armazem);
  assert.equal(b.ctx.DC_RAW.length, 1200, 'primeiro mostra o que estava no cache');
  await esperar(() => b.ctx.DC_RAW.length === 1230);
  assert.equal(b.ctx.DC_RAW.length, 1230);
  await esperar(() => armazem.get(CHAVE).vendas.length === 1230);
  assert.equal(armazem.get(CHAVE).vendas.length, 1230, 'o cache foi trocado pela versao nova');
});

test('mesmo total mas lote novo (salvamento manual troca tudo): assinatura muda e recarrega', async () => {
  const servidor = criarServidor(gerarLinhas(900));
  const armazem = new Map();
  await abrir(servidor, armazem);
  await esperar(() => armazem.has(CHAVE));

  servidor.linhas = gerarLinhas(900, '2026-10-25T09:00:00Z');
  const b = await abrir(servidor, armazem);
  const antes = servidor.paginas;
  await esperar(() => servidor.paginas > antes);
  await esperar(() => armazem.get(CHAVE).assinatura.endsWith(servidor.maxCriado()));
  assert.ok(armazem.get(CHAVE).assinatura.endsWith(servidor.maxCriado()));
  assert.equal(b.ctx.DC_RAW.length, 900);
});

test('registros apagados (total menor): recarrega', async () => {
  const servidor = criarServidor(gerarLinhas(1500));
  const armazem = new Map();
  await abrir(servidor, armazem);
  await esperar(() => armazem.has(CHAVE));
  servidor.linhas = servidor.linhas.slice(0, 1400);
  const b = await abrir(servidor, armazem);
  await esperar(() => b.ctx.DC_RAW.length === 1400);
  assert.equal(b.ctx.DC_RAW.length, 1400);
});

test('se a sonda falha, NAO baixa tudo de novo: mantem o cache que ja esta na tela', async () => {
  const servidor = criarServidor(gerarLinhas(1100));
  const armazem = new Map();
  await abrir(servidor, armazem);
  await esperar(() => armazem.has(CHAVE));
  servidor.falharSonda = true;
  const paginasAntes = servidor.paginas;
  const b = await abrir(servidor, armazem);
  await esperar(() => servidor.sondas >= 1);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(b.ctx.DC_RAW.length, 1100);
  assert.equal(servidor.paginas, paginasAntes);
});

test('cache vencido (mais de 12 h) e tratado como ausente: baixa do banco', async () => {
  const servidor = criarServidor(gerarLinhas(1000));
  const armazem = new Map();
  await abrir(servidor, armazem);
  await esperar(() => armazem.has(CHAVE));
  const e = armazem.get(CHAVE);
  e.salvo_em = Date.now() - 13 * 60 * 60 * 1000;
  armazem.set(CHAVE, e);

  const antes = servidor.paginas;
  const b = await abrir(servidor, armazem);
  assert.ok(servidor.paginas > antes, 'baixou de novo');
  assert.equal(b.ctx.DC_RAW.length, 1000);
});

test('botao Atualizar ignora o cache local e baixa do banco', async () => {
  const servidor = criarServidor(gerarLinhas(1000));
  const armazem = new Map();
  const a = await abrir(servidor, armazem);
  await esperar(() => armazem.has(CHAVE));
  const antes = servidor.paginas;
  await a.ctx.dcSincronizarOuAtualizar();
  assert.ok(servidor.paginas > antes, 'Atualizar baixou do banco');
});

test('chave de desligamento: com DC_CACHE_BANCO_ATIVO=false nada e gravado nem lido', async () => {
  const servidor = criarServidor(gerarLinhas(900));
  const armazem = new Map();
  await abrir(servidor, armazem, { antes: (ctx) => require('node:vm').runInContext('DC_CACHE_BANCO_ATIVO = false;', ctx) });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(armazem.has(CHAVE), false);
});

test('linhas sem criado_em: nao cacheia (assinatura impossivel), comportamento antigo', async () => {
  const sem = gerarLinhas(900).map((l) => Object.assign({}, l, { criado_em: null }));
  const servidor = criarServidor(sem);
  const armazem = new Map();
  await abrir(servidor, armazem);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(armazem.has(CHAVE), false);
});

test('cache de snapshot antigo (sem campo fonte) continua sendo lido como antes', async () => {
  const servidor = criarServidor(gerarLinhas(500));
  const armazem = new Map();
  armazem.set(CHAVE, { gerado_em: '2026-10-01T00:00:00Z', vendas: gerarLinhas(500) });
  const paginasAntes = servidor.paginas;
  const b = await abrir(servidor, armazem);
  assert.equal(b.ctx.DC_RAW.length, 500);
  assert.equal(servidor.paginas, paginasAntes, 'nao baixou nada do banco');
  assert.equal(servidor.sondas, 0, 'sonda so existe para o cache do banco');
});
