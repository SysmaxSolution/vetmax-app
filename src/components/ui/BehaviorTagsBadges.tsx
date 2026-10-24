'use client'

import { useEffect, useState } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import { addClinicBehaviorTag, listClinicBehaviorTags, removeClinicBehaviorTag } from '@/lib/actions/behavior-tags'
import { BEHAVIOR_TAG_COLORS, type BehaviorTagColor, type ClinicBehaviorTag } from '@/types/behavior-tags'

// ─── Preset de Tags Comportamentais ───────────────────────────────────────────

export const BEHAVIOR_TAG_OPTIONS = [
  { label: 'Agressivo',   color: 'red'    },
  { label: 'Morde',       color: 'red'    },
  { label: 'Arranha',     color: 'orange' },
  { label: 'Ansioso',     color: 'orange' },
  { label: 'Fugitivo',    color: 'orange' },
  { label: 'Tímido',      color: 'blue'   },
  { label: 'Dócil',       color: 'green'  },
  { label: 'Cardiopata',  color: 'purple' },
  { label: 'Epilético',   color: 'purple' },
  { label: 'Hipertenso',  color: 'purple' },
] as const

export type BehaviorTag = typeof BEHAVIOR_TAG_OPTIONS[number]['label']

// ─── Tags da clínica (cache compartilhado entre todos os badges da página) ─────
//
// As tags criadas pela clínica (migration 0517) precisam colorir badges em
// oito telas diferentes. Em vez de passar a lista por props em cada uma, o
// módulo carrega UMA vez e avisa quem estiver montado quando ela muda.

let cacheDaClinica: ClinicBehaviorTag[] | null = null
let carregando: Promise<void> | null = null
const ouvintes = new Set<(tags: ClinicBehaviorTag[]) => void>()

function publicar(tags: ClinicBehaviorTag[]) {
  cacheDaClinica = tags
  ouvintes.forEach(fn => fn(tags))
}

function carregarTagsDaClinica(): Promise<void> {
  if (carregando) return carregando
  carregando = listClinicBehaviorTags()
    .then(res => { if (Array.isArray(res)) publicar(res) })
    .catch(() => { /* sem rede: ficam só as padrão */ })
    .finally(() => { carregando = null })
  return carregando
}

/** Tags próprias da clínica; vazio até carregar. */
export function useClinicBehaviorTags(): ClinicBehaviorTag[] {
  const [tags, setTags] = useState<ClinicBehaviorTag[]>(cacheDaClinica ?? [])
  useEffect(() => {
    ouvintes.add(setTags)
    if (cacheDaClinica) setTags(cacheDaClinica)
    else void carregarTagsDaClinica()
    return () => { ouvintes.delete(setTags) }
  }, [])
  return tags
}

// ─── Badge classes por cor ────────────────────────────────────────────────────

const TAG_BADGE: Record<string, string> = {
  red:    'bg-red-100 text-red-700 border border-red-200',
  orange: 'bg-orange-100 text-orange-700 border border-orange-200',
  blue:   'bg-blue-100 text-blue-700 border border-blue-200',
  green:  'bg-green-100 text-green-700 border border-green-200',
  purple: 'bg-purple-100 text-purple-700 border border-purple-200',
  gray:   'bg-slate-100 text-slate-600 border border-slate-200',
}

const COLOR_LABEL: Record<BehaviorTagColor, string> = {
  red: 'Alerta', orange: 'Atenção', blue: 'Informativo', green: 'Positivo', purple: 'Clínico', gray: 'Neutro',
}

function tagColor(label: string, daClinica: ClinicBehaviorTag[]): string {
  const preset = BEHAVIOR_TAG_OPTIONS.find(t => t.label === label)
  if (preset) return preset.color
  const propria = daClinica.find(t => t.label.toLowerCase() === label.toLowerCase())
  return propria ? propria.color : 'gray'
}

// ─── Display-only badges (para contexto clínico) ──────────────────────────────

export function BehaviorTagsBadges({
  tags,
  size = 'sm',
}: {
  tags: string[]
  size?: 'xs' | 'sm'
}) {
  const daClinica = useClinicBehaviorTags()
  if (!tags || tags.length === 0) return null

  const sizeClass = size === 'xs'
    ? 'text-xs px-1.5 py-0.5'
    : 'text-xs font-semibold px-2 py-0.5'

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(tag => (
        <span
          key={tag}
          className={`inline-flex items-center rounded-full font-semibold ${sizeClass} ${TAG_BADGE[tagColor(tag, daClinica)] ?? TAG_BADGE.gray}`}
        >
          {tag === 'Agressivo' && '⚠️ '}
          {tag === 'Morde'     && '⚠️ '}
          {tag}
        </span>
      ))}
    </div>
  )
}

