# RESUTE Analytics

Plataforma SaaS multiempresa e multimodulo da RESUTE, com login, painel administrativo, dashboard de cliente, integracao com Supabase e sincronizacao via API para empresas configuradas.

## Modulos contratados (SaaS)

Cada empresa contrata um ou mais modulos. O contrato fica na tabela `empresa_modulos`
e e gerido no console do super_admin, secao "Modulos e contratos".

| Modulo | Slug | Estado |
|---|---|---|
| Comercial | `comercial` | Em producao — relatorios de vendas, produtos e representantes |
| Financeiro | `financeiro` | Em producao — contas a receber e pagar, fluxo de caixa e resultado |

Combinacoes suportadas: so comercial, so financeiro, ou os dois (nesse caso o
cliente troca de painel pelo seletor no header).

Regra de vigencia: `ativo = true` E (`expira_em` nulo OU `expira_em > now()`).
Desativar um modulo bloqueia o acesso e nunca apaga dados.

Detalhes em [docs/MODULO-FINANCEIRO.md](docs/MODULO-FINANCEIRO.md).

## Stack atual

- HTML, CSS e JavaScript puro
- Chart.js
- Supabase
- Vercel

## O que o sistema faz hoje

- Login com sessao persistente e expiracao automatica
- Fluxo separado para `super_admin` e cliente
- Painel multiempresa
- Modo manual para empresas que trabalham com colagem/processamento de dados
- Modo API para empresas com sincronizacao automatica
- Dashboard do cliente com filtros por ano e mes
- Relatorios de produtos e representantes
- Visao cadastral para acompanhar colunas preenchidas automaticamente no BD

## Empresas no fluxo atual

- Varremaster
  - Fluxo com API ativa
  - Sincronizacao por periodo definido no painel admin

## Estrutura principal

Apenas os arquivos carregados pelo `index.html` estao listados — e essa a ordem
real de carga dos scripts.

```text
resute-analytics/
|-- index.html
|-- roleta.html
|-- css/
|   `-- style.css
|-- js/
|   |-- utils.js
|   |-- constants.js
|   |-- state.js
|   |-- nav.js
|   |-- charts.js
|   |-- actions.js
|   |-- modulos.js          # camada de modulos SaaS (gate de UI)
|   |-- auth.js             # login, sessao, dashboard cliente, painel admin
|   |-- admin-console.js    # console do super_admin
|   |-- financeiro/         # modulo financeiro
|   |   |-- financeiro-core.js    # carga, filtros e calculos
|   |   |-- financeiro-ui.js      # KPIs, abas e tabelas
|   |   |-- financeiro-charts.js  # graficos
|   |   `-- financeiro-admin.js   # importacao manual de lancamentos
|   |-- jss.js
|   |-- bd.js
|   |-- relatorios.js
|   `-- relatrep.js
|-- api/
|   |-- login.js
|   `-- secure-proxy.js
|-- docs/
|   |-- MODULO-FINANCEIRO.md
|   |-- supabase-admin-audit.sql
|   |-- supabase-modulos.sql
|   `-- supabase-financeiro.sql
`-- README.md
```

Toda alteracao em JS exige bump do `?v=` correspondente no `index.html`,
senao o navegador serve a versao antiga em cache.

## Arquivos mais importantes

- [index.html](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\index.html)
  - Estrutura principal da interface
- [css/style.css](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\css\style.css)
  - Visual do sistema, login, dashboard e relatorios
- [js/modulos.js](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\js\modulos.js)
  - Quais modulos a sessao pode usar e troca de painel. Gate de UI, nao de seguranca
- [js/auth.js](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\js\auth.js)
  - Login, sessao, dashboard do cliente, painel admin e sincronizacao
- [js/admin-console.js](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\js\admin-console.js)
  - Console do super_admin, incluindo "Modulos e contratos"
- [js/bd.js](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\js\bd.js)
  - Tratamento do BD, preenchimento automatico e relatorios de produtos
- [js/relatorios.js](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\js\relatorios.js)
  - Navegacao entre areas e abertura dos relatorios
- [js/relatrep.js](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\js\relatrep.js)
  - Relatorios de representantes
- [api/login.js](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\api\login.js)
  - Autenticacao protegida via Vercel
- [api/secure-proxy.js](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\api\secure-proxy.js)
  - Proxy seguro para Supabase e API externa

## Como rodar localmente

Abra o projeto no VS Code e rode pelo navegador local.

Opcao simples:

1. Abra a pasta do projeto no VS Code
2. Abra o arquivo `index.html`
3. Rode com Live Server ou outro servidor local

## Deploy

O fluxo atual esta pensado para Vercel.

Quando houver alteracao no codigo:

1. Atualize os arquivos no projeto local
2. Faça `git add`
3. Faça `git commit`
4. Faça `git push`
5. A Vercel publica automaticamente a nova versao

## Variaveis importantes na Vercel

### Supabase

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Visual Saef / API externa

- `VISUAL_SAEF_API_URL`
- `VISUAL_SAEF_CLIENT_ID`
- `VISUAL_SAEF_CLIENT_SECRET`
- `VISUAL_SAEF_CODIGO_EMPRESA` (quando a empresa Visual Saef exigir liberação por código)

## Observacoes atuais

- As chaves sensiveis ficam no backend da Vercel
- O frontend usa proxy seguro para evitar expor segredos no navegador
- A API externa integrada hoje puxa vendas e cadastros dedicados de clientes, produtos e representantes
- Empresas sem API continuam podendo operar por fluxo manual

## Scripts SQL

Rodar no SQL Editor do Supabase. Todos idempotentes.

- `docs/supabase-admin-audit.sql` — auditoria administrativa (`admin_audit_log`). Aplicado
- `docs/supabase-modulos.sql` — contratos de modulo (`empresa_modulos`). Aplicado
- `docs/supabase-financeiro.sql` — tabela `fin_lancamentos` do modulo financeiro

## Proximo foco do projeto

- Integracao automatica do financeiro (API contabil/ERP), dispensando a colagem manual
- Evoluir a integracao de API para trazer mais dados cadastrais
- Melhorar filtros e dashboards por empresa
- Refinar ainda mais a experiencia dos clientes nos relatorios

### Variaveis adicionais para cadastros Visual Saef

- `VISUAL_SAEF_CADASTRO_CLIENT_ID`
- `VISUAL_SAEF_CADASTRO_CLIENT_SECRET`
