# DRE RESUTE — Documentação da lógica (revisada)

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
  vira "S" (saída) por padrão — ou seja, um erro de digitação no grupo não
  quebra visivelmente, só distorce o resultado. A grade de edição valida isso
  antes de salvar.
- **`F_V`** (Fixo/Variável) e **`D_I`** (Direto/Indireto) são independentes
  entre si — uma conta pode ser `F+D`, `F+I`, `V+D` ou `V+I`. Alimentam só a
  aba de análise (margem de contribuição, ponto de equilíbrio, custo direto
  unitário), não a cascata do DRE.

### ⚠️ Estado real do arquivo original

- **`F_V`**: 74 contas marcadas como `F`, 49 como `V`, **198 em branco**.
- **`D_I`**: **100% em branco** nas 321 contas — nenhuma conta possui marcação
  de Direto/Indireto no arquivo original.

Consequência direta: os indicadores de **Custo Direto Unitário** e **peso do
direto** vão aparecer zerados até o usuário marcar o `D_I` manualmente conta
a conta. O painel deve exibir dois alertas separados:
- Um para contas de saída sem `F_V` → "Margem de contribuição incompleta"
- Outro para contas de saída sem `D_I` → "Custo direto por produto incompleto"

Misturar os dois em um único alerta esconde a gravidade do `D_I`, que está
completamente vazio.

---

## Estágio 2 — BD (livro-razão, entrada parcialmente manual)

Campos digitados: `DT_CAIXA` (data de competência — é esta que o DRE usa,
não `DT_VENC`), `DT_VENC`, `DT_PAG`, `CONTA`, `VALOR`, `PARCEIRO`,
`DOCUMENTO`, `BANCO`, `FORMA`.

Campos derivados automaticamente (`enriquecerBD()`, seção 5):

| Campo | Como é calculado |
|---|---|
| `GRUPO` | PROCV em `PLANO_CONTAS` pelo nome da conta |
| `S_E` | `SE_POR_GRUPO[grupo]` — `E` entrada, `S` saída, `0` extracontábil |
| `ANO`, `MÊS` | de `DT_CAIXA` |
| `STATUS` | `PG` se `DT_PAG` preenchida, senão `N` |

Conta sem correspondência no plano vira **`#N/A`** e fica de fora da soma do
resultado. O painel mostra um alerta contando quantos lançamentos caíram nesse
caso (`renderAlertas`, seção 14).

### Como corrigir um lançamento `#N/A`

Há dois caminhos — o usuário precisa saber qual usar:

1. **O nome da conta no BD está errado** (erro de digitação, espaço extra,
   capitalização diferente): corrigir no BD, na coluna `CONTA`.
2. **A conta existe no BD mas não foi cadastrada no Plano de Contas**: ir à
   aba Plano de Contas e adicionar a conta com grupo, `F_V` e `D_I`.

Sem essa correção o lançamento continua invisível para o DRE — não entra em
nenhum grupo, não afeta nenhum resultado.

`S_E = '0'` (extracontábil) é o caso de `FATURAMENTO` e `VALOR PRODUZIDO`:
aparecem no DRE como blocos informativos, mas nunca entram na cascata de
resultado — servem só para o cálculo de custo direto unitário.

### Campos presentes no Excel original mas fora do schema atual

| Campo | Situação | Observação |
|---|---|---|
| `TOT_PAGO` | Não persistido | Útil para inadimplência: valor em aberto = `VALOR − TOT_PAGO`. Manter no schema mesmo sem uso imediato evita migração futura. |
| `VENC` | Não persistido | VP = vencido/pago, VA = a vencer. Útil para aging. Mesmo caso do `TOT_PAGO`. |
| `CNPJ` | Fixado em `1` | Ver seção abaixo. |

**Recomendação:** incluir `TOT_PAGO` e `VENC` no schema de `fin_dre_lancamentos`
desde já, mesmo que nenhum cálculo atual os consuma. Custo zero agora, migração
evitada depois.

---

## Estágio 3 — BD_DRE (matriz calculada, o "SUMIFS" da planilha)

Fórmula original do Excel, célula a célula:

```
SUMIFS(BD.VALOR; BD.CONTA; esta_conta; BD.ANO; este_ano; BD.MÊS; este_mês; BD.CNPJ; este_cnpj)
```

O motor não repete essa varredura por célula (321 contas × 12 meses = 3.852
varreduras do BD a cada recálculo). Em vez disso, `montarBDDRE()` (seção 6)
indexa o BD **uma vez** numa chave composta `conta|ano|mês|cnpj` e depois
monta o produto cartesiano lendo dessa tabela hash — mesmo resultado, uma
passada só.

