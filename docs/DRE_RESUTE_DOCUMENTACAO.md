# DRE RESUTE — Documentação da lógica

Réplica em JavaScript da planilha `Modelo_DRE_Matheus.xlsx`
(`docs/ferramenta/modelo/`). Este documento explica a cadeia de cálculo, as
fórmulas, a ordem de execução obrigatória e onde cada peça vive no código hoje.
Para "onde a ferramenta se encaixa no sistema" (ids, rotas, RLS), ver
`docs/MODULO-DRE.md` — este arquivo é sobre a **lógica do DRE em si**, não
sobre a integração.

---

## A cadeia — 4 estágios, cada um só existe por causa do anterior

```
PLANO_CONTAS  →  BD (lançamentos)  →  BD_DRE (matriz SUMIFS)  →  DESIGN (DRE visual)
```

Inverter a ordem produz número errado sem erro visível — é por isso que
`recalcular()` em `js/dre/dre-engine.js` (seção 16) chama as etapas sempre na
mesma sequência: `montarBDDRE()` primeiro, o resto depois.

---

## Estágio 1 — PLANO_CONTAS (dicionário de contas, 100% manual)

Colunas: `COD`, `CONTA`, `GRUPO`, `F_V`, `D_I`.

- **`CONTA` é a chave de tudo.** Todo lançamento do BD casa com o plano pelo
  nome da conta (comparação sem diferenciar maiúsculas). Duas linhas com o
  mesmo nome de conta tornam o PROCV ambíguo — a grade de edição
  (`js/dre/dre-grid.js`) e o schema (`docs/supabase-dre.sql`, `unique
  (empresa_id, conta)`) recusam duplicata.
- **`GRUPO`** precisa ser um dos 15 nomes que o motor conhece
  (`DRE.SE_POR_GRUPO` em `dre_engine.js`, seção 1). Grupo fora dessa lista
  vira "S" (saída) por padrão — um erro de digitação no grupo não quebra
  visivelmente, só distorce o resultado. A grade de edição valida isso antes
  de salvar.
- **`F_V`** (Fixo/Variável) e **`D_I`** (Direto/Indireto) são independentes
  entre si — uma conta pode ser `F+D`, `F+I`, `V+D` ou `V+I`. Alimentam só a
  aba de análise (margem de contribuição, ponto de equilíbrio, custo direto
  unitário), não a cascata do DRE.

### Estado real do arquivo-modelo (`Modelo DRE Matheus.xlsx`, 321 contas)

Conferido direto na planilha:

| Campo | Distribuição |
|---|---|
| `F_V` | 74 `F` · 49 `V` · **198 em branco** |
| `D_I` | **321 em branco (100%)** — nenhuma conta tem Direto/Indireto marcado |

Consequência prática: **Custo Direto Unitário** e **peso do direto** vão sair
zerados em qualquer empresa até alguém marcar `D_I` conta a conta — não é bug,
é o estado herdado do modelo original. Por isso o motor separa os dois
alertas (`renderAlertas`, `dre_engine.js` seção 14, já assim na entrega,
nenhuma mudança necessária):

```js
if (semFV) add('atencao','Contas sem marcação F_V', ...)   // 198 contas no modelo
if (semDI) add('atencao','Contas sem marcação D_I', ...)   // 321 contas no modelo
```

Misturar os dois num alerta só esconderia que o `D_I` está inteiramente vazio.

---

## Estágio 2 — BD (livro-razão, entrada parcialmente manual)

Campos digitados: `DT_CAIXA` (data de competência — é esta que o DRE usa,
não `DT_VENC`), `DT_VENC`, `DT_PAG`, `CONTA`, `VALOR`, `TOT_PAGO`,
`PARCEIRO`, `DOCUMENTO`, `BANCO`, `FORMA`.

Campos derivados automaticamente (`enriquecerBD()`, seção 5):

| Campo | Como é calculado |
|---|---|
| `GRUPO` | PROCV em `PLANO_CONTAS` pelo nome da conta |
| `S_E` | `SE_POR_GRUPO[grupo]` — `E` entrada, `S` saída, `0` extracontábil |
| `ANO`, `MÊS` | de `DT_CAIXA` |
| `STATUS` | `PG` se `DT_PAG` preenchida, senão `N` |

