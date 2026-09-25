# Plano Fase 1 — Motor de Layouts v2 (branch feature/layout-engine-v2)

Base: a8284205. Migrations 0465–0467 (dev claqxwckiihknclhmzvf). Um commit por item. Sem push.

## 1. Página flexível
- `canvas-state.ts`: `PageSize = 'A4'|'A5'|'A6'|'Letter'|'Etiqueta'|'custom'`; `PAGE_PRESETS` em mm; `PageConfig.customMm?: {w,h}`; `pageDimensionsMm/Cm` cobrem tudo; `hydratePageConfig` tolerante (size desconhecido → A4, margens faltando → default); `isCanvasState` aceita os novos tamanhos. Versão continua 1 (aditivo).
- `canva-print.css`: substitui 21×29.7 fixo por `var(--canva-page-w/--canva-page-h)`; `@page` global mantém A4 (outras telas), e `LaudoPrintable` injeta `<style>@page{size:<w>mm <h>mm}</style>` (cascata posterior vence).
- `CanvasStage`: seta as vars por página. `LaudoPrintable`: jsPDF `format:[w,h]` + orientação + px por mm.
- `PageSettingsPanel`: presets + custom (mm) + margens com input numérico em mm.
- Decisão: `@page margin` fica 0 (folha full-bleed para timbrado). Margens de `PageConfig` = área segura (guia + ancoragem da identidade/rodapé). Margens em `@page` quebrariam a folha absoluta.

## 2. Fontes
- `src/lib/canva/fonts.ts` (puro): catálogo `STANDARD_FONTS` (Inter, Roboto, Open Sans, Lato, Montserrat, Merriweather, Times New Roman, Georgia, Arial, Helvetica, Courier New) + `fontFamilyCss(name, clinicFonts)` com fallback stack.
- `src/components/canva/CanvaFontsScope.tsx`: `next/font/google` (Inter, Roboto, Open Sans, Lato, Montserrat, Merriweather) via `variable`; contexto `CanvaFontsContext` (fontes da clínica) + `<style>@font-face</style>`.
- Migration 0465: tabela `clinic_fonts` (clinic_id + RLS) + bucket privado `clinic-fonts` (5 MB, TTF/OTF/WOFF/WOFF2) com RLS por clinic_id.
- Actions `src/lib/actions/clinic-fonts.ts`: list (signed URL 1 ano), upload URL, register, delete (admin).
- PropertiesPanel: lista = padrão + clínica (via contexto). Upload no PageSettingsPanel ("Fontes da clínica").
- PDF: jsPDF rasteriza via html2canvas → fontes ficam "embutidas" no PNG; window.print embute via browser.

## 3. Pin + "Pág. X de Y"
- `src/lib/canva/pagination.ts` (puro): `expandPagesForRepeaterOverflow` migra pra cá + `applyPinnedElements` (elementos com pin ≠ none da página 1 replicam em todas as páginas reais e virtuais, sem duplicar id) + numeração `pageNumber/totalPages` por página.
- Tags `doc.page`, `doc.total_pages`, `doc.page_of_total`, `doc.printed_at`, `doc.verify_code`, `doc.verify_url` (grupo `documento`); `ctx.doc` injetado por página no print/modal. Texto livre resolve tokens `{{doc.page}}`.
- Editor: páginas 2+ mostram os pinados da página 1 como "fantasma" (não editáveis).

## 4. Snapshot
- Migration 0466: `patient_documents.canvas_state_snapshot JSONB`, `snapshot_taken_at`.
- create: grava snapshot do template; update: mantém (backfill se nulo); load/print/edit: snapshot → fallback template.

## 5. Idade "9 A 3 M 30 D"
- `src/lib/canva/age-format.ts` (puro) `formatAgeAMD(birth, ref)`; `TagFormat 'age_amd'`; tag `pet.age_amd` + `DynamicTagElement.formatOverride` (select no PropertiesPanel para `pet.age`). Referência = `consultation.date` quando houver.

## 6. Identidade por clínica
- Migration 0467: `clinic_document_identity` (clinic_id UNIQUE, config JSONB, RLS).
- `src/lib/canva/identity.ts` (puro): tipo `DocumentIdentity`, default, `buildIdentityElements()` (cabeçalho pin header + rodapé pin footer com Pág X de Y + QR) e `applyIdentityToState()`.
- Actions `src/lib/actions/clinic-identity.ts` (get/upsert). UI: modal `DocumentIdentityModal` em Gestão > Modelos; botão "Aplicar identidade" no ElementsToolbar; `createBlankCanvasTemplate` herda por padrão.

## 7. Hash + QR
- Sem PDF no storage (print client-side): hash = SHA-256 de JSON canônico {snapshot, content_json}. `createCanvaPatientDocument` gera `verify_code` + `content_hash` + signer; update recalcula hash. `getLaudoVerification` verifica integridade pelo snapshot quando não há PDF.
- Elemento `qr_validation` (kind novo): QR SVG gerado server-side (`qrcode.toString`) e passado em `ctx.doc.qr_svg`; editor mostra placeholder.

## Testes (Jest, tests/unit)
- `canvas-page-config.test.ts`, `canvas-age-format.test.ts`, `canvas-pagination.test.ts`, `canvas-identity.test.ts`; ajustar `canvas-state.test.ts` (Letter agora válido).