### ⚠️ Armadilha crítica: normalização do mês (case-insensitive)

O BD original grava o mês em **minúsculo** (`set`, `jan`, `fev`…) enquanto o
cabeçalho do BD_DRE usa **capitalizado** (`Set`, `Jan`, `Fev`…). No Excel o
SUMIFS é case-insensitive e casa normalmente. **Em JavaScript a comparação de
strings é case-sensitive** — sem normalização, toda a matriz do BD_DRE zera
silenciosamente, sem lançar nenhum erro.

Regra obrigatória no motor: **sempre converter os dois lados para minúsculo**
antes de montar a chave de comparação:

```js
// ERRADO — zera a matriz inteira sem aviso
chave = `${conta}|${ano}|${mes}|${cnpj}`

// CORRETO
chave = `${conta.toLowerCase()}|${ano}|${mes.toLowerCase()}|${cnpj}`
```

Qualquer refatoração no motor deve preservar essa normalização. É a falha mais
silenciosa de toda a implementação.

### Colunas calculadas por linha

- **`TOTAL`** = soma de `Jan..Dez` restrita ao recorte de meses ativo (não é
  sempre o ano inteiro — o filtro de mês do painel corta o intervalo).
- **`MÉD`** = `TOTAL ÷ número de meses do recorte` — **não** divide por 12
  fixo. Um recorte de 3 meses divide por 3.
- **`%`** = `TOTAL da linha ÷ receita total do período`. Calculado em **dois
  passes**: primeiro soma tudo, depois calcula o `%` — o `%` só existe depois
  que a receita total estiver disponível.

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

---

## Indicadores

| Indicador | Fórmula | Depende de |
|---|---|---|
| Margem Bruta / EBITDA / Líquida | linha de resultado ÷ Receita Líquida | BD_DRE calculado |
| Margem de Contribuição | Receita − custos/despesas com `F_V = V` | `F_V` marcado nas contas |
| Índice MC | Margem de Contribuição ÷ Receita | idem |
| Ponto de Equilíbrio | Total com `F_V = F` ÷ Índice MC | idem |
| Custo Direto Unitário | Total com `D_I = D` ÷ VALOR PRODUZIDO | `D_I` marcado nas contas |
| Peso de cada grupo | total do grupo ÷ receita total | BD_DRE calculado |

**Atenção:** Margem de Contribuição e Ponto de Equilíbrio ficam incorretos
enquanto `F_V` estiver em branco. Custo Direto Unitário fica zerado enquanto
`D_I` estiver em branco — que é o estado atual do arquivo original (100% vazio).

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

---

## As 6 abas da ferramenta

1. **DRE** — cascata visual + KPIs + alertas no topo
2. **BD_DRE** — a matriz conta × mês com os SUMIFS calculados
3. **Plano de Contas** — tabela com busca/filtro por grupo/F_V/D_I e toggle de marcação
4. **Lançamentos** — livro-razão com GRUPO/S_E já resolvidos
5. **Fixo/Variável · Direto/Indireto** — barras + indicadores de MC e PE
6. **Gráficos** — receita × resultado por mês, peso dos grupos, evolução das margens

---

## Como os dados entram

1. **Colar planilha inteira** — modal com textarea, para a primeira carga em massa
2. **Grade estilo Excel** — célula clicável, colar/copiar do Excel, navegação
   por Tab/Enter/setas, ordenar por coluna, filtro por coluna (estilo
   AutoFiltro), busca, desfazer última colagem, validação inline (borda
   vermelha + tooltip) e totais no rodapé. Só grava quando o admin aperta
   "Salvar no banco".

---

## CNPJ — multiempresa

O sistema separa empresas por `empresa_id` (RLS), então hoje `cnpj` é fixado
em `1` em todos os lançamentos. O campo existe no motor porque a fórmula
original do Excel o usa como chave de SUMIFS.

**Atenção futura:** se uma mesma empresa vier a ter múltiplos CNPJs (ex:
Varremaster indústria + Varremaster comercial), o campo `cnpj` no schema
precisará receber valores reais e o motor já está preparado para isso — basta
parar de fixar `cnpj: 1` na carga dos dados.

---

## Diferenças conscientes entre o Excel original e a implementação

| Diferença | Motivo |
|---|---|
| `CNPJ` fixado em `1` | Multiempresa já resolvida por `empresa_id` + RLS |
| `TOT_PAGO` fora do schema | Sem uso no DRE; recomenda-se incluir no schema para uso futuro |
| `VENC` fora do schema | Idem |
| `D_I` 100% vazio | Estado original da planilha — usuário precisa marcar manualmente |