Conta sem correspondência no plano vira **`#N/A`** e fica de fora da soma do
resultado. O painel mostra um alerta contando quantos lançamentos caíram
nesse caso (`renderAlertas`, seção 14).

### Corrigindo um lançamento `#N/A`

Dois caminhos possíveis — importa saber qual é o certo:

1. **Nome da conta digitado errado no BD** (typo, espaço extra,
   capitalização diferente do plano): corrige direto no BD, coluna `CONTA`.
2. **Conta existe de verdade mas nunca foi cadastrada no plano**: vai na aba
   Plano de Contas e cadastra ela (com grupo, `F_V`, `D_I`).

Sem correção o lançamento fica invisível para o DRE — não entra em nenhum
grupo, não afeta nenhum resultado, e some sem gerar erro além do alerta.

`S_E = '0'` (extracontábil) é o caso de `FATURAMENTO` e `VALOR PRODUZIDO`:
aparecem no DRE como blocos informativos, mas nunca entram na cascata de
resultado — servem só para o custo direto unitário no Estágio 4.

### Por que o mês não quebra por maiúscula/minúscula aqui

No Excel original, o BD grava o mês em minúsculo (`set`, `jan`...) e o
BD_DRE em capitalizado (`Set`, `Jan`...). O SUMIFS do Excel é
case-insensitive e não liga para isso; uma reimplementação ingênua em
JavaScript (que É case-sensitive) zeraria a matriz inteira em silêncio se
comparasse essas strings direto.

O motor **evita esse problema estruturalmente**: a chave de cruzamento em
`montarBDDRE()` não usa o nome do mês como string — usa `mesIdx`, o índice
numérico 0–11 tirado de `Date.getMonth()`:

```js
// dre_engine.js — chave real usada, não strings de mês
const chave = `${norm(l.conta)}|${l.ano}|${l.mesIdx}|${l.cnpj}`;
```

Não existe comparação de nome de mês em lugar nenhum da cadeia de cálculo —
só `norm()` (minúsculo) na conta, que é a única chave textual que sobrevive.
Se qualquer refatoração futura reintroduzir comparação de mês por nome, essa
é exatamente a armadilha a evitar.

### Campos do Excel original e sua situação no schema (`fin_dre_lancamentos`)

| Campo | Situação | Observação |
|---|---|---|
| `TOT_PAGO` | **Coluna no schema**, editável na grade | Não lido por nenhum cálculo do motor hoje. Guardado para inadimplência futura: aberto = `valor − tot_pago`. |
| `VENC` | **Não é coluna do banco** — calculado ao vivo | Ver abaixo. |
| `CNPJ` | Fixado em `1` no carregamento | Ver seção "CNPJ e multiempresa". |

`VENC` (VP/VA no Excel) é inerentemente temporal — depende da data de hoje
contra `DT_VENC`. Gravar um valor calculado no momento do import ficaria
errado no dia seguinte (um lançamento "a vencer" viraria "vencido" sem que
ninguém tocasse o dado). Por isso não é uma coluna persistida: a grade de
edição (`js/dre/dre-grid.js`, coluna derivada `venc` em
`_dreGradeCalcularDerivadasLancamento`) recalcula isso a cada abertura,
exatamente como já faz com `STATUS`.

O Excel original só tinha dois estados (VP = vencido/pago, VA = a vencer),
o que deixa "vencido e ainda não pago" escondido dentro de VA — justamente o
caso que essa coluna deveria sinalizar para cobrança. A versão da grade usa
três estados:

```
dt_pag preenchida        → VP
sem dt_pag, dt_venc < hoje → VENCIDO
sem dt_pag, dt_venc ≥ hoje → A VENCER
```

---

## Estágio 3 — BD_DRE (matriz calculada, o "SUMIFS" da planilha)

Fórmula original do Excel, célula a célula:

```
SUMIFS(BD.VALOR; BD.CONTA; esta_conta; BD.ANO; este_ano; BD.MÊS; este_mês; BD.CNPJ; este_cnpj)
```

