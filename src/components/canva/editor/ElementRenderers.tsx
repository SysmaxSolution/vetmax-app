'use client'

/**
 * Renderers puros (apresentacionais) para cada CanvasElement.
 * Sem state interno, sem callbacks de drag — apenas DOM final.
 *
 * Reutilizado: CanvasStage no editor + LaudoPrintable na impressão.
 */

import type { CSSProperties } from 'react'
import type {
  CanvasElement, TextElement, ImageElement, LineElement,
  DynamicTagElement, RepeaterElement, TypographyStyle, BlockStyle,
} from '@/lib/canva/elements'
import { resolveTagValue, type ResolveContext } from '@/lib/canva/dynamic-tags'

// ── Estilo helpers ───────────────────────────────────────────────────────────

export function typographyToCss(t?: TypographyStyle): CSSProperties {
  if (!t) return {}
  return {
    fontFamily: t.fontFamily,
    fontSize: t.fontSize != null ? `${t.fontSize}pt` : undefined,
    fontWeight: t.fontWeight,
    fontStyle: t.fontStyle,
    textDecoration: t.textDecoration,
    color: t.color,
    textAlign: t.align === 'justify' ? 'justify' : t.align,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing != null ? `${t.letterSpacing}px` : undefined,
  }
}

export function blockToCss(b?: BlockStyle): CSSProperties {
  if (!b) return {}
  return {
    backgroundColor: b.backgroundColor,
    border:
      b.borderWidth && b.borderColor
        ? `${b.borderWidth}px solid ${b.borderColor}`
        : undefined,
    borderRadius: b.borderRadius != null ? `${b.borderRadius}px` : undefined,
    padding:
      b.paddingY != null || b.paddingX != null
        ? `${b.paddingY ?? 0}px ${b.paddingX ?? 0}px`
        : undefined,
  }
}

export function vAlignToFlex(v?: TypographyStyle['vAlign']): CSSProperties {
  switch (v) {
    case 'middle': return { display: 'flex', alignItems: 'center' }
    case 'bottom': return { display: 'flex', alignItems: 'flex-end' }
    case 'top':
    default:       return {}
  }
}

// ── Renderers por kind ───────────────────────────────────────────────────────

interface RenderProps {
  element: CanvasElement
  ctx?: ResolveContext
  isPrint?: boolean
}

export function ElementRenderer({ element, ctx, isPrint }: RenderProps) {
  switch (element.kind) {
    case 'text':         return <TextRenderer        e={element} isPrint={isPrint} />
    case 'image':        return <ImageRenderer       e={element} isPrint={isPrint} />
    case 'line':         return <LineRenderer        e={element} />
    case 'dynamic_tag':  return <DynamicTagRenderer  e={element} ctx={ctx} isPrint={isPrint} />
    case 'repeater':     return <RepeaterRenderer    e={element} ctx={ctx} isPrint={isPrint} />
  }
}

function TextRenderer({ e, isPrint }: { e: TextElement; isPrint?: boolean }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        ...typographyToCss(e.typography),
        ...blockToCss(e.block),
        ...vAlignToFlex(e.typography.vAlign),
      }}
    >
      <span style={{ width: '100%' }}>{e.content || (isPrint ? '' : 'Texto livre')}</span>
    </div>
  )
}

function ImageRenderer({ e }: { e: ImageElement; isPrint?: boolean }) {
  if (!e.url) {
    return (
      <div
        style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(148,163,184,0.15)',
          border: '1px dashed #94a3b8', borderRadius: 6, color: '#64748b', fontSize: 11,
        }}
      >Sem imagem</div>
    )
  }
  return (
    <img
      src={e.url}
      alt={e.alt ?? ''}
      draggable={false}
      style={{
        width: '100%', height: '100%',
        objectFit: e.objectFit ?? 'contain',
        userSelect: 'none', pointerEvents: 'none',
        ...blockToCss(e.block),
      }}
    />
  )
}

function LineRenderer({ e }: { e: LineElement }) {
  const horizontal = e.orientation === 'horizontal'
  const stroke = e.dashed ? `${e.thickness}px dashed ${e.color}` : `${e.thickness}px solid ${e.color}`
  return (
    <div
      style={{
        width: '100%', height: '100%',
        borderTop:  horizontal ? stroke : undefined,
        borderLeft: horizontal ? undefined : stroke,
      }}
    />
  )
}

