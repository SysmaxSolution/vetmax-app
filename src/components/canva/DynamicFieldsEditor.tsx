'use client'

/**
 * DynamicFieldsEditor — chaves dinâmicas que o vet adiciona em tempo de
 * consulta. Cada par key/value vira um item dentro do bloco de dados do
 * pet na impressão.
 *
 * Restrições propositais:
 * - Sem drag-and-drop (a ordem é a de inserção; o vet pode remover e
 *   reinserir).
 * - Sem persistência aqui (parent controla o estado).
 */

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CanvaDynamicField } from '@/lib/canva/types'

interface Props {
  value: CanvaDynamicField[]
  onChange: (next: CanvaDynamicField[]) => void
  disabled?: boolean
}

const SUGGESTED_KEYS = [
  'Pressão Arterial', 'Glicemia', 'Saturação',
  'Temperatura', 'Frequência Cardíaca', 'Frequência Respiratória',
  'Hidratação', 'Score Corporal',
]

export default function DynamicFieldsEditor({ value, onChange, disabled }: Props) {
  const [draft, setDraft] = useState<{ key: string; value: string }>({ key: '', value: '' })

  function addField(k: string, v: string) {
    const key = k.trim()
    const val = v.trim()
    if (!key || !val) return
    onChange([...value, { key, value: val }])
    setDraft({ key: '', value: '' })
  }

  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  function updateAt(i: number, patch: Partial<CanvaDynamicField>) {
    onChange(value.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Campos customizados</h3>
        <span className="text-xs text-slate-500">{value.length} adicionado{value.length === 1 ? '' : 's'}</span>
      </header>

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((f, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
                placeholder="Nome do campo"
                value={f.key}
                disabled={disabled}
                onChange={e => updateAt(i, { key: e.target.value })}
              />
              <input
                className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
                placeholder="Valor"
                value={f.value}
                disabled={disabled}
                onChange={e => updateAt(i, { value: e.target.value })}
              />
              <button
                type="button"
                className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-50"
                disabled={disabled}
                onClick={() => removeAt(i)}
                aria-label="Remover campo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 p-2">
        <input
          className="flex-1 min-w-0 rounded border border-slate-200 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
          placeholder="Nome do campo"
          value={draft.key}
          disabled={disabled}
          list="canva-dyn-suggestions"
          onChange={e => setDraft(d => ({ ...d, key: e.target.value }))}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); addField(draft.key, draft.value) }
          }}
        />
        <input
          className="flex-1 min-w-0 rounded border border-slate-200 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
          placeholder="Valor"
          value={draft.value}
          disabled={disabled}
          onChange={e => setDraft(d => ({ ...d, value: e.target.value }))}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); addField(draft.key, draft.value) }
          }}
        />
        <button
          type="button"
          className="flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          disabled={disabled || !draft.key.trim() || !draft.value.trim()}
          onClick={() => addField(draft.key, draft.value)}
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar
        </button>
      </div>

      <datalist id="canva-dyn-suggestions">
        {SUGGESTED_KEYS.map(k => <option key={k} value={k} />)}
      </datalist>
    </section>
  )
}
