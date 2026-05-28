'use client'

/**
 * LaudoPrintable — visualização para impressão e download PDF.
 *
 * Estratégia anti-desconfiguração:
 *   1. Preview é renderizado em TAMANHO A4 REAL (21cm × 29.7cm) — sem
 *      shrink/max-width. What-you-see-is-what-you-print.
 *   2. Download PDF (html2canvas + jsPDF): força width/height A4 em px
 *      explícitos (794 × 1123 @ 96dpi) com windowWidth/Height — evita
 *      que html2canvas inferir tamanho a partir da viewport zoomed.
 *   3. Imprimir (Ctrl+P): CSS @media print esconde tudo menos a folha,
 *      força width: 21cm e print-color-adjust: exact para que cores de
 *      fundo (blocos rosa, destaque azul de controlados) imprimam.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2, Printer } from 'lucide-react'
import type { CanvaContentJson, CanvaTemplateConfig } from '@/lib/canva/types'
import type { CanvasState, PageConfig } from '@/lib/canva/canvas-state'
import { getAllPages } from '@/lib/canva/canvas-state'
import type { CanvasElement, RepeaterElement } from '@/lib/canva/elements'
import CanvaA4Preview from './CanvaA4Preview'
import CanvasStage from './editor/CanvasStage'
import { readRepeaterSource } from './editor/ElementRenderers'
import type { ResolveContext } from '@/lib/canva/dynamic-tags'

/** Página real ou virtual (gerada por overflow do repeater). */
interface ExpandedPage {
  page: PageConfig
  elements: CanvasElement[]
  /** Map de repeater id → slice de itens. Quando vazio/undefined, o
   *  repeater renderiza tudo (comportamento legado). Quando setado,
   *  cada repeater pega só o intervalo correspondente. */
  repeaterSlices?: Record<string, { start: number; end: number }>
  /** Etiqueta opcional pra debug ("1", "1 (cont.)", etc.). */
  label?: string
}

/** Expande páginas reais em páginas virtuais quando algum Repeater tem
 *  maxItemsPerPage e mais itens reais que isso. Cada página virtual herda
 *  os MESMOS elementos da página real — assim cabeçalhos, assinaturas e
 *  rodapés aparecem em todas, e o repeater muda apenas seu slice. */
function expandPagesForRepeaterOverflow(
  pages: ReturnType<typeof getAllPages>,
  resolveContext: ResolveContext | undefined,
): ExpandedPage[] {
  const out: ExpandedPage[] = []
  for (const p of pages) {
    const repeaters = p.elements.filter((el): el is RepeaterElement => el.kind === 'repeater')
    // Pega o primeiro repeater paginável da página (suporte a múltiplos
    // repeaters paginados na MESMA página é raro — fica como evolução futura)
    const paged = repeaters.find(r => r.maxItemsPerPage && r.maxItemsPerPage > 0)
    if (!paged) {
      out.push({ page: p.page, elements: p.elements })
      continue
    }
    const items = readRepeaterSource(paged.source, resolveContext)
    const effectiveTotal = Math.min(items.length, paged.maxLines ?? items.length)
    const max = paged.maxItemsPerPage!
    const slices = Math.max(1, Math.ceil(effectiveTotal / max))
    for (let s = 0; s < slices; s++) {
      out.push({
        page: p.page,
        elements: p.elements,
        repeaterSlices: {
          [paged.id]: { start: s * max, end: Math.min(effectiveTotal, (s + 1) * max) },
        },
        label: slices > 1 ? `${p.index + 1}${s > 0 ? ` (cont. ${s + 1}/${slices})` : ''}` : undefined,
      })
    }
  }
  return out
}

interface PatientHeader {
  patient_name?: string
  tutor_name?: string
  species?: string
  breed?: string
  age?: string
  sex?: string
  weight?: string
  date?: string
  vet_name?: string
  crmv?: string
}

interface Props {
  documentTitle: string
  config: CanvaTemplateConfig
  content: CanvaContentJson
  patient: PatientHeader
  /** Quando true, dispara print automaticamente após montar. */
  autoPrint?: boolean
  /** Quando presente, renderiza pelo motor Canvas Visual (drag&drop). */
  canvasState?: CanvasState | null
  /** Contexto para resolver dynamic tags (tutor, pet, consulta, etc.). */
  resolveContext?: ResolveContext
}