function DynamicTagRenderer({ e, ctx, isPrint }: { e: DynamicTagElement; ctx?: ResolveContext; isPrint?: boolean }) {
  const resolved = ctx ? resolveTagValue(e.tagId, ctx) : ''
  const display = resolved || e.fallback || (isPrint ? '' : `{{${e.tagId}}}`)
  const text = `${e.prefix ?? ''}${display}${e.suffix ?? ''}`

  const isUnresolved = !resolved && !isPrint
  return (
    <div
      style={{
        width: '100%', height: '100%',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap', wordWrap: 'break-word',
        outline: isUnresolved ? '1px dashed rgba(124,58,237,0.5)' : undefined,
        outlineOffset: 0,
        ...typographyToCss(e.typography),
        ...blockToCss(e.block),
        ...vAlignToFlex(e.typography.vAlign),
      }}
    >
      <span style={{
        width: '100%',
        background: isUnresolved ? 'rgba(124,58,237,0.06)' : undefined,
        color: isUnresolved ? '#7c3aed' : undefined,
      }}>{text}</span>
    </div>
  )
}

function RepeaterRenderer({ e, ctx, isPrint }: { e: RepeaterElement; ctx?: ResolveContext; isPrint?: boolean }) {
  const items = readRepeaterSource(e.source, ctx)
  const lines = items.slice(0, e.maxLines ?? items.length)

  if (lines.length === 0 && !isPrint) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        outline: '1px dashed rgba(16,185,129,0.5)',
        background: 'rgba(16,185,129,0.05)',
        color: '#059669', fontSize: 11,
        borderRadius: 4,
      }}>
        Lista vazia — {labelForSource(e.source)} (preview)
      </div>
    )
  }

  // Mock para preview no editor (sem ctx real): mostra 2 linhas exemplo
  const display = lines.length > 0 ? lines : (isPrint ? [] : MOCK_REPEATER[e.source])

  return (
    <ol
      style={{
        width: '100%', height: '100%',
        listStyle: 'none', margin: 0, padding: 0,
        overflow: 'hidden',
        ...typographyToCss(e.typography),
        ...blockToCss(e.block),
      }}
    >
      {display.map((item, i) => (
        <li
          key={i}
          style={{
            display: 'flex', gap: 6, alignItems: 'baseline',
            marginBottom: e.lineSpacing != null ? `${e.lineSpacing}pt` : undefined,
            pageBreakInside: 'avoid', breakInside: 'avoid',
          }}
        >
          {e.groupAndEnumerate && (
            <span style={{ fontWeight: 600, minWidth: '1.5em' }}>{i + 1}.</span>
          )}
          <span style={{ flex: 1 }}>
            {applyItemTemplate(e.itemTemplate, item)}
          </span>
        </li>
      ))}
    </ol>
  )
}

// ── Repeater data helpers ────────────────────────────────────────────────────

function readRepeaterSource(source: RepeaterElement['source'], ctx?: ResolveContext): Record<string, unknown>[] {
  if (!ctx) return []
  const consultation = ctx.consultation as Record<string, unknown> | undefined
  if (!consultation) return []
  const list = consultation[source]
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : []
}

function applyItemTemplate(template: string, item: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = item[key]
    return v === null || v === undefined ? '' : String(v)
  })
}

function labelForSource(source: RepeaterElement['source']): string {
  switch (source) {
    case 'prescriptions':  return 'Prescrições'
    case 'exam_items':     return 'Itens de Exame'
    case 'vaccines':       return 'Vacinas'
    case 'dynamic_fields': return 'Campos Dinâmicos'
  }
}

const MOCK_REPEATER: Record<RepeaterElement['source'], Record<string, unknown>[]> = {
  prescriptions: [
    { name: 'Dipirona 25mg/mL', posology: '1mL a cada 8h por 5 dias', quantity: '1 frasco' },
    { name: 'Drontal Plus',     posology: '1 comp por 10kg, dose única', quantity: '1 comprimido' },
  ],
  exam_items: [
    { name: 'Hemograma completo' },
    { name: 'Ecocardiograma' },
  ],
  vaccines: [
    { name: 'V10 (polivalente)' },
    { name: 'Antirrábica' },
  ],
  dynamic_fields: [
    { name: 'Pressão Arterial: 120/80 mmHg' },
    { name: 'Glicemia: 95 mg/dL' },
  ],
}
