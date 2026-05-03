'use client'

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

// ─── Badge classes por cor ────────────────────────────────────────────────────

const TAG_BADGE: Record<string, string> = {
  red:    'bg-red-100 text-red-700 border border-red-200',
  orange: 'bg-orange-100 text-orange-700 border border-orange-200',
  blue:   'bg-blue-100 text-blue-700 border border-blue-200',
  green:  'bg-green-100 text-green-700 border border-green-200',
  purple: 'bg-purple-100 text-purple-700 border border-purple-200',
  gray:   'bg-slate-100 text-slate-600 border border-slate-200',
}

function tagColor(label: string): string {
  const preset = BEHAVIOR_TAG_OPTIONS.find(t => t.label === label)
  return preset ? preset.color : 'gray'
}

// ─── Display-only badges (para contexto clínico) ──────────────────────────────

export function BehaviorTagsBadges({
  tags,
  size = 'sm',
}: {
  tags: string[]
  size?: 'xs' | 'sm'
}) {
  if (!tags || tags.length === 0) return null

  const sizeClass = size === 'xs'
    ? 'text-xs px-1.5 py-0.5'
    : 'text-xs font-semibold px-2 py-0.5'

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(tag => (
        <span
          key={tag}
          className={`inline-flex items-center rounded-full font-semibold ${sizeClass} ${TAG_BADGE[tagColor(tag)] ?? TAG_BADGE.gray}`}
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
  const toggle = (label: string) => {
    if (selected.includes(label)) {
      onChange(selected.filter(t => t !== label))
    } else {
      onChange([...selected, label])
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {BEHAVIOR_TAG_OPTIONS.map(({ label, color }) => {
          const isActive = selected.includes(label)
          const activeClass = TAG_BADGE[color] ?? TAG_BADGE.gray
          return (
            <button
              key={label}
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
          )
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-slate-400">
          {selected.length} tag{selected.length > 1 ? 's' : ''} selecionada{selected.length > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
