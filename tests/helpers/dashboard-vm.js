// Carrega o auth.js REAL (com constants.js e utils.js) num vm com DOM falso, IndexedDB falso
// e um "servidor" falso atras do proxy. Usado pelos testes de ponta a ponta do painel do cliente.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');

function criarElemento(id) {
  return {
    id, value: '', innerHTML: '', textContent: '', hidden: false, disabled: false, style: {}, dataset: {},
    children: [], options: [], className: '', title: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    removeAttribute() {}, appendChild() {}, remove() {}, focus() {}, click() {},
    querySelector() { return criarElemento('q'); }, querySelectorAll() { return []; },
    closest() { return null; }, getContext() { return {}; }, insertAdjacentHTML() {}, scrollIntoView() {}
  };
}

// IndexedDB minimo: so o que _dcIdbOpen/_dcIdbGet/_dcIdbSet/_dcIdbDelete usam. `armazem` e um Map
// compartilhado entre "recarregamentos de pagina" (varios contextos) e clona como o IDB de verdade.
function criarIndexedDB(armazem) {
  const agendar = (fn) => setTimeout(fn, 0);
  const db = {
    createObjectStore() {},
    transaction() {
      const tx = {};
      tx.objectStore = () => ({
        get(chave) {
          const req = {};
          agendar(() => { req.result = armazem.has(chave) ? structuredClone(armazem.get(chave)) : undefined; req.onsuccess && req.onsuccess(); });
          return req;
        },
        put(valor, chave) {
          const req = {};
          armazem.set(chave, structuredClone(valor));
          agendar(() => { tx.oncomplete && tx.oncomplete(); });
          return req;
        },
        delete(chave) {
          const req = {};
          armazem.delete(chave);
          agendar(() => { tx.oncomplete && tx.oncomplete(); });
          return req;
        }
      });
      return tx;
    }
  };
  return {
    open() {
      const req = {};
      agendar(() => {
        req.onupgradeneeded && req.onupgradeneeded({ target: { result: db } });
        req.onsuccess && req.onsuccess({ target: { result: db } });
      });
      return req;
    }
  };
}

function resposta(status, corpo, cabecalhos) {
  const mapa = Object.assign({}, cabecalhos || {});
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: (k) => (mapa[String(k).toLowerCase()] !== undefined ? mapa[String(k).toLowerCase()] : null) },
    json: async () => corpo, text: async () => JSON.stringify(corpo), clone() { return this; }
  };
}

// Servidor falso: tabela `vendas` paginada por Range, sonda de assinatura (select=criado_em + count),
// empresas (exibir_origem) e sync_log. Conta chamadas para os testes conferirem o que foi baixado.
function criarServidor(linhas) {
  const s = {
    linhas, paginas: 0, sondas: 0, falharSonda: false, empresas: 0,
    maxCriado() {
      return s.linhas.reduce((m, r) => (r.criado_em && (!m || Date.parse(r.criado_em) > Date.parse(m)) ? r.criado_em : m), null);
    },
    fetchNativo: async (_url, opts) => {
      const env = JSON.parse(opts.body);
      const url = env.url; const h = env.headers || {};
      if (url.indexOf('/rest/v1/empresas?') >= 0) { s.empresas++; return resposta(200, [{ exibir_origem: 'api' }]); }
      if (url.indexOf('/rest/v1/sync_log') >= 0) return resposta(200, []);
      if (url.indexOf('/rest/v1/vendas?') >= 0 && url.indexOf('select=criado_em') >= 0) {
        s.sondas++;
        if (s.falharSonda) return resposta(500, { erro: 'x' });
        const topo = s.maxCriado();
        return resposta(206, topo ? [{ criado_em: topo }] : [], { 'content-range': '0-0/' + s.linhas.length });
      }
      if (url.indexOf('/rest/v1/vendas?') >= 0) {
        s.paginas++;
        const [ini, fim] = String(h.Range || '0-999').split('-').map(Number);
        return resposta(206, s.linhas.slice(ini, fim + 1), { 'content-range': ini + '-' + fim + '/' + s.linhas.length });
      }
      return resposta(200, []);
    }
  };
  return s;
}

