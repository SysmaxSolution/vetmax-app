'use client'

/**
 * PageSettingsPanel — barra superior do CanvasEditor.
 * Layout denso/responsivo: tamanho/orientação à esquerda, 4 sliders de margem
 * no centro, papel timbrado + cor da página à direita. Em telas estreitas
 * usa flex-wrap. Tudo controlado por useState do parent — reativo no mesmo frame.
 */

import { useRef, useState } from 'react'
import {
  ImagePlus, Loader2, Trash2, RectangleHorizontal, RectangleVertical,
  Droplet,
} from 'lucide-react'
import type { PageConfig, PageOrientation, PageSize } from '@/lib/canva/canvas-state'

interface Props {
  page: PageConfig
  onChange: (next: PageConfig) => void
  onUploadBackground: (file: File) => Promise<{ url: string }>
  /** Quando setado (templates multi-page), mostra "Página X de Y" no topo. */
  pageLabel?: string
}

export default function PageSettingsPanel({ page, onChange, onUploadBackground, pageLabel }: Props) {
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
    <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-3 py-2 text-xs">
      {pageLabel && (
        <Group label="Editando">
          <span className="inline-flex items-center gap-1 rounded border border-violet-300 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">
            {pageLabel}
          </span>
        </Group>
      )}

      {/* Tamanho */}
      <Group label="Tamanho">
        <div className="flex">
          {(['A4', 'A5'] as PageSize[]).map((size, i) => (
            <button
              key={size}
              onClick={() => onChange({ ...page, size })}
              className={`px-2 py-1 text-[11px] font-medium border ${
                page.size === size
                  ? 'border-violet-600 bg-violet-50 text-violet-700 z-10'
                  : 'border-slate-300 text-slate-700 hover:border-slate-500'
              } ${i === 0 ? 'rounded-l' : '-ml-px rounded-r'}`}
            >
              {size}
            </button>
          ))}
        </div>
      </Group>

      {/* Orientação */}
      <Group label="Orientação">
        <div className="flex">
          {(['portrait', 'landscape'] as PageOrientation[]).map((o, i) => (
            <button
              key={o}
              onClick={() => onChange({ ...page, orientation: o })}
              title={o === 'portrait' ? 'Retrato' : 'Paisagem'}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium border ${
                page.orientation === o
                  ? 'border-violet-600 bg-violet-50 text-violet-700 z-10'
                  : 'border-slate-300 text-slate-700 hover:border-slate-500'
              } ${i === 0 ? 'rounded-l' : '-ml-px rounded-r'}`}
            >
              {o === 'portrait' ? <RectangleVertical className="w-3 h-3" /> : <RectangleHorizontal className="w-3 h-3" />}
              <span className="hidden md:inline">{o === 'portrait' ? 'Retrato' : 'Paisagem'}</span>
            </button>
          ))}
        </div>
      </Group>

      {/* Margens (densas em 2x2 para caber em qualquer largura) */}
      <Group label="Margens (cm)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 min-w-[260px]">
          {(['top', 'right', 'bottom', 'left'] as const).map(k => (
            <label key={k} className="flex flex-col gap-0.5">
              <span className="flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-500">
                <span>{LABELS[k]}</span>
                <span className="tabular-nums font-semibold text-slate-700">{page.margins[k].toFixed(1)}</span>
              </span>
              <input
                type="range" min={0} max={5} step={0.1}
                value={page.margins[k]}
                onChange={e => setMargin(k, parseFloat(e.target.value))}
                className="canva-slider w-full min-w-[80px]"
              />
            </label>
          ))}
        </div>
      </Group>

      {/* Cor de fundo da página */}
      <Group label="Cor da página">
        <label
          className="flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-1 cursor-pointer hover:border-slate-500"
          title="Cor de fundo aplicada à folha inteira (renderizada antes do papel timbrado)"
        >
          <Droplet className="w-3 h-3 text-slate-500" />
          <input
            type="color"
            value={page.backgroundColor && page.backgroundColor.startsWith('#') ? page.backgroundColor.slice(0, 7) : '#ffffff'}
            onChange={e => onChange({ ...page, backgroundColor: e.target.value })}
            className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
          />
          {page.backgroundColor && (
            <button
              type="button"
              onClick={e => { e.preventDefault(); onChange({ ...page, backgroundColor: null }) }}
              title="Limpar cor"
              className="text-slate-400 hover:text-red-600 leading-none"
            >
              ×
            </button>
          )}
        </label>
      </Group>

      {/* Papel timbrado */}
      <Group label="Papel timbrado">
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
            className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-violet-400 hover:text-violet-700 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
            {page.backgroundImageUrl ? 'Trocar' : 'Enviar'}
          </button>
          {page.backgroundImageUrl && (
            <button
              onClick={() => onChange({ ...page, backgroundImageUrl: null })}
              title="Remover fundo"
              className="rounded border border-slate-300 p-1 text-slate-500 hover:border-red-400 hover:text-red-600"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </Group>
    </div>
  )
}

const LABELS = { top: 'Topo', right: 'Dir.', bottom: 'Base', left: 'Esq.' } as const

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </div>
  )
}