// ─── Selector interativo de tags (para forms) ─────────────────────────────────

export function BehaviorTagsSelector({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (tags: string[]) => void
}) {
  const daClinica = useClinicBehaviorTags()
  const [criando, setCriando]   = useState(false)
  const [novoRotulo, setNovoRotulo] = useState('')
  const [novaCor, setNovaCor]   = useState<BehaviorTagColor>('orange')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]         = useState<string | null>(null)

  const toggle = (label: string) => {
    if (selected.includes(label)) {
      onChange(selected.filter(t => t !== label))
    } else {
      onChange([...selected, label])
    }
  }

  async function criarTag() {
    setErro(null)
    const rotulo = novoRotulo.trim()
    if (!rotulo) { setErro('Escreva o nome da tag.'); return }
    setSalvando(true)
    const res = await addClinicBehaviorTag({ label: rotulo, color: novaCor })
    setSalvando(false)
    if ('error' in res) { setErro(res.error); return }
    publicar(res)
    const criada = res.find(t => t.label.toLowerCase() === rotulo.toLowerCase())?.label ?? rotulo
    // A tag recém-criada já entra marcada: quem a criou foi porque este pet precisava dela.
    if (!selected.includes(criada)) onChange([...selected, criada])
    setNovoRotulo(''); setCriando(false)
  }

  async function removerTag(label: string) {
    setErro(null)
    const res = await removeClinicBehaviorTag(label)
    if ('error' in res) { setErro(res.error); return }
    publicar(res)
  }

  // Tags que o pet já tem mas não estão em lista nenhuma (removidas da
  // clínica depois) continuam visíveis para poderem ser desmarcadas.
  const conhecidas = new Set<string>([
    ...BEHAVIOR_TAG_OPTIONS.map(t => t.label),
    ...daClinica.map(t => t.label),
  ])
  const orfas = selected.filter(t => !conhecidas.has(t))

  const chip = (label: string, color: string, extra?: React.ReactNode) => {
    const isActive = selected.includes(label)
    const activeClass = TAG_BADGE[color] ?? TAG_BADGE.gray
    return (
      <span key={label} className="inline-flex items-center">
        <button
          type="button"
          onClick={() => toggle(label)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-all border ${
            isActive
              ? activeClass + ' ring-1 ring-offset-1 ring-current'
              : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
          }`}
        >
          {label === 'Agressivo' && isActive && '⚠️ '}
          {label === 'Morde'     && isActive && '⚠️ '}
          {label}
        </button>
        {extra}
      </span>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {BEHAVIOR_TAG_OPTIONS.map(({ label, color }) => chip(label, color))}
        {daClinica.map(({ label, color }) => chip(label, color, (
          <button
            type="button"
            onClick={() => void removerTag(label)}
            title="Remover esta tag da clínica (os pets que já a têm não mudam)"
            className="ml-0.5 rounded-full p-0.5 text-slate-300 hover:bg-slate-100 hover:text-rose-600"
          >
            <X className="h-3 w-3" />
          </button>
        )))}
        {orfas.map(label => chip(label, 'gray'))}

        {!criando && (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-teal-300 px-3 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50"
          >
            <Plus className="h-3 w-3" /> Nova tag
          </button>
        )}
      </div>

      {criando && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={novoRotulo}
              onChange={e => setNovoRotulo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void criarTag() } if (e.key === 'Escape') setCriando(false) }}
              maxLength={40}
              placeholder="Ex.: Precisa de focinheira"
              className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
            />
            <div className="flex items-center gap-1" title="Cor da tag">
              {BEHAVIOR_TAG_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNovaCor(c)}
                  title={COLOR_LABEL[c]}
                  className={`h-6 w-6 rounded-full border-2 ${TAG_BADGE[c]} ${novaCor === c ? 'ring-2 ring-offset-1 ring-slate-500' : ''}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => void criarTag()}
              disabled={salvando}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Criar
            </button>
            <button type="button" onClick={() => { setCriando(false); setErro(null) }} className="text-xs text-slate-500 hover:text-slate-700">
              Cancelar
            </button>
          </div>
          <p className="text-[11px] text-slate-500">A tag fica disponível para todos os pets desta clínica.</p>
          {erro && <p className="text-xs text-rose-600">{erro}</p>}
        </div>
      )}

      {selected.length > 0 && (
        <p className="text-xs text-slate-400">
          {selected.length} tag{selected.length > 1 ? 's' : ''} selecionada{selected.length > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
