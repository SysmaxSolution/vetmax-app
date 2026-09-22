'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, Download, RotateCcw, Contrast, Move } from 'lucide-react'

// Visualizador DICOM leve — decodifica com dicom-parser (JS puro, sem WASM/fs) e
// desenha num canvas com janela/nível, zoom e pan. Cobre DICOM NÃO comprimido
// (Implicit/Explicit VR Little Endian), o formato usual de raio-X/TC exportados.
// DICOM comprimido (JPEG/JPEG2000) → fallback de download (abrir na estação).

const UNCOMPRESSED = new Set(['1.2.840.10008.1.2', '1.2.840.10008.1.2.1', '1.2.840.10008.1.2.2'])

interface Frame {
  width: number; height: number
  pixels: Int16Array | Uint16Array | Uint8Array
  rgb: boolean
  slope: number; intercept: number
  invert: boolean            // MONOCHROME1
  defaultWc: number; defaultWw: number
}

export default function DicomViewer({ url, fileName }: { url: string; fileName?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<Frame | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [wc, setWc] = useState(0)
  const [ww, setWw] = useState(1)
  const view = useRef({ scale: 1, tx: 0, ty: 0 })
  const [mode, setMode] = useState<'wl' | 'pan'>('wl')
  const drag = useRef<{ x: number; y: number; wc: number; ww: number; tx: number; ty: number } | null>(null)

  // ── decodifica ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const dicomParser = (await import('dicom-parser')).default
        const buf = await (await fetch(url)).arrayBuffer()
        if (cancelled) return
        const byteArray = new Uint8Array(buf)
        const ds = dicomParser.parseDicom(byteArray)
        const ts = ds.string('x00020010') || '1.2.840.10008.1.2'
        const pdEl: any = ds.elements.x7fe00010
        if (!UNCOMPRESSED.has(ts) || !pdEl || pdEl.encapsulatedPixelData) throw new Error('compressed')

        const width = ds.uint16('x00280011')!, height = ds.uint16('x00280010')!
        const spp = ds.uint16('x00280002') || 1
        const bits = ds.uint16('x00280100') || 16
        const signed = (ds.uint16('x00280103') || 0) === 1
        const photometric = (ds.string('x00280004') || 'MONOCHROME2').toUpperCase()
        const slope = parseFloat(ds.floatString('x00281053') as any) || 1
        const intercept = parseFloat(ds.floatString('x00281052') as any) || 0

        const raw = byteArray.slice(pdEl.dataOffset, pdEl.dataOffset + pdEl.length)
        const rgb = spp === 3
        let pixels: Int16Array | Uint16Array | Uint8Array
        if (rgb || bits === 8) pixels = new Uint8Array(raw.buffer, raw.byteOffset, raw.length)
        else pixels = signed ? new Int16Array(raw.buffer) : new Uint16Array(raw.buffer)

        // janela padrão: tags ou min/max
        let dWc = parseFloat((ds.floatString('x00281050') as any))
        let dWw = parseFloat((ds.floatString('x00281051') as any))
        if (!Number.isFinite(dWc) || !Number.isFinite(dWw) || dWw <= 0) {
          let mn = Infinity, mx = -Infinity
          if (!rgb) for (let i = 0; i < pixels.length; i++) { const v = (pixels[i] as number) * slope + intercept; if (v < mn) mn = v; if (v > mx) mx = v }
          else { mn = 0; mx = 255 }
          dWw = Math.max(1, mx - mn); dWc = (mx + mn) / 2
        }
        frameRef.current = { width, height, pixels, rgb, slope, intercept, invert: photometric === 'MONOCHROME1', defaultWc: dWc, defaultWw: dWw }
        if (cancelled) return
        setWc(dWc); setWw(dWw); setState('ready')
      } catch (e) {
        if (!cancelled) setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [url])

  // ── render ────────────────────────────────────────────────────────────────
  const render = useCallback((wcv: number, wwv: number) => {
    const f = frameRef.current, cv = canvasRef.current
    if (!f || !cv) return
    cv.width = f.width; cv.height = f.height
    const ctx = cv.getContext('2d'); if (!ctx) return
    const img = ctx.createImageData(f.width, f.height)
    const out = img.data
    const lower = wcv - wwv / 2, range = wwv
    if (f.rgb) {
      const p = f.pixels as Uint8Array
      for (let i = 0, j = 0; i < f.width * f.height; i++, j += 4) {
        out[j] = p[i * 3]; out[j + 1] = p[i * 3 + 1]; out[j + 2] = p[i * 3 + 2]; out[j + 3] = 255
      }
    } else {
      const p = f.pixels
      for (let i = 0, j = 0; i < p.length; i++, j += 4) {
        const hu = (p[i] as number) * f.slope + f.intercept
        let g = ((hu - lower) / range) * 255
        g = g < 0 ? 0 : g > 255 ? 255 : g
        if (f.invert) g = 255 - g
        out[j] = out[j + 1] = out[j + 2] = g; out[j + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [])

  useEffect(() => { if (state === 'ready') render(wc, ww) }, [state, wc, ww, render])

  // aplica transform (zoom/pan) via CSS
  const applyTransform = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return
    const v = view.current
    cv.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`
  }, [])
  useEffect(() => { applyTransform() }, [state, applyTransform])

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const v = view.current
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15
    v.scale = Math.min(8, Math.max(0.5, v.scale * f))
    applyTransform()
  }
  function onDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, wc, ww, tx: view.current.tx, ty: view.current.ty }
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current; if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (mode === 'pan') { view.current.tx = d.tx + dx; view.current.ty = d.ty + dy; applyTransform() }
    else { setWc(d.wc + dy * (ww / 200 + 1)); setWw(Math.max(1, d.ww + dx * (ww / 200 + 1))) }
  }
  function onUp() { drag.current = null }
  function reset() {
    const f = frameRef.current; if (!f) return
    view.current = { scale: 1, tx: 0, ty: 0 }; applyTransform()
    setWc(f.defaultWc); setWw(f.defaultWw)
  }

  if (state === 'error') {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
        <p className="text-sm text-slate-500 mb-3">Este DICOM está em formato comprimido e não pôde ser aberto aqui. Baixe para abrir na sua estação de laudo.</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 border border-emerald-200 rounded-lg px-3 py-2 hover:bg-emerald-50">
          <Download className="h-4 w-4" />Baixar {fileName ?? 'DICOM'}
        </a>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-slate-800 bg-black relative select-none" style={{ height: '62vh', minHeight: 380 }}>
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <canvas ref={canvasRef}
          className="origin-center touch-none"
          style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '100%', cursor: mode === 'pan' ? 'grab' : 'crosshair' }}
          onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} />
      </div>
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />Carregando DICOM…
        </div>
      )}
      <div className="absolute top-2 right-2 flex gap-1.5">
        <button onClick={() => setMode(m => m === 'wl' ? 'pan' : 'wl')} title={mode === 'wl' ? 'Modo: brilho/contraste' : 'Modo: mover'}
          className="h-8 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 backdrop-blur text-xs">
          {mode === 'wl' ? <Contrast className="h-4 w-4" /> : <Move className="h-4 w-4" />}
        </button>
        <button onClick={reset} title="Redefinir" className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur"><RotateCcw className="h-4 w-4" /></button>
        <a href={url} target="_blank" rel="noopener noreferrer" title="Baixar DICOM" className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur"><Download className="h-4 w-4" /></a>
      </div>
      <div className="absolute bottom-2 left-3 text-[11px] text-white/50">arraste: {mode === 'wl' ? 'brilho/contraste' : 'mover'} · roda: zoom</div>
    </div>
  )
}
