# RESUTE Analytics

Sistema interno de análise de vendas — BPO Comercial.

## Estrutura do projeto

```
resute-analytics/
├── index.html          ← Página principal (HTML puro)
├── css/
│   └── style.css       ← Todo o CSS do sistema
├── js/
│   ├── utils.js        ← Funções utilitárias ($, formatters, toast)
│   ├── constants.js    ← ROLES, colorNameMap, HEADER_HINTS, regex
│   ├── state.js        ← Estado global e instâncias de gráficos
│   ├── nav.js          ← Navegação entre views e ripple
│   ├── upload.js       ← Leitura de arquivos CSV/XLSX
│   ├── autodetect.js   ← Engine de auto-detecção de colunas
│   ├── mapping.js      ← Interface de mapeamento (grid Excel)
│   ├── process.js      ← Processamento dos dados
│   ├── filters.js      ← Lógica de filtros do dashboard
│   ├── charts.js       ← Renderização de gráficos (Chart.js)
│   ├── dashboard.js    ← Dashboard, tabs e agrupamentos
│   ├── actions.js      ← Limpar tudo / exportar CSV
│   └── uniao.js        ← Ferramenta União de Planilhas
└── README.md
```

## Como rodar localmente

Abra o `index.html` diretamente no navegador, **ou** use o Live Server do VS Code:

1. Instale a extensão **Live Server** no VS Code
2. Clique com o botão direito em `index.html` → **Open with Live Server**
3. O site abre em `http://127.0.0.1:5500`

## Fluxo Git + GitHub

```bash
# Primeira vez (já feito pelo time)
git init
git remote add origin https://github.com/SEU_USUARIO/resute-analytics.git
git push -u origin main

# Dia a dia — editar no VS Code e publicar:
git add .
git commit -m "descrição da mudança"
git push
```

## Publicar com GitHub Pages

1. Vá em **Settings → Pages** no repositório
2. Source: **Deploy from a branch** → `main` → `/` (root)
3. O site fica em `https://SEU_USUARIO.github.io/resute-analytics/`

## Dependências externas (CDN — sem instalação)

| Biblioteca | Versão | Uso |
|---|---|---|
| [xlsx](https://github.com/SheetJS/sheetjs) | 0.18.5 | Leitura de arquivos XLSX |
| [PapaParse](https://www.papaparse.com/) | 5.4.1 | Leitura de arquivos CSV |
| [Chart.js](https://www.chartjs.org/) | latest | Gráficos do dashboard |
| Inter + Instrument Serif | — | Fontes (Google Fonts) |
