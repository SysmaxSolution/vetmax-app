'use client'

/**
 * PageSettingsPanel — barra superior do CanvasEditor. Controla tamanho
 * (A4/A5), orientação (retrato/paisagem), 4 sliders de margem em cm e
 * upload/remoção do papel timbrado de fundo.
 *
 * Toda mudança é reativa (useState do parent) — preview atualiza no mesmo frame.
 */

import { useRef, useState } from 'react'
import {
  ImagePlus, Loader2, Trash2, RectangleHorizontal, RectangleVertical,
} from 'lucide-react'
import type { PageConfig, PageOrientation, PageSize } from '@/lib/canva/canvas-state'

interface Props {
  page: PageConfig
  onChange: (next: PageConfig) => void
  onUploadBackground: (file: File) => Promise<{ url: string }>
}

export default function PageSettingsPanel({ page, onChange, onUploadBackground }: Props) {
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function setMargin(k: keyof PageConfig['margins'], v: number) {
    onChange({ ...page, margins: { ...page.margins, [k]: Math.max(0, Math.min(10, v)) } })
  }

  async function handleFile(f: File) {
    setUploading(true)
    try {
      const { url } = await onUploadBackground(f)
      onChange({ ...page, backgroundImageUrl: url })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-4 py-2">
      {/* Tamanho */}
      <Group label="Tamanho">
        <div className="flex gap-1">
          {(['A4', 'A5'] as PageSize[]).map(size => (
            <button
              key={size}
              onClick={() => onChange({ ...page, size })}
              className={`rounded border px-2.5 py-1 text-xs font-medium ${
                page.size === size ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-300 text-slate-700 hover:border-slate-500'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </Group>

      {/* Orientação */}
      <Group label="Orientação">
        <div className="flex gap-1">
          {(['portrait', 'landscape'] as PageOrientation[]).map(o => (
            <button
              key={o}
              onClick={() => onChange({ ...page, orientation: o })}
              title={o === 'portrait' ? 'Retrato' : 'Paisagem'}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${
                page.orientation === o ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-300 text-slate-700 hover:border-slate-500'
              }`}
            >
              {o === 'portrait' ? <RectangleVertical className="w-3.5 h-3.5" /> : <RectangleHorizontal className="w-3.5 h-3.5" />}
              {o === 'portrait' ? 'Retrato' : 'Paisagem'}
            </button>
          ))}
        </div>
      </Group>

      {/* Margens */}
      <Group label="Margens (cm)">
        <div className="grid grid-cols-4 gap-2 min-w-[400px]">
          {(['top', 'right', 'bottom', 'left'] as const).map(k => (
            <label key={k} className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                {LABELS[k]} <span className="tabular-nums text-slate-700">{page.margins[k].toFixed(1)}</span>
              </span>
              <input
                type="range" min={0} max={5} step={0.1}
                value={page.margins[k]}
                onChange={e => setMargin(k, parseFloat(e.target.value))}
                className="canva-slider w-full"
              />
            </label>
          ))}
        </div>
      </Group>

      {/* Background */}
      <Group label="Papel timbrado de fundo">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:border-violet-400 hover:text-violet-700 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {page.backgroundImageUrl ? 'Trocar' : 'Enviar'}
          </button>
          {page.backgroundImageUrl && (
            <button
              onClick={() => onChange({ ...page, backgroundImageUrl: null })}
              title="Remover fundo"
              className="rounded border border-slate-300 p-1 text-slate-500 hover:border-red-400 hover:text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </Group>
    </div>
  )
}

const LABELS = { top: 'Topo', right: 'Direita', bottom: 'Base', left: 'Esquerda' } as const

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </div>
  )
}