O motor não repete essa varredura por célula (321 contas × 12 meses = 3.852
varreduras do BD a cada recálculo). Em vez disso, `montarBDDRE()` (seção 6)
indexa o BD **uma vez** numa chave composta `conta|ano|mesIdx|cnpj` e depois
monta o produto cartesiano lendo dessa tabela hash — mesmo resultado, uma
passada só.

Colunas calculadas por linha:
- **`TOTAL`** = soma de `Jan..Dez` restrita ao recorte de meses ativo (não é
  sempre o ano inteiro — o filtro de mês do painel corta o intervalo).
- **`MÉD`** = `TOTAL ÷ número de meses do recorte` — **não** divide por 12
  fixo. Um recorte de 3 meses divide por 3.
- **`%`** = `TOTAL da linha ÷ receita total do período`. Calculado em **dois
  passes**: primeiro soma tudo, depois calcula o `%` — só é possível depois
  que a receita total já está disponível (comentário na seção 6 do motor).

---

## Estágio 4 — DESIGN (o DRE visual, 100% derivado do BD_DRE)

Nada é digitado aqui. `ESTRUTURA` (seção 1) descreve a ordem fixa dos blocos;
`renderBloco()`/`renderResultado()` (seção 9) desenham a partir do BD_DRE.

---

## Estrutura obrigatória do DRE (ordem dos blocos)

```
FATURAMENTO                     ← extracontábil (S_E=0), não soma
VALOR PRODUZIDO                 ← extracontábil (S_E=0), não soma
(+) RECEITA OPERACIONAL
(-) DESP. TRIBUTÁRIA
════ RECEITA LÍQUIDA            ← base de todas as margens
(-) CUSTO. MP OU REVENDA
════ LUCRO BRUTO
(-) DESP. OPERACIONAL
(-) DESP. COMERCIAL
(-) DESP. LOGÍSTICA
(-) DESP. ADM
(-) MKT
(-) MANUT. E CONSERVAÇÃO
════ EBITDA
(-) DESP. FINANCEIRA
(+) RECEITA NÃO OPERACIONAL
════ RESULTADO ANTES DE SÓCIOS
(-) PROLABORE E RETIRADA
════ LUCRO LÍQUIDO
(-) INVESTIMENTOS
════ GERAÇÃO DE CAIXA
```

Implementado em `calcularResultado()` (`dre_engine.js`, seção 7) — cada linha
de resultado é a anterior somada/subtraída do próximo grupo, mês a mês,
depois recortada pelo intervalo de meses ativo.

---

## Indicadores

| Indicador | Fórmula | Depende de |
|---|---|---|
| Margem Bruta / EBITDA / Líquida | linha de resultado ÷ Receita Líquida | BD_DRE calculado |
| Margem de Contribuição | Receita − custos/despesas com `F_V = V` | `F_V` marcado nas contas de saída |
| Índice MC | Margem de Contribuição ÷ Receita | idem |
| Ponto de Equilíbrio | Total com `F_V = F` ÷ Índice MC | idem |
| Custo Direto Unitário | Total com `D_I = D` ÷ VALOR PRODUZIDO | `D_I` marcado nas contas de saída |
| Peso de cada grupo | total do grupo ÷ receita total | BD_DRE calculado |

Margem de Contribuição e Ponto de Equilíbrio ficam incorretos enquanto `F_V`
estiver em branco nas contas de saída (198 de 321 no modelo original). Custo
Direto Unitário fica **zerado** enquanto `D_I` estiver em branco — que é o
estado de 100% das contas no arquivo-modelo. Isso não é uma falha da
ferramenta: é dado que precisa ser preenchido, conta a conta, na aba Plano de
Contas (ou na grade de edição do console admin).

---

## Visual (paleta da aba DESIGN original)

| Elemento | Cor |
|---|---|
| Cabeçalho de grupo | `#002060` (azul-marinho), texto branco |
| Coluna TOT | `#00B050` (verde) |
| Valores de saída | `#FF0000` (vermelho) |
| Linha de total do grupo | `#FFFF00` (amarelo) |
| Fonte | Calibri 10 |
| Zero | cinza, exibe `-` |

