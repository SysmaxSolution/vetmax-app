# Handoff para o Sócio — Ambiente de Testes VetMax/SysVetMax

*Gerado em 2026-09-25. Objetivo: permitir que o sócio trabalhe nos testes exatamente como no computador do Diretor.*

> Este documento é o **ponto de partida**. A fonte de verdade do desenvolvimento é `SPRINT_ANIMAIS_STATUS.md`; as regras de engenharia estão em `CLAUDE.md` e `vetmax-docs.md`.

---

## 1. Repositório e remotes

- **Repositório canônico (clone este):** `SysmaxSolution/vetmax-app` → remote `vetmax`.
  ```bash
  git clone https://github.com/SysmaxSolution/vetmax-app.git
  cd vetmax-app
  ```
- É neste repo que vivem **Issues, PRs, `main`, `dev` e todas as branches de feature**.
- O remote `origin` (`Sysmax.git`) é secundário; **não é usado no fluxo de PR/deploy**.

## 2. Fluxo de trabalho obrigatório (resumo do `CLAUDE.md`)

1. **Toda tarefa nasce como Issue** no `SysmaxSolution/vetmax-app`, com label `correcao` | `melhoria` | `nova-funcao`.
2. **Todo deploy é via PR** e a descrição menciona a Issue (`Closes #N` / `Refs #N`).
3. **Ciclo de ambientes:**
   - Branch de trabalho a partir de `dev` → PR para `dev` → merge → deploy no ambiente de testes.
   - Validação do Diretor no dev → PR `dev` → `main` → merge → push no `vetmax` → produção.
4. **NUNCA commitar direto na `main`.** (A exceção da "virada para produção" está encerrada.)
5. **NUNCA apontar testes para o banco de produção.**

## 3. Ambientes

| Ambiente | Vercel | Supabase | Arquivo de env |
|---|---|---|---|
| **Testes/dev** | projeto `sysvetmax-dev` | `claqxwckiihknclhmzvf` | `.env.dev.local` |
| Produção | projeto de produção | projeto de produção | `.env.local` |

Deploy de testes: `npx.cmd vercel --prod` a partir da pasta do checkout de dev, projeto Vercel `sysvetmax-dev`.

## 4. Setup na máquina do sócio

