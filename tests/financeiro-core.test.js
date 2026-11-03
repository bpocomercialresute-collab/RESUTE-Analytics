const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/financeiro/financeiro-core.js'), 'utf8');

function montarAmbiente() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <span id="fin-filtro-resumo-texto"></span>
    <select id="fin-filtro-ano"><option value="0">Todos</option><option value="2026">2026</option></select>
    <select id="fin-filtro-mes"><option value="">Ano inteiro</option><option value="0">Jan</option></select>
    <input type="date" id="fin-filtro-inicio">
    <input type="date" id="fin-filtro-fim">
    <nav class="fin-tabs-cliente">
      <button class="fin-tab active" id="btn-dre">DRE</button>
      <button class="fin-tab" id="btn-laudo">Laudo</button>
    </nav>
    <div class="fin-pane-cliente" id="fin-dre-corpo">DRE</div>
    <div class="fin-pane-cliente" id="fin-laudo-corpo" style="display:none">Laudo</div>
  </body></html>`, { runScripts: 'dangerously' });

  dom.window.MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const scriptEl = dom.window.document.createElement('script');
  scriptEl.textContent = src;
  dom.window.document.body.appendChild(scriptEl);
  return dom;
}

test('finAtualizarResumoFiltroDRE mostra "Todos os períodos" sem nenhum filtro', () => {
  const dom = montarAmbiente();
  dom.window.finAtualizarResumoFiltroDRE();
  assert.equal(dom.window.document.getElementById('fin-filtro-resumo-texto').textContent, 'Todos os períodos');
});

test('finAtualizarResumoFiltroDRE mostra "Mês/Ano" quando só ano+mês estão preenchidos', () => {
  const dom = montarAmbiente();
  dom.window.document.getElementById('fin-filtro-ano').value = '2026';
  dom.window.document.getElementById('fin-filtro-mes').value = '0';
  dom.window.finAtualizarResumoFiltroDRE();
  assert.equal(dom.window.document.getElementById('fin-filtro-resumo-texto').textContent, 'Jan/2026');
});

test('finAtualizarResumoFiltroDRE prioriza o recorte por data sobre ano/mês quando ambos têm valor', () => {
  const dom = montarAmbiente();
  dom.window.document.getElementById('fin-filtro-ano').value = '2026';
  dom.window.document.getElementById('fin-filtro-mes').value = '0';
  dom.window.document.getElementById('fin-filtro-inicio').value = '2025-11-01';
  dom.window.document.getElementById('fin-filtro-fim').value = '2026-01-31';
  dom.window.finAtualizarResumoFiltroDRE();
  assert.equal(dom.window.document.getElementById('fin-filtro-resumo-texto').textContent, '01/11/2025 – 31/01/2026');
});

test('finAtualizarResumoFiltroDRE aceita só Início ou só Fim preenchido', () => {
  const dom = montarAmbiente();
  dom.window.document.getElementById('fin-filtro-inicio').value = '2026-03-10';
  dom.window.finAtualizarResumoFiltroDRE();
  assert.equal(dom.window.document.getElementById('fin-filtro-resumo-texto').textContent, '10/03/2026');
});

test('finAbrirAbaCliente troca a aba ativa e mostra só o painel escolhido', () => {
  const dom = montarAmbiente();
  const btnLaudo = dom.window.document.getElementById('btn-laudo');
  const btnDre = dom.window.document.getElementById('btn-dre');
  dom.window.finAbrirAbaCliente('fin-laudo-corpo', btnLaudo);

  assert.equal(btnLaudo.classList.contains('active'), true);
  assert.equal(btnDre.classList.contains('active'), false);
  assert.equal(dom.window.document.getElementById('fin-laudo-corpo').style.display, '');
  assert.equal(dom.window.document.getElementById('fin-dre-corpo').style.display, 'none');
});

test('financeiroDestruir zera o estado do módulo (empresa ativa, loading, preview)', () => {
  const dom = montarAmbiente();
  dom.window.FIN_ACTIVE_COMPANY = 'empresa-x';
  dom.window.FIN_IS_LOADING = true;
  dom.window.FIN_ADMIN_PREVIEW = true;
  dom.window.FIN_CHARTS = { grafico1: { destroy: function() {} } };

  dom.window.financeiroDestruir();

  assert.equal(dom.window.FIN_ACTIVE_COMPANY, '');
  assert.equal(dom.window.FIN_IS_LOADING, false);
  assert.equal(dom.window.FIN_ADMIN_PREVIEW, false);
  assert.deepEqual(JSON.parse(JSON.stringify(dom.window.FIN_CHARTS)), {});
});
