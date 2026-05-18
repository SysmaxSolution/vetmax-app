'use client'

/**
 * ElementsToolbar — barra vertical à esquerda do CanvasEditor.
 *
 * Botões agrupados que disparam adição de elementos ao canvas:
 *   1. Texto livre
 *   2. Imagem (upload via signed URL)
 *   3. Linha (H/V)
 *   4. Tag Dinâmica (popover com catálogo agrupado por entidade)
 *   5. Repeater (medicações, exames, vacinas)
 */

import { useRef, useState } from 'react'
import {
  Type, Image as ImageIcon, Minus, Loader2,
  Tag as TagIcon, ListOrdered, AlignLeft,
} from 'lucide-react'
import { tagsByGroup, type DynamicTagDef } from '@/lib/canva/dynamic-tags'
import type {
  CanvasElement, LineElement, RepeaterSource,
} from '@/lib/canva/elements'
import {
  makeTextElement, makeImageElement, makeLineElement,
  makeDynamicTagElement, makeRepeaterElement,
} from '@/lib/canva/elements'

interface Props {
  onAdd: (element: CanvasElement) => void
  onUploadImage: (file: File) => Promise<{ url: string; storagePath: string }>
}

export default function ElementsToolbar({ onAdd, onUploadImage }: Props) {
  const [openTags, setOpenTags] = useState(false)
  const [openRepeater, setOpenRepeater] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleImageFile(f: File) {
    setUploading(true)
    try {
      const { url, storagePath } = await onUploadImage(f)
      onAdd(makeImageElement({ url, storagePath }))
    } finally {
      setUploading(false)
    }
  }

  return (
    <aside className="flex flex-col items-stretch gap-2 border-r border-slate-200 bg-slate-50 p-3 w-[88px]">
      <ToolButton icon={<Type className="w-5 h-5" />} label="Texto"
        onClick={() => onAdd(makeTextElement())} />

      <ToolButton icon={uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
        label="Imagem"
        onClick={() => fileInput.current?.click()}
        disabled={uploading} />

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = '' }}
      />

      <div className="grid grid-cols-2 gap-1.5">
        <ToolButton compact icon={<Minus className="w-4 h-4" />} label="Linha H"
          onClick={() => onAdd(makeLineElement('horizontal'))} />
        <ToolButton compact icon={<Minus className="w-4 h-4 rotate-90" />} label="Linha V"
          onClick={() => onAdd(makeLineElement('vertical'))} />
      </div>

      <Popover
        open={openTags}
        onOpenChange={setOpenTags}
        trigger={<ToolButton icon={<TagIcon className="w-5 h-5" />} label="Tags Dinâmicas" />}
      >
        <TagsCatalog onPick={(tag) => { onAdd(makeDynamicTagElement(tag.id)); setOpenTags(false) }} />
      </Popover>

      <Popover
        open={openRepeater}
        onOpenChange={setOpenRepeater}
        trigger={<ToolButton icon={<ListOrdered className="w-5 h-5" />} label="Repetir Lista" />}
      >
        <RepeaterPicker onPick={(s) => { onAdd(makeRepeaterElement(s)); setOpenRepeater(false) }} />
      </Popover>

      <div className="mt-auto text-[10px] text-slate-400 leading-tight px-1">
        <AlignLeft className="w-3 h-3 inline mr-1" />
        Arraste no canvas; clique para editar.
      </div>
    </aside>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ToolButton({
  icon, label, onClick, disabled, compact,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`
        flex flex-col items-center justify-center gap-1
        rounded-lg border border-slate-200 bg-white
        ${compact ? 'p-1.5' : 'p-2.5'}
        text-slate-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {icon}
      {!compact && <span className="text-[10px] font-medium">{label}</span>}
    </button>
  )
}

function Popover({
  open, onOpenChange, trigger, children,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  trigger: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <div onClick={() => onOpenChange(!open)} role="button" tabIndex={0}>{trigger}</div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
          <div className="absolute left-full top-0 ml-2 z-50 w-[280px] max-h-[480px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            {children}
          </div>
        </>
      )}
    </div>
  )
}

function TagsCatalog({ onPick }: { onPick: (tag: DynamicTagDef) => void }) {
  const groups = tagsByGroup()
  return (
    <div className="p-2">
      {groups.map(g => (
        <section key={g.group} className="mb-2">
          <h4 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {g.label}
          </h4>
          <div className="grid grid-cols-1 gap-0.5">
            {g.tags.map(t => (
              <button
                key={t.id}
                onClick={() => onPick(t)}
                className="flex items-center justify-between rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-700"
              >
                <span>{t.label}</span>
                <span className="text-[10px] text-slate-400">{t.preview}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function RepeaterPicker({ onPick }: { onPick: (source: RepeaterSource) => void }) {
  const opts: Array<{ source: RepeaterSource; label: string; hint: string }> = [
    { source: 'prescriptions',  label: 'Medicações',       hint: 'Lista de medicamentos prescritos' },
    { source: 'exam_items',     label: 'Itens de Exame',   hint: 'Solicitação de exames' },
    { source: 'vaccines',       label: 'Vacinas',          hint: 'Histórico vacinal' },
    { source: 'dynamic_fields', label: 'Campos Dinâmicos', hint: 'Pressão, glicemia, etc.' },
  ]
  return (
    <div className="p-2">
      <h4 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Fonte da lista
      </h4>
      {opts.map(o => (
        <button
          key={o.source}
          onClick={() => onPick(o.source)}
          className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-700"
        >
          <span className="font-medium">{o.label}</span>
          <span className="text-[10px] text-slate-400">{o.hint}</span>
        </button>
      ))}
    </div>
  )
}
