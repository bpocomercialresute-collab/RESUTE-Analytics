# CONTRATO DE ENCAIXE — Painel Financeiro RESUTE

> Cole este arquivo junto com o que você for pedir.
> Ele não diz nada sobre **o que** criar nem sobre aparência — só as regras
> técnicas para o resultado encaixar no sistema depois.

---

## FORMATO DA ENTREGA

Dois blocos, só isso:

1. **HTML** — o conteúdo de dentro do painel
2. **CSS** — os estilos

Sem `<html>`, `<head>`, `<body>`, `<script>`. Sem arquivo novo, sem estrutura de
projeto, sem instalação.

---

## RESTRIÇÕES TÉCNICAS

- HTML, CSS e JavaScript puro. Sem framework, sem build, sem npm, sem Tailwind.
- Nada carregado de fora: sem CDN, sem `@import`, sem `<link>`, sem imagem por
  URL, sem biblioteca de ícones. Tudo precisa estar dentro dos dois blocos —
  ícone, se houver, é SVG inline.
- Gráfico é Chart.js, já integrado no sistema. Entregue apenas o `<canvas>` com
  o `id`; não desenhe gráfico em CSS ou SVG.
- O container externo do painel já existe no sistema (ocupa a tela inteira e
  rola por dentro). Você entrega o que vai dentro dele.

---

## PREFIXO DE CLASSE

Toda classe nova começa com `fin-`.

O sistema já usa `dc-`, `av-`, `relat-` e `admin-` em outras telas. Classe sem
prefixo pode colidir e quebrar tela alheia.

---

## OS `id` SÃO O CONTRATO

O JavaScript encontra os elementos por `id`. A estrutura e a organização em
volta são livres — os `id` abaixo é que precisam existir com esses nomes.

**Cabeçalho**

| id | Função |
|---|---|
| `fin-empresa` | recebe o nome da empresa |
| `fin-modulos` | recebe os botões de troca de módulo |
| `fin-admin-preview-badge` | selo mostrado/escondido pelo sistema |
| `fin-filtro-ano` | `<select>` |
| `fin-filtro-mes` | `<select>` |
| `fin-filtro-inicio` | `<input type="date">` |
| `fin-filtro-fim` | `<input type="date">` |
| `fin-btn-atualizar` | `<button>` |
| `fin-status` | recebe mensagens de carga |
| `fin-admin-back` | `<button>` |

**Corpo** — todos são containers vazios que o sistema preenche:

| id | Recebe |
|---|---|
| `fin-periodo-label` | texto do recorte |
| `fin-executive-summary` | texto de resumo |
| `fin-kpis` | os cards de indicador |
| `fin-alertas` | as faixas de alerta |
| `fin-conteudo` | avisos |
| `fin-tab-categorias` | uma tabela |
| `fin-tab-receber` | uma tabela |
| `fin-tab-pagar` | uma tabela |
| `fin-tab-fluxo` | uma tabela |
| `fin-tab-dre` | uma tabela |

**Gráficos** — cada um é um `<canvas>`:

`fin-chart-receita-despesa` · `fin-chart-saldo` · `fin-chart-aging-receber` ·
`fin-chart-aging-pagar` · `fin-chart-fluxo`

---

## MECANISMO DE ABAS

Se houver abas, o sistema alterna assim:

- Botão: classe `fin-tab` + atributo `data-fin-pane="<id do painel>"`
- Painel: classe `fin-pane` + o `id` correspondente
- O painel ativo recebe a classe `active`
- O CSS precisa ter: `.fin-pane { display: none }` e `.fin-pane.active { display: block }`

---

## BLOCOS GERADOS PELO SISTEMA

Estes três o JavaScript escreve sozinho. Não escreva o HTML deles — só o CSS
que os alcança. Esta é a marcação exata que sai hoje:

```html
<div class="dc-kpi-card">
  <div class="dc-kpi-value">…</div>
  <div class="dc-kpi-label">…</div>
  <div class="dc-kpi-sub">…</div>
</div>
```

```html
<!-- segunda classe varia: positivo | negativo | atencao -->
<div class="dc-alert-card negativo">
  <strong>…</strong>
  <span>…</span>
</div>
```

```html
<table class="dc-tabela">
  <thead><tr><th>…</th></tr></thead>
  <tbody><tr><td>…</td></tr></tbody>
</table>

<!-- quando não há dados -->
<div class="fin-tabela-vazia">…</div>
```

Se quiser outros nomes de classe nesses blocos, é só dizer — eu troco no gerador.

---

## SE O SEU PAINEL FOR DIFERENTE DISSO

Nada acima é imutável — é só o que o código espera **hoje**.

Se o seu painel tiver outras seções, outros indicadores, outras abas ou outra
estrutura de card, **descreva a diferença em uma frase no fim da entrega** em vez
de tentar se encaixar à força. Eu ajusto o JavaScript do lado de cá.

O que não pode é um `id` mudar de nome sem avisar — aí a parte quebra em silêncio.
