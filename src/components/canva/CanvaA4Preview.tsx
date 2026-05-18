'use client'

/**
 * CanvaA4Preview — folha A4 vertical com papel timbrado de fundo e bloco
 * de dados do pet sobreposto. Reutilizado tanto no editor (preview reativo)
 * quanto na impressão (LaudoPrintable).
 *
 * Apresentação pura: não busca dados, não escreve, não navega. O parent
 * controla todo o estado (margens em cm, block_style, conteúdo dinâmico).
 */

import type { ReactNode } from 'react'
import type { CanvaBlockStyle, CanvaContentJson, CanvaMargins } from '@/lib/canva/types'

export type CanvaA4Mode = 'preview' | 'print'

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

interface CanvaA4PreviewProps {
  backgroundUrl: string | null
  margins: CanvaMargins
  blockStyle: CanvaBlockStyle
  patient?: PatientHeader
  content: CanvaContentJson
  documentTitle?: string
  mode?: CanvaA4Mode
  /** Quando >0, renderiza N folhas duplicando o background (page-break-after). */
  pages?: number
  /** Override de zoom do A4 quando em preview (default 1). Print ignora. */
  zoom?: number
  footer?: ReactNode
}

/** A4 em centímetros (norma ISO 216). */
const A4_W_CM = 21.0
const A4_H_CM = 29.7

/**
 * Em preview o A4 é renderizado em qualquer container responsivo via
 * aspect-ratio CSS. Em print, usamos cm reais — `@page` cuida do tamanho.
 */
export default function CanvaA4Preview({
  backgroundUrl,
  margins,
  blockStyle,
  patient,
  content,
  documentTitle,
  mode = 'preview',
  pages = 1,
  zoom = 1,
  footer,
}: CanvaA4PreviewProps) {
  const isPrint = mode === 'print'

  const pageStyle: React.CSSProperties = isPrint
    ? {
        width: `${A4_W_CM}cm`,
        height: `${A4_H_CM}cm`,
        position: 'relative',
        overflow: 'hidden',
        background: '#fff',
        breakAfter: 'page',
        pageBreakAfter: 'always',
      }
    : {
        width: '100%',
        aspectRatio: `${A4_W_CM} / ${A4_H_CM}`,
        position: 'relative',
        overflow: 'hidden',
        background: '#fff',
        borderRadius: 6,
        boxShadow: '0 4px 24px rgba(15,23,42,.08)',
        transform: zoom !== 1 ? `scale(${zoom})` : undefined,
        transformOrigin: 'top left',
      }

  const renderOnePage = (key: number) => (
    <article
      key={key}
      className="canva-a4-page"
      data-canva-page={key + 1}
      style={pageStyle}
    >
      {backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          aria-hidden
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        className="canva-a4-content"
        style={{
          position: 'absolute',
          top: `${margins.top}cm`,
          bottom: `${margins.bottom}cm`,
          left: `${margins.left}cm`,
          right: `${margins.right}cm`,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6cm',
          fontFamily: 'Inter, -apple-system, "Segoe UI", system-ui, sans-serif',
          color: '#0f172a',
          fontSize: isPrint ? '10pt' : '0.7rem',
          lineHeight: 1.45,
        }}
      >
        {key === 0 && documentTitle && (
          <h1
            style={{
              fontSize: isPrint ? '14pt' : '0.95rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              marginBottom: '0.1cm',
            }}
          >
            {documentTitle}
          </h1>
        )}

        {key === 0 && (
          <PatientBlock patient={patient} content={content} blockStyle={blockStyle} isPrint={isPrint} />
        )}

        {/* Body — primeiro static_fields conhecidos, depois extras */}
        {key === 0 && (
          <BodyBlock content={content} isPrint={isPrint} />
        )}

        {footer && key === pages - 1 && (
          <div style={{ marginTop: 'auto' }}>{footer}</div>
        )}
      </div>
    </article>
  )

  return (
    <div className="canva-a4-stack" style={{ display: 'flex', flexDirection: 'column', gap: isPrint ? 0 : 16 }}>
      {Array.from({ length: Math.max(1, pages) }).map((_, i) => renderOnePage(i))}
    </div>
  )
}

// ── Sub-blocks ───────────────────────────────────────────────────────────────

function PatientBlock({
  patient, content, blockStyle, isPrint,
}: {
  patient?: PatientHeader
  content: CanvaContentJson
  blockStyle: CanvaBlockStyle
  isPrint: boolean
}) {
  const p = patient ?? {}
  const isSolid = blockStyle === 'solid'

  const rows: Array<[string, string | undefined]> = [
    ['Pet',     p.patient_name],
    ['Tutor',   p.tutor_name],
    ['Espécie', p.species],
    ['Raça',    p.breed],
    ['Idade',   p.age],
    ['Sexo',    p.sex],
    ['Peso',    p.weight],
    ['Data',    p.date],
  ]

  // Campos dinâmicos do veterinário injetados aqui dentro do bloco
  for (const f of content.dynamic_fields) {
    if (f.key.trim() && f.value.trim()) rows.push([f.key.trim(), f.value])
  }

  return (
    <section
      className="canva-patient-block"
      style={{
        background: isSolid ? 'rgba(241,245,249,0.92)' : 'transparent',
        borderRadius: isSolid ? 10 : 0,
        padding: isSolid ? '0.45cm 0.6cm' : 0,
        backdropFilter: isSolid && !isPrint ? 'blur(2px)' : undefined,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        rowGap: '0.12cm',
        columnGap: '0.5cm',
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
      }}
    >
      {rows.filter(([, v]) => !!v).map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{label}:</span>
          <span style={{ color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        </div>
      ))}
    </section>
  )
}

function BodyBlock({
  content, isPrint,
}: {
  content: CanvaContentJson
  isPrint: boolean
}) {
  const med = (content.static_fields.medicamentos ?? '').trim()
  const pos = (content.static_fields.posologia ?? '').trim()
  const obs = (content.static_fields.observacoes ?? '').trim()

  if (!med && !pos && !obs) return null

  const section = (label: string, body: string) => (
    <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
      <h2
        style={{
          fontSize: isPrint ? '11pt' : '0.78rem',
          fontWeight: 700,
          color: '#1e293b',
          marginBottom: '0.12cm',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </h2>
      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{body}</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35cm', marginTop: '0.2cm' }}>
      {med && section('Medicamentos', med)}
      {pos && section('Posologia', pos)}
      {obs && section('Observações', obs)}
    </div>
  )
}