1. **Node** compatível com Next 16 (Node 20+). `npm install`.
2. **Variáveis de ambiente** — os arquivos `.env*` **não** vão para o Git (contêm segredos). Peça ao Diretor os valores. Modelo em `.env.local.example`. Variáveis principais:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` (para `npm run db:migrate`)
   - `ANTHROPIC_API_KEY` (IA / transcrição por voz)
   - `NEXT_PUBLIC_APP_URL`, `KEEPALIVE_SECRET`
   - `GOTENBERG_URL` (opcional — DOCX→PDF; sem ele cai em fallback que entrega .docx)
   - **Para testes, use o `.env.dev.local`** apontando ao Supabase de dev `claqxwckiihknclhmzvf`.
3. **Docker** (opcional) para Supabase local (Rota B) e Gotenberg (`gotenberg/gotenberg:8` na porta 3001).

## 5. Como rodar

```bash
npm run dev            # Next dev na porta 4000
npm run test           # Jest (unit + integração)
npm run test:unit
npm run test:integration
npm run test:e2e       # Playwright
npm run test:e2e:ui    # Playwright modo UI
npm run test:rls       # testes de RLS / multi-tenancy
npm run db:migrate     # aplica migrations (usa SUPABASE_* do env)
```

Utilitários de seed/QA (no checkout de dev): `tests/_seed-runner.ts`, `tests/_modules-runner.ts`, `tests/_plan-runner.ts`, `tests/_reset-admin.ts`, `_seed-stock.mjs`, `_seed-training-quiz.mjs`. Scripts de captura de tela/diagnóstico em `scripts/*-shot.mjs`.

## 6. Branches WIP publicadas no `vetmax` (desenvolvimento/testes)

Todas foram enviadas para o sócio continuar de onde o Diretor parou:

| Branch remota (`vetmax`) | Conteúdo | Origem local |
|---|---|---|
| `feature/portal-white-label` | Portal white-label por clínica (item 3.4.1) | worktree `sysvetmax-dev` |
| `feature/layout-engine-v2` | Motor de layouts v2 | worktree `sysvetmax-layouts` |
| `feature/melhorias-treinamento` | Extrato do Cliente + rastreabilidade da baixa | worktree `sysvetmax-treino` |
| `feature/g10-financial-cadastros` | G-10 — cadastros auxiliares (bancos, plano de contas, cartões, funcionários) | worktree de agente |
| `feature/g12-purchases-xml-export` | G-12 — exportação ZIP de XMLs NF-e para contabilidade | worktree de agente |
| `feature/g13-reports` | G-13 — módulo relatórios (9 tipos: DRE, curva ABC, produtividade…) | worktree de agente |
| `feature/g14-auth-permissions` | G-14 — permissões granulares (matriz módulo × ação) | worktree de agente |
| `feature/g15-management-config` | G-15 — configurações reorganizadas por categorias | worktree de agente |
| `feature/g16-mentor` | G-16 — Mentor com highlights visuais e dual-mode | worktree de agente |
| `feature/pharmacy-catalog-suggestion` | Sugestão do catálogo global + cadastro rápido pré-preenchido | worktree de agente |

## 7. Fases pendentes (macro) — detalhe em `SPRINT_ANIMAIS_STATUS.md`

- **Fase 0/1:** concluídas no dev; pendências dependem de **ação do cliente (👤)** ou **investimento (💰)** — arquivos/EDI reais (Sipag, Sicoob, DDA/CNAB, Focus NFe, TEF). Item **0.9** ainda precisa amarrar a emissão real do nº na criação da OS.
- **Fase 2 (Laboratório):** camadas de software prontas; falta **conexão física** dos aparelhos (URIT BH-5100, BIOBASE BK-200, Worklist) + itens extras a detalhar (2.6).
- **Fase 3 (Imagem + Portal):** Portal do Tutor/Parceiro **em produção desde 24/09**; pendente **3.4.1 portal white-label** (branch acima, migrations a partir de 0476), Kanban de SLA (3.2), editor de laudos (3.3), Worklist ASL (3.1) e captura Ambra (3.5, depende de contrato).
- **Fase 4 (Centro Cirúrgico + Estoque):** ver seção correspondente no status.

> ⚠️ **Não vender o portal como white-label** antes da entrega de 3.4.1.

## 8. Modelos e documentos de referência (no repo)

- `SPRINT_ANIMAIS_STATUS.md` — fonte de verdade das fases.
- `PLANO_VIRADA_PRODUCAO.md` — plano e checklist da virada de produção.
- `AUDITORIA_ISOLAMENTO_PRE_PRODUCAO.md` / `RELATORIO_TESTES_PRE_PRODUCAO.md` — isolamento multi-tenant e bateria de testes.
- `VETMAX_MASTER_TEST_PLAN.md` — plano-mestre de testes.
- `DIAGNOSTICO_TEMPLATE.md` — modelo para reportar diagnóstico/bug.
- `SPRINT_PLAN_*.md` — modelos de planejamento de sprint.
- `DESIGN_SYSTEM.md` — regras de UI/UX (tokens, skeleton, motion).
- `PROMPT_SESSAO_LAYOUT_ENGINE.md` — prompt de sessão do motor de layouts.

## 9. O que NÃO está no Git (peça ao Diretor se precisar)

Por segurança/LGPD, ficaram **fora** do repositório: `.env*` (segredos), `contratos/` (contratos assinados), `backup-prod-offboard/` (dados reais de produção), `integracoes/` (NDAs, áudios), imagens DICOM (`*.dcm`) e assets pesados (`public/lab-agent/`).
