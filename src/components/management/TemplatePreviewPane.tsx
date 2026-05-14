'use client'

/**
 * TemplatePreviewPane — preview pixel-perfect do template.
 *
 * Renderiza o PDF original (page_images) como fundo, com os layout overlays
 * sobrepostos exatamente nas posicoes % configuradas no editor. E uma WYSIWYG
 * do que sera gerado pela engine pdf-lib em F5.
 *
 * Diferenca para o editor:
 *   - Sem drag/resize (read-only)
 *   - Overlays renderizam placeholder ({{campo}}) ou valor real (modo "filled")
 *   - Suporta navegacao entre paginas (se houver mais de uma)
 */

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, ScanEye, Eye, FileText } from 'lucide-react'
import type { ExtractedField, PageDimensionsRecord } from '@/types'
import type { LayoutElement } from './TemplateLayoutEditor'

interface TemplatePreviewPaneProps {
  pageImages: string[] | null
  pageDimensions: PageDimensionsRecord[] | null
  layoutElements: LayoutElement[]
  extractedFields: ExtractedField[]
  watermark?: string
  watermarkOpacity?: number
  clinicLogoUrl?: string | null
  // Opcional: valores reais a renderizar no lugar dos placeholders {{campo}}
  fieldValues?: Record<string, string | number | boolean | null>
}

export default function TemplatePreviewPane({
  pageImages,
  pageDimensions,
  layoutElements,
  extractedFields,
  watermark = '',
  watermarkOpacity = 15,
  clinicLogoUrl,
  fieldValues,
}: TemplatePreviewPaneProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const pageCount = pageImages?.length ?? 0

  // Filtra overlays % por pagina; campos legados (px) nao aparecem aqui
  const pageOverlays = useMemo(
    () => layoutElements.filter(el =>
      el.unit === 'pct' && (el.page ?? 0) === currentPage,
    ),
    [layoutElements, currentPage],
  )

  // Fallback: se nao ha layoutElements em %, monta a partir de extracted_fields
  const fallbackOverlays = useMemo(() => {
    if (pageOverlays.length > 0) return []
    return extractedFields
      .filter(f => (f.page ?? 0) === currentPage && f.x_percent != null)
      .map(f => ({
        id: f.field_name,
        type: 'field' as const,
        field_name: f.field_name,
        label: f.label,
        page: f.page ?? 0,
        unit: 'pct' as const,
        x: f.x_percent ?? 30,
        y: f.y_percent ?? 10,
        width: f.width_percent ?? 25,
        height: f.height_percent ?? 3,
        fontSize: 11,
        fontWeight: 'normal' as const,
        textAlign: 'left' as const,
      }))
  }, [extractedFields, currentPage, pageOverlays.length])

  const overlaysToRender = pageOverlays.length > 0 ? pageOverlays : fallbackOverlays

  if (!pageImages || pageImages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <FileText className="w-12 h-12 mb-3" />
        <p className="text-sm font-medium">Sem documento original</p>
        <p className="text-xs mt-1">Faca upload de um PDF para ver a pre-visualizacao pixel-perfect.</p>
      </div>
    )
  }

  const dim = pageDimensions?.[currentPage]
  const aspectRatio = dim ? `${dim.width_pt} / ${dim.height_pt}` : '210 / 297'

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
        <ScanEye className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <p className="text-xs text-blue-700 font-medium flex-1">
          Pre-visualizacao pixel-perfect — {pageCount} pagina{pageCount > 1 ? 's' : ''}.
          {overlaysToRender.length > 0 && ` ${overlaysToRender.length} campo${overlaysToRender.length > 1 ? 's' : ''} sobrepostos.`}
        </p>
        {pageCount > 1 && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-white border border-blue-200 rounded text-xs">
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-0.5 text-slate-600 hover:text-blue-600 disabled:opacity-30">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-slate-700 font-medium px-1">
              {currentPage + 1} / {pageCount}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={currentPage >= pageCount - 1}
              className="p-0.5 text-slate-600 hover:text-blue-600 disabled:opacity-30">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Page canvas */}
      <div className="flex justify-center">
        <div
          className="relative bg-white shadow-xl border border-slate-200"
          style={{ width: '100%', maxWidth: '900px', aspectRatio }}
        >
          {/* PDF background */}
          <img
            src={pageImages[currentPage]}
            alt={`Pagina ${currentPage + 1}`}
            className="absolute inset-0 w-full h-full object-fill select-none pointer-events-none"
            draggable={false}
          />

          {/* Watermark */}
          {watermark && (
            <div
              className="absolute inset-0 pointer-events-none overflow-hidden z-10"
              style={{ opacity: watermarkOpacity / 100 }}
            >
              <div
                className="absolute top-1/2 left-1/2 text-slate-400 font-bold whitespace-nowrap select-none"
                style={{
                  fontSize: '3rem',
                  transform: 'translate(-50%, -50%) rotate(-35deg)',
                  letterSpacing: '0.15em',
                }}
              >
                {watermark}
              </div>
            </div>
          )}

          {/* Overlays */}
          {overlaysToRender.map(el => (
            <OverlayChip
              key={el.id}
              element={el}
              clinicLogoUrl={clinicLogoUrl}
              value={fieldValues?.[el.field_name ?? '']}
            />
          ))}
        </div>
      </div>

      {/* Footer hint */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 px-1">
        <Eye className="w-3 h-3" />
        <span>
          Cada campo aparece exatamente onde sera preenchido na geracao final.
          {fieldValues
            ? ' Modo simulacao: valores reais.'
            : ' Modo template: placeholders {{campo}}.'}
        </span>
      </div>
    </div>
  )
}

