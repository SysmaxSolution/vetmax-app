'use client'

import { useState, useRef, useCallback, useMemo, useLayoutEffect, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import {
  Move, Image as ImageIcon, PenTool, Type, Trash2,
  RotateCcw, Plus, ChevronLeft, ChevronRight, MousePointer2, X, CopyPlus,
} from 'lucide-react'
import type { ExtractedField, FieldType, PageDimensionsRecord } from '@/types'
import NewFieldDialog from './NewFieldDialog'
import ElementQuickEditPopover from './ElementQuickEditPopover'

// ── Types ───────────────────────────────────────────────────────────────────

export type LayoutElement = {
  id: string
  type: 'field' | 'text' | 'logo' | 'signature'
  field_name?: string             // for type='field'
  label: string
  content?: string                // for type='text'
  x: number                       // px ou % (ver unit)
  y: number                       // px ou % (ver unit)
  width: number                   // px ou % (ver unit)
  height: number                  // px ou % (ver unit)
  fontSize: number                // px (editor) — convertido para pt na geracao
  fontWeight: 'normal' | 'bold'
  textAlign: 'left' | 'center' | 'right'
  // Pixel Perfect (opcionais — quando presentes, indicam modo % por pagina)
  page?: number                   // 0-based — qual pagina do PDF original
  unit?: 'px' | 'pct'             // 'pct' = todos x/y/w/h em %; ausente/default = 'px' (legado)
  // OCR Sniper: bbox EXATA do texto antigo (para whiteout cirurgico)
  whiteoutBbox?: { x_pct: number; y_pct: number; w_pct: number; h_pct: number }
  // OCR Sniper: marca campos de cabecalho/rodape que se repetem em todas as paginas
  isGlobal?: boolean
  // PM-3: baseline Y exata do texto original — pdf-lib usa para alinhar drawText
  baselineYPct?: number
}

interface TemplateLayoutEditorProps {
  elements: LayoutElement[]
  onChange: (elements: LayoutElement[]) => void
  fields: ExtractedField[]
  watermark?: string
  watermarkOpacity?: number
  clinicLogoUrl?: string | null
  // Pixel Perfect mode — quando pageImages e fornecido, o editor renderiza o PDF
  // como fundo e trabalha em coordenadas % por pagina.
  pageImages?: string[] | null
  pageDimensions?: PageDimensionsRecord[] | null
  // Modo desenho: callback acionado quando o usuario desenha um novo campo
  // sobre o PDF. Recebe o ExtractedField completo, ja com coords e tipo.
  onAddField?: (field: ExtractedField) => void
}

// ── Helpers ─────────────────────────────────────────────────────────────────

let idCounter = 0
/**
 * Gera um ID deterministico unico para LayoutElements. Combina timestamp +
 * counter — nunca colide, mesmo em chamadas back-to-back. Exportado para que
 * o ImportTemplateModal use o mesmo padrao ao criar campos a partir da IA.
 */
export const uid = () => `el_${Date.now()}_${++idCounter}`

const isPct = (el: LayoutElement) => el.unit === 'pct'

/**
 * Constroi overlays iniciais a partir dos campos extraidos pela IA.
 * Modo Pixel Perfect: cada campo posicionado nas coordenadas % retornadas pela
 * Vision API. Modo legado: layout vertical sequencial.
 */
function buildDefaultElements(
  fields: ExtractedField[],
  pixelPerfect: boolean,
): LayoutElement[] {
  if (pixelPerfect) {
    // Cada campo posicionado pela IA. Logo/Titulo/Assinatura ficam por conta do usuario.
    return fields.map(f => ({
      id: uid(),
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
  }

  // Modo legado (sem PDF) — layout vertical
  const els: LayoutElement[] = []
  let y = 20
  els.push({
    id: uid(), type: 'logo', label: 'Logo da Clinica',
    x: 35, y, width: 30, height: 60,
    fontSize: 12, fontWeight: 'bold', textAlign: 'center',
  })
  y += 70
  els.push({
    id: uid(), type: 'text', label: 'Titulo',
    content: 'DOCUMENTO VETERINARIO', x: 10, y, width: 80, height: 30,
    fontSize: 18, fontWeight: 'bold', textAlign: 'center',
  })
  y += 40
  els.push({
    id: uid(), type: 'text', label: 'Separador',
    content: '─'.repeat(60), x: 5, y, width: 90, height: 15,
    fontSize: 10, fontWeight: 'normal', textAlign: 'center',
  })
  y += 25
  for (const field of fields) {
    els.push({
      id: uid(), type: 'field', field_name: field.field_name,
      label: field.label, x: 5, y, width: 90,
      height: field.type === 'textarea' ? 50 : 28,
      fontSize: 11, fontWeight: 'normal', textAlign: 'left',
    })
    y += (field.type === 'textarea' ? 60 : 36)
  }
  y += 20
  els.push({
    id: uid(), type: 'signature', label: 'Assinatura Digital',
    x: 25, y, width: 50, height: 50,
    fontSize: 10, fontWeight: 'normal', textAlign: 'center',
  })
  return els
}

// ── Element renderer (visual content INSIDE the Rnd box) ────────────────────

function ElementContent({
  element,
  clinicLogoUrl,
}: {
  element: LayoutElement
  clinicLogoUrl?: string | null
}) {
  const bgMap = {
    field: 'rgba(59, 130, 246, 0.05)',
    text: 'rgba(248, 250, 252, 0.6)',
    logo: 'rgba(254, 243, 199, 0.5)',
    signature: 'rgba(240, 253, 244, 0.5)',
  }

  return (
    <div
      className="w-full h-full flex items-center overflow-hidden px-1"
      style={{
        fontSize: `${element.fontSize}px`,
        fontWeight: element.fontWeight,
        textAlign: element.textAlign,
        justifyContent: element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start',
        background: bgMap[element.type] || '#fff',
      }}
    >
      {element.type === 'logo' && (
        clinicLogoUrl ? (
          <img src={clinicLogoUrl} alt="Logo" className="max-h-full max-w-full object-contain mx-auto" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-amber-300 rounded bg-amber-50/50">
            <ImageIcon className="w-4 h-4 text-amber-400 mb-0.5" />
            <span className="text-[9px] text-amber-600 font-medium">Logo</span>
          </div>
        )
      )}
      {element.type === 'signature' && (
        <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-green-300 rounded bg-green-50/50">
          <PenTool className="w-4 h-4 text-green-400 mb-0.5" />
          <span className="text-[9px] text-green-600 font-medium">Assinatura</span>
        </div>
      )}
      {element.type === 'field' && (
        <span className="text-blue-700 truncate w-full">
          {`{{${element.field_name || 'campo'}}}`}
        </span>
      )}
      {element.type === 'text' && (
        <span className="text-slate-700 leading-tight truncate w-full">
          {element.content || element.label}
        </span>
      )}
    </div>
  )
}

// ── Properties Panel ────────────────────────────────────────────────────────

function PropertiesPanel({
  element,
  onChange,
  onDelete,
  onRepeatOnAllPages,
  pageCount,
}: {
  element: LayoutElement
  onChange: (updates: Partial<LayoutElement>) => void
  onDelete: () => void
  onRepeatOnAllPages?: () => void
  pageCount?: number
}) {
  const unit = isPct(element) ? '%' : 'px'
  const canRepeatAcrossPages =
    onRepeatOnAllPages !== undefined &&
    pageCount !== undefined && pageCount > 1 &&
    isPct(element)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Propriedades</span>
        <button onClick={onDelete} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded" title="Remover">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {canRepeatAcrossPages && (
        <button
          type="button"
          onClick={onRepeatOnAllPages}
          title="Cria cópias deste elemento nas demais páginas, mantendo as coordenadas. Usado para logo/cabeçalho/assinatura."
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
        >
          <CopyPlus className="w-3.5 h-3.5" />
          Repetir em todas as páginas
        </button>
      )}

      <div>
        <label className="text-[10px] font-medium text-slate-500">Label</label>
        <input
          type="text"
          value={element.label}
          onChange={e => onChange({ label: e.target.value })}
          className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {element.type === 'text' && (
        <div>
          <label className="text-[10px] font-medium text-slate-500">Conteudo</label>
          <textarea
            value={element.content || ''}
            onChange={e => onChange({ content: e.target.value })}
            className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            rows={2}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-slate-500">Largura ({unit})</label>
          <input type="number" min={1} step={isPct(element) ? 0.5 : 1} value={round2(element.width)}
            onChange={e => onChange({ width: Number(e.target.value) })}
            className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-slate-500">Altura ({unit})</label>
          <input type="number" min={1} step={isPct(element) ? 0.5 : 1} value={round2(element.height)}
            onChange={e => onChange({ height: Number(e.target.value) })}
            className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-slate-500">X ({unit})</label>
          <input type="number" min={0} step={isPct(element) ? 0.5 : 1} value={round2(element.x)}
            onChange={e => onChange({ x: Number(e.target.value) })}
            className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-slate-500">Y ({unit})</label>
          <input type="number" min={0} step={isPct(element) ? 0.5 : 1} value={round2(element.y)}
            onChange={e => onChange({ y: Number(e.target.value) })}
            className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-slate-500">Fonte (px)</label>
          <input type="number" min={6} max={48} step={0.5} value={element.fontSize}
            onChange={e => onChange({ fontSize: Number(e.target.value) })}
            className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-slate-500">Peso</label>
          <select value={element.fontWeight} onChange={e => onChange({ fontWeight: e.target.value as any })}
            className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="normal">Normal</option>
            <option value="bold">Negrito</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-medium text-slate-500">Alinhamento</label>
        <div className="flex gap-1 mt-0.5">
          {(['left', 'center', 'right'] as const).map(a => (
            <button key={a} onClick={() => onChange({ textAlign: a })}
              className={`flex-1 px-2 py-1 text-[10px] font-medium rounded border transition-colors ${
                element.textAlign === a
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}>
              {a === 'left' ? 'Esq.' : a === 'center' ? 'Centro' : 'Dir.'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function round2(n: number) { return Math.round(n * 100) / 100 }

// ── Main Editor ─────────────────────────────────────────────────────────────

export default function TemplateLayoutEditor({
  elements: initialElements,
  onChange,
  fields,
  watermark = '',
  watermarkOpacity = 15,
  clinicLogoUrl,
  pageImages,
  pageDimensions,
  onAddField,
}: TemplateLayoutEditorProps) {
  const pixelPerfectMode = !!(pageImages && pageImages.length > 0)
  const pageCount = pixelPerfectMode ? pageImages!.length : 1

  const [elements, setElements] = useState<LayoutElement[]>(() =>
    initialElements.length > 0 ? initialElements : buildDefaultElements(fields, pixelPerfectMode),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)

  // ── Modo Desenhar Campo (Pixel Perfect mode) ──────────────────────────
  const [drawMode, setDrawMode] = useState(false)
  const [drawingRect, setDrawingRect] = useState<
    { x_pct: number; y_pct: number; w_pct: number; h_pct: number } | null
  >(null)
  const drawStartRef = useRef<{ x_pct: number; y_pct: number } | null>(null)
  const [pendingDrawnField, setPendingDrawnField] = useState<
    { rect: { x_pct: number; y_pct: number; w_pct: number; h_pct: number }; page: number } | null
  >(null)

  // Esc cancela o modo desenho
  useEffect(() => {
    if (!drawMode && !pendingDrawnField) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawMode(false)
        setDrawingRect(null)
        drawStartRef.current = null
        setPendingDrawnField(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawMode, pendingDrawnField])

  // Tamanho renderizado do canvas (para converter % ↔ px nas operacoes de Rnd)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 800, height: 1131 })

  useLayoutEffect(() => {
    if (!canvasRef.current) return
    const updateSize = () => {
      if (!canvasRef.current) return
      const r = canvasRef.current.getBoundingClientRect()
      // Round para evitar sub-pixel changes do ResizeObserver disparando
      // re-renders em cascata (que faziam o popover piscar)
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      setCanvasSize(prev =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h },
      )
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [pixelPerfectMode, currentPage])

  const selected = elements.find(e => e.id === selectedId) || null

  const updateElements = useCallback((newEls: LayoutElement[]) => {
    setElements(newEls)
    onChange(newEls)
  }, [onChange])

  // ── Element ops ───────────────────────────────────────────────────────

  const addElement = (type: LayoutElement['type']) => {
    const newEl: LayoutElement = pixelPerfectMode
      ? {
          id: uid(),
          type,
          label: type === 'logo' ? 'Logo da Clinica'
            : type === 'signature' ? 'Assinatura Digital'
            : type === 'text' ? 'Novo Texto'
            : 'Campo',
          page: currentPage,
          unit: 'pct',
          x: type === 'logo' || type === 'signature' ? 35 : 10,
          y: type === 'logo' || type === 'signature' ? 80 : 10,
          width: type === 'logo' || type === 'signature' ? 30 : 25,
          height: type === 'logo' || type === 'signature' ? 8 : 3,
          fontSize: type === 'text' ? 14 : 11,
          fontWeight: 'normal',
          textAlign: type === 'logo' || type === 'signature' ? 'center' : 'left',
        }
      : {
          id: uid(),
          type,
          label: type === 'logo' ? 'Logo da Clinica'
            : type === 'signature' ? 'Assinatura Digital'
            : type === 'text' ? 'Novo Texto'
            : 'Campo',
          x: type === 'logo' || type === 'signature' ? 25 : 5,
          y: elements.reduce((max, el) => Math.max(max, el.y + el.height), 0) + 15,
          width: type === 'logo' || type === 'signature' ? 50 : 90,
          height: type === 'logo' ? 60 : type === 'signature' ? 50 : 25,
          fontSize: type === 'text' ? 12 : 11,
          fontWeight: 'normal',
          textAlign: type === 'logo' || type === 'signature' ? 'center' : 'left',
        }
    updateElements([...elements, newEl])
    setSelectedId(newEl.id)
  }

  const deleteElement = (id: string) => {
    updateElements(elements.filter(e => e.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const updateElement = (id: string, updates: Partial<LayoutElement>) => {
    updateElements(elements.map(e => e.id === id ? { ...e, ...updates } : e))
  }

  const resetLayout = () => {
    const newEls = buildDefaultElements(fields, pixelPerfectMode)
    updateElements(newEls)
    setSelectedId(null)
  }

  // ── Convert % overlay → Rnd px position/size ───────────────────────────

  const overlayToPx = useCallback((el: LayoutElement) => {
    if (isPct(el)) {
      return {
        x: (el.x / 100) * canvasSize.width,
        y: (el.y / 100) * canvasSize.height,
        width: (el.width / 100) * canvasSize.width,
        height: (el.height / 100) * canvasSize.height,
      }
    }
    // Legado: x e width em %, y/height em px
    return {
      x: (el.x / 100) * canvasSize.width,
      y: el.y,
      width: (el.width / 100) * canvasSize.width,
      height: el.height,
    }
  }, [canvasSize])

  const pxToOverlay = useCallback((
    el: LayoutElement,
    px: { x: number; y: number; width: number; height: number },
  ): Partial<LayoutElement> => {
    if (isPct(el)) {
      return {
        x: clamp((px.x / canvasSize.width) * 100, 0, 100),
        y: clamp((px.y / canvasSize.height) * 100, 0, 100),
        width: clamp((px.width / canvasSize.width) * 100, 0.5, 100),
        height: clamp((px.height / canvasSize.height) * 100, 0.3, 100),
      }
    }
    return {
      x: clamp((px.x / canvasSize.width) * 100, 0, 100),
      y: Math.max(0, px.y),
      width: clamp((px.width / canvasSize.width) * 100, 0.5, 100),
      height: Math.max(8, px.height),
    }
  }, [canvasSize])

  // ── Visible elements (filter by current page in PP mode) ───────────────

  const visibleElements = useMemo(() => {
    if (!pixelPerfectMode) return elements
    return elements.filter(el => (el.page ?? 0) === currentPage)
  }, [elements, currentPage, pixelPerfectMode])

  // ── Canvas dims ────────────────────────────────────────────────────────

  // Em modo PP: usa aspect ratio da pagina; em legado: altura cresce com conteudo
  const canvasStyle: React.CSSProperties = pixelPerfectMode
    ? (() => {
        const dim = pageDimensions?.[currentPage]
        const aspect = dim ? `${dim.width_pt} / ${dim.height_pt}` : '210 / 297'
        return {
          width: '100%',
          maxWidth: '900px',
          aspectRatio: aspect,
        }
      })()
    : (() => {
        const minH = Math.max(600, elements.reduce((max, el) => Math.max(max, (isPct(el) ? 0 : el.y) + (isPct(el) ? 0 : el.height) + 40), 0))
        return { width: '210mm', maxWidth: '100%', minHeight: `${minH}px` }
      })()

  return (
    <div className="flex gap-3 h-full">
      {/* ── Canvas ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <button onClick={() => addElement('logo')}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
            <ImageIcon className="w-3.5 h-3.5" />Logo
          </button>
          <button onClick={() => addElement('signature')}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
            <PenTool className="w-3.5 h-3.5" />Assinatura
          </button>
          <button onClick={() => addElement('text')}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
            <Type className="w-3.5 h-3.5" />Texto
          </button>
          <button onClick={() => addElement('field')}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
            <Plus className="w-3.5 h-3.5" />Campo
          </button>
          {/* Modo Desenhar Campo — disponivel em Pixel Perfect mode */}
          {pixelPerfectMode && onAddField && (
            <button
              onClick={() => { setDrawMode(m => !m); setSelectedId(null) }}
              title={drawMode ? 'Sair do modo desenho (Esc)' : 'Clique e arraste sobre o PDF para criar um campo'}
              className={
                'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors ' +
                (drawMode
                  ? 'text-white bg-blue-600 border-blue-700 hover:bg-blue-700'
                  : 'text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100')
              }
            >
              {drawMode
                ? <><X className="w-3.5 h-3.5" />Cancelar Desenho</>
                : <><MousePointer2 className="w-3.5 h-3.5" />Desenhar Campo</>}
            </button>
          )}
          <div className="flex-1" />
          {pixelPerfectMode && pageCount > 1 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-0.5 text-slate-600 hover:text-blue-600 disabled:opacity-30">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-slate-700 font-medium px-1">
                Pag. {currentPage + 1} / {pageCount}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={currentPage >= pageCount - 1}
                className="p-0.5 text-slate-600 hover:text-blue-600 disabled:opacity-30">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <button onClick={resetLayout}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="Resetar layout">
            <RotateCcw className="w-3.5 h-3.5" />Resetar
          </button>
        </div>

        {/* Canvas area */}
        <div className="flex-1 bg-slate-100 rounded-lg overflow-auto border border-slate-200">
          <div className="flex justify-center py-4 px-2">
            <div
              ref={canvasRef}
              className={'relative bg-white shadow-lg' + (drawMode ? ' cursor-crosshair' : '')}
              style={canvasStyle}
              onClick={(e) => {
                // So desseleciona se o click foi DIRETAMENTE na div do canvas
                // (area vazia/fundo), nao em um Rnd/popover filho.
                // Defesa em profundidade contra "popover pisca" quando algum
                // filho esquece de stopPropagation.
                if (!drawMode && e.target === e.currentTarget) setSelectedId(null)
              }}
              onMouseDown={(e) => {
                if (!drawMode || !canvasRef.current) return
                // Inicia desenho — calcula coords % a partir do clique
                const rect = canvasRef.current.getBoundingClientRect()
                const x_pct = ((e.clientX - rect.left) / rect.width) * 100
                const y_pct = ((e.clientY - rect.top)  / rect.height) * 100
                drawStartRef.current = { x_pct, y_pct }
                setDrawingRect({ x_pct, y_pct, w_pct: 0, h_pct: 0 })
                setSelectedId(null)
                e.preventDefault()
              }}
              onMouseMove={(e) => {
                if (!drawMode || !drawStartRef.current || !canvasRef.current) return
                const rect = canvasRef.current.getBoundingClientRect()
                const curX = ((e.clientX - rect.left) / rect.width) * 100
                const curY = ((e.clientY - rect.top)  / rect.height) * 100
                const s = drawStartRef.current
                // Suporta arraste em qualquer direcao — pega min/max
                const x = Math.max(0, Math.min(s.x_pct, curX))
                const y = Math.max(0, Math.min(s.y_pct, curY))
                const w = Math.min(100 - x, Math.abs(curX - s.x_pct))
                const h = Math.min(100 - y, Math.abs(curY - s.y_pct))
                setDrawingRect({ x_pct: x, y_pct: y, w_pct: w, h_pct: h })
              }}
              onMouseUp={() => {
                if (!drawMode || !drawingRect || !drawStartRef.current) return
                drawStartRef.current = null
                // Desenho muito pequeno (clique acidental) — cancela
                if (drawingRect.w_pct < 1 || drawingRect.h_pct < 0.8) {
                  setDrawingRect(null)
                  return
                }
                setPendingDrawnField({ rect: drawingRect, page: currentPage })
                setDrawingRect(null)
              }}
              onMouseLeave={() => {
                // Se sair do canvas com o mouse pressionado, cancela
                if (drawingRect) { setDrawingRect(null); drawStartRef.current = null }
              }}
            >
              {/* PDF page background (Pixel Perfect mode) */}
              {pixelPerfectMode && pageImages![currentPage] && (
                <img
                  src={pageImages![currentPage]}
                  alt={`Pagina ${currentPage + 1}`}
                  className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
                  draggable={false}
                />
              )}

              {/* Watermark overlay */}
              {watermark && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden z-10"
                  style={{ opacity: watermarkOpacity / 100 }}>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-300 font-bold whitespace-nowrap select-none"
                    style={{ fontSize: '3rem', transform: 'translate(-50%, -50%) rotate(-35deg)', letterSpacing: '0.15em' }}>
                    {watermark}
                  </div>
                </div>
              )}

              {/* Page margin guides — legado apenas */}
              {!pixelPerfectMode && (
                <div className="absolute inset-0 pointer-events-none"
                  style={{ border: '1px dashed #e2e8f0', margin: '10mm' }} />
              )}

              {/* Elements via Rnd — desabilitados no modo desenho para nao intercepter cliques */}
              {!drawMode && visibleElements.map(el => {
                const px = overlayToPx(el)
                const isSel = selectedId === el.id
                return (
                  <Rnd
                    key={el.id}
                    position={{ x: px.x, y: px.y }}
                    size={{ width: px.width, height: px.height }}
                    bounds="parent"
                    onMouseDown={(e: any) => { e.stopPropagation(); setSelectedId(el.id) }}
                    // Redundancia robusta: alguns paths do react-rnd (drag/tap-vs-click)
                    // podem nao chegar ao nosso onMouseDown a tempo. O onClick garante
                    // que selectedId seja setado em qualquer caso. Sem stopPropagation
                    // o click bubblaria pro canvas e fecharia o popover (efeito "piscar").
                    onClick={(e: any) => { e.stopPropagation(); setSelectedId(el.id) }}
                    onDragStop={(_e, d) => {
                      // Threshold: ignora "drags" de 0px (clique puro). Sem isso, o
                      // react-rnd dispara onDragStop apos cliques sem movimento, o que
                      // gera updateElement com pequena diferenca de sub-pixel → loop de
                      // re-render → pisca visivel (especialmente em campos IA com coords
                      // de muitas casas decimais vindas do refinamento pdfjs).
                      if (Math.abs(d.x - px.x) < 0.5 && Math.abs(d.y - px.y) < 0.5) return
                      const upd = pxToOverlay(el, { x: d.x, y: d.y, width: px.width, height: px.height })
                      updateElement(el.id, upd)
                    }}
                    onResizeStop={(_e, _dir, ref, _delta, position) => {
                      const newW = parseFloat(ref.style.width)
                      const newH = parseFloat(ref.style.height)
                      // Mesmo threshold para resize "fantasma"
                      if (
                        Math.abs(position.x - px.x) < 0.5 &&
                        Math.abs(position.y - px.y) < 0.5 &&
                        Math.abs(newW - px.width) < 0.5 &&
                        Math.abs(newH - px.height) < 0.5
                      ) return
                      const upd = pxToOverlay(el, { x: position.x, y: position.y, width: newW, height: newH })
                      updateElement(el.id, upd)
                    }}
                    style={{
                      border: `1.5px ${isSel ? 'solid' : 'dashed'} ${isSel ? '#3b82f6' : 'rgba(59,130,246,0.4)'}`,
                      borderRadius: '3px',
                      zIndex: isSel ? 30 : 20,
                      cursor: 'move',
                    }}
                    enableResizing={{ bottom: true, right: true, bottomRight: true, top: true, left: true, topLeft: true, topRight: true, bottomLeft: true }}
                  >
                    <ElementContent element={el} clinicLogoUrl={clinicLogoUrl} />
                  </Rnd>
                )
              })}

              {/* No modo desenho: render somente como overlay visual (sem interacao) */}
              {drawMode && visibleElements.map(el => {
                const px = overlayToPx(el)
                return (
                  <div
                    key={el.id}
                    className="absolute pointer-events-none"
                    style={{
                      left: px.x, top: px.y, width: px.width, height: px.height,
                      border: '1.5px dashed rgba(59,130,246,0.25)',
                      borderRadius: '3px',
                      zIndex: 15,
                    }}
                  >
                    <ElementContent element={el} clinicLogoUrl={clinicLogoUrl} />
                  </div>
                )
              })}

              {/* Preview do retangulo sendo desenhado */}
              {drawingRect && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left:   `${drawingRect.x_pct}%`,
                    top:    `${drawingRect.y_pct}%`,
                    width:  `${drawingRect.w_pct}%`,
                    height: `${drawingRect.h_pct}%`,
                    border: '2px dashed #2563eb',
                    background: 'rgba(37, 99, 235, 0.12)',
                    borderRadius: '3px',
                    zIndex: 40,
                  }}
                />
              )}

              {/* Hint visual quando o modo desenho esta ativo */}
              {drawMode && !drawingRect && (
                <div
                  className="absolute top-2 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg pointer-events-none z-50 flex items-center gap-2"
                >
                  <MousePointer2 className="w-3.5 h-3.5" />
                  Clique e arraste sobre o PDF para criar um campo &middot; Esc cancela
                </div>
              )}

              {/* Popover de edicao rapida — ao lado do elemento selecionado */}
              {!drawMode && selected && (pixelPerfectMode ? (selected.page ?? 0) === currentPage : true) && (
                <ElementQuickEditPopover
                  element={selected}
                  elementPx={overlayToPx(selected)}
                  canvasSize={canvasSize}
                  onChange={(updates) => updateElement(selected.id, updates)}
                  onDelete={() => deleteElement(selected.id)}
                  onClose={() => setSelectedId(null)}
                  pageCount={pageCount}
                  onRepeatOnAllPages={
                    pixelPerfectMode && pageCount > 1 && isPct(selected)
                      ? () => {
                          const sourcePage = selected.page ?? 0
                          const clones: LayoutElement[] = []
                          for (let p = 0; p < pageCount; p++) {
                            if (p === sourcePage) continue
                            const exists = elements.some(
                              e => e.type === selected.type &&
                                   (e.page ?? 0) === p &&
                                   (e.field_name ?? null) === (selected.field_name ?? null) &&
                                   Math.abs(e.x - selected.x) < 0.5 &&
                                   Math.abs(e.y - selected.y) < 0.5,
                            )
                            if (exists) continue
                            clones.push({ ...selected, id: uid(), page: p })
                          }
                          if (clones.length > 0) updateElements([...elements, ...clones])
                        }
                      : undefined
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Side Panel ── */}
      <div className="w-48 flex-shrink-0 bg-slate-50 rounded-lg border border-slate-200 p-3 overflow-y-auto">
        {selected ? (
          <PropertiesPanel
            element={selected}
            onChange={(updates) => updateElement(selected.id, updates)}
            onDelete={() => deleteElement(selected.id)}
            pageCount={pageCount}
            onRepeatOnAllPages={
              pixelPerfectMode && pageCount > 1 && isPct(selected)
                ? () => {
                    // Cria uma copia em cada outra pagina, mantendo coords/font/etc.
                    const sourcePage = selected.page ?? 0
                    const clones: LayoutElement[] = []
                    for (let p = 0; p < pageCount; p++) {
                      if (p === sourcePage) continue
                      // Pula se ja existe overlay com mesmo field_name nessa pagina
                      // (evita duplicacao se o user clicar varias vezes)
                      const exists = elements.some(
                        e => e.type === selected.type &&
                             (e.page ?? 0) === p &&
                             (e.field_name ?? null) === (selected.field_name ?? null) &&
                             Math.abs(e.x - selected.x) < 0.5 &&
                             Math.abs(e.y - selected.y) < 0.5,
                      )
                      if (exists) continue
                      clones.push({ ...selected, id: uid(), page: p })
                    }
                    if (clones.length > 0) updateElements([...elements, ...clones])
                  }
                : undefined
            }
          />
        ) : (
          <div className="text-center py-8">
            <Move className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-medium">Selecione um elemento</p>
            <p className="text-[10px] text-slate-400 mt-1">Clique e arraste para mover</p>
          </div>
        )}

        {/* Element list */}
        <div className="mt-4 pt-3 border-t border-slate-200">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Elementos ({pixelPerfectMode ? `${visibleElements.length}/${elements.length}` : elements.length})
          </p>
          <div className="space-y-1">
            {(pixelPerfectMode ? visibleElements : elements).map(el => {
              const colors = {
                field: 'text-blue-600 bg-blue-50',
                text: 'text-slate-600 bg-slate-100',
                logo: 'text-amber-600 bg-amber-50',
                signature: 'text-green-600 bg-green-50',
              }
              return (
                <button
                  key={el.id}
                  onClick={() => setSelectedId(el.id)}
                  className={`w-full text-left px-2 py-1 rounded text-[10px] font-medium truncate transition-colors ${
                    selectedId === el.id
                      ? 'bg-blue-100 text-blue-800'
                      : `${colors[el.type]} hover:opacity-80`
                  }`}
                >
                  {el.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Dialog de criacao de campo desenhado */}
      {pendingDrawnField && onAddField && (
        <NewFieldDialog
          rect={pendingDrawnField.rect}
          page={pendingDrawnField.page}
          existingFields={fields}
          onCancel={() => setPendingDrawnField(null)}
          onConfirm={(newField) => {
            // CAMPO NOVO: avisa o pai (push em extractedFields) + cria overlay
            onAddField(newField)
            const newOverlay: LayoutElement = {
              id: uid(),
              type: 'field',
              field_name: newField.field_name,
              label: newField.label,
              page: newField.page ?? 0,
              unit: 'pct',
              x: newField.x_percent ?? 30,
              y: newField.y_percent ?? 10,
              width: newField.width_percent ?? 25,
              height: newField.height_percent ?? 3,
              fontSize: 11,
              fontWeight: 'normal',
              textAlign: 'left',
            }
            updateElements([...elements, newOverlay])
            setSelectedId(newOverlay.id)
            setPendingDrawnField(null)
            setDrawMode(false)
          }}
          onConfirmRepeat={(existingFieldName) => {
            // CAMPO REPETIDO: nao duplica em extractedFields; so cria overlay.
            // O motor pdf-lib ao gerar desenha o mesmo valor em todas as posicoes.
            const existing = fields.find(f => f.field_name === existingFieldName)
            const rect = pendingDrawnField.rect
            const newOverlay: LayoutElement = {
              id: uid(),
              type: 'field',
              field_name: existingFieldName,
              label: existing?.label ?? existingFieldName,
              page: pendingDrawnField.page,
              unit: 'pct',
              x: rect.x_pct,
              y: rect.y_pct,
              width: rect.w_pct,
              height: rect.h_pct,
              fontSize: 11,
              fontWeight: 'normal',
              textAlign: 'left',
            }
            updateElements([...elements, newOverlay])
            setSelectedId(newOverlay.id)
            setPendingDrawnField(null)
            setDrawMode(false)
          }}
        />
      )}
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ── Export: Convert layout elements to HTML (legado, retrocompat) ───────────

export function layoutToHtml(elements: LayoutElement[]): string {
  // Legado puro: nao usado em modo Pixel Perfect (que salva em layout_overlays)
  const sorted = [...elements].filter(e => !isPct(e)).sort((a, b) => a.y - b.y)
  let html = '<div style="position:relative;width:100%;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;">\n'

  for (const el of sorted) {
    const style = [
      `position:absolute`,
      `left:${el.x}%`,
      `top:${el.y}px`,
      `width:${el.width}%`,
      `height:${el.height}px`,
      `font-size:${el.fontSize}px`,
      `font-weight:${el.fontWeight}`,
      `text-align:${el.textAlign}`,
      `display:flex`,
      `align-items:center`,
      el.textAlign === 'center' ? 'justify-content:center' : el.textAlign === 'right' ? 'justify-content:flex-end' : 'justify-content:flex-start',
      `box-sizing:border-box`,
      `padding:0 4px`,
    ].join(';')

    if (el.type === 'logo') {
      html += `  <div style="${style}">{{logo_clinica}}</div>\n`
    } else if (el.type === 'signature') {
      html += `  <div style="${style}">{{assinatura_digital}}</div>\n`
    } else if (el.type === 'field') {
      html += `  <div style="${style}"><span style="font-size:0.8em;font-weight:bold;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${el.label}</span>&nbsp;{{${el.field_name}}}</div>\n`
    } else if (el.type === 'text') {
      html += `  <div style="${style}">${el.content || el.label}</div>\n`
    }
  }
  const maxY = sorted.reduce((max, el) => Math.max(max, el.y + el.height), 0)
  html = html.replace('position:relative;', `position:relative;min-height:${maxY + 20}px;`)
  html += '</div>'
  return html
}

export function htmlToLayout(html: string, fields: ExtractedField[]): LayoutElement[] {
  if (!html.includes('position:absolute')) return buildDefaultElements(fields, false)
  const elements: LayoutElement[] = []
  const divRegex = /<div\s+style="([^"]*)">([\s\S]*?)<\/div>/g
  let match
  while ((match = divRegex.exec(html)) !== null) {
    const style = match[1]
    const content = match[2].trim()
    if (style.includes('position:relative')) continue
    const getStyleVal = (prop: string): string => {
      const m = style.match(new RegExp(`${prop}:\\s*([^;]+)`))
      return m ? m[1].trim() : ''
    }
    const el: LayoutElement = {
      id: uid(),
      type: 'text',
      label: '',
      x: parseFloat(getStyleVal('left')) || 0,
      y: parseFloat(getStyleVal('top')) || 0,
      width: parseFloat(getStyleVal('width')) || 50,
      height: parseFloat(getStyleVal('height')) || 25,
      fontSize: parseInt(getStyleVal('font-size')) || 11,
      fontWeight: getStyleVal('font-weight') === 'bold' ? 'bold' : 'normal',
      textAlign: (getStyleVal('text-align') || 'left') as any,
    }
    if (content.includes('{{logo_clinica}}')) {
      el.type = 'logo'; el.label = 'Logo da Clinica'
    } else if (content.includes('{{assinatura_digital}}')) {
      el.type = 'signature'; el.label = 'Assinatura Digital'
    } else if (content.includes('{{')) {
      el.type = 'field'
      const fieldMatch = content.match(/\{\{(\w+)\}\}/)
      if (fieldMatch) {
        el.field_name = fieldMatch[1]
        const f = fields.find(ff => ff.field_name === fieldMatch[1])
        el.label = f?.label || fieldMatch[1]
      }
    } else {
      el.type = 'text'
      el.content = content.replace(/<[^>]+>/g, '').trim()
      el.label = el.content.slice(0, 30) || 'Texto'
    }
    elements.push(el)
  }
  return elements.length > 0 ? elements : buildDefaultElements(fields, false)
}

/**
 * Converte LayoutElements para o formato canonico LayoutOverlay
 * (apenas elementos com unit='pct'). Usado para salvar em document_templates.layout_overlays.
 */
export function layoutElementsToOverlays(elements: LayoutElement[]) {
  return elements
    .filter(el => isPct(el))
    .map(el => ({
      id: el.id,
      type: el.type as 'field' | 'text' | 'logo' | 'signature',
      field_name: el.field_name,
      label: el.label,
      content: el.content,
      page: el.page ?? 0,
      x_pct: el.x,
      y_pct: el.y,
      w_pct: el.width,
      h_pct: el.height,
      font_size: el.fontSize,
      font_weight: el.fontWeight,
      font_family: 'Helvetica' as const,
      text_align: el.textAlign,
      // OCR Sniper: preserva whiteout_bbox, is_global, baseline_y_pct
      whiteout_bbox: el.whiteoutBbox,
      is_global: el.isGlobal,
      baseline_y_pct: el.baselineYPct,
    }))
}

/**
 * Hidrata LayoutElements a partir de LayoutOverlay armazenados.
 */
export function overlaysToLayoutElements(overlays: any[] | null | undefined): LayoutElement[] {
  if (!overlays || overlays.length === 0) return []
  return overlays.map(o => ({
    id: o.id || uid(),
    type: o.type,
    field_name: o.field_name,
    label: o.label,
    content: o.content,
    x: o.x_pct,
    y: o.y_pct,
    width: o.w_pct,
    height: o.h_pct,
    fontSize: o.font_size ?? 11,
    fontWeight: o.font_weight ?? 'normal',
    textAlign: o.text_align ?? 'left',
    page: o.page ?? 0,
    unit: 'pct',
    // OCR Sniper: preserva ao hidratar template salvo
    whiteoutBbox: o.whiteout_bbox,
    isGlobal: o.is_global,
    baselineYPct: o.baseline_y_pct,
  }))
}
