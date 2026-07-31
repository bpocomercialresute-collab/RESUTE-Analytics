## PROMPT — FERRAMENTA DRE RESUTE (Integração no Sistema de Relatórios)

Tenho uma planilha Excel chamada `Modelo_DRE_Matheus.xlsx` com 4 abas encadeadas. Quero que você leia o arquivo inteiro, entenda 100% da lógica, e construa uma ferramenta web que replique tudo — visual, fórmulas, comportamento e estrutura — para integrar no meu sistema de Relatórios.

---

### ENTRADA DE DADOS — COLA DO EXCEL

**Por enquanto todos os dados serão colados manualmente direto do Excel.** A ferramenta precisa se comportar como uma planilha real:

- Cada aba que recebe dados (`PLANO_CONTAS` e `BD`) deve ter uma **grid editável estilo Excel** — células clicáveis, navegação por Tab e Enter, seleção de intervalo com Shift+clique
- **Colar (Ctrl+V) funciona direto na grid** — o usuário copia um bloco de células do Excel e cola na ferramenta. A ferramenta detecta o `\t` entre colunas e `\n` entre linhas e distribui os valores corretamente nas células
- **Copiar (Ctrl+C)** exporta o bloco selecionado no mesmo formato tab-separado, compatível com Excel
- Cabeçalho de coluna fixo (sticky) com **filtro por clique** em cada coluna — dropdown com os valores distintos, igual ao AutoFiltro do Excel
- **Ordenação** por clique no cabeçalho — seta indica ascendente/descendente
- **Busca global** na grid (Ctrl+F ou campo de busca) que destaca as células encontradas
- Linha de **totais no rodapé** para colunas numéricas (soma, contagem)
- **Validação inline**: célula com erro (conta inexistente no plano, data inválida, valor não numérico) fica com borda vermelha e tooltip explicando o problema
- Botão **"Limpar tudo"** e botão **"Desfazer última colagem"** (Ctrl+Z)
- Indicador de **quantas linhas foram coladas** na última operação
- As colunas derivadas (`GRUPO`, `S_E`, `ANO`, `MÊS`, `STATUS`, `VENC`) são **somente leitura e calculadas automaticamente** após cada colagem — destacadas visualmente com fundo levemente diferente para o usuário saber que não deve editá-las

---

### AS 4 ABAS E A CADEIA DE DEPENDÊNCIA

A cadeia é linear e obrigatória — cada aba só existe por causa da anterior:

```
PLANO_CONTAS → BD → BD_DRE → DESIGN
```

**ABA 1 — `PLANO_CONTAS` (100% manual, entrada de dados)**
- É o dicionário de todas as contas da empresa
- Colunas: `COD` (código único por família), `CONTA` (nome — é a chave de ligação com todas as outras abas), `GRUPO` (um dos 15 grupos do DRE), `F_V`, `D_I`
- `F_V` = Fixo ou Variável. Na ferramenta precisa ter um botão de marcação por conta, igual à planilha — clicar alterna entre F, V e não marcado
- `D_I` = Direto ou Indireto. Mesmo comportamento de botão que o `F_V`, independente dele
- Os dois campos são independentes entre si: uma conta pode ser `F + D`, `V + I`, `F + I`, `V + D`
- Precisa ter filtros por grupo, por `F_V` e por `D_I`, e busca por código ou nome de conta

**ABA 2 — `BD` (lançamentos financeiros)**
- É o livro-razão. Parte dos campos é digitada/colada manualmente, parte é derivada por `PROCV`/`PROCX` no `PLANO_CONTAS`
- Campos principais: `ID`, `DT_CAIXA` (data de competência — é esta que o DRE usa), `DT_VENC`, `DT_PAG`, `CONTA`, `TIPO`, `VALOR`, `TOT_PAGO`, `FORNECEDOR/CLIENTE`, `N_DOC`, `BANCO`, `FORMA`, `CNPJ`
- Campos derivados automaticamente: `GRUPO` e `S_E` (via PROCV na conta), `ANO`, `MÊS` (por extenso: Jan, Fev… — atenção: o mês precisa ser normalizado para case-insensitive antes de qualquer comparação), `STATUS` (PG se `DT_PAG` preenchida, senão N), `VENC` (VP = vencido/pago, VA = a vencer)
- `S_E` = Saída ou Entrada, derivado do grupo. Receita = E, Despesa/Custo = S, Faturamento e Valor Produzido = 0 (extracontábil — não somam no resultado)
- Conta ausente no plano gera `#N/A` — a ferramenta deve alertar esses casos