// ── Single overlay chip ─────────────────────────────────────────────────────

function OverlayChip({
  element,
  clinicLogoUrl,
  value,
}: {
  element: LayoutElement
  clinicLogoUrl?: string | null
  value?: string | number | boolean | null
}) {
  const style: React.CSSProperties = {
    position: 'absolute',
    left:   `${element.x}%`,
    top:    `${element.y}%`,
    width:  `${element.width}%`,
    height: `${element.height}%`,
    fontSize: `${element.fontSize}px`,
    fontWeight: element.fontWeight,
    textAlign: element.textAlign,
    display: 'flex',
    alignItems: 'center',
    justifyContent:
      element.textAlign === 'center' ? 'center' :
      element.textAlign === 'right' ? 'flex-end' : 'flex-start',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: 20,
  }

  // Em modo simulacao com valor: renderiza valor cru, sem bordas/cores
  if (value !== undefined && value !== null && value !== '') {
    const display = typeof value === 'boolean' ? (value ? 'Sim' : 'Nao') : String(value)
    return (
      <div style={{ ...style, color: '#000000' }}>
        <span className="truncate w-full">{display}</span>
      </div>
    )
  }

  // Modo template: chip discreto com placeholder
  if (element.type === 'logo') {
    return (
      <div style={{ ...style, border: '1px dashed rgba(245, 158, 11, 0.6)', background: 'rgba(254, 243, 199, 0.4)' }}>
        {clinicLogoUrl ? (
          <img src={clinicLogoUrl} alt="Logo" className="max-h-full max-w-full object-contain mx-auto" />
        ) : (
          <span className="text-amber-700 text-[9px] font-medium w-full text-center">{element.label}</span>
        )}
      </div>
    )
  }

  if (element.type === 'signature') {
    return (
      <div style={{ ...style, border: '1px dashed rgba(34, 197, 94, 0.6)', background: 'rgba(220, 252, 231, 0.4)' }}>
        <span className="text-green-700 text-[9px] font-medium w-full text-center">{element.label}</span>
      </div>
    )
  }

  if (element.type === 'text') {
    return (
      <div style={{ ...style, color: '#334155' }}>
        <span className="truncate w-full">{element.content || element.label}</span>
      </div>
    )
  }

  // type === 'field'
  return (
    <div
      style={{
        ...style,
        border: '1px dashed rgba(59, 130, 246, 0.5)',
        background: 'rgba(59, 130, 246, 0.06)',
        color: '#2563eb',
      }}
    >
      <span className="truncate w-full px-1">
        {`{{${element.field_name || 'campo'}}}`}
      </span>
    </div>
  )
}
