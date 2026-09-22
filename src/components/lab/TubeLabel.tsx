'use client'

// Etiqueta do tubo de coleta: código de barras (Code128) + dados. Imprimível em
// qualquer impressora (via navegador). Adaptação a ZPL/térmica quando definirem.

import { encodeCode128B } from '@/lib/lab/code128'

export interface TubeLabelData {
  sample_code:  string   // conteúdo do código de barras (nº da OS/amostra)
  patient_name: string
  tutor_name?:  string | null
  species?:     string | null
  clinic_name?: string | null
  collected_at?: string | null
  exams?:       string[]
}

function Barcode({ value, unit = 1.6, height = 44 }: { value: string; unit?: number; height?: number }) {
  const enc = encodeCode128B(value)
  if ('error' in enc) return <text className="fill-red-600" fontSize={9}>{enc.error}</text>
  const quiet = 10
  const total = enc.modules + quiet * 2
  let x = quiet
  const bars: { x: number; w: number }[] = []
  enc.widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w })   // índice par = barra
    x += w
  })
  return (
    <svg width={total * unit} height={height + 14} viewBox={`0 0 ${total * unit} ${height + 14}`} shapeRendering="crispEdges">
      <rect x={0} y={0} width={total * unit} height={height + 14} fill="#fff" />
      {bars.map((b, i) => <rect key={i} x={b.x * unit} y={0} width={b.w * unit} height={height} fill="#000" />)}
      <text x={total * unit / 2} y={height + 11} textAnchor="middle" fontSize={10} fontFamily="monospace" fill="#000">{value}</text>
    </svg>
  )
}

export function TubeLabel({ data }: { data: TubeLabelData }) {
  return (
    <div className="tube-label" style={{ width: 300, border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569' }}>
        <span>{data.clinic_name ?? 'Laboratório'}</span>
        <span>{data.collected_at ?? ''}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1, marginTop: 2 }}>{data.patient_name}{data.species ? ` · ${data.species}` : ''}</div>
      {data.tutor_name && <div style={{ fontSize: 11, color: '#475569' }}>Tutor: {data.tutor_name}</div>}
      <div style={{ marginTop: 4 }}><Barcode value={data.sample_code} /></div>
      {data.exams && data.exams.length > 0 && (
        <div style={{ fontSize: 9, color: '#334155', marginTop: 2 }}>{data.exams.join(' · ')}</div>
      )}
    </div>
  )
}

/** Abre uma janela de impressão só com a(s) etiqueta(s). */
export function printLabels(labels: TubeLabelData[]) {
  const win = window.open('', '_blank', 'width=420,height=640')
  if (!win) return
  const barcodeSvg = (value: string) => {
    const enc = encodeCode128B(value)
    if ('error' in enc) return `<span style="color:red">${enc.error}</span>`
    const unit = 1.6, height = 44, quiet = 10
    const total = enc.modules + quiet * 2
    let x = quiet
    const rects: string[] = []
    enc.widths.forEach((w, i) => { if (i % 2 === 0) rects.push(`<rect x="${x * unit}" y="0" width="${w * unit}" height="${height}" fill="#000"/>`); x += w })
    return `<svg width="${total * unit}" height="${height + 14}" shape-rendering="crispEdges"><rect width="${total * unit}" height="${height + 14}" fill="#fff"/>${rects.join('')}<text x="${total * unit / 2}" y="${height + 11}" text-anchor="middle" font-size="10" font-family="monospace">${value}</text></svg>`
  }
  const body = labels.map(d => `
    <div class="lbl">
      <div class="hd"><span>${d.clinic_name ?? 'Laboratório'}</span><span>${d.collected_at ?? ''}</span></div>
      <div class="pt">${d.patient_name}${d.species ? ' · ' + d.species : ''}</div>
      ${d.tutor_name ? `<div class="tt">Tutor: ${d.tutor_name}</div>` : ''}
      <div class="bc">${barcodeSvg(d.sample_code)}</div>
      ${d.exams && d.exams.length ? `<div class="ex">${d.exams.join(' · ')}</div>` : ''}
    </div>`).join('')
  win.document.write(`<!doctype html><html><head><title>Etiquetas</title><style>
    @page { margin: 6mm; }
    body { font-family: Arial, sans-serif; margin: 0; }
    .lbl { width: 62mm; border: 1px solid #ccc; border-radius: 6px; padding: 6px 8px; margin: 4px; page-break-inside: avoid; display: inline-block; vertical-align: top; }
    .hd { display: flex; justify-content: space-between; font-size: 9px; color: #555; }
    .pt { font-size: 14px; font-weight: 700; }
    .tt { font-size: 10px; color: #555; }
    .ex { font-size: 8px; color: #333; }
    .bc { margin-top: 3px; }
  </style></head><body>${body}<script>window.onload=function(){window.print();}</script></body></html>`)
  win.document.close()
}