// A4 portrait em pixels a 96dpi — base do render no DOM e do html2canvas.
// 21cm × 96 / 2.54 = 793.7 → 794. 29.7cm × 96 / 2.54 = 1122.5 → 1123.
const A4_W_PX = 794
const A4_H_PX = 1123

export default function LaudoPrintable({
  documentTitle, config, content, patient, autoPrint, canvasState, resolveContext,
}: Props) {
  const printAreaRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  const doPrint = useCallback(() => {
    if (typeof window === 'undefined') return
    window.print()
  }, [])

  // Páginas finais para o print: páginas reais + páginas virtuais geradas
  // por overflow do Repeater (maxItemsPerPage). Memoizado pra evitar
  // re-calcular slices a cada render do html2canvas.
  const expandedPages = useMemo<ExpandedPage[]>(() => {
    if (!canvasState) return []
    return expandPagesForRepeaterOverflow(getAllPages(canvasState), resolveContext)
  }, [canvasState, resolveContext])

  const doDownloadPdf = useCallback(async () => {
    if (typeof window === 'undefined' || !printAreaRef.current) return
    setBusy(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const pages = Array.from(printAreaRef.current.querySelectorAll<HTMLElement>('.canva-a4-page'))
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const W = 210, H = 297

      // Para cada página, fixa explicitamente width/height em px e captura
      // com windowWidth/Height idênticos. Garante que html2canvas trabalha
      // num "viewport sintético" A4 — independe do zoom/scroll do browser.
      for (let i = 0; i < pages.length; i++) {
        const node = pages[i]

        // Snapshot dos estilos inline pra restaurar depois da captura
        const orig = {
          width:  node.style.width,
          height: node.style.height,
        }
        node.style.width  = `${A4_W_PX}px`
        node.style.height = `${A4_H_PX}px`

        const canvas = await html2canvas(node, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          width:        A4_W_PX,
          height:       A4_H_PX,
          windowWidth:  A4_W_PX,
          windowHeight: A4_H_PX,
        })

        // Restaura estilos originais
        node.style.width  = orig.width
        node.style.height = orig.height

        const img = canvas.toDataURL('image/png')
        if (i > 0) pdf.addPage('a4', 'portrait')
        pdf.addImage(img, 'PNG', 0, 0, W, H, undefined, 'FAST')
      }

      const safe = documentTitle.replace(/[^\w.-]+/g, '_')
      pdf.save(`${safe || 'laudo'}.pdf`)
    } finally {
      setBusy(false)
    }
  }, [documentTitle])

  useEffect(() => {
    if (autoPrint) {
      const id = window.setTimeout(doPrint, 350)
      return () => window.clearTimeout(id)
    }
  }, [autoPrint, doPrint])

  return (
    <div className="canva-print-shell min-h-screen bg-slate-100 py-8">
      <div className="canva-print-controls mx-auto mb-4 flex w-[21cm] items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
        <h1 className="text-sm font-semibold text-slate-800 truncate">{documentTitle}</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={doDownloadPdf}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Baixar PDF
          </button>
          <button
            type="button"
            onClick={doPrint}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir (Ctrl+P)
          </button>
        </div>
      </div>

      {/* Render em TAMANHO A4 REAL (21cm) — what-you-see-is-what-you-print.
          Sem max-w shrink. O CanvasStage internamente usa width: 21cm via
          mode='print', então é literal 794px @ 96dpi. */}
      <div
        ref={printAreaRef}
        className="canva-print-area mx-auto"
        style={{ width: '21cm' }}
      >
        {canvasState ? (
          // Multi-page: páginas reais (extraPages) + virtuais (overflow do
          // repeater com maxItemsPerPage). Cada stage recebe um CanvasState
          // single-page e o slice do repeater para a página correspondente.
          expandedPages.map((p, idx) => (
            <div
              key={idx}
              className="canva-print-page-wrapper"
              style={idx > 0 ? { pageBreakBefore: 'always', breakBefore: 'page', marginTop: '1cm' } : undefined}
            >
              <CanvasStage
                state={{ version: 1, page: p.page, elements: p.elements }}
                mode="print"
                resolveContext={resolveContext}
                repeaterSlices={p.repeaterSlices}
              />
            </div>
          ))
        ) : (
          <CanvaA4Preview
            backgroundUrl={config.background_image_url}
            margins={config.margins}
            blockStyle={config.block_style}
            patient={patient}
            content={content}
            documentTitle={documentTitle}
            mode="print"
            pages={1}
          />
        )}
      </div>
    </div>
  )
}