function criarContexto({ servidor, armazem, papel }) {
  const elementos = new Map();
  const document = {
    getElementById(id) { if (!elementos.has(id)) elementos.set(id, criarElemento(id)); return elementos.get(id); },
    createElement(tag) { return criarElemento(tag); },
    querySelector() { return criarElemento('q'); }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, body: criarElemento('body'), documentElement: criarElemento('html'), cookie: ''
  };
  class ChartFalso { constructor(el, cfg) { this.cfg = cfg; } destroy() {} update() {} static register() {} }
  ChartFalso.defaults = { font: {}, plugins: {}, color: '' };
  const store = {};
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    document, localStorage, sessionStorage: localStorage, Chart: ChartFalso, performance,
    setTimeout, clearTimeout, setInterval() { return 0; }, clearInterval() {},
    Promise, Date, Math, JSON, Intl, Set, Map, WeakMap, Array, Object, String, Number, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, structuredClone,
    requestAnimationFrame: (f) => setTimeout(f, 0), AbortController, URL, Symbol, Uint8Array, Headers, Response,
    navigator: { userAgent: 'node' }, location: { href: 'http://x/', hostname: 'x', search: '', hash: '' },
    fetch: servidor.fetchNativo, alert() {}, confirm() { return true; }, history: { replaceState() {}, pushState() {} },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    indexedDB: criarIndexedDB(armazem), Blob, TextEncoder, TextDecoder
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/constants.js', 'js/utils.js', 'js/auth.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  vm.runInContext("SESSION = { token: 't', papel: '" + (papel || 'cliente') + "', empresa_id: 'EMP1', empresa_nome: 'X' };", ctx);
  vm.runInContext('DC_CACHE_BANCO_ESPERA_MS = 0;', ctx);
  return { ctx, elementos };
}

function gerarLinhas(n, criadoBase) {
  const base = Date.parse(criadoBase || '2026-10-01T10:00:00Z');
  return Array.from({ length: n }, (_, i) => {
    const mes = String(1 + (i % 12)).padStart(2, '0');
    return {
      id: 'uuid-' + String(i).padStart(6, '0'), empresa_id: 'EMP1', origem: 'api',
      id_externo: 'api_' + i, num_pedido: 'P' + Math.floor(i / 3), produto: 'Produto ' + (i % 50),
      qtd: 1 + (i % 7), dt_emissao: '2026-' + mes + '-10', dt_saida: '2026-' + mes + '-10', valor: 100 + (i % 90) + 0.5,
      vendedor: 'Vend ' + (i % 6), industria: 'Ind', cliente: 'Cliente ' + (i % 40), ano: 2026, mes: String(Number(mes)),
      grupo: i % 4 === 0 ? '' : 'Grupo ' + (i % 5), grupo_produto: '', subgrupo: 'Sub ' + (i % 3), grupo_pai: 'Pai ' + (i % 2),
      classes: 'Classe ' + (i % 4), marca: 'Marca ' + (i % 9), familia: 'Fam ' + (i % 5), uf: 'SP', cidade: 'Cidade ' + (i % 8),
      criado_em: new Date(base + Math.floor(i / 500) * 60000).toISOString().replace('Z', '+00:00')
    };
  });
}

function esperar(cond, ms) {
  const limite = Date.now() + (ms || 3000);
  return new Promise((resolve, reject) => {
    (function tick() {
      if (cond()) return resolve();
      if (Date.now() > limite) return reject(new Error('esperar: condicao nao ocorreu a tempo'));
      setTimeout(tick, 5);
    })();
  });
}

// Texto de tudo que o render escreveu, sem os elementos de status/relogio (mudam com o caminho de carga).
function impressao(elementos) {
  const ignorar = new Set(['dc-last-update', 'dc-status', 'dc-sync-badge', 'dc-loading']);
  return [...elementos.entries()].filter(([k]) => !ignorar.has(k)).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, el]) => k + '|' + el.value + '|' + el.textContent + '|' + el.innerHTML).join('\n');
}

module.exports = { criarContexto, criarServidor, gerarLinhas, esperar, impressao };
