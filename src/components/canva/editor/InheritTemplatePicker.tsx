'use client'

/**
 * InheritTemplatePicker — escolhe um template Canvas existente da clínica
 * para servir de base ao novo modelo. Ao confirmar, chama a server action
 * que clona canvas_state + assets e devolve o id do template recém-criado.
 *
 * Recebe name + type já preenchidos pelo NewCanvasTemplateDialog; o type
 * vira filtro inicial (mas pode ser desativado pelo usuário se quiser
 * herdar de outro tipo).
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { ArrowLeft, FileText, Image as ImageIcon, Layers, Loader2, Search, Sparkles, X } from 'lucide-react'
import {
  createCanvasTemplateFromExisting,
  listCanvasTemplatesForInherit,
  type InheritableTemplateSummary,
} from '@/lib/actions/canva-templates'

type TemplateType = InheritableTemplateSummary['type']

const TYPE_LABEL: Record<TemplateType, string> = {
  receita: 'Receita',
  laudo: 'Laudo',
  encaminhamento: 'Encaminhamento',
  termo: 'Termo',
  exame: 'Exame',
  outro: 'Outro',
}

interface Props {
  name: string
  type: TemplateType
  onBack: () => void
  onClose: () => void
  onCreated: (templateId: string, name: string, type: TemplateType) => void
}

export default function InheritTemplatePicker({ name, type, onBack, onClose, onCreated }: Props) {
  const [templates, setTemplates] = useState<InheritableTemplateSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<TemplateType | 'all'>(type)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, startSubmit] = useTransition()

  useEffect(() => {
    let cancelled = false
    listCanvasTemplatesForInherit()
      .then(rows => { if (!cancelled) setTemplates(rows) })
      .catch(e => { if (!cancelled) setLoadError(e?.message ?? 'falha ao carregar modelos') })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    if (!templates) return []
    const q = search.trim().toLowerCase()
    return templates.filter(t => {
      if (filterType !== 'all' && t.type !== filterType) return false
      if (q && !t.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [templates, search, filterType])

  function confirmInherit() {
    if (!selectedId) return
    setSubmitError(null)
    startSubmit(async () => {
      try {
        const { id } = await createCanvasTemplateFromExisting({
          name,
          type,
          source_template_id: selectedId,
        })
        onCreated(id, name, type)
      } catch (e: any) {
        setSubmitError(e?.message ?? 'falha ao herdar modelo')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Voltar">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <Sparkles className="w-5 h-5 text-violet-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Herdar de um modelo existente</h2>
              <p className="text-xs text-slate-500">
                Novo modelo: <strong>{name || '(sem nome)'}</strong> ·{' '}
                <span className="text-violet-700">{TYPE_LABEL[type]}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="space-y-3 border-b border-slate-100 px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome…"
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilterType('all')}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium border ${
                filterType === 'all'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-slate-400'
              }`}
            >
              Todos
            </button>
            {(Object.keys(TYPE_LABEL) as TemplateType[]).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium border ${
                  filterType === t
                    ? 'border-violet-600 bg-violet-50 text-violet-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-400'
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[200px] flex-1 overflow-y-auto px-5 py-3">
          {loadError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {loadError}
            </div>
          )}

          {!loadError && templates === null && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando modelos…
            </div>
          )}

          {!loadError && templates !== null && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-slate-500">
              <FileText className="w-8 h-8 text-slate-300" />
              {templates.length === 0
                ? 'Nenhum modelo Canvas Visual encontrado nesta clínica.'
                : 'Nenhum modelo corresponde aos filtros.'}
            </div>
          )}

          {!loadError && filtered.length > 0 && (
            <ul className="space-y-1.5">
              {filtered.map(t => {
                const selected = selectedId === t.id
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedId(t.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                        selected
                          ? 'border-violet-600 bg-violet-50'
                          : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-semibold ${selected ? 'text-violet-800' : 'text-slate-900'} truncate`}>
                            {t.name}
                          </span>
                          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {TYPE_LABEL[t.type]}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-0.5">
                            <Layers className="w-3 h-3" /> {t.element_count} elemento{t.element_count === 1 ? '' : 's'}
                          </span>
                          {t.has_background && (
                            <span className="flex items-center gap-0.5">
                              <ImageIcon className="w-3 h-3" /> papel timbrado
                            </span>
                          )}
                          {t.updated_at && (
                            <span>· atualizado {new Date(t.updated_at).toLocaleDateString('pt-BR')}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {submitError && (
          <div className="border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">
            {submitError}
          </div>
        )}

        <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          <p className="text-[11px] text-slate-500">
            O novo modelo nasce com cópia do layout, papel timbrado e elementos do escolhido.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              disabled={submitting}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Voltar
            </button>
            <button
              onClick={confirmInherit}
              disabled={!selectedId || submitting}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Herdar e abrir editor
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
