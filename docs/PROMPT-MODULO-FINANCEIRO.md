# PROMPT — Módulo Financeiro RESUTE (multi-módulo SaaS)

> Cole o bloco abaixo inteiro no Claude Code, na raiz do projeto `resute-analytics`.
> Ele foi escrito para ser executado em duas fases: **Fase 1 = reservar o espaço** (fazer agora),
> **Fase 2 = plugar a ferramenta real** (fazer quando o financeiro existir).
> Nada na Fase 1 quebra o comercial atual.

---

## CONTEXTO DO SISTEMA (não presuma nada além disto — verifique no código)

Projeto: **RESUTE Analytics**. HTML/CSS/JS puro (sem build, sem framework, sem bundler),
Chart.js via CDN, Supabase como banco, Vercel como host + serverless functions.

Arquivos e fatos reais do repositório hoje:

- `index.html` (~1286 linhas) — SPA única. Views são `<div class="page-view" id="view-*">`
  alternadas por `switchView(viewId)` em `js/nav.js`. Views existentes:
  `view-login-page`, `view-home`, `view-tools`, `view-client-access`,
  `view-admin-console`, `view-app`, e o dashboard do cliente
  `view-dash-cliente` (é `position:fixed; inset:0; z-index:9000`, **não** é `.page-view`).
- Scripts carregados no fim do `index.html` com cache-busting `?v=N`
  (`js/utils.js?v=2` … `js/relatrep.js?v=3`). **Toda alteração em JS exige bump do `?v=`.**
- `js/auth.js` (~4043 linhas) — sessão, login, painel admin, dashboard cliente, sync.
  - `SESSION` global, persistida em `localStorage` na chave `resute_session`,
    TTL `SESSION_TTL_MS = 90min`, renovada por atividade (`_touchSession`).
  - `SESSION.papel` ∈ `super_admin | admin | gestor | cliente`.
  - `EMPRESA_ATIVA` global (empresa selecionada pelo super_admin).
  - `fetch` é monkey-patched no topo do arquivo: chamadas ao Supabase são reescritas
    para `/api/secure-proxy`.
- `js/admin-empresas.js` — carrega `empresas` + `api_config`, monta `EMPRESAS_LISTA`,
  renderiza abas por empresa (`adminSelecionarEmpresa`).
- `js/admin-console.js` (~1453 linhas) — console do super_admin, seções via
  `adminConsoleAbrir(target, el)`; navegação lateral `.cui-nav-item[data-admin-target]`
  em `index.html:177-184` (`overview`, `companies`, `users`, `integrations`, `sync`,
  `audit`, `security`, `settings`).
- `js/dashboard-cliente.js`, `js/relatorios.js`, `js/relatrep.js`, `js/bd.js` — comercial.
- `api/login.js` — autentica no Supabase (`/auth/v1/token`), busca `usuarios` + `empresas`
  com service role, e devolve o payload de sessão:
  `{ token, access_token, nome, email, papel, empresa_id, empresa_ids, empresa_nome,
  empresa_slug, empresa_codigo }`. Mensagens de erro pós-auth são genéricas de propósito
  (anti user-enumeration) — **mantenha esse comportamento**.
- `api/secure-proxy.js` (~1244 linhas) — proxy único para Supabase/API externa, com
  rate limiting e CSRF. Tabelas/rotas permitidas são controladas aqui.
- `docs/supabase-admin-audit.sql` — padrão de migration do projeto: idempotente
  (`create table if not exists`, `drop policy if exists` + `create policy`), RLS habilitado,
  escrita só via service role no backend.
- Tabelas conhecidas: `usuarios`, `empresas`, `api_config`, `vendas`, `admin_audit_log`.

---

## O QUE PRECISA EXISTIR (modelo de negócio)

A RESUTE vira um SaaS **multi-módulo**. Uma empresa cliente contrata um ou mais módulos:

| Módulo | Slug | O que é |
|---|---|---|
| Comercial | `comercial` | O sistema atual (relatórios de vendas, produtos, representantes) |
| Financeiro | `financeiro` | Nova ferramenta (a construir) |

Combinações válidas por empresa:
1. só `comercial` → comportamento idêntico ao de hoje;
2. só `financeiro` → cliente entra e cai direto no painel financeiro, **sem ver nada do comercial**;
3. `comercial` + `financeiro` → cliente vê o painel atual **mais** uma entrada
   "Relatórios Financeiro" para trocar de módulo.

