# Operação Pixel Perfect — Plano Arquitetural

> **Status:** Aguardando aprovação do Diretor
> **Data:** 2026-05-13
> **Owner:** Mozart (Tech Lead) · **Modo:** Bypass (após aprovação)
> **Objetivo de negócio:** Fechar contrato Enterprise — fidelidade visual 100% pixel-perfect em laudos importados.

---

## 1. Diagnóstico do Estado Atual

Auditoria dos arquivos relevantes:

| Camada | Arquivo | Linhas | Estado |
| --- | --- | ---: | --- |
| UI (modal de importação + abas) | `src/components/management/ImportTemplateModal.tsx` | 1436 | Implementação ampla, mas preview NÃO usa imagem do PDF como fundo |
| Editor visual | `src/components/management/TemplateLayoutEditor.tsx` | 692 | Drag/resize custom; sem background do PDF original |
| Server actions | `src/lib/actions/templates.ts` | 193 | OK — salva `page_images` em JSONB |
| Conversão PDF→PNG | `src/lib/pdf-to-images.ts` | 41 | Já existe; usa `pdfjs-dist` no client |
| API de extração IA | `src/app/api/process-template-with-file/route.ts` | 417 | **Já extrai coordenadas (`x_percent`, `y_percent`, `width_percent`, `height_percent`) via Claude Vision** |
| Migrations | `0007`, `0079`, `0082` | — | `page_images jsonb`, `template_html text`, `extracted_fields jsonb` já existem |
| Geração de PDF | `src/lib/pdf-generator.ts` | — | Client-side com `jspdf`. **Não usa `pdf-lib`** — perde fidelidade de marca d'água/vetor/font |

### Gap Crítico (o que falta)

1. **PDF original não é persistido em Storage** — apenas o array base64 de imagens fica no JSONB (estoura limites, perde resolução).
2. **Aba Pré-visualizar** não desenha a imagem da página como fundo — mostra apenas labels + chips. Não é pixel-perfect.
3. **Aba Layout** tem fundo branco. O editor precisa do PDF renderizado por trás dos overlays.
4. **Drag/resize custom** em `TemplateLayoutEditor.tsx` (~150 linhas de mousedown/mousemove). Substituir por `react-rnd` reduz bugs e padroniza UX.
5. **Geração final** usa `jspdf` (cliente) — quando o PDF original tem font embedded ou marca d'água vetorial, o resultado degrada. Migrar para `pdf-lib` **no servidor** preserva o PDF original byte-a-byte e só adiciona overlay de texto.

---

## 2. Arquitetura Alvo — Padrão DocuSign (Overlay Engine)

```
┌──────────────────────────────────────────────────────────────────┐
│ FLUXO DE IMPORTAÇÃO                                              │
└──────────────────────────────────────────────────────────────────┘

  Upload PDF              ┌───────────────────────────────────┐
       │                  │ Supabase Storage                  │
       ▼                  │  bucket: document-templates       │
  ┌─────────┐  upload     │   {clinic_id}/{template_id}/      │
  │ Browser │────────────▶│      original.pdf  (imutável)     │
  └─────────┘             └───────────────────────────────────┘
       │
       │ pdfjs-dist → renderiza páginas em <canvas>
       ▼
  page_images[] (base64)
       │
       │ POST /api/process-template-with-file
       ▼
  Claude Vision → JSON com campos + (x%, y%, w%, h%) por página
       │
       ▼
  document_templates.row:
    file_url           → URL do PDF no Storage
    page_images        → snapshot das páginas (para preview rápido)
    extracted_fields   → [{field_name, label, type, x_percent, y_percent, ...}]


┌──────────────────────────────────────────────────────────────────┐
│ EDITOR (3 ABAS — Pré-visualizar / Layout / Campos)               │
└──────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────┐
  │ <div class="aspect-[210/297] relative">    │ ← A4 fixo
  │                                            │
  │  <img src={page_images[i]}                 │ ← FUNDO IMUTÁVEL
  │       class="absolute inset-0 w-full"/>    │
  │                                            │
  │  <Rnd                                      │ ← Overlay editável
  │     position={{ x:%, y:% }}                │
  │     size={{ w:%, h:% }}                    │
  │     bounds="parent">                       │
  │       {{paciente_nome}}                    │
  │  </Rnd>                                    │
  │                                            │
  │  ... (N overlays)                          │
  │                                            │
  └────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────┐
│ GERAÇÃO DO LAUDO PREENCHIDO                                      │
└──────────────────────────────────────────────────────────────────┘

  Server Action: generateFilledDocument(template_id, patient_data)
       │
       │ 1. supabase.storage.download(file_url)
       ▼
  PDF original em ArrayBuffer
       │
       │ 2. PDFDocument.load() — pdf-lib
       ▼
  PDFDocument (preserva fonts, marca d'água vetorial, camadas)
       │
       │ 3. Para cada campo:
       │      page.drawText(valor, { x, y, size, font })
       │      ↑ conversão %  →  PDF points (origem bottom-left)
       ▼
  PDF final = PDF original + texto sobreposto
       │
       ▼
  Upload para Storage (patient-documents bucket) → URL
```

