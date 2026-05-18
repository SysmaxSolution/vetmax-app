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
  DynamicTagElement, DynamicImageElement, RepeaterElement, BrushStrokeElement,
  TypographyStyle, BlockStyle,
} from '@/lib/canva/elements'
import {
  resolveTagValue, resolveImageTagUrl, findImageTag,
  type ResolveContext,
} from '@/lib/canva/dynamic-tags'

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
    case 'text':           return <TextRenderer          e={element} isPrint={isPrint} />
    case 'image':          return <ImageRenderer         e={element} isPrint={isPrint} />
    case 'line':           return <LineRenderer          e={element} />
    case 'dynamic_tag':    return <DynamicTagRenderer    e={element} ctx={ctx} isPrint={isPrint} />
    case 'dynamic_image':  return <DynamicImageRenderer  e={element} ctx={ctx} isPrint={isPrint} />
    case 'repeater':       return <RepeaterRenderer      e={element} ctx={ctx} isPrint={isPrint} />
    case 'brush_stroke':   return <BrushStrokeFallback   e={element} />
  }
}

/** Fallback quando um brush_stroke é renderizado fora do BrushLayer
 *  (ex: print no LaudoPrintable que recebe canvas_state mas não usa stage). */
function BrushStrokeFallback({ e }: { e: BrushStrokeElement }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <polyline
        points={e.points.map(p => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={e.strokeColor}
        strokeWidth={e.strokeWidth / 10}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={e.opacity ?? 1}
      />
    </svg>
  )
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

function DynamicImageRenderer({ e, ctx, isPrint }: { e: DynamicImageElement; ctx?: ResolveContext; isPrint?: boolean }) {
  const url = ctx ? resolveImageTagUrl(e.tagId, ctx) : null
  const def = findImageTag(e.tagId)
  const label = def?.label ?? e.tagId

  if (!url) {
    if (isPrint) {
      // Em impressão: mostra fallback de texto OU vazio (não desenha placeholder)
      if (!e.fallbackText) return <div style={{ width: '100%', height: '100%' }} />
      return (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '9pt', color: '#94a3b8',
        }}>{e.fallbackText}</div>
      )
    }
    // No editor: placeholder visual instrutivo
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(124,58,237,0.06)',
        border: '1px dashed rgba(124,58,237,0.5)', borderRadius: 6,
        color: '#7c3aed', fontSize: 10, padding: 4, textAlign: 'center',
      }}>
        <strong style={{ fontSize: 11 }}>{label}</strong>
        <span style={{ fontSize: 9, opacity: 0.7 }}>{`{{${e.tagId}}}`}</span>
        <span style={{ fontSize: 8, marginTop: 2, opacity: 0.6 }}>
          Cadastre em Gestão {'>'} {def?.group === 'clinica' ? 'Aparência/Clínica' : 'Usuários'}
        </span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={e.alt ?? label}
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