**ABA 3 — `BD_DRE` (matriz SUMIFS — 100% calculada)**
- Produto cartesiano completo: todas as contas × todos os anos × CNPJ
- Para cada linha: 12 colunas de mês (Jan a Dez), cada uma é um `SUMIFS` cruzando conta, ano, mês e CNPJ contra o BD
- Fórmula base: `SUMIFS(BD.VALOR; BD.CONTA; esta_conta; BD.ANO; este_ano; BD.MÊS; este_mês; BD.CNPJ; este_cnpj)`
- Colunas calculadas: `TOTAL` (soma do recorte de meses), `MÉD` (TOTAL ÷ número de meses do recorte — não divide por 12 fixo), `%` (TOTAL ÷ receita total do período)
- O `%` só pode ser calculado depois que a receita total estiver somada — respeitar a ordem de execução

**ABA 4 — `DESIGN` (resultado visual — última aba, 100% derivada do BD_DRE)**
- É a apresentação final do DRE. Nada é digitado aqui — tudo puxa do `BD_DRE`
- Para cada grupo do DRE, existe um bloco com: cabeçalho do grupo + uma linha por conta + linha de total do grupo
- Abaixo de cada conjunto de grupos, existe uma linha de resultado (Receita Líquida, Lucro Bruto, EBITDA, Lucro Líquido, Geração de Caixa)
- **Esta é a aba que o usuário vê como o DRE final**

---

### ESTRUTURA DO DRE (ordem obrigatória dos blocos)

```
FATURAMENTO                     ← extracontábil, não soma
VALOR PRODUZIDO                 ← extracontábil, não soma
(+) RECEITA OPERACIONAL
(-) DESP. TRIBUTÁRIA
════ RECEITA LÍQUIDA            ← base de todas as margens
(-) CUSTO. MP OU REVENDA
════ LUCRO BRUTO                ← margem bruta = ÷ receita líquida
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

### VISUAL — REPLICAR EXATAMENTE O DA PLANILHA

| Elemento | Especificação |
|---|---|
| Fonte | Calibri 10 |
| Cabeçalho de grupo | fundo `#002060` (azul-marinho), texto branco |
| Coluna TOT | fundo `#00B050` (verde), texto branco |
| Valores de saída (despesas) | texto `#FF0000` (vermelho) |
| Linha de total do grupo | fundo `#FFFF00` (amarelo), prefixo `(-)` ou `(+)` |
| Linhas de resultado | fundo `#002060`, texto branco, destaque de margem |
| Blocos extracontábeis | borda tracejada, cabeçalho `#3d4a5c` |
| Formato numérico | `#.##0` sem centavos |
| Formato percentual | `0,00%` |
| Valor zero | cinza claro, exibe `-` |

---

### INDICADORES QUE DEVEM SER CALCULADOS

- Margem Bruta, Margem EBITDA, Margem Líquida (todas ÷ Receita Líquida)
- Margem de Contribuição = (Receita − Custos e Despesas Variáveis) ÷ Receita
- Ponto de Equilíbrio = Total Fixo ÷ Índice de Margem de Contribuição
- Custo Direto Unitário = Total Diretos ÷ Valor Produzido
- Peso de cada grupo sobre a receita

---

### ABAS DA FERRAMENTA (todas obrigatórias)

1. **DRE** — os blocos visuais da aba DESIGN, com KPIs e alertas no topo
2. **BD_DRE** — a matriz conta × mês com todos os SUMIFS calculados
3. **Plano de Contas** — grid editável com cola do Excel + botões de `F_V` e `D_I` por linha
4. **Lançamentos (BD)** — grid editável com cola do Excel, colunas derivadas somente leitura
5. **Fixo/Variável · Direto/Indireto** — análise gráfica + indicadores de MC e PE
6. **Gráficos** — receita × resultado por mês, peso dos grupos, evolução das margens

---

Crie também um `DRE_RESUTE_DOCUMENTACAO.md` completo explicando toda a lógica, cadeia de dependência, fórmulas, ordem de execução e estrutura dos arquivos.
