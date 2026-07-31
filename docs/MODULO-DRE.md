# Módulo DRE

Painel de Demonstrativo de Resultado do Exercício. Réplica em JS da cadeia da
planilha `Modelo_DRE_Matheus.xlsx`: `PLANO_CONTAS → BD → BD_DRE (SUMIFS) → DESIGN`.

Não substitui o painel financeiro. São visões diferentes do mesmo dinheiro:

| Painel | Pergunta que responde |
|---|---|
| Financeiro (`view-dash-financeiro`) | quem me deve, a quem eu devo, quanto entra e sai — tesouraria |
| DRE (`view-dash-dre`) | quanto sobrou por competência, com que margem — resultado gerencial |

---

## A ferramenta é intocada

Os quatro arquivos abaixo vieram prontos e estão **byte a byte idênticos** à
entrega original guardada em `docs/ferramenta/`. Nenhuma linha foi alterada para
encaixá-los no sistema.

| Em produção | Original | Conteúdo |
|---|---|---|
| `views/dre-painel.html` | `docs/ferramenta/dre_painel.html` | bloco do painel, 6 abas |
| `css/dre-painel.css` | `docs/ferramenta/dre_painel.css` | estilos |
| `js/dre/dre-engine.js` | `docs/ferramenta/dre_engine.js` | motor, expõe `DRE` |
| `assets/dre/plano_contas.json` | `docs/ferramenta/plano_contas.json` | plano de contas |
| `assets/dre/bd_lancamentos.json` | `docs/ferramenta/bd_lancamentos.json` | lançamentos de exemplo |

Conferir a qualquer momento:

```sh
cmp docs/ferramenta/dre_painel.html  views/dre-painel.html
cmp docs/ferramenta/dre_painel.css   css/dre-painel.css
cmp docs/ferramenta/dre_engine.js    js/dre/dre-engine.js
cmp docs/ferramenta/plano_contas.json    assets/dre/plano_contas.json
cmp docs/ferramenta/bd_lancamentos.json  assets/dre/bd_lancamentos.json
```

Ao evoluir o painel, edite os arquivos de produção e **sincronize a cópia em
`docs/ferramenta/`** — ou o `cmp` acima passa a acusar diferença e o rastro da
entrega original se perde.

---

## Toda a adaptação está em um arquivo

`js/dre/dre-view.js` é a única cola. Ele existe porque três coisas não encaixam
sozinhas:

### 1. Os ids colidem com o painel financeiro

A ferramenta usa `fin-empresa`, `fin-status`, `fin-kpis`, `fin-alertas`,
`fin-filtro-ano`, `fin-btn-atualizar`, `fin-admin-back` — todos já existentes no
bloco estático de `#view-dash-financeiro`. Dois elementos com o mesmo id fazem
`getElementById` devolver só o primeiro, quebrando um dos painéis em silêncio.

Solução: `#view-dash-dre` nasce **vazio** no `index.html`. O HTML é buscado e
injetado em `dreAbrir()` e removido em `dreFechar()`. Enquanto o DRE está
montado ele é o primeiro no documento — por isso o container precisa vir
**antes** de `#view-dash-financeiro` no `index.html`. Fora disso, só o painel
financeiro tem esses ids.

**Consequência prática:** nunca troque a montagem dinâmica por HTML estático sem
antes renomear os ids de um dos lados.

### 2. O CSS da ferramenta vazaria para o dashboard comercial

`css/dre-painel.css` redefine `.dc-kpi-card`, `.dc-kpi-value`, `.dc-kpi-label`,
`.dc-kpi-sub`, `.dc-alert-card` (e modificadores) e `.dc-tabela` (e
descendentes) sem prefixo. Essas classes são do dashboard comercial.

Solução: `_dreInjetarCSS()` carrega o arquivo, insere num `<style>` e reescreve
cada `selectorText` via CSSOM prefixando `#view-dash-dre `. Usa CSSOM em vez de
regex porque o navegador já separou seletor de declaração e trata `@media`
sozinho. O arquivo em disco continua intacto.

### 3. As abas do painel financeiro perdiam o estado

`ligarAbas()` da ferramenta faz `querySelectorAll('.fin-tab')` sem escopo e
alcança as abas do painel financeiro, removendo `.active` delas.
`_dreRestaurarAbasFinanceiro()` reativa a primeira aba daquele painel na
desmontagem.

---

## Registro no sistema

`js/modulos.js`:

- `MODULOS.DRE = 'dre'`
- `MODULO_META.dre` — `view: 'view-dash-dre'`, `disponivel: true`
- `abrirModulo` → `dreAbrir(opts)`
- `_fecharModulo` → `dreFechar()` (desmonta, não só esconde)
- `resetarModulos` → `dreDestruir()` (destrói os Chart.js)

