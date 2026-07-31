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

Os três arquivos abaixo vieram prontos e estão **byte a byte idênticos** à
entrega original guardada em `docs/ferramenta/`. Nenhuma linha foi alterada para
encaixá-los no sistema.

| Em produção | Original | Conteúdo |
|---|---|---|
| `views/dre-painel.html` | `docs/ferramenta/dre_painel.html` | bloco do painel, 6 abas |
| `css/dre-painel.css` | `docs/ferramenta/dre_painel.css` | estilos |
| `js/dre/dre-engine.js` | `docs/ferramenta/dre_engine.js` | motor, expõe `DRE` |

Conferir a qualquer momento:

```sh
cmp docs/ferramenta/dre_painel.html  views/dre-painel.html
cmp docs/ferramenta/dre_painel.css   css/dre-painel.css
cmp docs/ferramenta/dre_engine.js    js/dre/dre-engine.js
```

Ao evoluir o painel, edite os arquivos de produção e **sincronize a cópia em
`docs/ferramenta/`** — ou o `cmp` acima passa a acusar diferença e o rastro da
entrega original se perde.

`docs/ferramenta/plano_contas.json` e `docs/ferramenta/bd_lancamentos.json`
continuam ali como **registro do formato de dados da entrega original** — não
são mais servidos pelo app. Ver "Dados reais" abaixo.

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

## Dados reais — admin calcula, cliente só vê o resultado

Sem dado fictício: `_dreCarregarDados()` (`js/dre/dre-view.js`) lê direto de
`fin_dre_plano_contas` e `fin_dre_lancamentos` (schema em
`docs/supabase-dre.sql`), sempre filtrado por `empresa_id`. Empresa sem nada
cadastrado abre o painel vazio — os estados vazios (`fin-tabela-vazia`) já são
da ferramenta, nenhum precisou ser inventado aqui.

A entrada de dados é **só no console admin**, na aba **Financeiro**
(`js/admin-console.js`, `adminConsoleRenderFinanceiro`): cada card de empresa
ganhou a linha "Dados do DRE" com sete botões, implementados em
`js/dre/dre-admin.js` (mesmo padrão de `financeiro-admin.js` — colar
planilha, parser converte, grava por lote):

| Botão | Faz |
|---|---|
| Importar plano de contas | cola `cod\|conta\|grupo\|fv\|di`, grava em `fin_dre_plano_contas` |
| Importar lançamentos | cola `conta\|dt_caixa\|dt_venc\|dt_pag\|valor\|tot_pago\|parceiro\|documento\|banco\|forma`, grava em `fin_dre_lancamentos` |
| Editar plano (grade) / Editar lançamentos (grade) | grade estilo Excel — ver abaixo |
| Abrir DRE | abre o painel da ferramenta para aquela empresa (preview supervisionado) |
| Limpar plano / Limpar lançamentos | apaga tudo daquela empresa e tabela, com dupla confirmação |

### Grade estilo Excel (`js/dre/dre-grid.js`)

Os botões "Importar" (textarea + colar de uma vez) continuam para a primeira
carga em massa. Os botões "Editar (grade)" abrem um overlay de tela cheia com
comportamento de planilha de verdade — célula clicável, colar/copiar do
Excel (Ctrl+V/Ctrl+C), navegação por Tab/Enter/setas, ordenar por coluna,
filtro por coluna (estilo AutoFiltro), busca, desfazer última colagem
(1 nível), validação inline (borda vermelha + tooltip) e totais no rodapé.
Carrega o que já está no banco; só grava quando o admin aperta
"Salvar no banco" (`_dreGradeSalvarTabela`, delete + insert em lote).

Motor genérico, reutilizado pelas duas grades (Plano de Contas e
Lançamentos) — cada instância com seu próprio estado. Documentado por inteiro
em `docs/DRE_RESUTE_DOCUMENTACAO.md`, seção "Como os dados entram hoje", e o
brief original que pediu esse comportamento está em
`docs/ferramenta/modelo/PROMPT_DRE_RESUTE.md`.

**Limite assumido, de propósito:** colar (Ctrl+V) só funciona sem ordenação
nem filtro ativos na grade — a posição visual da célula deixa de bater com o
array de dados assim que a view é reordenada, e colar "no meio" de outra
ordem quebraria em silêncio. Copiar, navegar e editar célula a célula
funcionam normalmente com filtro/ordenação ligados. A grade avisa o usuário
antes de recusar a colagem.

O painel do cliente (seletor de módulos → Resultado (DRE)) usa a mesma
`dreAbrir()`, mas sem nenhum desses botões — o cliente só lê o que o admin já
calculou.

### Validações do import

- **Grupo** precisa bater com um dos 15 nomes que o motor conhece
  (`DRE.SE_POR_GRUPO`, lido direto do motor — não duplicado aqui, então não
  desalinha se a ferramenta ganhar/mudar grupos). Grupo não reconhecido barra
  a linha, com erro apontando o número da linha.
- **Conta duplicada** no mesmo arquivo colado barra a segunda ocorrência —
  o PROCV do motor é por nome de conta; duas linhas iguais tornam o resultado
  ambíguo.
- **Conta do lançamento fora do plano** não bloqueia o import (mensagem de
  confirmação avisa quantas), porque o motor já tem o comportamento certo
  para isso: mostra `#N/A` e soma no alerta "contas fora do plano".
- **`cod` em branco** vira o próprio nome da conta — só importa para a aba
  "Plano de Contas" identificar a linha ao clicar nos toggles F_V/D_I.

### Forma que chega ao motor

`plano`:

```json
{ "cod": "MP02", "conta": "Aviamento", "grupo": "CUSTO. MP OU REVENDA", "fv": "V", "di": "" }
```

`lancamentos` (o `cnpj: 1` é fixo, adicionado em `_dreCarregarDados` — a
multiempresa já é feita por `empresa_id`, não por `cnpj`):

```json
{ "id": "...", "dt_caixa": "2024-09-06", "dt_pag": "2024-09-06",
  "conta": "Vendas", "valor": 170, "cnpj": 1 }
```

### Persistência das marcações F_V / D_I pelo próprio painel

A aba "Plano de Contas" tem toggle F/V e D/I clicável na tela — mas isso é a
ferramenta original, e `salvar()` dentro dela (`js/dre/dre-engine.js`, seção
11) continua sendo só `console.log`: clicar no toggle muda a tela na hora,
mas não grava no banco. Hoje a gravação real do F_V/D_I é **só pelo import**
(reimportar o plano com a coluna atualizada). Ligar o toggle da tela direto no
`PATCH fin_dre_plano_contas` exigiria expor uma função do motor para
sobrescrever ou chamar depois de `salvar()` — que é interna ao IIFE, não faz
parte da API pública (`DRE.init`, `DRE.recalcular`, ...). Não fiz essa mudança
porque envolveria tocar em `dre-engine.js`, e esse arquivo é para ficar como
veio. Se quiser esse fio depois, é uma conversa separada.

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
- Ao mexer em `views/dre-painel.html` ou `css/dre-painel.css`, suba o `?v=`
  correspondente nas constantes `DRE_HTML_URL`/`DRE_CSS_URL` de
  `js/dre/dre-view.js`. Ao mexer em `js/dre/dre-engine.js`, `dre-view.js` ou
  `dre-admin.js`, suba o `?v=` do `<script>` correspondente em `index.html`.
- `dreDestruir()` destrói os Chart.js via `DRE.estado.charts`. Sem isso o
  Chart.js vaza memória a cada troca de módulo.