### Princípio Imutável

> O PDF original NUNCA é convertido para HTML, JPG, ou qualquer outro formato no caminho de geração. Ele é o substrato que recebe overlays nativos via `pdf-lib`. As page_images servem APENAS como camada visual rápida para o editor no browser.

---

## 3. Bibliotecas a Instalar

| Pacote | Versão alvo | Motivo | Onde |
| --- | --- | --- | --- |
| `pdf-lib` | `^1.17.x` | Edição nativa de PDF no servidor (preserva fonts/vetores/marca d'água) | server + (opcional) client |
| `@pdf-lib/fontkit` | `^1.1.x` | Embed de fonts customizadas (CRMV signature, fontes da clínica) | server |
| `react-rnd` | `^10.x` | Drag + resize com bounds, snap, aspect lock | client |
| `react-pdf` | `^9.x` | (Opcional) renderização incremental do PDF original com zoom no editor — alternativa à imagem | client |

**Não instalar:** Konva, Fabric.js, tldraw — overkill. `react-rnd` cobre todo o requisito.

**Já existentes (manter):**
- `pdfjs-dist` — conversão PDF→PNG para fundo do editor
- `jspdf` — manter durante a transição até `pdf-lib` ficar 100% (fallback)
- `@anthropic-ai/sdk` — Claude Vision

```bash
npm install pdf-lib @pdf-lib/fontkit react-rnd
npm install --save-dev @types/react-rnd
```

---

## 4. Banco de Dados & Storage

### 4.1 Migration nova — `0126_document_templates_storage.sql`

```sql
-- Adiciona referência ao PDF original no Storage
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS original_pdf_path text,    -- path no bucket
  ADD COLUMN IF NOT EXISTS original_pdf_size_bytes int,
  ADD COLUMN IF NOT EXISTS page_count int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS page_dimensions jsonb;     -- [{w_pt, h_pt}, ...] em points por página

-- Snapshot imutável do layout aprovado (separado do template_html legado)
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS layout_overlays jsonb;     -- [{id, type, field_name, page, x_pct, y_pct, w_pct, h_pct, font_size, font_weight, align}]

-- Limpa page_images do JSONB se ficarem >2MB total — passa para Storage
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS page_images_storage_paths text[];

-- Mesmo padrão para o documento gerado por paciente
ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS generated_pdf_path text,
  ADD COLUMN IF NOT EXISTS overlay_values jsonb;
```

### 4.2 Storage Buckets

Criar 2 buckets privados (via SQL ou Supabase admin):

| Bucket | Path pattern | RLS |
| --- | --- | --- |
| `document-templates` | `{clinic_id}/{template_id}/original.pdf` | apenas users com `clinic_id` igual ao path |
| `patient-documents` | `{clinic_id}/{patient_id}/{document_id}.pdf` | apenas users da clínica |

### 4.3 RLS Policies (Storage)

```sql
CREATE POLICY "clinic_isolation_template_storage"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'document-templates'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );
```

---

## 5. Refatoração dos Componentes

### 5.1 Novo: `src/lib/pdf/coordinate-system.ts`

Única fonte da verdade para conversão de coordenadas. Crítico — todo bug pixel-perfect passa por aqui.

```ts
// %  →  PDF points (origem bottom-left, A4 = 595.28 x 841.89 pt)
export function pctToPdfPoints(
  xPct: number, yPct: number,
  pageWidthPt: number, pageHeightPt: number
): { x: number; y: number } {
  return {
    x: (xPct / 100) * pageWidthPt,
    y: pageHeightPt - (yPct / 100) * pageHeightPt, // INVERTE Y
  }
}

export function pctToCssPixels(
  xPct: number, yPct: number, wPct: number, hPct: number,
  containerWidth: number, containerHeight: number
): React.CSSProperties { ... }
```

### 5.2 Refatoração — `TemplateLayoutEditor.tsx`

| Antes | Depois |
| --- | --- |
| `<div>` fundo branco | `<img src={page_images[currentPage]} />` (fundo absolute inset-0) |
| Custom drag (mousedown/mousemove handlers ~150 linhas) | `<Rnd>` do react-rnd com `bounds="parent"`, `dragGrid={[1,1]}`, `resizeGrid={[1,1]}` |
| `LayoutElement.y` em **px** | `LayoutElement.y` em **% da altura da página** (consistente com x) |
| Sem multi-página | Tab/paginador para navegar `page_images[i]` |
| Sem snap | Snap a guias (linhas pontilhadas do laudo) — feature P2 |

Substituir o tipo:

```ts
export type LayoutElement = {
  id: string
  type: 'field' | 'text' | 'logo' | 'signature' | 'image'
  field_name?: string
  label: string
  content?: string
  page: number          // NOVO — qual página do PDF original
  x: number             // % horizontal (0-100)
  y: number             // % vertical (0-100)   ← agora também em %
  width: number         // % largura
  height: number        // % altura
  fontSize: number      // pt (não px) — alinha com pdf-lib
  fontWeight: 'normal' | 'bold'
  fontFamily: 'Helvetica' | 'Times' | 'Courier'  // fonts standard do pdf-lib
  textAlign: 'left' | 'center' | 'right'
  color?: string        // hex, default '#000000'
}
```

### 5.3 Nova Aba Pré-visualizar — `TemplatePreviewPane.tsx`

```tsx
<div className="relative w-full aspect-[210/297] bg-white shadow-lg">
  <img src={pageImages[currentPage]} className="absolute inset-0 w-full h-full" />
  {overlays.filter(o => o.page === currentPage).map(o => (
    <div
      key={o.id}
      style={{
        position: 'absolute',
        left: `${o.x}%`, top: `${o.y}%`,
        width: `${o.width}%`, height: `${o.height}%`,
        fontSize: `${o.fontSize}pt`,
        fontWeight: o.fontWeight,
        textAlign: o.textAlign,
      }}
    >
      {o.type === 'field' ? `{{${o.field_name}}}` : o.content}
    </div>
  ))}
</div>
```

Crucial: o container tem `aspect-[210/297]` (A4 retrato). Em paisagem ou outro formato, ler de `page_dimensions[currentPage]`.

### 5.4 Atualização — `ImportTemplateModal.tsx`

Adicionar etapa de upload do PDF para Storage logo após a conversão a imagens (manter as imagens para preview rápido, mas garantir que o original esteja no bucket):

```ts
// pseudo
const { data: { id } } = await saveTemplateMetadata(...)
const pdfPath = `${clinic_id}/${id}/original.pdf`
await supabase.storage.from('document-templates').upload(pdfPath, file)
await updateTemplate(id, { original_pdf_path: pdfPath, page_count: pages.length })
```

---

## 6. Pipeline de Importação — Refinamentos na IA

`process-template-with-file/route.ts` já extrai coordenadas. Refinar prompt para aumentar precisão:

1. Adicionar pedido explícito de **`x_pct` do INÍCIO do espaço em branco** (não do centro), pois alinha melhor com `drawText` (left-anchor).
2. Pedir `font_size_estimate_pt` por campo (tamanho de fonte estimado lendo o documento).
3. Pedir `align_estimate` (`left`/`center`/`right`).
4. Pedir bounding box do **label** também — para suportar "Nomear Campo" sem o usuário clicar exatamente.
5. **Segunda passagem opcional**: enviar a imagem novamente com as coordenadas extraídas marcadas em vermelho, pedir verificação. (Toggle "Validar com IA" na UI.)

---

## 7. Engine de Geração — `src/lib/actions/document-generation.ts`

Nova Server Action central:

```ts
'use server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

export async function generateFilledDocument(input: {
  template_id: string
  patient_id: string
  field_values: Record<string, string | number | boolean | null>
}): Promise<{ pdf_path: string } | { error: string }> {
  // 1. auth + clinic_id check (RLS-style)
  // 2. fetch template (file_url, layout_overlays, page_dimensions)
  // 3. download PDF original do Storage
  // 4. PDFDocument.load(originalBytes)
  // 5. pdfDoc.registerFontkit(fontkit)
  // 6. const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  // 7. for cada overlay onde overlay.type === 'field':
  //      const page = pdfDoc.getPage(overlay.page)
  //      const { width, height } = page.getSize()
  //      const { x, y } = pctToPdfPoints(overlay.x, overlay.y, width, height)
  //      // Ajustar Y para baseline da fonte
  //      page.drawText(String(field_values[overlay.field_name]), {
  //        x, y: y - overlay.fontSize, // baseline correction
  //        size: overlay.fontSize,
  //        font: bold ? helveticaBold : helvetica,
  //        color: rgb(0, 0, 0),
  //      })
  // 8. Embed logo/assinatura: pdfDoc.embedPng(logoBytes) → page.drawImage()
  // 9. const finalPdf = await pdfDoc.save()
  // 10. upload para patient-documents bucket
  // 11. registrar patient_documents row
  // 12. logAudit + revalidatePath
}
```

### Edge cases tratados
- **Texto longo > largura do campo**: medir via `font.widthOfTextAtSize()`, quebrar com word-wrap manual ou reduzir `fontSize` em 0.5pt até caber.
- **Página não A4**: usar `page.getSize()` real — nunca assumir 595x841.
- **Campos em multi-página**: agrupar por `overlay.page` antes do loop.
- **Boolean → "Sim"/"Não"** (já implementado no jspdf, portar).
- **Date → formato BR `dd/MM/yyyy`** via `date-fns`.

---

## 8. Cronograma de Execução (Sprint Pixel Perfect)

| Fase | Itens | Tempo estimado | Bloqueante |
| --- | --- | ---: | --- |
| **F0 — Setup** | `npm install` pdf-lib, fontkit, react-rnd; migration 0126; criar buckets + RLS | 1h | — |
| **F1 — Coordinate System** | `src/lib/pdf/coordinate-system.ts` + testes unitários (mm↔pt↔%↔px) | 2h | F0 |
| **F2 — Storage do PDF Original** | Upload no `ImportTemplateModal`; backfill opcional para templates existentes | 2h | F0 |
| **F3 — Editor Refatorado** | Substituir drag custom por `react-rnd`; adicionar fundo PDF; paginador | 6h | F1 |
| **F4 — Preview Pixel-Perfect** | Componente `TemplatePreviewPane` com imagem + overlays absolutos | 2h | F1 |
| **F5 — Engine `pdf-lib`** | Server action `generateFilledDocument`; substituir `jspdf` no fluxo Vet | 6h | F1 |
| **F6 — IA Refinada** | Prompt v2 com `font_size_estimate_pt`, `align_estimate`; opcional 2nd pass | 3h | — (paralelo) |
| **F7 — Migração de Templates Antigos** | Script Node para gerar `layout_overlays` a partir de `extracted_fields` + `template_html` | 3h | F1 |
| **F8 — Testes E2E** | Spec Playwright: upload → editar → preview → gerar PDF → comparar com pixelmatch | 3h | F5 |
| **F9 — QA Pixel-Perfect** | Importar 5 layouts reais do cliente; diff visual < 2% por página | 2h | F8 |
| **F10 — Commit & Push vetmax** | Branch `feature/pixel-perfect-templates`; PR; merge após aprovação | 1h | F9 |

**Total estimado:** ~31h · **Wall-clock realista:** 3–4 dias úteis em Bypass.

---

## 9. Riscos & Mitigações

| Risco | Impacto | Probabilidade | Mitigação |
| --- | --- | --- | --- |
| `react-rnd` causa re-render em loop com 50+ overlays | UX trava | Média | `React.memo` em cada `<Rnd>`; throttle do `onDrag` |
| PDF com fonte não-standard (Calibri, Roboto) | Texto sobreposto com fonte errada | Alta | Embed Helvetica como fallback + UI para upload de `.ttf` da clínica |
| Marca d'água do PDF tem opacidade > overlay | Texto fica ilegível | Baixa | `pdf-lib` permite drawText com `opacity:1` por cima — testar em F9 |
| Claude Vision retorna coordenadas com erro de ±3% | Texto fora do campo | Alta | UI permite ajuste fino (já existe no editor); F6 segunda passagem reduz erro |
| `page_images` em JSONB > 5MB estoura Postgres TOAST | Erro 500 ao salvar | Média | Migrar para Storage (`page_images_storage_paths`) em F0 |
| PDF com camada vetorial protegida (CFMV signature certificada) | pdf-lib pode invalidar assinatura | Baixa | Detectar `isSigned()` e bloquear edição — preencher antes do signing |
| Cliente envia PDF escaneado (imagem em vez de texto) | Vision não acha labels | Média | Já temos OCR via Vision; resultado degrada mas usável |

---

## 10. Critérios de Aceite (Definition of Done)

1. ✅ Importar `Laudo_ECO__PC_SnowDjhmes.pdf` (do cliente) e o preview ficar visualmente idêntico ao original com placeholders nos lugares certos.
2. ✅ Gerar laudo de teste para um pet fictício → abrir o PDF gerado → marca d'água, logo, layout e fontes preservados; texto preenchido nas linhas pontilhadas com offset < 1mm.
3. ✅ Diff visual (pixelmatch) entre PDF original vazio e PDF gerado: somente os campos preenchidos diferem.
4. ✅ Editor permite arrastar campo e reduzir/aumentar fonte; persiste em `layout_overlays`.
5. ✅ RLS testada: usuário de clínica A não acessa template/PDF da clínica B (Storage + DB).
6. ✅ Sem regressão nos templates já cadastrados (legados continuam gerando com `jspdf` até backfill em F7).
7. ✅ Tempo de geração de um PDF de 2 páginas < 2s no servidor.
8. ✅ E2E Playwright passa no CI.

---

## 11. Ordem de Refatoração de Arquivos

```
NOVOS:
  src/lib/pdf/coordinate-system.ts
  src/lib/pdf/pdf-lib-renderer.ts
  src/lib/actions/document-generation.ts
  src/components/management/TemplatePreviewPane.tsx
  supabase/migrations/0126_document_templates_storage.sql
  tests/lib/coordinate-system.test.ts
  tests/e2e/pixel-perfect-templates.spec.ts

REFATORADOS:
  src/components/management/TemplateLayoutEditor.tsx     (drag → react-rnd, fundo PDF)
  src/components/management/ImportTemplateModal.tsx      (upload PDF para Storage, nova preview)
  src/app/api/process-template-with-file/route.ts        (prompt v2, font_size_estimate)
  src/types/index.ts                                     (LayoutElement com page + % em Y)
  src/lib/actions/templates.ts                           (aceitar layout_overlays)

DEPRECIADOS (gradualmente):
  src/lib/pdf-generator.ts  →  manter como fallback, marcar @deprecated
```

---

## 12. Decisões Pendentes (precisam de OK do Diretor)

1. **Backfill de templates antigos** — refazer extração com Vision-v2 (preserva precisão) OU mapear `extracted_fields` legado para `layout_overlays` (mais rápido, menos preciso)?
2. **Fonte default** — Helvetica (universal) ou tentar embed da fonte original via detecção (mais arriscado)?
3. **Validação de segundo turno da IA** (F6) — feature default ON ou opt-in com botão "Refinar com IA"?
4. **Upload de fonte customizada por clínica** — entra nesta sprint ou backlog?
5. **Comparador visual no UI** — slider "Original ↔ Gerado" para o usuário validar visualmente cada laudo antes de fechar?

---

**Próximo passo:** aguardar OK do Diretor sobre (1) o plano arquitetural e (2) as 5 decisões pendentes em §12. Após aprovação, executar em Bypass na branch `feature/pixel-perfect-templates`.
