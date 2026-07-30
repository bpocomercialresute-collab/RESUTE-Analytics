# Módulo Financeiro — contrato de integração

Referência curta de onde o financeiro mora no sistema. Leia antes de escrever
qualquer linha do módulo.

## Modelo SaaS

Uma empresa contrata um ou mais módulos. Tabela `empresa_modulos`
(`docs/supabase-modulos.sql`).

| Módulo | Slug | Estado |
|---|---|---|
| Comercial | `comercial` | Em produção |
| Financeiro | `financeiro` | Espaço reservado (Fase 1) |

Regra única de vigência, replicada em backend, frontend e console admin:

```
ativo = true  E  (expira_em is null  OU  expira_em > now())
```

Combinações suportadas: só comercial, só financeiro, ou os dois (aí aparece o
seletor "Relatórios Comercial / Relatórios Financeiro" no header do cliente).

## Onde cada coisa está

| Camada | Arquivo | Papel |
|---|---|---|
| Banco | `docs/supabase-modulos.sql` | Contratos + RLS + seed do comercial |
| Banco | `docs/supabase-financeiro.sql` | Esqueleto das tabelas `fin_*` (Fase 2) |
| Backend | `api/login.js` | Resolve `modulos` e `modulo_padrao` da sessão |
| Backend | `api/secure-proxy.js` | Allowlist `fin_*` + `empresa_modulos`; ação `admin-module-toggle` |
| Frontend | `js/modulos.js` | `temModulo()`, `moduloPadrao()`, `abrirModulo()`, seletor |
| Frontend | `js/financeiro/financeiro-core.js` | Boot, estado, carga de dados |
| Frontend | `js/financeiro/financeiro-ui.js` | KPIs, seções, estado vazio |
| Frontend | `js/financeiro/financeiro-charts.js` | Gráficos (registrar em `FIN_CHARTS`) |
| Markup | `index.html` `#view-dash-financeiro` | Painel do financeiro |
| Admin | `js/admin-console.js` seção `modules` | Liga/desliga contrato por empresa |

## Segurança — o que realmente protege o dado

`temModulo()` e o seletor de módulos são **UX, não segurança**. `SESSION` vive
em `localStorage` e é editável pelo usuário.

A proteção real é, e só é:

1. **RLS no Supabase** — política de `select` restrita à empresa do usuário ou
   a `super_admin` ativo, em toda tabela `fin_*`.
2. **`api/secure-proxy.js`** — valida a sessão no servidor e exige
   `empresa_id=eq.<id>` em toda leitura `fin_*`. Sem filtro: 403.

Escrita em `empresa_modulos` e em `fin_*` nunca sai do navegador — só service
role no backend.

## Regras do módulo

- Prefixos reservados: `fin-` (CSS/IDs) e `financeiro*` / `fin*` (funções).
  Zero colisão com `dc-`, `av-`, `relat-`.
- Toda tabela do módulo começa com `fin_` — é isso que o `FIN_TABLE_REGEX` do
  proxy usa como allowlist.
- Todo gráfico passa por `finCriarGrafico()`, que registra em `FIN_CHARTS`.
  `financeiroDestruir()` percorre esse registro; gráfico fora dele vaza memória.
- Sem framework, sem build, sem npm. `var`, funções globais, `function`
  declarations — igual ao resto do projeto.
- Qualquer JS alterado exige bump do `?v=` em `index.html`.

## Fase 2 — o que falta para ligar de verdade

1. Completar `docs/supabase-financeiro.sql` e rodar no Supabase.
2. Trocar o stub de `finCarregarDados()` pela leitura real via
   `/api/secure-proxy`, filtrando `empresa_id`.
3. Preencher `finRenderizarKpis()`, `finRenderizarSecoes()`,
   `finRenderizarGraficos()`.
4. `MODULO_META.financeiro.disponivel = true` em `js/modulos.js` e remover
   `finRenderizarPlaceholder()`.
5. Bump de `?v=` nos arquivos alterados.

Se na Fase 2 aparecer necessidade de estrutura nova, a Fase 1 está errada —
corrija a Fase 1.