O `super_admin` sempre enxerga todos os módulos de todas as empresas, e no console
consegue **ligar/desligar módulo por empresa**.

---

## FASE 1 — RESERVAR O ESPAÇO (executar agora)

Objetivo: deixar toda a fundação de multi-módulo pronta e funcionando, com o financeiro
existindo como **placeholder navegável** ("Em construção"). Zero regressão no comercial.

### 1.1 Banco (Supabase)

Crie `docs/supabase-modulos.sql`, idempotente, no mesmo estilo de
`docs/supabase-admin-audit.sql`:

- Tabela `public.empresa_modulos`:
  - `id uuid pk default gen_random_uuid()`
  - `empresa_id uuid not null references public.empresas(id) on delete cascade`
  - `modulo text not null check (modulo in ('comercial','financeiro'))`
  - `ativo boolean not null default true`
  - `contratado_em timestamptz not null default now()`
  - `expira_em timestamptz null`  ← permite encerrar contrato sem apagar histórico
  - `criado_por text null`, `atualizado_em timestamptz not null default now()`
  - `unique (empresa_id, modulo)`
  - índice em `(empresa_id) where ativo = true`
- RLS habilitado. `select` liberado para `authenticated` **apenas** quando o usuário
  pertence à empresa (`usuarios.empresa_id = empresa_modulos.empresa_id and usuarios.ativo`)
  **ou** é `super_admin` ativo. `insert/update/delete` **não** expostos ao browser —
  só service role via backend.
- Seed idempotente: para toda empresa existente hoje, inserir
  `('comercial', ativo=true)` com `on conflict do nothing` (preserva o funcionamento atual).
- **Não rode a migration automaticamente.** Deixe o arquivo pronto e me diga
  exatamente o que rodar no SQL Editor do Supabase.

Regra de negócio derivada, implemente como fonte única de verdade:
um módulo está ativo para a empresa se `ativo = true` **e** (`expira_em is null` ou `expira_em > now()`).

### 1.2 Backend — `api/login.js`

- Após resolver `user` e `empresaRelacion`, buscar (service role) os módulos ativos da empresa
  e incluir no payload de resposta:
  - `modulos: ['comercial', ...]` — array de slugs ativos;
  - `modulo_padrao: '<slug>'` — primeiro módulo ativo, priorizando `comercial`.
- Fallbacks obrigatórios (não pode quebrar login existente):
  - `papel === 'super_admin'` → `modulos: ['comercial','financeiro']`;
  - erro na consulta, tabela ainda não criada, ou empresa sem linha → `modulos: ['comercial']`
    e log `console.warn`, **nunca** 500.
- Se `modulos` ficar vazio para um cliente → tratar como acesso negado usando a **mesma**
  mensagem genérica `MSG_ACESSO_NEGADO` já existente, e `console.warn` no servidor.

### 1.3 Backend — `api/secure-proxy.js`

- Registre desde já o prefixo de tabelas do financeiro (`fin_*`) e `empresa_modulos`
  na allowlist do proxy, seguindo o padrão de allowlist que já existe no arquivo
  (leia o arquivo e siga o mecanismo real, não invente outro).
- Toda leitura de tabela `fin_*` deve ser obrigatoriamente filtrada por `empresa_id`
  da sessão — mesma regra já usada para `vendas`.

### 1.4 Frontend — camada de módulos (arquivo novo)

Crie `js/modulos.js`, carregado **antes** de `js/auth.js` no `index.html`:

```js
// Fonte única de verdade sobre quais módulos a sessão pode usar.
var MODULOS = {
  COMERCIAL: 'comercial',
  FINANCEIRO: 'financeiro'
};

var MODULO_META = {
  comercial:  { slug:'comercial',  nome:'Relatórios Comercial',  view:'view-dash-cliente',    icone:'…', disponivel:true  },
  financeiro: { slug:'financeiro', nome:'Relatórios Financeiro', view:'view-dash-financeiro', icone:'…', disponivel:false } // Fase 1: placeholder
};

var MODULO_ATIVO = null; // módulo em uso na tela agora

function sessaoModulos()            { /* lê SESSION.modulos, fallback ['comercial'] */ }
function temModulo(slug)            { /* super_admin => true; senão inclui em sessaoModulos() */ }
function moduloPadrao()             { /* SESSION.modulo_padrao válido, senão 1º de sessaoModulos() */ }
function abrirModulo(slug)          { /* valida temModulo(slug); troca de view; seta MODULO_ATIVO */ }
function renderizarSeletorModulos() { /* pinta a navegação de módulos no header do cliente */ }
```