`js/auth.js` — o DRE entra junto do painel financeiro nos pontos que escondem
views: logout, `_abrirApp()` e `_abrirDashCliente()`.

Como o gating é por `SESSION.modulos`, o painel aparece no seletor de módulos
para quem tem `'dre'` na lista. `super_admin` enxerga todos os módulos.

> `temModulo()` é UX, não segurança. A barreira real continua sendo RLS no
> Supabase + `api/secure-proxy.js`.

---

## Dados: o que falta para sair do exemplo

Hoje `_dreCarregarDados()` lê os dois JSON de `assets/dre/`, iguais para toda
empresa. Para ligar no banco, só essa função muda — o motor recebe
`{ plano, lancamentos }` e não sabe de onde veio.

### Forma esperada pelo motor

`plano` — uma linha por conta:

```json
{ "cod": "MP02", "conta": "Aviamento", "grupo": "CUSTO. MP OU REVENDA", "fv": "V", "di": "" }
```

`lancamentos` — livro-razão:

```json
{ "id": 1283, "dt_caixa": "2024-09-06", "dt_pag": "2024-09-06",
  "conta": "Vendas", "valor": 170, "cnpj": 1 }
```

O PROCV é por **nome da conta** (`lancamento.conta` → `plano.conta`), comparado
sem diferenciar maiúsculas. Conta ausente do plano vira `#N/A` e **não entra no
DRE** — o painel já alerta quantos lançamentos caíram nesse caso.

### Lacunas contra o schema atual

`fin_lancamentos` (`docs/supabase-financeiro.sql`) não cobre o modelo:

| Motor precisa | Hoje existe | Ação |
|---|---|---|
| plano de contas (`cod`, `conta`, `grupo`, `fv`, `di`) | — | criar `fin_plano_contas` com RLS |
| `conta` (chave do PROCV) | `categoria`, texto livre | normalizar contra o plano, senão vira `#N/A` em massa |
| `dt_caixa` | `data_competencia` | mapear |
| `dt_pag` | `data_pagamento` | mapear |
| `cnpj` | `empresa_id` (uuid) | `estado.cnpj` aceita qualquer valor; passar o uuid |
| sinal entrada/saída | coluna `tipo` | o DRE **deriva do grupo**, ignora `tipo` — o plano vira a fonte da verdade |

A tabela nova precisa do prefixo `fin_`: `FIN_TABLE_REGEX` em
`api/secure-proxy.js` recusa qualquer outra.

### Persistência das marcações F_V / D_I

A aba "Plano de Contas" é a única de digitação do painel. Hoje `salvar()` no
motor (`js/dre/dre-engine.js`, seção 11) só faz `console.log`. Gravar exige
`PATCH` via `api/secure-proxy.js` — escrita não passa por RLS, só `super_admin`.

Sem essas marcações, margem de contribuição, índice MC e ponto de equilíbrio
saem incompletos; o painel já emite alerta contando as contas sem marcação.

---

## O que o motor calcula

15 grupos com classificação `s_e`: `E` entrada, `S` saída, `0` extracontábil
(FATURAMENTO e VALOR PRODUZIDO — exibidos, mas fora da soma do resultado).

Cascata de 21 linhas:

```
RECEITA OPERACIONAL − DESP. TRIBUTÁRIA        = RECEITA LÍQUIDA  (base das margens)
                    − CUSTO. MP OU REVENDA    = LUCRO BRUTO
                    − 6 grupos de despesa     = EBITDA
                    − DESP. FINANCEIRA
                    + RECEITA NÃO OPERACIONAL = RESULTADO ANTES DE SÓCIOS
                    − PROLABORE E RETIRADA    = LUCRO LÍQUIDO
                    − INVESTIMENTOS           = GERAÇÃO DE CAIXA
```

Mais margem de contribuição, índice MC, ponto de equilíbrio (via F_V) e custo
direto unitário sobre o VALOR PRODUZIDO (via D_I).

---

## Notas de manutenção

- O motor é ES2020 (`const`, arrow, `?.`, `??`); o resto de `js/` é ES5
  (`var`, `function`). Proposital — não "padronize" reescrevendo a ferramenta.
- Ao mexer em `views/dre-painel.html`, `css/dre-painel.css` ou
  `js/dre/dre-engine.js`, suba o `?v=` correspondente em `js/dre/dre-view.js`
  (HTML, CSS e JSON) e em `index.html` (os dois `<script>`).
- `dreDestruir()` destrói os Chart.js via `DRE.estado.charts`. Sem isso o
  Chart.js vaza memória a cada troca de módulo.
