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

### Estágio 1 — PLANO_CONTAS (dicionário de contas, 100% manual)

Colunas: `COD`, `CONTA`, `GRUPO`, `F_V`, `D_I`.

- **`CONTA` é a chave de tudo.** Todo lançamento do BD casa com o plano pelo
  nome da conta (comparação sem diferenciar maiúsculas). Duas linhas com o
  mesmo nome de conta tornam o PROCV ambíguo — por isso a grade de edição
  (`js/dre/dre-grid.js`) e o schema (`docs/supabase-dre.sql`, `unique
  (empresa_id, conta)`) recusam duplicata.
- **`GRUPO`** precisa ser um dos 15 nomes que o motor conhece
  (`DRE.SE_POR_GRUPO` em `dre_engine.js`, seção 1). Grupo fora dessa lista
  vira "S" (saída) por padrão (`seDoGrupo`, linha `SE_POR_GRUPO[g] ?? 'S'`) —
  ou seja, um erro de digitação no grupo não quebra visivelmente, só distorce
  o resultado. A grade de edição valida isso antes de salvar.
- **`F_V`** (Fixo/Variável) e **`D_I`** (Direto/Indireto) são independentes
  entre si — uma conta pode ser `F+D`, `F+I`, `V+D` ou `V+I`. Alimentam só a
  aba de análise (margem de contribuição, ponto de equilíbrio, custo direto
  unitário), não a cascata do DRE.

### Estágio 2 — BD (livro-razão, entrada parcialmente manual)

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
resultado — o painel mostra um alerta contando quantos lançamentos caíram
nesse caso (`renderAlertas`, seção 14).

`S_E = '0'` (extracontábil) é o caso de `FATURAMENTO` e `VALOR PRODUZIDO`:
aparecem no DRE como blocos informativos, mas nunca entram na cascata de
resultado — servem só para o cálculo de custo direto unitário no Estágio 4.

### Estágio 3 — BD_DRE (matriz calculada, é o "SUMIFS" da planilha)

Fórmula original do Excel, célula a célula:

```
SUMIFS(BD.VALOR; BD.CONTA; esta_conta; BD.ANO; este_ano; BD.MÊS; este_mês; BD.CNPJ; este_cnpj)
```

O motor não repete essa varredura por célula (321 contas × 12 meses = 3.852
varreduras do BD a cada recálculo). Em vez disso, `montarBDDRE()` (seção 6)
indexa o BD **uma vez** numa chave composta `conta|ano|mês|cnpj` e depois
monta o produto cartesiano conta × ano × cnpj lendo dessa tabela hash — mesmo
resultado, uma passada só.

Colunas calculadas por linha:
- **`TOTAL`** = soma de `Jan..Dez` restrita ao recorte de meses ativo (não é
  sempre o ano inteiro — o filtro de mês do painel corta o intervalo).
- **`MÉD`** = `TOTAL ÷ número de meses do recorte` — **não** divide por 12
  fixo. Um recorte de 3 meses divide por 3.
- **`%`** = `TOTAL da linha ÷ receita total do período`. Isso só pode ser
  calculado depois que a receita (soma de todas as contas com `S_E = 'E'`)
  já estiver somada — é por isso que o motor faz **dois passes**: primeiro
  soma tudo, depois calcula o `%` (comentário na seção 6, "precisa da receita
  já somada").

### Estágio 4 — DESIGN (o DRE visual, 100% derivado do BD_DRE)

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

| Indicador | Fórmula | Onde |
|---|---|---|
| Margem Bruta / EBITDA / Líquida | linha de resultado ÷ Receita Líquida | `renderResultado`, seção 9 |
| Margem de Contribuição | Receita − custos/despesas **variáveis** (`F_V = V`) | `analiseFVDI()`, seção 8 |
| Índice MC | Margem de Contribuição ÷ Receita | idem |
| Ponto de Equilíbrio | Total **Fixo** (`F_V = F`) ÷ Índice MC | idem |
| Custo Direto Unitário | Total **Direto** (`D_I = D`) ÷ VALOR PRODUZIDO | idem |
| Peso de cada grupo | total do grupo ÷ receita total | `renderGraficos`, seção 15 |

Note que Margem de Contribuição e Ponto de Equilíbrio dependem inteiramente
de `F_V` estar marcado nas contas de saída — sem isso, o painel já avisa
("Contas sem marcação F_V — margem de contribuição incompleta").

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

## Como os dados entram hoje

O painel da ferramenta (abas 2–4 acima) é **somente leitura** — mostra o que
já está calculado, não edita célula a célula. A entrada de dados fica
inteiramente no **console admin**, dois níveis:

1. **Colar planilha inteira** (`js/dre/dre-admin.js`,
   `dreAdminAbrirImportacaoPlano` / `dreAdminAbrirImportacaoLancamentos`) —
   um modal com textarea, bom para a primeira carga em massa.
2. **Grade estilo Excel** (`js/dre/dre-grid.js`, botões "Editar plano (grade)"
   / "Editar lançamentos (grade)") — célula clicável, colar/copiar do Excel,
   navegação por Tab/Enter/setas, ordenar por coluna, filtro por coluna
   (estilo AutoFiltro), busca, desfazer última colagem, validação inline
   (borda vermelha + tooltip) e totais no rodapé. Carrega o que já está no
   banco, deixa editar à vontade, só grava quando o admin aperta
   "Salvar no banco".

Os dois caminhos gravam nas mesmas tabelas: `fin_dre_plano_contas` e
`fin_dre_lancamentos` (`docs/supabase-dre.sql`), sempre por `empresa_id`. O
painel do cliente (seletor de módulos → Resultado (DRE)) só lê o resultado já
calculado — nenhum botão de edição aparece lá.

---

## Diferenças conscientes entre o Excel original e a implementação

- **`CNPJ`**: no Excel, uma mesma empresa pode ter várias colunas de CNPJ. No
  sistema, a multiempresa já é feita por `empresa_id` (RLS), então todo
  lançamento entra com `cnpj: 1` fixo (ver `_dreCarregarDados` em
  `js/dre/dre-view.js`) — o campo existe no motor só porque a fórmula
  original o usa como chave, não porque o sistema precise dele.
- **`VENC`** (VP = vencido/pago, VA = a vencer): existe na planilha original,
  mas `dre_engine.js` nunca lê essa coluna em nenhum cálculo — é
  informativo, não afeta o DRE. Por isso não foi replicado como campo
  persistido; a grade de lançamentos não o exibe.
- **`TOT_PAGO`**: idem — coluna do Excel sem uso no motor, fora do schema
  atual.

Se algum desses campos passar a ser necessário (por exemplo, um relatório de
inadimplência separado do DRE), é questão de acrescentar a coluna em
`docs/supabase-dre.sql` e no formulário de import — não muda a cadeia de
cálculo em si.