Regras não negociáveis desta camada:
- `temModulo()` é a **única** função consultada para exibir/ocultar qualquer coisa de módulo.
  Nada de checar `SESSION.modulos` espalhado pelo código.
- Gating no front é **UX, não segurança**. `localStorage` é editável pelo usuário.
  A garantia real vem de RLS + filtro por `empresa_id` no `secure-proxy`. Escreva isso
  como comentário no topo de `js/modulos.js` para ninguém confiar no gate visual depois.
- Se `abrirModulo()` receber slug sem permissão: `toast()` de acesso negado e volta ao
  `moduloPadrao()`.

### 1.5 Frontend — roteamento pós-login (`js/auth.js`)

- Em `abrirAnaliseVendas()` / `_abrirDashCliente()`, substituir o salto direto ao dashboard
  comercial por: `abrirModulo(moduloPadrao())`.
- Cliente **só financeiro** entra direto no painel financeiro; não deve haver nenhum
  ponto do fluxo que force `view-dash-cliente`.
- Cliente **só comercial**: fluxo idêntico ao de hoje, e o seletor de módulos
  **não aparece** (não polua a tela com uma aba única).
- Preview do super_admin (`DC_ADMIN_PREVIEW`) continua funcionando e passa a respeitar
  o módulo escolhido — o badge "Visualização supervisionada" deve continuar visível.
- Logout deve limpar `MODULO_ATIVO`.

### 1.6 Frontend — seletor de módulos no painel do cliente

No header do cliente (`index.html`, bloco `.dc-header-left`, perto de `#dc-empresa`),
adicione um container `#dc-modulos` renderizado por `renderizarSeletorModulos()`:

- Aparece **apenas** quando `sessaoModulos().length > 1`.
- Botões: "Relatórios Comercial" / "Relatórios Financeiro", com estado `active`
  refletindo `MODULO_ATIVO`.
- Trocar de módulo **não** recarrega a página; chama `abrirModulo(slug)`.
- CSS novo em `css/style.css`, prefixo `dc-modulos-*`, reaproveitando as variáveis de
  cor já existentes no arquivo. Não introduza paleta nova.

### 1.7 Frontend — espaço reservado do financeiro

Crie a estrutura vazia mas real, para a Fase 2 ser só "preencher":

```
js/financeiro/
  financeiro-core.js     # boot do módulo, estado, carga de dados (stub)
  financeiro-ui.js       # render de KPIs/seções (stub)
  financeiro-charts.js   # gráficos Chart.js (stub)
docs/
  supabase-modulos.sql
  supabase-financeiro.sql   # schema fin_* — só o esqueleto comentado, sem tabelas ainda
  MODULO-FINANCEIRO.md      # este contrato, resumido, para consulta futura
```

- Em `index.html`, criar `<div id="view-dash-financeiro">` **espelhando exatamente**
  o padrão de `view-dash-cliente` (fixed/inset/z-index/header próprio), com:
  header (logo, nome da empresa, seletor de módulos, filtros de período, botão sair),
  `<main class="fin-main">` contendo um estado vazio "Módulo financeiro em construção",
  e nada mais.
- `financeiro-core.js` expõe `financeiroAbrir()` / `financeiroFechar()` /
  `financeiroDestruir()`. `financeiroDestruir()` **precisa** destruir instâncias Chart.js
  (o projeto já tem esse padrão com o global `graficos` em `js/state.js` — siga-o,
  senão vaza memória ao alternar módulos).
- Prefixo de CSS/IDs/funções do financeiro: `fin-` / `financeiro*`.
  Zero colisão com `dc-`, `av-`, `relat-`.
- Adicione os 3 scripts no `index.html` com `?v=1` e **bump em todos os `?v=`
  dos arquivos que você alterar**.

### 1.8 Console do super_admin — gestão de módulos

Em `js/admin-console.js` + `index.html:177-184`:

- Nova seção lateral `data-admin-target="modules"` → "Módulos e contratos".
- Tabela: empresa × módulo, com toggle ativo/inativo e campo `expira_em` opcional.
- Escrita **sempre** via `/api/secure-proxy` (service role no servidor), nunca direto do browser.
- Toda mudança grava linha em `admin_audit_log` (`acao: 'modulo.ativado' | 'modulo.desativado'`,
  `entidade: 'empresa_modulos'`), no mesmo formato que o console já usa.
- Desligar módulo **não apaga dado nenhum** — só marca `ativo=false`.
- Em `js/admin-empresas.js`, junto das tags `API`/`Manual` já renderizadas nas abas de
  empresa, exibir também as tags de módulo contratado.

### 1.9 Critérios de aceite da Fase 1

Só considere pronto quando **todos** forem verdadeiros:

1. Cliente com só `comercial` → tela idêntica à de hoje, sem seletor de módulos.
2. Cliente com `comercial` + `financeiro` → seletor aparece, alterna sem reload,
   financeiro mostra "Em construção", comercial continua íntegro ao voltar.
3. Cliente com só `financeiro` → cai direto no financeiro, e **nenhum** elemento do
   comercial fica acessível na UI.
4. `super_admin` vê os dois módulos e a nova seção "Módulos e contratos" funcionando.
5. Login funciona normalmente **mesmo se `empresa_modulos` ainda não existir no banco**
   (fallback `['comercial']`).
6. Sem erro no console do navegador em nenhum dos 4 cenários acima.
7. Nenhum `?v=` esquecido nos scripts alterados.

---

## FASE 2 — PLUGAR A FERRAMENTA REAL (executar depois)

Quando o financeiro existir, o trabalho deve ser **só preencher os espaços da Fase 1**:

1. `docs/supabase-financeiro.sql` — criar as tabelas `fin_*` (ex.: `fin_lancamentos`,
   `fin_contas_pagar`, `fin_contas_receber`, `fin_categorias`, `fin_fluxo_caixa`).
   Toda tabela **obrigatoriamente** com `empresa_id uuid not null references empresas(id)`,
   índice em `(empresa_id, <coluna de data>)`, RLS habilitado e política de `select`
   restrita à empresa do usuário / super_admin. Escrita só por service role.
2. `js/financeiro/financeiro-core.js` — trocar o stub de carga pela leitura real via
   `/api/secure-proxy`, sempre filtrando `empresa_id` da sessão.
3. `js/financeiro/financeiro-ui.js` / `-charts.js` — preencher `#view-dash-financeiro`.
4. `MODULO_META.financeiro.disponivel = true` e remover o estado "Em construção".
5. Bump de `?v=` em tudo que mudou.

Nada de estrutura nova precisa ser inventado na Fase 2. Se você sentir que precisa,
a Fase 1 foi feita errado — corrija a Fase 1.

---

## RESTRIÇÕES (valem para as duas fases)

- **Sem framework, sem build step, sem npm.** JS de navegador direto, no estilo do
  código existente (`var`, funções globais, `function` declarations).
- **Não refatore o comercial.** Nenhuma mudança em `js/bd.js`, `js/relatrep.js`,
  `js/relatorios.js`, `js/dashboard-cliente.js` além do estritamente necessário
  para o roteamento de módulo.
- **Não mexa** na lógica de sessão/TTL, no monkey-patch de `fetch`, no rate limiting
  ou no CSRF do `secure-proxy` — só estenda allowlists.
- **Não** exponha service role no browser. **Não** afrouxe as mensagens genéricas de
  erro do login. **Não** crie política RLS com `using (true)`.
- **Não rode migration sozinho** — entregue o `.sql` e me diga o comando.
- Não faça commit sem eu pedir.
- Ao terminar cada fase: liste os arquivos criados/alterados, o SQL a rodar, e como
  eu testo cada um dos 4 cenários de cliente.

---

## COMEÇE POR AQUI

Execute **só a Fase 1**. Antes de escrever código, leia de fato:
`index.html`, `js/nav.js`, `js/auth.js` (seções de sessão, `abrirAnaliseVendas`,
`_abrirDashCliente`, preview admin), `js/admin-console.js`, `js/admin-empresas.js`,
`api/login.js`, `api/secure-proxy.js` e `docs/supabase-admin-audit.sql`.
Se algo neste prompt divergir do código real, o **código real vence** — me avise a
divergência e siga o padrão existente.