Replicado em `css/dre-painel.css` (variáveis `--fin-navy`, `--fin-green`,
`--fin-red`, `--fin-yellow` no topo do arquivo).

---

## As 6 abas da ferramenta (`views/dre-painel.html`)

1. **DRE** — cascata visual + KPIs + alertas no topo
2. **BD_DRE** — a matriz conta × mês com os SUMIFS calculados
3. **Plano de Contas** — tabela com busca/filtro por grupo/F_V/D_I e toggle de marcação (clique alterna F→V→vazio)
4. **Lançamentos** — livro-razão com GRUPO/S_E já resolvidos
5. **Fixo/Variável · Direto/Indireto** — barras + indicadores de MC e PE
6. **Gráficos** — receita × resultado por mês, peso dos grupos, evolução das margens

---

## Como os dados entram

O painel da ferramenta (abas 2–4 acima) é **somente leitura** — mostra o que
já está calculado, não edita célula a célula. A entrada de dados fica
inteiramente no **console admin**:

1. **Colar planilha inteira** (`js/dre/dre-admin.js`,
   `dreAdminAbrirImportacaoPlano` / `dreAdminAbrirImportacaoLancamentos`) —
   modal com textarea, bom para a primeira carga em massa.
2. **Grade estilo Excel** (`js/dre/dre-grid.js`, botões "Editar plano
   (grade)" / "Editar lançamentos (grade)") — célula clicável, colar/copiar
   do Excel, navegação Tab/Enter/setas, ordenar por coluna, filtro por
   coluna (estilo AutoFiltro), busca, desfazer última colagem (1 nível),
   validação inline (borda vermelha + tooltip, aviso amarelo para casos não
   bloqueantes) e totais no rodapé. Carrega o que já está no banco, deixa
   editar à vontade, só grava quando o admin aperta "Salvar no banco".

Os dois caminhos gravam nas mesmas tabelas: `fin_dre_plano_contas` e
`fin_dre_lancamentos` (`docs/supabase-dre.sql`), sempre por `empresa_id`. O
painel do cliente (seletor de módulos → Resultado (DRE)) só lê o resultado já
calculado — nenhum botão de edição aparece lá.

**Limite assumido, de propósito:** colar (Ctrl+V) na grade só funciona sem
ordenação nem filtro ativos — a posição visual da célula deixa de bater com o
array de dados assim que a view é reordenada, e colar "no meio" de outra
ordem quebraria em silêncio. Copiar, navegar e editar célula a célula
funcionam normalmente com filtro/ordenação ligados.

---

## CNPJ e multiempresa

O sistema já separa empresas por `empresa_id` (RLS) — por isso todo
lançamento entra com `cnpj: 1` fixo no carregamento
(`js/dre/dre-view.js`, `_dreCarregarDados`). O campo existe no motor só
porque a fórmula original do Excel o usa como uma das chaves do SUMIFS, não
porque o sistema precise dele para separar empresas.

**Se uma empresa vier a operar com múltiplos CNPJs de verdade** (ex: uma
indústria e uma comercial sob a mesma conta), o motor já está pronto para
isso — `estado.cnpj` é só mais um campo de filtro na chave. Bastaria parar de
fixar `cnpj: 1` na carga e passar a gravar/ler o CNPJ real por lançamento;
nenhuma mudança na cadeia de cálculo em si.

---

## Diferenças conscientes entre o Excel original e a implementação

| Diferença | Motivo |
|---|---|
| `CNPJ` fixado em `1` | Multiempresa já resolvida por `empresa_id` + RLS — ver seção acima |
| `TOT_PAGO` no schema, sem uso no motor | Guardado para relatório de inadimplência futuro; zero custo hoje |
| `VENC` não é coluna do banco | É temporal (depende de "hoje") — persistir um snapshot ficaria errado com o tempo; calculado ao vivo na grade, com 3 estados em vez dos 2 ambíguos do Excel |
| `D_I` 100% vazio no modelo | Estado herdado da planilha original — precisa ser preenchido manualmente, não é falha da ferramenta |
| Comparação de mês não usa nome de string | Motor usa índice numérico do mês, evitando por construção a armadilha de case-sensitivity que existiria copiando o SUMIFS do Excel ao pé da letra |
