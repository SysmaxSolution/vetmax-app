# Sessão paralela — Motor de Layouts v2 (SYSVETMAX)

## Como abrir (PowerShell)
```
cd C:\SysMax
claude --add-dir C:\sysvetmax-layouts
```
(abrir a partir de `C:\SysMax` para carregar a memória do projeto; o código fica no worktree `C:\sysvetmax-layouts`)

## Prompt para colar na primeira mensagem

Você vai construir a **evolução do motor de layouts do SYSVETMAX** conforme o diagnóstico aprovado pelo Diretor em 22/09/2026 — leia primeiro a memória `project_animais_layouts_diagnostico.md` e o artifact "Diagnóstico Layouts Animais" (https://claude.ai/artifact/Q1ZGoJWcGH27RS82kBBPk5), além de `project_canva_native_pivot.md`, `project_canva_receituario_almavet.md` e `project_default_canva_templates_seed.md`.

**Onde trabalhar:** SOMENTE no worktree `C:\sysvetmax-layouts` (branch `feature/layout-engine-v2`, derivada de `feature/treinamento`, que é o estado atual do ambiente de testes). Deploy com `npx vercel deploy --prod --yes` de dentro desse worktree → `sysvetmax-dev.vercel.app`. Migrations aditivas com `IF NOT EXISTS`, numeradas a partir de **0468** (0465–0467 já foram usadas na Fase 1), aplicadas automaticamente no Supabase **dev** (`claqxwckiihknclhmzvf`) via pooler `aws-0-us-east-1.pooler.supabase.com:6543` (senha em `SUPABASE_DEV_DB_PASSWORD` do `.env.local` — nunca no código). Modelos reais de referência da Clínica Animais estão em `C:\SysMax\anexos\Animais_Layouts\` (pasta gitignored — contêm dados pessoais de tutores; nunca commitar nem copiar para o repositório). Obs.: `public/lab-agent/` (bundle de 80 MB com node.exe) não está no git — se precisar do download do agente de laboratório no dev, regenerar com `scripts/gen-agent-bundle.mjs`.

**Ambiente já preparado (22/09):** `node_modules` foi copiado do `sysvetmax-dev` (mesmo `package-lock`) — não rode `npm ci`; se precisar adicionar pacote (ex.: Tiptap), use `npm install <pkg>` normalmente. ⚠️ **A máquina tem pouca RAM livre (~1 GB):** o `npm ci` anterior morreu por memória. Antes de `tsc`/`next build`, feche abas do Chrome e outras sessões; rode `npx tsc --noEmit` sem outros builds em paralelo e prefira `vercel deploy` (build na nuvem) a `next build` local.

## ⚠️ ESTADO ATUAL — A FASE 1 JÁ FOI ENTREGUE (22/09/2026). NÃO REFAÇA.

Na branch `feature/layout-engine-v2` já existem **7 commits locais** (base `a8284205`), `tsc` limpo, Jest do canvas 91/91 e **deploy no dev feito**. Rode `git log --oneline a8284205..HEAD` para ver. Entregue na Fase 1:

- `56fbe610` página flexível (presets A4/A5/A6/Carta/Etiqueta + custom em mm, `@page` e jsPDF dinâmicos; `PAGE_PRESETS`, `pageDimensionsMm/Cm/Px`, `hydratePageConfig`)
- `2ce78ac4` fontes: `src/lib/canva/fonts.ts` + `CanvaFontsScope` (`next/font`) + **migration 0465** `clinic_fonts` + bucket `clinic-fonts` + `ClinicFontsManager`
- `9c7a75f0` **`src/lib/canva/pagination.ts`** (reais → virtuais → pinados replicados → numeração) + tags `doc.page`, `doc.total_pages`, `doc.page_of_total`, `doc.printed_at`, `doc.verify_code`, `doc.verify_url`
- `1cee0962` **migration 0466** `patient_documents.canvas_state_snapshot` + `snapshot_taken_at` (print/edit usam snapshot, fallback ao template)
- `05535da2` `age-format.ts`, `TagFormat 'age_amd'` ("9 A 3 M 30 D"), `pet.age_amd`, `pet.birth_date`
- `d4104b62` **migration 0467** `clinic_document_identity` + **`src/lib/canva/identity.ts`** + modal "Identidade documental" em Gestão > Modelos + elemento `qr_validation`
- `bdf8c998` hash SHA-256 (`hashCanvasDocument`) + `doc-verification.ts` (QR SVG via `qrcode`) reaproveitando 0457 e `/public/verificar/[code]`

Pendências herdadas: fluxo logado nunca foi testado no navegador (não há `DEV_SYSMAX_PASSWORD` no `.env.local` — **não invente senha**; se o Diretor cadastrar, valide); múltiplos repeaters paginados na mesma página seguem sem suporte; migrations 0465–0467 só estão no **dev**.

## Sua missão agora: FASE 2

**Comece em modo plano** e me apresente a sequência antes de codar. Reaproveite obrigatoriamente `pagination.ts` (pins + tags `doc.*`) e `identity.ts` (cabeçalho/rodapé/identidade), para que os dois motores compartilhem a mesma identidade e numeração.

- **Fase 2 (AGORA) — motor de fluxo (documento corrido):** Tiptap com paginação (Pages ou extensão), tags dinâmicas como nodes, biblioteca de "Resultado Padrão"/frases por setor, para laudos RX/tomo/RM, atestados longos e termos multi-página. Manter o Canvas Nativo para documentos de posição fixa.
- **Fase 3 — blocos de conteúdo integrado:** elementos "Tabela de resultados" (analitos do LIS — já existem `0444_exam_results`, `0459_lab_analyte_mapping`, `exam-results.ts`, `lab-analytes.ts`; propor o que faltar) e "Imagens do exame" (galeria do PACS — `imaging_studies`/`imaging.ts`), disponíveis nos dois motores; relatório de resultados por OS em `@react-pdf/renderer` server-side (já está no repo em `render-quotation-pdf.tsx`).

**Regras inegociáveis:** multi-tenancy `clinic_id` em toda tabela/consulta; nunca `git add -A` (stage seletivo + guarda anti-segredo); `tsc` limpo sem cache (`.tsbuildinfo`) antes de qualquer push; **nunca push no remote `vetmax`/`main` sem OK explícito do Diretor na conversa**; modal sempre via `createPortal(document.body)`; terminologia CFMV (Pet/Tutor/MV); IA é escriba, nunca diagnostica; não nomear const `URL`. Ao final de cada fase: deploy no dev, teste no navegador com o modelo equivalente da Animais, e resumo do que mudou.