function RepeaterRenderer({ e, ctx, isPrint }: { e: RepeaterElement; ctx?: ResolveContext; isPrint?: boolean }) {
  const items = readRepeaterSource(e.source, ctx)
  const lines = items.slice(0, e.maxLines ?? items.length)

  // Mock para preview no editor (sem ctx real)
  const display = lines.length > 0 ? lines : (isPrint ? [] : MOCK_REPEATER[e.source])

  if (display.length === 0 && !isPrint) {
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

  // Agrupamento opcional por campo (route_of_administration, prescription_type)
  const groups = groupItems(display, e.groupBy)
  let runningIndex = 0

  return (
    <div
      style={{
        width: '100%', height: '100%',
        margin: 0, padding: 0,
        overflow: 'hidden',
        ...typographyToCss(e.typography),
        ...blockToCss(e.block),
      }}
    >
      {groups.map((group, gi) => (
        <section key={gi} style={{ marginBottom: gi < groups.length - 1 ? '0.25cm' : 0 }}>
          {e.groupBy && group.key && (
            <header
              style={{
                ...typographyToCss(e.groupHeaderTypography ?? { ...e.typography, fontWeight: 700 }),
                borderBottom: '1px solid currentColor',
                paddingBottom: 1,
                marginBottom: '0.1cm',
                opacity: 0.85,
                pageBreakAfter: 'avoid',
                breakAfter: 'avoid',
              }}
            >
              {formatGroupHeader(e.groupHeaderTemplate ?? '{{group}}', group.key, e.source)}
            </header>
          )}
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {group.items.map(item => {
              const i = runningIndex++
              const isHighlighted = e.highlightField
                ? Boolean(item[e.highlightField])
                : false
              return (
                <li
                  key={i}
                  style={{
                    display: 'flex', gap: 6, alignItems: 'baseline',
                    marginBottom: e.lineSpacing != null ? `${e.lineSpacing}pt` : undefined,
                    pageBreakInside: 'avoid', breakInside: 'avoid',
                    background: isHighlighted ? (e.highlightColor ?? '#dbeafe') : undefined,
                    borderRadius: isHighlighted ? 3 : undefined,
                    padding: isHighlighted ? '1pt 4pt' : undefined,
                  }}
                >
                  {e.groupAndEnumerate && (
                    <span style={{ fontWeight: 600, minWidth: '1.5em' }}>{i + 1}.</span>
                  )}
                  <span style={{ flex: 1 }}>
                    {isHighlighted && e.highlightBadge && (
                      <strong style={{ marginRight: 4, fontSize: '0.85em' }}>{e.highlightBadge}</strong>
                    )}
                    {applyItemTemplate(e.itemTemplate, item)}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}

function groupItems(
  items: Record<string, unknown>[],
  groupBy?: string,
): Array<{ key: string | null; items: Record<string, unknown>[] }> {
  if (!groupBy) return [{ key: null, items }]
  const map = new Map<string, Record<string, unknown>[]>()
  for (const item of items) {
    const raw = item[groupBy]
    const key = raw === null || raw === undefined || raw === ''
      ? '— sem categoria —'
      : String(raw)
    const existing = map.get(key)
    if (existing) existing.push(item)
    else map.set(key, [item])
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
}

function formatGroupHeader(template: string, value: string, source: RepeaterElement['source']): string {
  // Tradução de valores técnicos para PT-BR amigável
  const friendly = source === 'prescriptions' ? PRESCRIPTION_GROUP_LABEL[value.toLowerCase()] ?? value : value
  return template.replace(/\{\{\s*group\s*\}\}/gi, friendly)
}

const PRESCRIPTION_GROUP_LABEL: Record<string, string> = {
  // route_of_administration
  oral:            'Oral',
  topical:         'Tópico',
  topica:          'Tópico',
  topico:          'Tópico',
  intramuscular:   'Intramuscular (IM)',
  subcutaneous:    'Subcutâneo (SC)',
  intravenous:     'Endovenoso (EV)',
  intravenosa:     'Endovenoso (EV)',
  oftalmic:        'Oftálmico',
  otic:            'Otológico',
  // prescription_type
  common:          'Medicamentos Comuns',
  comum:           'Medicamentos Comuns',
  controlled:      'Medicamentos Controlados',
  controlado:      'Medicamentos Controlados',
  manipulated:     'Medicamentos Manipulados',
  manipulado:      'Medicamentos Manipulados',
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
    {
      medication: 'Dipirona 25mg/mL', dose: '1 mL',
      frequency: 'a cada 8h', duration_days: 5,
      route_of_administration: 'oral', prescription_type: 'common',
      is_controlled: false,
      orientation: 'Administrar com alimento.',
    },
    {
      medication: 'Drontal Plus', dose: '1 comp por 10 kg',
      frequency: 'dose única, repetir em 30 dias', duration_days: 1,
      route_of_administration: 'oral', prescription_type: 'common',
      is_controlled: false,
    },
    {
      medication: 'Tramadol 50mg', dose: '50 mg',
      frequency: 'a cada 12h', duration_days: 5,
      route_of_administration: 'oral', prescription_type: 'controlled',
      is_controlled: true,
      orientation: 'Receituário azul. Manter fora do alcance.',
    },
    {
      medication: 'Pomada Furacin', dose: 'Aplicar fina camada',
      frequency: '3× ao dia', duration_days: 7,
      route_of_administration: 'topical', prescription_type: 'common',
      is_controlled: false,
    },
    {
      medication: 'Cloridrato de Tramadol Manipulado', dose: '5 gotas',
      frequency: 'a cada 8h', duration_days: 3,
      route_of_administration: 'oral', prescription_type: 'manipulated',
      is_controlled: true,
    },
  ],
  exam_items: [
    { name: 'Hemograma completo', urgency: 'rotina' },
    { name: 'Ecocardiograma',     urgency: 'urgente' },
    { name: 'Bioquímica renal',   urgency: 'rotina' },
  ],
  vaccines: [
    { name: 'V10 (polivalente)', date: '15/04/2026', next: '15/04/2027' },
    { name: 'Antirrábica',       date: '15/04/2026', next: '15/04/2027' },
  ],
  dynamic_fields: [
    { name: 'Pressão Arterial: 120/80 mmHg' },
    { name: 'Glicemia: 95 mg/dL' },
  ],
}
