'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Move, Image, PenTool, Type, Trash2, GripVertical,
  Maximize2, Minimize2, RotateCcw, Plus,
} from 'lucide-react'
import type { ExtractedField } from '@/types'

// ── Types ───────────────────────────────────────────────────────────────────

export type LayoutElement = {
  id: string
  type: 'field' | 'text' | 'logo' | 'signature'
  field_name?: string    // for type='field'
  label: string
  content?: string       // for type='text'
  x: number              // % from left
  y: number              // px from top
  width: number          // % width
  height: number         // px height
  fontSize: number       // px
  fontWeight: 'normal' | 'bold'
  textAlign: 'left' | 'center' | 'right'
}

interface TemplateLayoutEditorProps {
  elements: LayoutElement[]
  onChange: (elements: LayoutElement[]) => void
  fields: ExtractedField[]
  watermark?: string
  watermarkOpacity?: number
  clinicLogoUrl?: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

let idCounter = 0
const uid = () => `el_${Date.now()}_${++idCounter}`

function buildDefaultElements(fields: ExtractedField[]): LayoutElement[] {
  const els: LayoutElement[] = []
  let y = 20

  // Logo placeholder
  els.push({
    id: uid(), type: 'logo', label: 'Logo da Clinica',
    x: 35, y, width: 30, height: 60,
    fontSize: 12, fontWeight: 'bold', textAlign: 'center',
  })
  y += 70

  // Title text
  els.push({
    id: uid(), type: 'text', label: 'Titulo',
    content: 'DOCUMENTO VETERINARIO', x: 10, y, width: 80, height: 30,
    fontSize: 18, fontWeight: 'bold', textAlign: 'center',
  })
  y += 40

  // Separator
  els.push({
    id: uid(), type: 'text', label: 'Separador',
    content: '─'.repeat(60), x: 5, y, width: 90, height: 15,
    fontSize: 10, fontWeight: 'normal', textAlign: 'center',
  })
  y += 25

  // Fields
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

  // Signature placeholder
  els.push({
    id: uid(), type: 'signature', label: 'Assinatura Digital',
    x: 25, y, width: 50, height: 50,
    fontSize: 10, fontWeight: 'normal', textAlign: 'center',
  })

  return els
}

// ── Draggable Element ───────────────────────────────────────────────────────

function DraggableElement({
  element,
  isSelected,
  onSelect,
  onDragStart,
  onResizeStart,
  clinicLogoUrl,
}: {
  element: LayoutElement
  isSelected: boolean
  onSelect: () => void
  onDragStart: (e: React.MouseEvent) => void
  onResizeStart: (e: React.MouseEvent) => void
  clinicLogoUrl?: string | null
}) {
  const borderColor = isSelected ? '#3b82f6' : 'transparent'
  const bgMap = {
    field: '#eff6ff',
    text: '#f8fafc',
    logo: '#fef3c7',
    signature: '#f0fdf4',
  }

  return (
    <div
      className="absolute group"
      style={{
        left: `${element.x}%`,
        top: `${element.y}px`,
        width: `${element.width}%`,
        height: `${element.height}px`,
        border: `2px ${isSelected ? 'solid' : 'dashed'} ${isSelected ? '#3b82f6' : '#cbd5e1'}`,
        borderRadius: '4px',
        background: bgMap[element.type] || '#fff',
        cursor: 'move',
        zIndex: isSelected ? 20 : 10,
        transition: 'border-color 0.15s',
        userSelect: 'none',
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        onSelect()
        onDragStart(e)
      }}
    >
      {/* Drag handle */}
      <div className="absolute -top-0.5 -left-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded px-1 py-0.5 shadow-sm -translate-y-full">
          <Move className="w-3 h-3 text-slate-400" />
          <span className="text-[9px] text-slate-500 font-medium">{element.label}</span>
        </div>
      </div>

      {/* Content */}
      <div
        className="w-full h-full flex items-center overflow-hidden px-2"
        style={{
          fontSize: `${element.fontSize}px`,
          fontWeight: element.fontWeight,
          textAlign: element.textAlign,
          justifyContent: element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start',
        }}
      >
        {element.type === 'logo' && (
          clinicLogoUrl ? (
            <img src={clinicLogoUrl} alt="Logo" className="max-h-full max-w-full object-contain mx-auto" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-amber-300 rounded bg-amber-50/50">
              <Image className="w-5 h-5 text-amber-400 mb-1" />
              <span className="text-[9px] text-amber-600 font-medium">Logo da Clinica</span>
            </div>
          )
        )}

        {element.type === 'signature' && (
          <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-green-300 rounded bg-green-50/50">
            <PenTool className="w-5 h-5 text-green-400 mb-1" />
            <span className="text-[9px] text-green-600 font-medium">Assinatura Digital</span>
            <span className="text-[8px] text-green-500">MV Responsavel</span>
          </div>
        )}

        {element.type === 'field' && (
          <div className="w-full">
            <span className="text-[9px] font-semibold text-blue-600 uppercase tracking-wide">{element.label}</span>
            <div className="mt-0.5 border-b border-dashed border-blue-300 text-blue-400 text-[10px]">
              {`{{${element.field_name}}}`}
            </div>
          </div>
        )}

        {element.type === 'text' && (
          <span className="text-slate-700 leading-tight">{element.content || element.label}</span>
        )}
      </div>

      {/* Resize handle */}
      {isSelected && (
        <div
          className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border border-white rounded-sm cursor-se-resize shadow"
          onMouseDown={(e) => {
            e.stopPropagation()
            onResizeStart(e)
          }}
        />
      )}
    </div>
  )
}

// ── Properties Panel ────────────────────────────────────────────────────────

function PropertiesPanel({
  element,
  onChange,
  onDelete,
}: {
  element: LayoutElement
  onChange: (updates: Partial<LayoutElement>) => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Propriedades</span>
        <button onClick={onDelete} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded" title="Remover">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

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
          <label className="text-[10px] font-medium text-slate-500">Largura (%)</label>
          <input type="number" min={5} max={100} value={Math.round(element.width)}
            onChange={e => onChange({ width: Number(e.target.value) })}
            className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-slate-500">Altura (px)</label>
          <input type="number" min={15} max={300} value={Math.round(element.height)}
            onChange={e => onChange({ height: Number(e.target.value) })}
            className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-slate-500">Fonte (px)</label>
          <input type="number" min={8} max={36} value={element.fontSize}
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

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-slate-500">X (%)</label>
          <input type="number" min={0} max={95} value={Math.round(element.x)}
            onChange={e => onChange({ x: Number(e.target.value) })}
            className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-slate-500">Y (px)</label>
          <input type="number" min={0} value={Math.round(element.y)}
            onChange={e => onChange({ y: Number(e.target.value) })}
            className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      </div>
    </div>
  )
}

// ── Main Editor ─────────────────────────────────────────────────────────────

export default function TemplateLayoutEditor({
  elements: initialElements,
  onChange,
  fields,
  watermark = '',
  watermarkOpacity = 15,
  clinicLogoUrl,
}: TemplateLayoutEditorProps) {
  const [elements, setElements] = useState<LayoutElement[]>(
    initialElements.length > 0 ? initialElements : buildDefaultElements(fields)
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<{
    id: string; startX: number; startY: number; elX: number; elY: number
  } | null>(null)
  const [resizeState, setResizeState] = useState<{
    id: string; startX: number; startY: number; elW: number; elH: number
  } | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)

  const selected = elements.find(e => e.id === selectedId) || null

  // Sync up to parent
  const updateElements = useCallback((newEls: LayoutElement[]) => {
    setElements(newEls)
    onChange(newEls)
  }, [onChange])

  // ── Drag handling ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!dragState) return
    const handleMove = (e: MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const canvasW = rect.width

      const dx = e.clientX - dragState.startX
      const dy = e.clientY - dragState.startY

      const newX = Math.max(0, Math.min(95, dragState.elX + (dx / canvasW) * 100))
      const newY = Math.max(0, dragState.elY + dy)

      setElements(prev => prev.map(el =>
        el.id === dragState.id ? { ...el, x: newX, y: newY } : el
      ))
    }
    const handleUp = () => {
      setDragState(null)
      // Sync to parent
      setElements(prev => { onChange(prev); return prev })
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [dragState, onChange])

  // ── Resize handling ───────────────────────────────────────────────────

  useEffect(() => {
    if (!resizeState) return
    const handleMove = (e: MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()

      const dx = e.clientX - resizeState.startX
      const dy = e.clientY - resizeState.startY

      const newW = Math.max(10, Math.min(100, resizeState.elW + (dx / rect.width) * 100))
      const newH = Math.max(15, resizeState.elH + dy)

      setElements(prev => prev.map(el =>
        el.id === resizeState.id ? { ...el, width: newW, height: newH } : el
      ))
    }
    const handleUp = () => {
      setResizeState(null)
      setElements(prev => { onChange(prev); return prev })
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [resizeState, onChange])

  // ── Add elements ──────────────────────────────────────────────────────

  const addElement = (type: LayoutElement['type']) => {
    const maxY = elements.reduce((max, el) => Math.max(max, el.y + el.height), 0)
    const newEl: LayoutElement = {
      id: uid(),
      type,
      label: type === 'logo' ? 'Logo da Clinica'
        : type === 'signature' ? 'Assinatura Digital'
        : type === 'text' ? 'Novo Texto'
        : 'Campo',
      x: type === 'logo' || type === 'signature' ? 25 : 5,
      y: maxY + 15,
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
    const updated = elements.map(e => e.id === id ? { ...e, ...updates } : e)
    updateElements(updated)
  }

  const resetLayout = () => {
    const newEls = buildDefaultElements(fields)
    updateElements(newEls)
    setSelectedId(null)
  }

  // ── Canvas height ─────────────────────────────────────────────────────
  const canvasHeight = Math.max(600, elements.reduce((max, el) => Math.max(max, el.y + el.height + 40), 0))

  return (
    <div className="flex gap-3 h-full">
      {/* ── Canvas ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <button onClick={() => addElement('logo')}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
            <Image className="w-3.5 h-3.5" />Logo
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
          <div className="flex-1" />
          <button onClick={resetLayout}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="Resetar layout">
            <RotateCcw className="w-3.5 h-3.5" />Resetar
          </button>
        </div>

        {/* Canvas area */}
        <div className="flex-1 bg-slate-100 rounded-lg overflow-auto border border-slate-200">
          <div className="flex justify-center py-4">
            <div
              ref={canvasRef}
              className="relative bg-white shadow-lg"
              style={{
                width: '210mm',
                maxWidth: '100%',
                minHeight: `${canvasHeight}px`,
                aspectRatio: 'auto',
              }}
              onClick={() => setSelectedId(null)}
            >
              {/* Watermark */}
              {watermark && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden z-0"
                  style={{ opacity: watermarkOpacity / 100 }}>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-300 font-bold whitespace-nowrap select-none"
                    style={{ fontSize: '3rem', transform: 'translate(-50%, -50%) rotate(-35deg)', letterSpacing: '0.15em' }}>
                    {watermark}
                  </div>
                </div>
              )}

              {/* Page margin guides */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ border: '1px dashed #e2e8f0', margin: '10mm' }} />

              {/* Elements */}
              {elements.map(el => (
                <DraggableElement
                  key={el.id}
                  element={el}
                  isSelected={selectedId === el.id}
                  onSelect={() => setSelectedId(el.id)}
                  onDragStart={(e) => {
                    setDragState({
                      id: el.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      elX: el.x,
                      elY: el.y,
                    })
                  }}
                  onResizeStart={(e) => {
                    setResizeState({
                      id: el.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      elW: el.width,
                      elH: el.height,
                    })
                  }}
                  clinicLogoUrl={clinicLogoUrl}
                />
              ))}
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
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Elementos ({elements.length})</p>
          <div className="space-y-1">
            {elements.map(el => {
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
    </div>
  )
}

// ── Export: Convert layout elements to HTML ──────────────────────────────────

export function layoutToHtml(elements: LayoutElement[]): string {
  const sorted = [...elements].sort((a, b) => a.y - b.y)
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

  // Set container height based on lowest element
  const maxY = sorted.reduce((max, el) => Math.max(max, el.y + el.height), 0)
  html = html.replace('position:relative;', `position:relative;min-height:${maxY + 20}px;`)

  html += '</div>'
  return html
}

// ── Export: Parse HTML back to layout elements ──────────────────────────────

export function htmlToLayout(html: string, fields: ExtractedField[]): LayoutElement[] {
  // If HTML doesn't have absolute positioning, fall back to defaults
  if (!html.includes('position:absolute')) {
    return buildDefaultElements(fields)
  }

  const elements: LayoutElement[] = []
  const divRegex = /<div\s+style="([^"]*)">([\s\S]*?)<\/div>/g
  let match

  while ((match = divRegex.exec(html)) !== null) {
    const style = match[1]
    const content = match[2].trim()

    // Skip the container div
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
      el.type = 'logo'
      el.label = 'Logo da Clinica'
    } else if (content.includes('{{assinatura_digital}}')) {
      el.type = 'signature'
      el.label = 'Assinatura Digital'
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

  return elements.length > 0 ? elements : buildDefaultElements(fields)
}
