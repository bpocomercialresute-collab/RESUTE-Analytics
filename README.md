# RESUTE Analytics

Plataforma de analise comercial multiempresa da RESUTE, com login, painel administrativo, dashboard de cliente, integracao com Supabase e sincronizacao via API para empresas configuradas.

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
- Llamenina Matriz
  - Fluxo de cliente com dashboard e acesso aos relatorios
- Llamenina Mega
  - Fluxo de cliente com dashboard e acesso aos relatorios
- 44-Tshirts
  - Fluxo cadastrado no painel multiempresa

## Estrutura principal

```text
resute-analytics/
|-- index.html
|-- css/
|   `-- style.css
|-- js/
|   |-- actions.js
|   |-- auth.js
|   |-- bd.js
|   |-- charts.js
|   |-- constants.js
|   |-- dashboard.js
|   |-- dados.js
|   |-- jss.js
|   |-- nav.js
|   |-- relatatorios.js
|   |-- relatrep.js
|   |-- state.js
|   `-- utils.js
|-- api/
|   |-- login.js
|   `-- secure-proxy.js
`-- README.md
```

## Arquivos mais importantes

- [index.html](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\index.html)
  - Estrutura principal da interface
- [css/style.css](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\css\style.css)
  - Visual do sistema, login, dashboard e relatorios
- [js/auth.js](C:\Users\varremaster\Desktop\resute-analytics\resute-analytics\js\auth.js)
  - Login, sessao, dashboard do cliente, painel admin e sincronizacao
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

## Observacoes atuais

- As chaves sensiveis ficam no backend da Vercel
- O frontend usa proxy seguro para evitar expor segredos no navegador
- A API externa integrada hoje puxa vendas
- Empresas sem API continuam podendo operar por fluxo manual

## Proximo foco do projeto

- Evoluir a integracao de API para trazer mais dados cadastrais
- Melhorar filtros e dashboards por empresa
- Refinar ainda mais a experiencia dos clientes nos relatorios
