const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const authSource = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
const finSource = fs.readFileSync(path.join(root, 'js/financeiro/financeiro-core.js'), 'utf8');

function extrairFuncao(src, nome) {
  const m = src.match(new RegExp('function\\s+' + nome + '\\s*\\('));
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

// Markup minimo: botao "Filtros" e o grupo, dentro do header-right, igual
// index.html (tanto o painel Comercial dc-* quanto o Financeiro fin-*).
function montarDom(prefixo) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dc-header-right">
      <button id="${prefixo}-filtro-resumo" aria-expanded="false"></button>
      <div id="${prefixo}-filtros-grupo" class="dc-filtros-grupo"></div>
      <button class="dc-btn-sair">Sair</button>
    </div>
  </body></html>`);
  const ctx = { document: dom.window.document };
  vm.createContext(ctx);
  return { dom, ctx };
}

test('dcToggleFiltrosMobile: abrir marca dc-filtro-aberto no header-right (pra "Sair" nao ficar cortado no mobile)', () => {
  const { dom, ctx } = montarDom('dc');
  vm.runInContext(extrairFuncao(authSource, 'dcToggleFiltrosMobile'), ctx);

  ctx.dcToggleFiltrosMobile();

  const header = dom.window.document.querySelector('.dc-header-right');
  const grupo = dom.window.document.getElementById('dc-filtros-grupo');
  const btn = dom.window.document.getElementById('dc-filtro-resumo');
  assert.equal(header.classList.contains('dc-filtro-aberto'), true);
  assert.equal(grupo.classList.contains('aberto'), true);
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
});

test('dcToggleFiltrosMobile: fechar de novo tira a classe do header-right', () => {
  const { dom, ctx } = montarDom('dc');
  vm.runInContext(extrairFuncao(authSource, 'dcToggleFiltrosMobile'), ctx);

  ctx.dcToggleFiltrosMobile(); // abre
  ctx.dcToggleFiltrosMobile(); // fecha

  const header = dom.window.document.querySelector('.dc-header-right');
  assert.equal(header.classList.contains('dc-filtro-aberto'), false);
});

test('finToggleFiltrosMobile: mesmo comportamento no painel Financeiro (fin-*)', () => {
  const { dom, ctx } = montarDom('fin');
  vm.runInContext(extrairFuncao(finSource, 'finToggleFiltrosMobile'), ctx);

  ctx.finToggleFiltrosMobile();

  const header = dom.window.document.querySelector('.dc-header-right');
  assert.equal(header.classList.contains('dc-filtro-aberto'), true);
});
